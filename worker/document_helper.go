package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/cenkalti/backoff/v4"
	"github.com/sirupsen/logrus"
	"golang.org/x/sync/semaphore"
	"io"
	"net"
	"net/http"
	"time"
)

type DocumentHelper interface {
	IngestDocument(ctx context.Context, splitter TextSplitter, embeddings PipelineEmbeddingConfig, sinks []PipelineDataSink, openAIApiKeys string, document IndexedDocument, textContent string, metadata map[string]any) error
	DeleteDocument(ctx context.Context, sinks []PipelineDataSink, integration Integration, documentType, documentId string) error
	CountDocumentTokens(ctx context.Context, textContent string) (int, error)
}

type DocumentHelperImpl struct {
	logger                 logrus.FieldLogger
	documentHelperEndpoint string
	httpClient             *http.Client
	sema                   *semaphore.Weighted
}

func (helper *DocumentHelperImpl) CountDocumentTokens(ctx context.Context, textContent string) (int, error) {
	err := helper.sema.Acquire(ctx, 1)
	if err != nil {
		return 0, fmt.Errorf("unable to acquire semaphore, %w", err)
	}
	defer helper.sema.Release(1)

	body := map[string]any{
		"document_text": textContent,
	}
	marshalledBody, err := json.Marshal(body)
	if err != nil {
		return 0, fmt.Errorf("unable to marshal request body, %w", err)
	}

	resp, err := helper.sendRequest(ctx, http.MethodPost, "count", bytes.NewReader(marshalledBody))
	if err != nil {
		return 0, fmt.Errorf("unable to count document tokens, %w", err)
	}

	type countResponse struct {
		TokenCount int `json:"token_count"`
	}

	countResp := countResponse{}
	err = json.NewDecoder(resp.Body).Decode(&countResp)
	if err != nil {
		return 0, fmt.Errorf("unable to decode count response, %w", err)
	}

	return countResp.TokenCount, nil
}

type DocumentHelperErrorCode string

const (
	DocumentHelperErrorCodeInvalidEmbeddings DocumentHelperErrorCode = "invalid_embeddings"
	DocumentHelperErrorCodeFlaggedContent    DocumentHelperErrorCode = "flagged_content"
	DocumentHelperErrorCodeUnknown           DocumentHelperErrorCode = "unknown"
	DocumentHelperErrorInvalidVectorStore    DocumentHelperErrorCode = "invalid_vector_store"
	DocumentHelperErrorInvalidTextSplitter   DocumentHelperErrorCode = "invalid_text_splitter"
	DocumentHelperErrorUpsertFailed          DocumentHelperErrorCode = "vector_store_upsert_failed"
	DocumentHelperErrorDeleteFailed          DocumentHelperErrorCode = "vector_store_delete_failed"
)

type DocumentHelperError struct {
	Code    DocumentHelperErrorCode `json:"code"`
	Message string                  `json:"message"`

	// Whether request can be retried
	IsTransient bool `json:"is_transient"`
}

func (e *DocumentHelperError) Error() string {
	return fmt.Sprintf("document helper error (%s): %s", e.Code, e.Message)
}

func (helper *DocumentHelperImpl) sendRequest(ctx context.Context, method string, endpoint string, body io.Reader) (*http.Response, error) {
	return backoff.RetryWithData[*http.Response](func() (*http.Response, error) {
		req, err := http.NewRequestWithContext(ctx, method, fmt.Sprintf("%s/%s", helper.documentHelperEndpoint, endpoint), body)
		if err != nil {
			return nil, backoff.Permanent(fmt.Errorf("unable to create request, %w", err))
		}
		req.Header.Set("Content-Type", "application/json")

		res, err := helper.httpClient.Do(req)
		if err != nil {
			// if http client timeout, retry
			if err, ok := err.(net.Error); ok && err.Timeout() {
				return nil, err
			}
			return nil, backoff.Permanent(fmt.Errorf("unable to make request, %w", err))
		}

		if res.StatusCode == http.StatusTooManyRequests {
			return res, fmt.Errorf("too many requests")
		}

		if res.StatusCode == http.StatusBadRequest {
			type errorResp struct {
				Error DocumentHelperError `json:"error"`
			}
			resp := errorResp{}
			err = json.NewDecoder(res.Body).Decode(&resp)
			if err != nil {
				return res, backoff.Permanent(fmt.Errorf("unable to decode error response, %w", err))
			}

			if resp.Error.Code != "" {
				if resp.Error.IsTransient {
					return res, &resp.Error
				}
				return res, backoff.Permanent(&resp.Error)
			}

			return res, backoff.Permanent(fmt.Errorf("bad request"))
		}

		if res.StatusCode != http.StatusOK {
			return res, backoff.Permanent(fmt.Errorf("unexpected status code %d", res.StatusCode))
		}

		return res, nil
	}, newBackOff(ctx, 5))
}

func (helper *DocumentHelperImpl) DeleteDocument(ctx context.Context, sinks []PipelineDataSink, integration Integration, documentType, documentId string) error {
	err := helper.sema.Acquire(ctx, 1)
	if err != nil {
		return fmt.Errorf("unable to acquire semaphore, %w", err)
	}
	defer helper.sema.Release(1)

	body := map[string]any{
		"integration":   integration,
		"document_type": documentType,

		"data_sinks": sinks,
	}
	marshalledBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("unable to marshal request body, %w", err)
	}

	_, err = helper.sendRequest(ctx, http.MethodDelete, fmt.Sprintf("documents/%s", documentId), bytes.NewReader(marshalledBody))
	if err != nil {
		return fmt.Errorf("unable to delete document, %w", err)
	}

	return nil
}

func (helper *DocumentHelperImpl) IngestDocument(ctx context.Context, splitter TextSplitter, embeddings PipelineEmbeddingConfig, sinks []PipelineDataSink, openAIApiKey string, doc IndexedDocument, textContent string, metadata map[string]any) error {
	err := helper.sema.Acquire(ctx, 1)
	if err != nil {
		return fmt.Errorf("unable to acquire semaphore, %w", err)
	}
	defer helper.sema.Release(1)

	body := map[string]any{
		"document":          doc,
		"document_text":     textContent,
		"document_metadata": metadata,

		"text_splitter":  splitter,
		"embeddings":     embeddings,
		"data_sinks":     sinks,
		"openai_api_key": openAIApiKey,
	}
	marshalledBody, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("unable to marshal request body, %w", err)
	}

	_, err = helper.sendRequest(ctx, http.MethodPost, "ingest", bytes.NewReader(marshalledBody))
	if err != nil {
		return fmt.Errorf("unable to ingest document, %w", err)
	}

	return nil
}

func newDocumentHelper(documentHelperEndpoint string, logger logrus.FieldLogger) DocumentHelper {
	return &DocumentHelperImpl{
		logger:                 logger,
		documentHelperEndpoint: documentHelperEndpoint,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		sema: semaphore.NewWeighted(5),
	}
}

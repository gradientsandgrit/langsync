package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"github.com/cenkalti/backoff/v4"
	"github.com/mitchellh/mapstructure"
	"github.com/sirupsen/logrus"
	"golang.org/x/sync/semaphore"
	"net"
	"net/http"
	"time"
)

type NotionAPIClientImpl struct {
	httpClient           *http.Client
	logger               logrus.FieldLogger
	notionHelperEndpoint string
	sema                 *semaphore.Weighted
}

func (client *NotionAPIClientImpl) GetDocument(ctx context.Context, documentType string, id string, integration IntegrationConnection) (IndexedDocument, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return IndexedDocument{}, err
	}
	defer client.sema.Release(1)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("https://api.notion.com/v1/pages/%s", id), nil)
	if err != nil {
		return IndexedDocument{}, err
	}

	req.Header.Set("Authorization", "Bearer "+integration.NotionIntegrationConnection.Config.AcessToken)

	req.Header.Set("Notion-Version", "2022-06-28")
	req.Header.Set("Content-Type", "application/json")

	res, err := backoff.RetryWithData[*http.Response](
		func() (*http.Response, error) {
			res, err := client.httpClient.Do(req)
			if err != nil {
				if err, ok := err.(net.Error); ok && err.Timeout() {
					return nil, err
				}
				return nil, backoff.Permanent(err)
			}

			// While only 3 requests can be run at the same time, requests will be quicker than a second,
			// so we still need to handle rate-limiting and retry gracefully
			if res.StatusCode == http.StatusTooManyRequests {
				return nil, fmt.Errorf("rate limited")
			}

			if res.StatusCode != http.StatusOK {
				return nil, backoff.Permanent(fmt.Errorf("unexpected status code: %d", res.StatusCode))
			}

			return res, nil
		},
		newBackOff(ctx, 10),
	)
	if err != nil {
		return IndexedDocument{}, err
	}

	type searchResp struct {
		Id             string         `json:"id" mapstructure:"id"`
		LastEditedTime string         `json:"last_edited_time" mapstructure:"last_edited_time"`
		Properties     map[string]any `json:"properties" mapstructure:"properties"`
		URL            string         `json:"url" mapstructure:"url"`
	}

	var searchResponse searchResp
	err = json.NewDecoder(res.Body).Decode(&searchResponse)
	if err != nil {
		return IndexedDocument{}, err
	}

	return IndexedDocument{
		Integration:        IntegrationNotion,
		DocumentType:       "page",
		Id:                 searchResponse.Id,
		Title:              extractTitle(searchResponse.Properties),
		URL:                searchResponse.URL,
		FreshnessIndicator: searchResponse.LastEditedTime,
	}, nil

}

func newNotionApiClient(notionHelperEndpoint string, logger logrus.FieldLogger) DataSourceApiClient {
	return &NotionAPIClientImpl{
		httpClient: &http.Client{
			Timeout: time.Minute * 5,
		},
		logger:               logger,
		notionHelperEndpoint: notionHelperEndpoint,
		// We're limited to 3 requests per second, so we definitely cannot allow more than 3 concurrent requests
		// However, each request could be faster than a second, so we might still run into rate limiting issues
		sema: semaphore.NewWeighted(3),
	}
}

type TitleProperty struct {
	Type  string     `json:"type" mapstructure:"type"` // title
	Title []RichText `json:"title" mapstructure:"title"`
}

type RichText struct {
	Type string `json:"type" mapstructure:"type"` // text
	Text struct {
		Content string  `json:"content" mapstructure:"content"`
		Link    *string `json:"link" mapstructure:"link"`
	} `json:"text" mapstructure:"text"`
	PlainText string `json:"plain_text" mapstructure:"plain_text"`
}

func (client *NotionAPIClientImpl) loadAllPages(ctx context.Context, integration NotionIntegrationConnection) (map[string]IndexedDocument, error) {
	var cursor *string
	var indexedDocuments = make(map[string]IndexedDocument)

	for {
		body := map[string]any{
			"query":     "",
			"page_size": 100,
			"filter": map[string]any{
				"property": "object",
				"value":    "page",
			},
		}
		if cursor != nil {
			body["start_cursor"] = *cursor
		}
		marshalledBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.notion.com/v1/search", bytes.NewBuffer(marshalledBody))
		if err != nil {
			return nil, err
		}

		req.Header.Set("Authorization", "Bearer "+integration.Config.AcessToken)

		req.Header.Set("Notion-Version", "2022-06-28")
		req.Header.Set("Content-Type", "application/json")

		res, err := backoff.RetryWithData[*http.Response](
			func() (*http.Response, error) {
				res, err := client.httpClient.Do(req)
				if err != nil {
					if err, ok := err.(net.Error); ok && err.Timeout() {
						return nil, err
					}
					return nil, backoff.Permanent(err)
				}

				// While only 3 requests can be run at the same time, requests will be quicker than a second,
				// so we still need to handle rate-limiting and retry gracefully
				if res.StatusCode == http.StatusTooManyRequests {
					return nil, fmt.Errorf("rate limited")
				}

				if res.StatusCode != http.StatusOK {
					return nil, backoff.Permanent(fmt.Errorf("unexpected status code: %d", res.StatusCode))
				}

				return res, nil
			},
			newBackOff(ctx, 10),
		)
		if err != nil {
			return nil, err
		}

		type searchResp struct {
			Results []struct {
				Id             string         `json:"id" mapstructure:"id"`
				LastEditedTime string         `json:"last_edited_time" mapstructure:"last_edited_time"`
				Properties     map[string]any `json:"properties" mapstructure:"properties"`
				URL            string         `json:"url" mapstructure:"url"`
			} `json:"results"`
			NextCursor *string `json:"next_cursor"`
			HasMore    bool    `json:"has_more"`
		}

		var searchResponse searchResp
		err = json.NewDecoder(res.Body).Decode(&searchResponse)
		if err != nil {
			return nil, err
		}

		for _, result := range searchResponse.Results {
			indexedDocuments[result.Id] = IndexedDocument{
				Integration:        IntegrationNotion,
				DocumentType:       "page",
				Id:                 result.Id,
				Title:              extractTitle(result.Properties),
				URL:                result.URL,
				FreshnessIndicator: result.LastEditedTime,
			}
		}

		if !searchResponse.HasMore {
			break
		}

		cursor = searchResponse.NextCursor
	}

	return indexedDocuments, nil
}

func (client *NotionAPIClientImpl) loadDatabaseIds(ctx context.Context, integration NotionIntegrationConnection) ([]string, error) {
	var cursor *string
	var databaseIds []string

	for {
		body := map[string]any{
			"query":     "",
			"page_size": 100,
			"filter": map[string]any{
				"property": "object",
				"value":    "database",
			},
		}
		if cursor != nil {
			body["start_cursor"] = *cursor
		}
		marshalledBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.notion.com/v1/search", bytes.NewBuffer(marshalledBody))
		if err != nil {
			return nil, err
		}

		req.Header.Set("Authorization", "Bearer "+integration.Config.AcessToken)

		req.Header.Set("Notion-Version", "2022-06-28")
		req.Header.Set("Content-Type", "application/json")

		res, err := backoff.RetryWithData[*http.Response](
			func() (*http.Response, error) {
				res, err := client.httpClient.Do(req)
				if err != nil {
					if err, ok := err.(net.Error); ok && err.Timeout() {
						return nil, err
					}
					return nil, backoff.Permanent(err)
				}

				// While only 3 requests can be run at the same time, requests will be quicker than a second,
				// so we still need to handle rate-limiting and retry gracefully
				if res.StatusCode == http.StatusTooManyRequests {
					return nil, fmt.Errorf("rate limited")
				}

				if res.StatusCode != http.StatusOK {
					return nil, backoff.Permanent(fmt.Errorf("unexpected status code: %d", res.StatusCode))
				}

				return res, nil
			},
			newBackOff(ctx, 10),
		)
		if err != nil {
			return nil, err
		}

		type searchResp struct {
			Results []struct {
				Id string `json:"id" mapstructure:"id"`
			} `json:"results"`
			NextCursor *string `json:"next_cursor"`
			HasMore    bool    `json:"has_more"`
		}

		var searchResponse searchResp
		err = json.NewDecoder(res.Body).Decode(&searchResponse)
		if err != nil {
			return nil, err
		}

		for _, result := range searchResponse.Results {
			databaseIds = append(databaseIds, result.Id)
		}

		if !searchResponse.HasMore {
			break
		}

		cursor = searchResponse.NextCursor
	}

	return databaseIds, nil
}

func (client *NotionAPIClientImpl) loadDatabasePages(ctx context.Context, integration NotionIntegrationConnection, databaseId string) ([]IndexedDocument, error) {
	// TODO Reliably list _all_ pages integration can access
	// TODO Maybe load databases separately and then fetch all their items

	var cursor *string
	var indexedDocuments []IndexedDocument

	for {
		body := map[string]any{
			"page_size": 100,
		}
		if cursor != nil {
			body["start_cursor"] = *cursor
		}
		marshalledBody, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}

		req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("https://api.notion.com/v1/databases/%s/query", databaseId), bytes.NewBuffer(marshalledBody))
		if err != nil {
			return nil, err
		}

		req.Header.Set("Authorization", "Bearer "+integration.Config.AcessToken)

		req.Header.Set("Notion-Version", "2022-06-28")
		req.Header.Set("Content-Type", "application/json")

		res, err := backoff.RetryWithData[*http.Response](
			func() (*http.Response, error) {
				res, err := client.httpClient.Do(req)
				if err != nil {
					if err, ok := err.(net.Error); ok && err.Timeout() {
						return nil, err
					}
					return nil, backoff.Permanent(err)
				}

				// While only 3 requests can be run at the same time, requests will be quicker than a second,
				// so we still need to handle rate-limiting and retry gracefully
				if res.StatusCode == http.StatusTooManyRequests {
					return nil, fmt.Errorf("rate limited")
				}

				if res.StatusCode != http.StatusOK {
					return nil, backoff.Permanent(fmt.Errorf("unexpected status code: %d", res.StatusCode))
				}

				return res, nil
			},
			newBackOff(ctx, 10),
		)
		if err != nil {
			return nil, err
		}

		type searchResp struct {
			Results []struct {
				Id             string         `json:"id" mapstructure:"id"`
				LastEditedTime string         `json:"last_edited_time" mapstructure:"last_edited_time"`
				Properties     map[string]any `json:"properties" mapstructure:"properties"`
				URL            string         `json:"url" mapstructure:"url"`
			} `json:"results"`
			NextCursor *string `json:"next_cursor"`
			HasMore    bool    `json:"has_more"`
		}

		var searchResponse searchResp
		err = json.NewDecoder(res.Body).Decode(&searchResponse)
		if err != nil {
			return nil, err
		}

		for _, result := range searchResponse.Results {
			indexedDocuments = append(indexedDocuments, IndexedDocument{
				Integration:        IntegrationNotion,
				DocumentType:       "page",
				Id:                 result.Id,
				Title:              extractTitle(result.Properties),
				URL:                result.URL,
				FreshnessIndicator: result.LastEditedTime,
			})
		}

		if !searchResponse.HasMore {
			break
		}

		cursor = searchResponse.NextCursor
	}

	return indexedDocuments, nil
}

func (client *NotionAPIClientImpl) ListDocuments(ctx context.Context, integration IntegrationConnection) (map[string]IndexedDocument, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return nil, err
	}
	defer client.sema.Release(1)

	client.logger.Printf("Listing all Notion pages\n")

	allPages, err := client.loadAllPages(ctx, integration.NotionIntegrationConnection)
	if err != nil {
		return nil, err
	}

	client.logger.Printf("Listing all Notion databases\n")

	databaseIds, err := client.loadDatabaseIds(ctx, integration.NotionIntegrationConnection)
	if err != nil {
		return nil, err
	}

	for _, databaseId := range databaseIds {
		client.logger.Printf("Listing all Notion database pages for database %q\n", databaseId)
		databasePages, err := client.loadDatabasePages(ctx, integration.NotionIntegrationConnection, databaseId)
		if err != nil {
			return nil, err
		}

		for _, databasePage := range databasePages {
			allPages[databasePage.Id] = databasePage
		}
	}

	client.logger.Printf("Found %d shared Notion pages\n", len(allPages))

	return allPages, nil
}

func (client *NotionAPIClientImpl) GetDocumentContent(ctx context.Context, documentType, id string, integration IntegrationConnection) (string, map[string]any, error) {
	err := client.sema.Acquire(ctx, 1)
	if err != nil {
		return "", nil, err
	}
	defer client.sema.Release(1)

	body := map[string]any{
		"pageId": id,
		"token":  integration.NotionIntegrationConnection.Config.AcessToken,
	}
	marshalledBody, err := json.Marshal(body)
	if err != nil {
		return "", nil, fmt.Errorf("unable to marshal body, %w", err)
	}

	res, err := backoff.RetryWithData[*http.Response](
		func() (*http.Response, error) {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, fmt.Sprintf("%s/notion/markdown", client.notionHelperEndpoint), bytes.NewBuffer(marshalledBody))
			if err != nil {
				return nil, err
			}

			req.Header.Set("Content-Type", "application/json")

			res, err := client.httpClient.Do(req)
			if err != nil {
				if err, ok := err.(net.Error); ok && err.Timeout() {
					return nil, err
				}
				return nil, backoff.Permanent(err)
			}

			// While only 3 requests can be run at the same time, requests will be quicker than a second,
			// so we still need to handle rate-limiting and retry gracefully
			if res.StatusCode == http.StatusTooManyRequests {
				return nil, fmt.Errorf("rate limited")
			}

			if res.StatusCode != http.StatusOK {
				return nil, backoff.Permanent(fmt.Errorf("unexpected status code: %d", res.StatusCode))
			}

			return res, nil
		},
		newBackOff(ctx, 10),
	)
	if err != nil {
		return "", nil, fmt.Errorf("unable to get page markdown content, %w", err)
	}

	type notionMarkdownResponse struct {
		Markdown string `json:"markdown"`
	}

	var notionMarkdownResponseData notionMarkdownResponse
	err = json.NewDecoder(res.Body).Decode(&notionMarkdownResponseData)
	if err != nil {
		return "", nil, fmt.Errorf("unable to decode response, %w", err)
	}

	return notionMarkdownResponseData.Markdown, make(map[string]any), nil
}

func extractTitle(props map[string]any) string {
	var title string
	for _, a := range props {
		asMap, ok := a.(map[string]any)
		if !ok {
			continue
		}

		if asMap["type"] != "title" {
			continue
		}

		titleProperty := TitleProperty{}
		err := mapstructure.Decode(asMap, &titleProperty)
		if err != nil {
			continue
		}

		for _, text := range titleProperty.Title {
			title += text.PlainText
		}
		break
	}

	return title
}

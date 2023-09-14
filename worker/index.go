package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/aws/aws-sdk-go-v2/service/sqs/types"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/newrelic/go-agent/v3/newrelic"
	"github.com/sirupsen/logrus"
	"golang.org/x/sync/errgroup"
	"time"
)

type IndexedDocument struct {
	Integration        Integration `json:"integration"`
	DocumentType       string      `json:"documentType"`
	Id                 string      `json:"id"`
	Title              string      `json:"title"`
	URL                string      `json:"url"`
	FreshnessIndicator string      `json:"freshnessIndicator"`
}

type DataSourceApiClient interface {
	ListDocuments(ctx context.Context, integration IntegrationConnection) (map[string]IndexedDocument, error)
	GetDocumentContent(ctx context.Context, documentType string, id string, integration IntegrationConnection) (string, map[string]any, error)
	GetDocument(ctx context.Context, documentType string, id string, integration IntegrationConnection) (IndexedDocument, error)
}

func getDataSource(sources []PipelineDataSource, id string) *PipelineDataSource {
	for _, source := range sources {
		if source.Id == id {
			return &source
		}
	}

	return nil
}

func retrieveAllDocuments(
	ctx context.Context,
	dataSource *PipelineDataSource,
	integration IntegrationConnection,
	clients map[Integration]DataSourceApiClient,
) (map[string]IndexedDocument, error) {
	return clients[integration.Integration].ListDocuments(ctx, integration)
}

func getDocumentTextContent(
	ctx context.Context,
	document IndexedDocument,
	integration IntegrationConnection,
	clients map[Integration]DataSourceApiClient,
) (string, map[string]any, error) {
	return clients[integration.Integration].GetDocumentContent(ctx, document.DocumentType, document.Id, integration)
}

func now() *time.Time {
	now := time.Now()
	return &now
}

type IndexMessage struct {
	Kind      string              `json:"kind"`
	AccountId string              `json:"accountId"`
	MessageId string              `json:"messageId"`
	Payload   IndexMessagePayload `json:"payload"`
}

type IndexMessagePayload struct {
	PipelineId   string `json:"pipelineId"`
	RunId        string `json:"runId"`
	DataSourceId string `json:"dataSourceId"`
}

func totalIndexedDocumentsLimit(isSubscriber bool) int {
	if isSubscriber {
		return 1000 // 1 document * 1000 syncs or 100 documents * 10 syncs, etc.
	}
	return 100
}

func documentTokenLimit(isSubscriber bool) int {
	if isSubscriber {
		return 100_000 // 100_000 tokens = $0,01 * 1000 syncs = $10
	}
	return 1000
}

// processIndexMessage handles index messages, returning an error ONLY if message should be re-delivered to other worker
func processIndexMessage(pool *pgxpool.Pool, newrelicApp *newrelic.Application, clients map[Integration]DataSourceApiClient, documentHelper DocumentHelper, openAIApiKey string) workerHandlerFunc {
	return func(ctx context.Context, logger logrus.FieldLogger, msg types.Message) error {
		newrelicTxn := newrelicApp.StartTransaction("ProcessIndexMessage")
		defer newrelicTxn.End()
		ctx = newrelic.NewContext(ctx, newrelicTxn)

		logger.Printf("Processing index message %q\n", *msg.MessageId)

		if msg.Body == nil {
			return fmt.Errorf("message body is nil")
		}

		deserializedMsg := IndexMessage{}

		err := json.Unmarshal([]byte(*msg.Body), &deserializedMsg)
		if err != nil {
			return fmt.Errorf("unable to unmarshal message, %w", err)
		}

		newrelicTxn.AddAttribute("pipelineId", deserializedMsg.Payload.PipelineId)
		newrelicTxn.AddAttribute("pipelineRunId", deserializedMsg.Payload.RunId)
		newrelicTxn.AddAttribute("pipelineRunDataSourceId", deserializedMsg.Payload.DataSourceId)
		newrelicTxn.AddAttribute("accountId", deserializedMsg.AccountId)
		newrelicTxn.SetUserID(deserializedMsg.AccountId)

		innerHandler := func() error {
			segment := newrelicTxn.StartSegment("FetchRunDetails")
			defer segment.End()

			// TODO For some fatal errors that won't be solved by waiting and receiving the next request,
			// TODO kill the worker and let it be restarted by the health check
			// TODO Since this process may be running multiple workers, we need to figure out proper handling
			pipelineRunStep, err := GetPipelineStep(ctx, pool, deserializedMsg.Payload.RunId, deserializedMsg.Payload.DataSourceId)
			if err != nil {
				return fmt.Errorf("unable to get step in stage, %w", err)
			}

			pipeline, err := GetPipeline(ctx, pool, deserializedMsg.Payload.PipelineId)
			if err != nil {
				return fmt.Errorf("unable to get pipeline, %w", err)
			}

			pipelineRun, err := GetPipelineRun(ctx, pool, deserializedMsg.Payload.RunId)
			if err != nil {
				return fmt.Errorf("unable to get pipeline run, %w", err)
			}

			// If step doesn't exist, retrying doesn't make sense
			if pipelineRunStep == nil {
				logger.Printf("Pipeline run step not found, skipping\n")
				return nil
			}

			dataSource := getDataSource(pipeline.Config.DataSources, pipelineRunStep.DataSource)
			if dataSource == nil {
				return fmt.Errorf("data source not found")
			}

			integrationConnection, err := GetIntegrationConnection(ctx, pool, pipeline.Account, dataSource.IntegrationName)
			if err != nil {
				return fmt.Errorf("unable to get integration connection, %w", err)
			}

			account, err := GetAccount(ctx, pool, pipeline.Account)
			if err != nil {
				return fmt.Errorf("unable to get account: %w", err)
			}

			segment.End()

			segment = newrelicTxn.StartSegment("RunIndex")
			defer segment.End()

			startedAt := now()
			if dataSource.IsEnabled && !account.IsSuspended {
				// Set step to running, use separate tx so report goes out already
				err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusRunning, nil, startedAt, nil)
				if err != nil {
					return fmt.Errorf("unable to update pipeline run step, %w", err)
				}

			} else {
				logger.Printf("Data source %q is disabled, skipping\n", dataSource.Id)

				err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusCompleted, nil, startedAt, now())
				if err != nil {
					return fmt.Errorf("unable to update pipeline run step, %w", err)
				}

				return nil
			}

			if integrationConnection == nil {
				logger.Printf("Integration connection not found for integration %q\n", dataSource.IntegrationName)
				return nil
			}

			checkFlaggedAndSuspend := func(err error) error {
				docHelperError := &DocumentHelperError{}
				if errors.As(err, &docHelperError) {
					if docHelperError.Code == DocumentHelperErrorCodeFlaggedContent {
						logger.Printf("Document helper returned flagged content error, suspending account %q\n", account.Id)
						newrelicTxn.NoticeError(docHelperError)
						err = SuspendAccount(ctx, pool, account.Id)
						if err != nil {
							return fmt.Errorf("unable to suspend account: %w", err)
						}
					}
				}
				return nil
			}

			switch pipelineRun.SyncMode {
			case FullIndexSyncMode:
				logger.Printf("Running full index for pipeline %q\n", pipeline.Id)

				err = runFullIndex(ctx, logger, newrelicTxn, clients, pool, documentHelper, openAIApiKey, dataSource, integrationConnection, *pipeline, *pipelineRunStep, startedAt, *account)
				if err != nil {
					logger.Printf("unable to run full index, %v", err)

					err = checkFlaggedAndSuspend(err)
					if err != nil {
						return fmt.Errorf("unable to check flagged and suspend: %w", err)
					}

					// Set step to completed
					err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusFailed, &RunError{
						Code:    "index_failed",
						Message: "Unable to run full index",
					}, startedAt, nil)
					if err != nil {
						return fmt.Errorf("unable to update pipeline run step, %w", err)
					}

					return nil
				}
			case SingleDocumentSyncMode:
				if !account.IsUnlimited {
					if account.TotalIndexedDocumentCount+1 >= totalIndexedDocumentsLimit(account.IsSubscriber) {
						// Set step to failed
						err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusFailed, &RunError{
							Code:    "limit_exceeded",
							Message: "Exceeded total indexed document limit",
						}, startedAt, nil)
						if err != nil {
							return fmt.Errorf("unable to update pipeline run step, %w", err)
						}

						return nil
					}
					err = IncreaseTotalIndexedCount(ctx, pool, account.Id, 1)
					if err != nil {
						return fmt.Errorf("unable to update quotas: %w", err)
					}
				}

				if pipelineRun.Trigger == PipelineRunTriggerIntegrationChangeEvent {
					err = handleDocumentChange(ctx, logger, newrelicTxn, clients, pool, documentHelper, openAIApiKey, dataSource, integrationConnection, *pipeline, pipelineRun.IntegrationChangeEvent.Change, documentTokenLimit(account.IsSubscriber))
					if err != nil {
						logger.Printf("unable to handle document change, %v", err)

						err = checkFlaggedAndSuspend(err)
						if err != nil {
							return fmt.Errorf("unable to check flagged and suspend: %w", err)
						}

						// Set step to completed
						err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusFailed, &RunError{
							Code:    "single_document_sync_failed",
							Message: "Unable to sync single document",
						}, startedAt, nil)
						if err != nil {
							return fmt.Errorf("unable to update pipeline run step, %w", err)
						}

						return nil
					}
				}

				// Set step to completed
				err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusCompleted, nil, startedAt, now())
				if err != nil {
					return fmt.Errorf("unable to update pipeline run step, %w", err)
				}
			}

			return nil
		}

		err = innerHandler()
		if err != nil {
			newrelicTxn.NoticeError(err)
			return fmt.Errorf("unable to process index message, %w", err)
		}

		return nil
	}
}

func retrieveIngestAndUpsert(ctx context.Context, logger logrus.FieldLogger, newrelicTxn *newrelic.Transaction, pool *pgxpool.Pool, doc IndexedDocument, pipeline Pipeline, dataSource *PipelineDataSource, integrationConnection *IntegrationConnection, clients map[Integration]DataSourceApiClient, documentHelper DocumentHelper, openAIApiKey string, tokenLimit int) error {
	segment := newrelicTxn.StartSegment(fmt.Sprintf("RetrieveAndIngestDocument/%s/%s/%s", doc.Integration, doc.DocumentType, doc.Id))
	defer segment.End()

	segment.AddAttribute("integration", doc.Integration)
	segment.AddAttribute("documentType", doc.DocumentType)
	segment.AddAttribute("documentId", doc.Id)

	//  Only update if indexed document is newer than existing document
	existingDoc, err := GetDocumentForIntegration(ctx, pool, pipeline.Account, pipeline.Id, doc.Integration, doc.DocumentType, doc.Id)
	if err != nil {
		return fmt.Errorf("unable to get existing document, %w", err)
	}
	if existingDoc != nil && existingDoc.FreshnessIndicator != nil && *existingDoc.FreshnessIndicator == doc.FreshnessIndicator {
		logger.Printf("Skipping document %q, already fresh\n", doc.Id)
		return nil
	}

	segment = newrelicTxn.StartSegment(fmt.Sprintf("RetrieveDocument/%s/%s/%s", doc.Integration, doc.DocumentType, doc.Id))
	defer segment.End()

	logger.Printf("Retrieving text content for document %q\n", doc.Id)

	// Load full document content as text  (using helper API)
	textContent, metadata, err := getDocumentTextContent(ctx, doc, *integrationConnection, clients)
	if err != nil {
		return fmt.Errorf("unable to get document text content, %w", err)
	}

	segment.End()

	segment = newrelicTxn.StartSegment(fmt.Sprintf("CountTokens/%s/%s/%s", doc.Integration, doc.DocumentType, doc.Id))
	defer segment.End()

	tokenCount, err := documentHelper.CountDocumentTokens(ctx, textContent)
	if err != nil {
		return fmt.Errorf("unable to count document tokens, %w", err)
	}

	segment.End()

	if tokenCount > tokenLimit {
		logger.Printf("Skipping ingestion for document %q, token limit exceeded\n", doc.Id)
	} else {
		segment = newrelicTxn.StartSegment(fmt.Sprintf("IngestDocument/%s/%s/%s", doc.Integration, doc.DocumentType, doc.Id))
		defer segment.End()

		logger.Printf("Ingesting document %q\n", doc.Id)

		err := documentHelper.IngestDocument(
			ctx,
			dataSource.TextSplitter,
			pipeline.Config.Embeddings,
			pipeline.Config.DataSinks,
			openAIApiKey,
			doc,
			textContent,
			metadata,
		)
		if err != nil {
			return fmt.Errorf("unable to ingest document, %w", err)
		}

		segment.End()

		err = IncreaseTotalDocumentTokens(ctx, pool, pipeline.Account, tokenCount)
		if err != nil {
			logger.Errorf("unable to increase total document tokens: %v", err)
		}
	}

	now := time.Now()
	upsertDoc := &Document{
		AccountId:          pipeline.Account,
		PipelineId:         pipeline.Id,
		Integration:        doc.Integration,
		DocumentType:       doc.DocumentType,
		Id:                 doc.Id,
		CreatedAt:          now,
		UpdatedAt:          &now,
		Title:              doc.Title,
		URL:                doc.URL,
		FreshnessIndicator: &doc.FreshnessIndicator,
		TokenCount:         tokenCount,
		ExceedsTokenLimit:  tokenCount > tokenLimit,
	}
	err = UpsertDocument(ctx, pool, upsertDoc)
	if err != nil {
		return fmt.Errorf("unable to upsert document, %w", err)
	}

	logger.Printf("Ingested document %q\n", doc.Id)

	return nil
}

func deleteDocument(ctx context.Context, pool *pgxpool.Pool, documentHelper DocumentHelper, integration Integration, docType, docId string, pipeline Pipeline) error {
	// Delete documents from downstream stores
	err := documentHelper.DeleteDocument(ctx, pipeline.Config.DataSinks, integration, docType, docId)
	if err != nil {
		return fmt.Errorf("unable to delete document from sinks: %w", err)
	}

	// Finally drop from database
	err = DeleteDocument(ctx, pool, pipeline.Account, pipeline.Id, integration, docType, docId)
	if err != nil {
		return fmt.Errorf("unable to delete document from db: %w", err)
	}

	return nil
}

func runFullIndex(ctx context.Context, logger logrus.FieldLogger, newrelicTxn *newrelic.Transaction, clients map[Integration]DataSourceApiClient, pool *pgxpool.Pool, documentHelper DocumentHelper, openAIApiKey string, dataSource *PipelineDataSource, integrationConnection *IntegrationConnection, pipeline Pipeline, pipelineRunStep PipelineRunStep, startedAt *time.Time, account Account) error {
	// Perform full ETL run/index: Load all documents from integration, upsert into database, sync to downstream stores and delete documents that no longer exist

	segment := newrelicTxn.StartSegment("RetrieveAllDocuments")
	defer segment.End()

	// Find all documents (pages, tickets, etc. from the integration)
	indexedDocs, err := retrieveAllDocuments(ctx, dataSource, *integrationConnection, clients)
	if err != nil {
		return fmt.Errorf("unable to run index, %w", err)
	}

	segment.End()

	if !account.IsUnlimited {
		segment = newrelicTxn.StartSegment("CheckQuotas")
		defer segment.End()

		remainingAllowedDocs := totalIndexedDocumentsLimit(account.IsSubscriber) - account.TotalIndexedDocumentCount
		if remainingAllowedDocs == 0 {
			err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusFailed, &RunError{
				Code:    "limit_exceeded",
				Message: "Exceeded total indexed document limit",
			}, nil, nil)
			if err != nil {
				return fmt.Errorf("unable to update pipeline run step, %w", err)
			}
		}

		sliced := make(map[string]IndexedDocument)
		for k, v := range indexedDocs {
			if len(sliced) == remainingAllowedDocs {
				break
			}

			sliced[k] = v
			delete(indexedDocs, k)
		}
		indexedDocs = sliced

		err = IncreaseTotalIndexedCount(ctx, pool, account.Id, len(indexedDocs))
		if err != nil {
			return fmt.Errorf("unable to update quotas: %w", err)
		}

		segment.End()
	}

	segment = newrelicTxn.StartSegment("RetrieveAndIngestDocuments")
	defer segment.End()

	logger.Printf("Ingesting %d documents\n", len(indexedDocs))

	// Simply insert all docs (so database will now have old (potentially deleted + just updated docs) + newly-created docs)
	{
		g, ctx := errgroup.WithContext(ctx)
		for _, doc := range indexedDocs {
			doc := doc // https://golang.org/doc/faq#closures_and_goroutines
			g.Go(func() error {
				return retrieveIngestAndUpsert(ctx, logger, newrelicTxn, pool, doc, pipeline, dataSource, integrationConnection, clients, documentHelper, openAIApiKey, documentTokenLimit(account.IsSubscriber))
			})
		}

		err = g.Wait()
		if err != nil {
			return fmt.Errorf("unable to upsert documents, %w", err)
		}
	}

	segment.End()

	segment = newrelicTxn.StartSegment("DeleteDocuments")
	defer segment.End()

	foundDocIds := make([]string, 0)
	for _, doc := range indexedDocs {
		foundDocIds = append(foundDocIds, doc.Id)
	}

	// Since we just performed a full load of all documents, we can assume that previously-indexed
	// documents not part of foundDocIds have been deleted in the integration (source of truth)
	deletedDocs, err := GetMissingDocuments(ctx, pool, pipeline.Account, pipeline.Id, integrationConnection.Integration, foundDocIds)
	if err != nil {
		return fmt.Errorf("unable to get deleted documents, %w", err)
	}

	{
		g, ctx := errgroup.WithContext(ctx)
		for _, doc := range deletedDocs {
			doc := doc // https://golang.org/doc/faq#closures_and_goroutines
			g.Go(func() error {
				return deleteDocument(ctx, pool, documentHelper, doc.Integration, doc.DocumentType, doc.Id, pipeline)
			})
		}

		err = g.Wait()
		if err != nil {
			return fmt.Errorf("unable to delete documents, %w", err)
		}
	}

	segment.End()

	// Set step to completed
	err = UpdatePipelineRunStep(ctx, pool, pipelineRunStep.PipelineRun, pipelineRunStep.DataSource, PipelineRunStepStatusCompleted, nil, startedAt, now())
	if err != nil {
		return fmt.Errorf("unable to update pipeline run step, %w", err)
	}

	return nil
}

func handleDocumentChange(ctx context.Context, logger logrus.FieldLogger, newrelicTxn *newrelic.Transaction, clients map[Integration]DataSourceApiClient, pool *pgxpool.Pool, documentHelper DocumentHelper, openAIApiKey string, dataSource *PipelineDataSource, integrationConnection *IntegrationConnection, pipeline Pipeline, change DocumentChange, tokenLimit int) error {
	linearClient := clients[integrationConnection.Integration]
	switch change.Action {
	case ChangeActionCreate:
		fallthrough
	case ChangeActionUpdate:
		doc, err := linearClient.GetDocument(ctx, change.DocumentType, change.DocumentId, *integrationConnection)
		if err != nil {
			return fmt.Errorf("unable to get document, %w", err)
		}

		return retrieveIngestAndUpsert(ctx, logger, newrelicTxn, pool, doc, pipeline, dataSource, integrationConnection, clients, documentHelper, openAIApiKey, tokenLimit)
	case ChangeActionDelete:
		return deleteDocument(ctx, pool, documentHelper, integrationConnection.Integration, change.DocumentType, change.DocumentId, pipeline)
	}

	return nil
}

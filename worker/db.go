package main

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"time"
)

type Integration string

// Querier acts as abstraction to pass in Tx, Pool, and other client structures from pgx
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, arguments ...any) (commandTag pgconn.CommandTag, err error)
}

/*
from the https://pkg.go.dev/encoding/json#Marshal docs:

Anonymous struct fields are usually marshaled as if their inner exported fields were fields
in the outer struct, subject to the usual Go visibility rules amended as described in the next
paragraph. An anonymous struct field with a name given in its JSON tag is treated as having that
name, rather than being anonymous. An anonymous struct field of interface type is treated the same
as having that type as its name, rather than being anonymous.

The Go visibility rules for struct fields are amended for JSON when deciding which field to marshal
or unmarshal. If there are multiple fields at the same level, and that level is the least nested
(and would therefore be the nesting level selected by the usual Go rules), the following extra rules apply:

1) Of those fields, if any are JSON-tagged, only tagged fields are considered,
even if there are multiple untagged fields that would otherwise conflict.

2) If there is exactly one field (tagged or not according to the first rule), that is selected.

3) Otherwise there are multiple fields, and all are ignored; no error occurs.

Handling of anonymous struct fields is new in Go 1.1. Prior to Go 1.1, anonymous struct fields
were ignored. To force ignoring of an anonymous struct field in both current and earlier versions,
give the field a JSON tag of "-".
*/

const (
	IntegrationNotion Integration = "notion"
	IntegrationLinear Integration = "linear"
)

type Account struct {
	Id                        string    `json:"id"`
	Email                     string    `json:"email"`
	Name                      string    `json:"name"`
	IsSuspended               bool      `json:"is_suspended"`
	AgreeToTerms              bool      `json:"agree_to_terms"`
	CreatedAt                 time.Time `json:"created_at"`
	LastLoginAt               time.Time `json:"last_login_at"`
	IsSubscriber              bool      `json:"is_subscriber"`
	IsUnlimited               bool      `json:"is_unlimited"`
	TotalIndexedDocumentCount int       `json:"total_indexed_document_count"`
	TotalIndexDocumentTokens  int       `json:"total_indexed_document_tokens"`
}

func GetAccount(ctx context.Context, client Querier, accountId string) (*Account, error) {
	row := client.QueryRow(ctx, `
		SELECT id, email, name, is_suspended, agree_to_terms, created_at, last_login_at, is_subscriber, is_unlimited, total_indexed_document_count, total_indexed_document_tokens
		FROM langsync.account
		WHERE id = $1
	`, accountId)

	var account Account
	err := row.Scan(&account.Id, &account.Email, &account.Name, &account.IsSuspended, &account.AgreeToTerms, &account.CreatedAt, &account.LastLoginAt, &account.IsSubscriber, &account.IsUnlimited, &account.TotalIndexedDocumentCount, &account.TotalIndexDocumentTokens)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &account, nil
}

// IncreaseTotalIndexedCount simply increases total_indexed_document_count by countToAdd. Because multiple workers may
// run at a given time, adding instead of overwriting is important. This way we don't lose any counts.
func IncreaseTotalIndexedCount(ctx context.Context, client Querier, accountId string, countToAdd int) error {
	_, err := client.Exec(ctx, `
		UPDATE langsync.account
		SET total_indexed_document_count = total_indexed_document_count + $2
		WHERE id = $1
	`, accountId, countToAdd)
	return err
}

func IncreaseTotalDocumentTokens(ctx context.Context, client Querier, accountId string, tokensToAdd int) error {
	_, err := client.Exec(ctx, `
		UPDATE langsync.account
		SET total_indexed_document_tokens = total_indexed_document_tokens + $2
		WHERE id = $1
	`, accountId, tokensToAdd)
	return err
}

type IntegrationConnectionBase struct {
	Account     string      `json:"account"`
	Integration Integration `json:"integration_name"`
	ConnectedAt string      `json:"connected_at"`
}

type NotionIntegrationConnection struct {
	Config struct {
		AcessToken    string `json:"access_token"`
		BotId         string `json:"bot_id"`
		WorkspaceId   string `json:"workspace_id"`
		WorkspaceName string `json:"workspace_name"`
		WorkspaceIcon string `json:"workspace_icon"`
	} `json:"config"`
}

type LinearIntegrationConnection struct {
	Config struct {
		AccessToken string `json:"access_token"`
		TokenType   string `json:"token_type"`
	} `json:"config"`
}

type IntegrationConnection struct {
	// see annotation above
	IntegrationConnectionBase
	NotionIntegrationConnection
	LinearIntegrationConnection
}

// Write UnmarshalJSON methods for IntegrationConnection
func (i *IntegrationConnection) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &i.IntegrationConnectionBase)
	if err != nil {
		return err
	}

	if i.Integration == IntegrationNotion {
		err := json.Unmarshal(data, &i.NotionIntegrationConnection)
		if err != nil {
			return err
		}

		return nil
	} else if i.Integration == IntegrationLinear {
		err := json.Unmarshal(data, &i.LinearIntegrationConnection)
		if err != nil {
			return err
		}
		return nil
	}

	return nil
}

type VectorStoreType string

const (
	VectorStoreTypeWeaviate VectorStoreType = "weaviate"
	VectorStoreTypeQdrant   VectorStoreType = "qdrant"
	VectorStoreTypeMilvus   VectorStoreType = "milvus"
	VectorStoreTypePinecone VectorStoreType = "pinecone"
)

type VectorStoreBase struct {
	StoreType VectorStoreType `json:"store_type"`
}

type PineconeVectorStore struct {
	Config json.RawMessage `json:"config"`
}

type WeaviateVectorStore struct {
	Config json.RawMessage `json:"config"`
}

type VectorStore struct {
	// see annotation above
	VectorStoreBase
	PineconeVectorStore
	WeaviateVectorStore
}

// Write UnmarshalJSON methods for VectorStore
func (v *VectorStore) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &v.VectorStoreBase)
	if err != nil {
		return err
	}

	if v.VectorStoreBase.StoreType == VectorStoreTypePinecone {
		err := json.Unmarshal(data, &v.PineconeVectorStore)
		if err != nil {
			return err
		}
		return nil
	} else if v.VectorStoreBase.StoreType == VectorStoreTypeWeaviate {
		err := json.Unmarshal(data, &v.WeaviateVectorStore)
		if err != nil {
			return err
		}
		return nil
	}

	return nil
}

// MarshalJSON marshals VectorStore, for why we use the non-pointer receiver, see: https://go.dev/ref/spec#Method_sets / https://stackoverflow.com/questions/39164471/marshaljson-not-called
func (v VectorStore) MarshalJSON() ([]byte, error) {
	switch v.VectorStoreBase.StoreType {
	case VectorStoreTypePinecone:
		type vectorStorePinecone struct {
			VectorStoreBase
			PineconeVectorStore
		}
		return json.Marshal(vectorStorePinecone{
			VectorStoreBase:     v.VectorStoreBase,
			PineconeVectorStore: v.PineconeVectorStore,
		})
	case VectorStoreTypeWeaviate:
		type vectorStoreWeaviate struct {
			VectorStoreBase
			WeaviateVectorStore
		}
		return json.Marshal(vectorStoreWeaviate{
			VectorStoreBase:     v.VectorStoreBase,
			WeaviateVectorStore: v.WeaviateVectorStore,
		})
	default:
		return nil, errors.New("unknown vector store type")
	}
}

type TextSplitterType string

const (
	TextSplitterTypeCharacter          TextSplitterType = "character"
	TextSplitterTypeRecursiveCharacter TextSplitterType = "recursive_character"
	TextSplitterTypeToken              TextSplitterType = "token"
)

type TextSplitterBase struct {
	Type TextSplitterType `json:"type"`
}

type RecursiveCharacterTextSplitter struct {
	Config struct {
		ChunkSize    int      `json:"chunk_size"`
		ChunkOverlap int      `json:"chunk_overlap"`
		Separators   []string `json:"separators"`
	} `json:"config"`
}

type TextSplitter struct {
	// see annotation above
	TextSplitterBase
	RecursiveCharacterTextSplitter
}

func (t *TextSplitter) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &t.TextSplitterBase)
	if err != nil {
		return err
	}

	if t.Type == TextSplitterTypeRecursiveCharacter {
		err := json.Unmarshal(data, &t.RecursiveCharacterTextSplitter)
		if err != nil {
			return err
		}
		return nil
	}

	return nil
}

func (t TextSplitter) MarshalJSON() ([]byte, error) {
	switch t.Type {
	case TextSplitterTypeRecursiveCharacter:
		type textSplitterRecursiveCharacter struct {
			TextSplitterBase
			RecursiveCharacterTextSplitter
		}
		return json.Marshal(textSplitterRecursiveCharacter{
			TextSplitterBase:               t.TextSplitterBase,
			RecursiveCharacterTextSplitter: t.RecursiveCharacterTextSplitter,
		})
	default:
		return nil, errors.New("unknown text splitter type")
	}
}

type PipelineDataSourceBase struct {
	Id              string       `json:"id"`
	IsEnabled       bool         `json:"is_enabled"`
	IntegrationName Integration  `json:"integration_name"`
	TextSplitter    TextSplitter `json:"text_splitter"`
}

type NotionDataSource struct {
}

type LinearDataSource struct {
}

type PipelineDataSource struct {
	// see annotation above
	PipelineDataSourceBase
	NotionDataSource
	LinearDataSource
}

func (p *PipelineDataSource) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &p.PipelineDataSourceBase)
	if err != nil {
		return err
	}

	if p.IntegrationName == IntegrationNotion {
		err := json.Unmarshal(data, &p.NotionDataSource)
		if err != nil {
			return err
		}
		return nil
	} else if p.IntegrationName == IntegrationLinear {
		err := json.Unmarshal(data, &p.LinearDataSource)
		if err != nil {
			return err
		}
		return nil
	}

	return nil
}

type DataSinkType string

const (
	DataSinkTypeVectorStore DataSinkType = "vector_store"
)

type PipelineDataSinkBase struct {
	Id        string       `json:"id"`
	Type      DataSinkType `json:"type"`
	IsEnabled bool         `json:"is_enabled"`
}

type VectorStoreDataSink struct {
	Config VectorStore `json:"config"`
}

type PipelineDataSink struct {
	// see annotation above
	PipelineDataSinkBase
	VectorStoreDataSink
}

func (d *PipelineDataSink) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &d.PipelineDataSinkBase)
	if err != nil {
		return err
	}

	if d.Type == DataSinkTypeVectorStore {
		err := json.Unmarshal(data, &d.VectorStoreDataSink)
		if err != nil {
			return err
		}

		return nil
	}

	return nil
}

func (d PipelineDataSink) MarshalJSON() ([]byte, error) {
	switch d.Type {
	case DataSinkTypeVectorStore:
		type dataSinkVectorStore struct {
			PipelineDataSinkBase
			VectorStoreDataSink
		}

		marshaled, err := json.Marshal(dataSinkVectorStore{
			PipelineDataSinkBase: d.PipelineDataSinkBase,
			VectorStoreDataSink:  d.VectorStoreDataSink,
		})
		if err != nil {
			return nil, err
		}
		return marshaled, nil
	default:
		return nil, errors.New("unknown data sink type")
	}
}

type EmbeddingType string

const (
	EmbeddingTypeOpenAI EmbeddingType = "openai"
)

type PipelineEmbeddingConfigBase struct {
	Type EmbeddingType `json:"type"`
}

type OpenAIEmbeddingConfig struct {
	Config struct {
		ApiKey string `json:"api_key"`
	} `json:"config"`
}

type PipelineEmbeddingConfig struct {
	// see annotation above
	PipelineEmbeddingConfigBase
	OpenAIEmbeddingConfig
}

func (e *PipelineEmbeddingConfig) UnmarshalJSON(data []byte) error {
	err := json.Unmarshal(data, &e.PipelineEmbeddingConfigBase)
	if err != nil {
		return err
	}

	if e.PipelineEmbeddingConfigBase.Type == EmbeddingTypeOpenAI {
		err := json.Unmarshal(data, &e.OpenAIEmbeddingConfig)
		if err != nil {
			return err
		}

		return nil
	}

	return nil
}

func (e PipelineEmbeddingConfig) MarshalJSON() ([]byte, error) {
	switch e.PipelineEmbeddingConfigBase.Type {
	case EmbeddingTypeOpenAI:
		type embeddingOpenAI struct {
			PipelineEmbeddingConfigBase
			OpenAIEmbeddingConfig
		}
		return json.Marshal(embeddingOpenAI{
			PipelineEmbeddingConfigBase: e.PipelineEmbeddingConfigBase,
			OpenAIEmbeddingConfig:       e.OpenAIEmbeddingConfig,
		})
	default:
		return nil, errors.New("unknown embedding type")
	}
}

type PipelineConfig struct {
	DataSources []PipelineDataSource    `json:"data_sources"`
	Embeddings  PipelineEmbeddingConfig `json:"embeddings"`
	DataSinks   []PipelineDataSink      `json:"data_sinks"`
}

type Pipeline struct {
	Id        string         `json:"id"`
	Account   string         `json:"account"`
	Name      string         `json:"name"`
	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt *time.Time     `json:"updated_at"`
	Config    PipelineConfig `json:"config"`
	IsEnabled bool           `json:"is_enabled"`
	IsDefault bool           `json:"is_default"`
}

type PipelineRunTrigger string

const (
	PipelineRunTriggerManual                 PipelineRunTrigger = "manual"
	PipelineRunTriggerSystem                 PipelineRunTrigger = "system"
	PipelineRunTriggerIntegrationChangeEvent PipelineRunTrigger = "integration_change_event"
)

type SyncMode string

const (
	FullIndexSyncMode      SyncMode = "full_index"
	SingleDocumentSyncMode SyncMode = "single_document"
)

type ChangeAction string

const (
	ChangeActionCreate ChangeAction = "create"
	ChangeActionUpdate ChangeAction = "update"
	ChangeActionDelete ChangeAction = "delete"
)

type DocumentChange struct {
	Action       ChangeAction `json:"action"`
	DocumentId   string       `json:"documentId"`
	DocumentType string       `json:"documentType"`
}

type IntegrationChangeEvent struct {
	Integration Integration    `json:"integration"`
	Change      DocumentChange `json:"change"`
}

type PipelineRun struct {
	Id                     string                  `json:"id"`
	Pipeline               string                  `json:"pipeline"`
	Trigger                PipelineRunTrigger      `json:"trigger"`
	SyncMode               SyncMode                `json:"sync_mode"`
	IntegrationChangeEvent *IntegrationChangeEvent `json:"integration_change_event"`
	CreatedAt              time.Time               `json:"created_at"`
	UpdatedAt              *time.Time              `json:"updated_at"`
}

type PipelineRunStepStatus string

const (
	PipelineRunStepStatusPending   PipelineRunStepStatus = "pending"
	PipelineRunStepStatusRunning   PipelineRunStepStatus = "running"
	PipelineRunStepStatusCompleted PipelineRunStepStatus = "completed"
	PipelineRunStepStatusFailed    PipelineRunStepStatus = "failed"
)

type PipelineRunStep struct {
	Pipeline    string `json:"pipeline"`
	PipelineRun string `json:"pipeline_run"`
	DataSource  string `json:"data_source"`

	CreatedAt   time.Time             `json:"created_at"`
	StartedAt   *time.Time            `json:"started_at"`
	CompletedAt *time.Time            `json:"completed_at"`
	Error       *RunError             `json:"error"`
	Status      PipelineRunStepStatus `json:"status"`
}

func GetPipeline(ctx context.Context, client Querier, pipelineId string) (*Pipeline, error) {
	row := client.QueryRow(ctx, `
		SELECT json_build_object('account', account, 'name', name, 'created_at', created_at, 'updated_at', updated_at, 'config', config, 'is_enabled', is_enabled, 'id', id, 'is_default', is_default)::text
		FROM langsync.pipeline
		WHERE id = $1
	`, pipelineId)

	var pipelineStr string
	err := row.Scan(&pipelineStr)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	pipeline := Pipeline{}
	err = json.Unmarshal([]byte(pipelineStr), &pipeline)
	if err != nil {
		return nil, err
	}

	return &pipeline, nil
}

func GetPipelineRun(ctx context.Context, client Querier, pipelineRunId string) (*PipelineRun, error) {
	row := client.QueryRow(ctx, `
		SELECT pipeline, trigger, created_at, updated_at, id, sync_mode, integration_change_event
		FROM langsync.pipeline_run
		WHERE id = $1
	`, pipelineRunId)

	pipelineRun := PipelineRun{}

	err := row.Scan(&pipelineRun.Pipeline, &pipelineRun.Trigger, &pipelineRun.CreatedAt, &pipelineRun.UpdatedAt, &pipelineRun.Id, &pipelineRun.SyncMode, &pipelineRun.IntegrationChangeEvent)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &pipelineRun, nil

}

func GetPipelineRunSteps(ctx context.Context, client Querier, pipelineRunId string) ([]PipelineRunStep, error) {
	rows, err := client.Query(ctx, `
		SELECT pipeline, pipeline_run, data_source, created_at, started_at, completed_at, error, status
		FROM langsync.pipeline_run_step
		WHERE pipeline_run = $1
	`, pipelineRunId)
	if err != nil {
		return nil, err
	}

	steps := make([]PipelineRunStep, 0)

	for rows.Next() {
		step := PipelineRunStep{}

		err := rows.Scan(&step.Pipeline, &step.PipelineRun, &step.DataSource, &step.CreatedAt, &step.StartedAt, &step.CompletedAt, &step.Error, &step.Status)
		if err != nil {
			return nil, err
		}

		steps = append(steps, step)
	}

	return steps, nil
}

func GetPipelineStep(ctx context.Context, client Querier, pipelineRunId string, dataSourceId string) (*PipelineRunStep, error) {
	row := client.QueryRow(ctx, `
		SELECT pipeline, pipeline_run, data_source, created_at, started_at, completed_at, error, status
		FROM langsync.pipeline_run_step
		WHERE pipeline_run = $1 AND data_source = $2
	`, pipelineRunId, dataSourceId)

	step := PipelineRunStep{}

	err := row.Scan(&step.Pipeline, &step.PipelineRun, &step.DataSource, &step.CreatedAt, &step.StartedAt, &step.CompletedAt, &step.Error, &step.Status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &step, nil
}

type RunError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func SuspendAccount(ctx context.Context, client Querier, accountId string) error {
	_, err := client.Exec(ctx, `
		update "langsync"."account" set is_suspended = true where id = $1
	`, accountId)
	return err
}

func UpdatePipelineRunStep(ctx context.Context, client Querier, pipelineRunId string, dataSourceId string, status PipelineRunStepStatus, error *RunError, startedAt, completedAt *time.Time) error {
	_, err := client.Exec(ctx, `
		UPDATE langsync.pipeline_run_step
		SET status = $3, error = $4, completed_at = $5, started_at = $6
		WHERE pipeline_run = $1 AND data_source = $2
	`, pipelineRunId, dataSourceId, status, error, completedAt, startedAt)

	return err
}

type Document struct {
	AccountId   string      `json:"account"`
	PipelineId  string      `json:"pipeline"`
	Integration Integration `json:"integration"`

	DocumentType string     `json:"document_type"`
	Id           string     `json:"id"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    *time.Time `json:"updated_at"`

	FreshnessIndicator *string `json:"freshness_indicator"`

	// Some basic preview information
	Title string `json:"title"`
	URL   string `json:"url"`

	TokenCount        int  `json:"token_count"`
	ExceedsTokenLimit bool `json:"exceeds_token_limit"`
}

func GetDocumentForIntegration(ctx context.Context, client Querier, accountId, pipelineId string, integration Integration, documentType string, documentId string) (*Document, error) {
	row := client.QueryRow(ctx, `
		SELECT account, pipeline, integration_name, document_type, id, created_at, updated_at, title, url, freshness_indicator::text, token_count, exceeds_token_limit
		FROM langsync.document
		WHERE account = $1 AND "pipeline" = $2 AND integration_name = $3 AND document_type = $4 AND id = $5
	`, accountId, pipelineId, integration, documentType, documentId)

	document := Document{}

	err := row.Scan(&document.AccountId, &document.PipelineId, &document.Integration, &document.DocumentType, &document.Id, &document.CreatedAt, &document.UpdatedAt, &document.Title, &document.URL, &document.FreshnessIndicator, &document.TokenCount, &document.ExceedsTokenLimit)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &document, nil
}

func GetIntegrationConnection(ctx context.Context, client Querier, accountId string, integration Integration) (*IntegrationConnection, error) {
	row := client.QueryRow(ctx, `
		SELECT json_build_object('account', account, 'integration_name', integration_name, 'connected_at', connected_at, 'config', config)::text
		FROM langsync.integration_connection
		WHERE account = $1 AND integration_name = $2
	`, accountId, integration)

	var connectionStr string

	err := row.Scan(&connectionStr)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	connection := IntegrationConnection{}
	err = json.Unmarshal([]byte(connectionStr), &connection)
	if err != nil {
		return nil, err
	}

	return &connection, nil
}

func UpsertDocument(ctx context.Context, client Querier, document *Document) error {
	_, err := client.Exec(ctx, `
		INSERT INTO langsync.document (account, pipeline, integration_name, document_type, id, created_at, updated_at, title, url, freshness_indicator, token_count, exceeds_token_limit)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (account, pipeline, integration_name, document_type, id) DO UPDATE
		SET created_at = $6, updated_at = $7, title = $8, url = $9, freshness_indicator = $10, token_count = $11, exceeds_token_limit = $12
	`, document.AccountId, document.PipelineId, document.Integration, document.DocumentType, document.Id, document.CreatedAt, document.UpdatedAt, document.Title, document.URL, document.FreshnessIndicator, document.TokenCount, document.ExceedsTokenLimit)

	return err
}

func DeleteDocument(ctx context.Context, client Querier, accountId string, pipelineId string, integration Integration, documentType string, documentId string) error {
	_, err := client.Exec(ctx, `
		DELETE FROM langsync.document
		WHERE account = $1 AND pipeline = $2 AND integration_name = $3 AND document_type = $4 AND id = $5
	`, accountId, pipelineId, integration, documentType, documentId)

	return err
}

func GetMissingDocuments(ctx context.Context, client Querier, accountId string, pipelineId string, integration Integration, existingIds []string) ([]Document, error) {
	// Find all documents with ids not in existingIds
	rows, err := client.Query(ctx, `
		SELECT account, pipeline, integration_name, document_type, id, created_at, updated_at, title, url, freshness_indicator::text, token_count, exceeds_token_limit
		FROM langsync.document
		WHERE account = $1 AND pipeline = $2 AND integration_name = $3 AND id NOT IN (SELECT * FROM unnest($4::text[]))
	`, accountId, pipelineId, integration, existingIds)
	if err != nil {
		return nil, err
	}

	documents := make([]Document, 0)

	for rows.Next() {
		document := Document{}

		err := rows.Scan(&document.AccountId, &document.PipelineId, &document.Integration, &document.DocumentType, &document.Id, &document.CreatedAt, &document.UpdatedAt, &document.Title, &document.URL, &document.FreshnessIndicator, &document.TokenCount, &document.ExceedsTokenLimit)
		if err != nil {
			return nil, err
		}

		documents = append(documents, document)
	}

	return documents, nil
}

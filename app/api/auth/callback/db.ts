import { db, QueryResult, QueryResultRow } from "@vercel/postgres";
import { nanoid } from "nanoid";
import { IntegrationChangeEvent } from "@/app/api/pipelines/dispatch";

type Primitive = string | number | boolean | undefined | null;
export type SqlFunc = <O extends QueryResultRow>(
  strings: TemplateStringsArray,
  ...values: Primitive[]
) => Promise<QueryResult<O>>;

function sqlTemplate(
  strings: TemplateStringsArray,
  ...values: any[]
): [string, Primitive[]] {
  var _a, _b;
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new Error(
      "It looks like you tried to call `sql` as a function. Make sure to use it as a tagged template.\n	Example: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
    );
  }
  let result = (_a = strings[0]) != null ? _a : "";
  for (let i = 1; i < strings.length; i++) {
    result += `$${i}${(_b = strings[i]) != null ? _b : ""}`;
  }
  return [result, values];
}
function isTemplateStringsArray(strings: TemplateStringsArray) {
  return (
    Array.isArray(strings) && "raw" in strings && Array.isArray(strings.raw)
  );
}

export async function withTransaction<T>(
  handler: (sql: SqlFunc) => Promise<T>,
) {
  const client = await db.connect();
  try {
    const customSqlFuncThatDoesntLoseContext = async <O extends QueryResultRow>(
      strings: TemplateStringsArray,
      ...values: Primitive[]
    ): Promise<QueryResult<O>> => {
      const [query, params] = sqlTemplate(strings, ...values);
      return client.query<O>(query, params);
    };

    const result = await handler(customSqlFuncThatDoesntLoseContext);
    await client.query("COMMIT");
    client.release();
    return result;
  } catch (err) {
    if (err instanceof Error) {
      await client.query("ROLLBACK");
      client.release(err);
      throw err;
    }
  }
}

export interface Document {
  id: string;
  account: string;
  pipeline: string;
  integration_name: Integration;
  document_type: string;
  created_at: string;
  updated_at: string | null;
  freshness_indicator: string | null;
  title: string | null;
  url: string | null;
  token_count: number;
  exceeds_token_limit: boolean;
}

export interface AuthAttempt {
  id: string;
  email: string;
  created_at: string;
  accepted_at: string | null;
  confirmation_code: string;
}

export async function findRecentAuthAttempt(
  sql: SqlFunc,
  email: string,
  code: string,
) {
  const { rows: findAuthAttemptRows } = await sql<AuthAttempt>`
        select *
        from "langsync"."auth_attempt"
        where
            "email" = ${email} and
            "confirmation_code" = ${code} and
            "created_at" > now() - interval '15 minutes'       
    `;
  if (findAuthAttemptRows.length === 0) {
    return null;
  }
  if (findAuthAttemptRows.length > 1) {
    throw new Error("Multiple auth attempts found");
  }
  return findAuthAttemptRows[0];
}

export async function countRecentAuthAttempts(sql: SqlFunc, email: string) {
  const { rows: countAuthAttemptRows } = await sql<{ count: number }>`
            select count(*)
            from "langsync"."auth_attempt"
            where
                "email" = ${email} and
                "created_at" > now() - interval '15 minutes'       
        `;
  return countAuthAttemptRows[0].count;
}

export interface Account {
  id: string;
  email: string;
  name: string | null;
  agree_to_terms: boolean;
  created_at: string;
  last_login_at: string;
  is_subscriber: boolean;
  is_suspended: boolean;
  is_unlimited: boolean;
  total_indexed_document_count: number;
  total_indexed_document_tokens: number;
}

export enum LinearDocumentType {
  Issue = "issue",
}

export async function findAccountByEmail(sql: SqlFunc, email: string) {
  const { rows: findAccountRows } = await sql<Account>`
            select *
            from "langsync"."account"
            where "email" = ${email}
        `;
  if (findAccountRows.length === 0) {
    return null;
  }
  if (findAccountRows.length > 1) {
    throw new Error("Multiple accounts found");
  }
  return findAccountRows[0];
}

export async function findAccountById(sql: SqlFunc, id: string) {
  const { rows: findAccountRows } = await sql<Account>`
            select *
            from "langsync"."account"
            where "id" = ${id}
        `;
  if (findAccountRows.length === 0) {
    return null;
  }
  if (findAccountRows.length > 1) {
    throw new Error("Multiple accounts found");
  }
  return findAccountRows[0];
}

export async function createAccount(
  sql: SqlFunc,
  email: string,
  isSubscriber: boolean,
) {
  const id = nanoid();
  const { rows: createAccountRows } = await sql<Account>`
            insert into "langsync"."account" ("id", "email", "is_subscriber", created_at, last_login_at)
            values (${id}, ${email}, ${isSubscriber}, now(), now())
            returning *
        `;
  if (createAccountRows.length !== 1) {
    throw new Error("Could not create account");
  }
  return createAccountRows[0];
}

export async function updateLastLoginAt(sql: SqlFunc, email: string) {
  const { rows: updateLastLoginAtRows } = await sql<Account>`
            update "langsync"."account"
            set "last_login_at" = now()
            where "email" = ${email}
            returning *
        `;
  if (updateLastLoginAtRows.length !== 1) {
    throw new Error("Could not update last login at");
  }
  return updateLastLoginAtRows[0];
}

export async function acceptAuthAttempt(sql: SqlFunc, id: string) {
  const { rows: acceptAuthAttemptRows } = await sql<AuthAttempt>`
            update "langsync"."auth_attempt"
            set "accepted_at" = now()
            where "id" = ${id}
            returning *
        `;
  if (acceptAuthAttemptRows.length !== 1) {
    throw new Error("Could not accept auth attempt");
  }
  return acceptAuthAttemptRows[0];
}

export async function createAuthAttempt(
  sql: SqlFunc,
  email: string,
  code: string,
) {
  const id = nanoid();
  const { rows: createAuthAttemptRows } = await sql<AuthAttempt>`
                insert into "langsync"."auth_attempt" ("id", "email", "confirmation_code", created_at)
                values (${id}, ${email}, ${code}, now())
                returning *
            `;
  if (createAuthAttemptRows.length !== 1) {
    throw new Error("Could not create auth attempt");
  }
  return createAuthAttemptRows[0];
}

export async function updateIsSubscriber(
  sql: SqlFunc,
  email: string,
  isSubscriber: boolean,
) {
  const { rows: updateIsSubscriberRows } = await sql<Account>`
            update "langsync"."account"
            set "is_subscriber" = ${isSubscriber}
            where "email" = ${email}
            returning *
        `;
  if (updateIsSubscriberRows.length !== 1) {
    throw new Error("Could not update is subscriber");
  }
  return updateIsSubscriberRows[0];
}

export async function suspendAccount(sql: SqlFunc, id: string) {
  const { rows: suspendAccountRows } = await sql<Account>`
                update "langsync"."account"
                set "is_suspended" = true
                where "id" = ${id}
                returning *
            `;
  if (suspendAccountRows.length !== 1) {
    throw new Error("Could not suspend account");
  }
  return suspendAccountRows[0];
}

export async function updateName(sql: SqlFunc, id: string, name: string) {
  const { rows: updateNameRows } = await sql<Account>`
                update "langsync"."account"
                set "name" = ${name}
                where "id" = ${id}
                returning *
            `;
  if (updateNameRows.length !== 1) {
    throw new Error("Could not update name");
  }
  return updateNameRows[0];
}

export async function updateAgreeToTerms(
  sql: SqlFunc,
  id: string,
  agreeToTerms: boolean,
) {
  const { rows: updateAgreeToTermsRows } = await sql<Account>`
                update "langsync"."account"
                set "agree_to_terms" = ${agreeToTerms}
                where "id" = ${id}
                returning *
            `;
  if (updateAgreeToTermsRows.length !== 1) {
    throw new Error("Could not update agree to terms");
  }
  return updateAgreeToTermsRows[0];
}

export async function countAccounts(sql: SqlFunc) {
  // Count distinct groups of non-subscriber, subscriber, and total accounts in one query
  const { rows: countAccountsRows } = await sql<{
    non_subscriber_count: number;
    subscriber_count: number;
    total_count: number;
  }>`
        select
            count(distinct case when "is_subscriber" = false then "id" end) as "non_subscriber_count",
            count(distinct case when "is_subscriber" = true then "id" end) as "subscriber_count",
            count(distinct "id") as "total_count"
        from "langsync"."account"
    `;
  if (countAccountsRows.length !== 1) {
    throw new Error("Could not count accounts");
  }

  return countAccountsRows[0];
}

export enum Integration {
  Notion = "notion",
  Linear = "linear",
}

export interface IntegrationConnectionBase {
  account: string;
  integration_name: Integration;
  connected_at: string;
  config: {};

  // workspace or organization ID contained in receiving webhooks
  workspace_id: string;
}

export interface NotionIntegrationConnection extends IntegrationConnectionBase {
  integration_name: Integration.Notion;
  config: {
    access_token: string;
    bot_id: string;
    workspace_id: string;
    workspace_name: string;
    workspace_icon: string;
  };
}

export interface LinearIntegrationConnection extends IntegrationConnectionBase {
  integration_name: Integration.Linear;
  config: {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string[];
    organization_id: string;
    organization_name: string;
    organization_logo?: string;
  };
}

export type IntegrationConnection =
  | NotionIntegrationConnection
  | LinearIntegrationConnection;

export enum VectorStoreType {
  Pinecone = "pinecone",
}

export interface VectorStoreBase {
  store_type: VectorStoreType;
  config: {};
}

export interface PineconeVectorStore extends VectorStoreBase {
  store_type: VectorStoreType.Pinecone;

  config: {
    api_key: string;
    environment: string;

    index_name: string;
    namespace: string;
  };
}

export type VectorStore = PineconeVectorStore;

export enum TextSplitterType {
  Character = "character",
  RecursiveCharacter = "recursive_character",
  Token = "token",
}

export interface TextSplitterBase {
  type: TextSplitterType;
  config: {};
}

export interface RecursiveCharacterTextSplitter extends TextSplitterBase {
  config: {
    chunk_size?: number;
    chunk_overlap?: number;
    separators?: string[];
  };
}

export type TextSplitter = RecursiveCharacterTextSplitter;

export interface PipelineDataSourceBase {
  id: string;
  is_enabled: boolean;
  integration_name: Integration;
  text_splitter: TextSplitter;
}

export interface NotionDataSource extends PipelineDataSourceBase {
  integration_name: Integration.Notion;
}

export interface LinearDataSource extends PipelineDataSourceBase {
  integration_name: Integration.Linear;
}

export type PipelineDataSource = NotionDataSource | LinearDataSource;

export enum DataSinkType {
  VectorStore = "vector_store",
}

export interface PipelineDataSinkBase {
  id: string;
  type: DataSinkType;
  is_enabled: boolean;
  config: {};
}

export interface VectorStoreDataSink extends PipelineDataSinkBase {
  type: DataSinkType.VectorStore;
  config: VectorStore;
}

export type PipelineDataSink = VectorStoreDataSink;

export enum EmbeddingType {
  OpenAI = "openai",
}

export interface PipelineEmbeddingConfigBase {
  type: EmbeddingType;
  config: {};
}

export interface OpenAIEmbeddingConfig extends PipelineEmbeddingConfigBase {
  type: EmbeddingType.OpenAI;
  config: {
    api_key?: string;
  };
}

export type PipelineEmbeddingConfig = OpenAIEmbeddingConfig;

export interface PipelineConfig {
  data_sources: PipelineDataSource[];
  embeddings: PipelineEmbeddingConfig;
  data_sinks: PipelineDataSink[];
}

export interface Pipeline {
  id: string;
  account: string;
  name: string;
  created_at: string;
  updated_at: string | null;
  config: PipelineConfig;
  is_enabled: boolean;
}

export async function createPipeline(
  sql: SqlFunc,
  account: string,
  name: string,
  config: PipelineConfig,
  isDefault: boolean,
  isEnabled: boolean,
) {
  const { rows: createPipelineRows } = await sql<Pipeline>`
                insert into "langsync"."pipeline" ("id", "account", "name", "config", "is_enabled", created_at, "is_default")
                values (${nanoid()}, ${account}, ${name}, ${JSON.stringify(
                  config,
                )}, ${isEnabled}, now(), ${isDefault})
                returning *
            `;
  if (createPipelineRows.length !== 1) {
    throw new Error("Could not create pipeline");
  }
  return createPipelineRows[0];
}

export async function getDefaultPipeline(sql: SqlFunc, account: string) {
  const { rows: getDefaultPipelineRows } = await sql<Pipeline>`
                select *
                from "langsync"."pipeline"
                where "account" = ${account} and "is_default"
            `;
  if (getDefaultPipelineRows.length !== 1) {
    throw new Error("Could not get default pipeline");
  }
  return getDefaultPipelineRows[0];
}

export async function getPipeline(sql: SqlFunc, account: string, id: string) {
  const { rows: getPipelineRows } = await sql<Pipeline>`
                select *
                from "langsync"."pipeline"
                where "account" = ${account} and "id" = ${id}
            `;
  if (getPipelineRows.length !== 1) {
    return null;
  }
  return getPipelineRows[0];
}

export async function getPipelines(sql: SqlFunc, account: string) {
  const { rows: getPipelinesRows } = await sql<Pipeline>`
                select *
                from "langsync"."pipeline"
                where "account" = ${account}
            `;
  return getPipelinesRows;
}

export async function getIntegrationConnections(sql: SqlFunc, account: string) {
  const { rows: getIntegrationConnectionsRows } =
    await sql<IntegrationConnection>`
                select *
                from "langsync"."integration_connection"
                where "account" = ${account}
            `;
  return getIntegrationConnectionsRows;
}

export async function getIntegrationConnection(
  sql: SqlFunc,
  account: string,
  integration: Integration,
) {
  const { rows: getIntegrationConnectionRows } =
    await sql<IntegrationConnection>`
                select *
                from "langsync"."integration_connection"
                where "account" = ${account} and "integration_name" = ${integration}
            `;
  if (getIntegrationConnectionRows.length !== 1) {
    return null;
  }
  return getIntegrationConnectionRows[0];
}

export async function createIntegrationConnection(
  sql: SqlFunc,
  account: string,
  integrationName: Integration,
) {
  const { rows: createIntegrationConnectionRows } =
    await sql<IntegrationConnection>`
                insert into "langsync"."integration_connection" ("account", "integration_name", "config")
                values (${account}, ${integrationName}, '{}')
                returning *
            `;
  if (createIntegrationConnectionRows.length !== 1) {
    throw new Error("Could not create integration connection");
  }
  return createIntegrationConnectionRows[0];
}

export async function findIntegrationConnectionsByWorkspaceId(
  sql: SqlFunc,
  workspaceId: string,
) {
  const { rows: findIntegrationConnectionsByWorkspaceIdRows } =
    await sql<IntegrationConnection>`
                select *
                from "langsync"."integration_connection"
                where "workspace_id" = ${workspaceId}
            `;
  return findIntegrationConnectionsByWorkspaceIdRows;
}

export async function updateIntegrationConnection(
  sql: SqlFunc,
  account: string,
  integrationName: Integration,
  config: IntegrationConnection["config"],
  connectedAt: string | null,
  workspaceId: string | null,
) {
  const { rows: updateIntegrationConnectionRows } =
    await sql<IntegrationConnection>`
                update "langsync"."integration_connection"
                set "config" = ${JSON.stringify(config)},
                    "connected_at" = ${connectedAt},
                    "workspace_id" = ${workspaceId}
                where "account" = ${account} and "integration_name" = ${integrationName}
                returning *
            `;
  if (updateIntegrationConnectionRows.length !== 1) {
    throw new Error("Could not update integration connection");
  }
  return updateIntegrationConnectionRows[0];
}

export function updatePipeline(
  sql: SqlFunc,
  account: string,
  id: string,
  config: PipelineConfig,
  isEnabled: boolean,
) {
  return sql<Pipeline>`
                update "langsync"."pipeline"
                set "config" = ${JSON.stringify(config)},
                    "is_enabled" = ${isEnabled}
                where "account" = ${account} and "id" = ${id}
                returning *
            `;
}

export enum PipelineRunTrigger {
  Manual = "manual",
  System = "system",
  IntegrationChangeEvent = "integration_change_event",
}

export enum SyncMode {
  FullIndex = "full_index",
  SingleDocument = "single_document",
}

export interface PipelineRun {
  id: string;
  pipeline: string;
  trigger: PipelineRunTrigger;
  created_at: string;
  updated_at: string | null;
  sync_mode: SyncMode;
  integration_change_event: IntegrationChangeEvent | null;
}

export enum PipelineRunStepStatus {
  Pending = "pending",
  Running = "running",
  Completed = "completed",
  Failed = "failed",
}

export interface PipelineRunStep {
  pipeline: string;
  pipeline_run: string;
  data_source: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error: { code: string; message: string } | null;
  status: PipelineRunStepStatus;
}

export async function createPipelineRun(
  sql: SqlFunc,
  pipeline: string,
  trigger: PipelineRunTrigger,
  syncMode: SyncMode = SyncMode.FullIndex,
  changeEvent: IntegrationChangeEvent | null = null,
) {
  const { rows: createPipelineRunRows } = await sql<PipelineRun>`
                insert into "langsync"."pipeline_run" ("id", "pipeline", "trigger", created_at, "sync_mode", "integration_change_event")
                values (${nanoid()}, ${pipeline}, ${trigger}, now(), ${syncMode}, ${
                  changeEvent ? JSON.stringify(changeEvent) : null
                })
                returning *
            `;
  if (createPipelineRunRows.length !== 1) {
    throw new Error("Could not create pipeline run");
  }
  return createPipelineRunRows[0];
}

export async function getPipelineRuns(
  sql: SqlFunc,
  pipeline: string,
  limit: number,
) {
  const { rows: getPipelineRunsRows } = await sql<PipelineRun>`
                select *
                from "langsync"."pipeline_run"
                where "pipeline" = ${pipeline}
                order by "created_at" desc
                limit ${limit}
            `;
  return getPipelineRunsRows;
}

export async function getPipelineRun(sql: SqlFunc, id: string) {
  const { rows: getPipelineRunRows } = await sql<PipelineRun>`
                select *
                from "langsync"."pipeline_run"
                where "id" = ${id}
            `;
  if (getPipelineRunRows.length !== 1) {
    throw new Error("Could not get pipeline run");
  }
  return getPipelineRunRows[0];
}

export async function getPipelineRunSteps(sql: SqlFunc, pipelineRun: string) {
  const { rows: getPipelineRunStepsRows } = await sql<PipelineRunStep>`
                select *
                from "langsync"."pipeline_run_step"
                where "pipeline_run" = ${pipelineRun}
            `;
  return getPipelineRunStepsRows;
}

export async function createPipelineRunStep(
  sql: SqlFunc,
  pipeline: string,
  pipelineRun: string,
  dataSource: string,
) {
  const { rows: createPipelineRunStepRows } = await sql<PipelineRunStep>`
                insert into "langsync"."pipeline_run_step" ("pipeline", "pipeline_run", "status", "data_source", created_at)
                values (${pipeline}, ${pipelineRun}, ${PipelineRunStepStatus.Pending}, ${dataSource}, now())
                returning *
            `;
  if (createPipelineRunStepRows.length !== 1) {
    throw new Error("Could not create pipeline run step");
  }
  return createPipelineRunStepRows[0];
}

export async function deleteIntegrationConnection(
  sql: SqlFunc,
  account: string,
  integrationName: Integration,
) {
  await sql`
    delete from "langsync"."integration_connection"
    where "account" = ${account} and "integration_name" = ${integrationName}
  `;
}

export async function deleteIntegrationDocuments(
  sql: SqlFunc,
  account: string,
  integrationName: Integration,
) {
  await sql`
    delete from "langsync"."document"
    where "account" = ${account} and "integration_name" = ${integrationName}
  `;
}

export async function getPipelineDocuments(
  sql: SqlFunc,
  account: string,
  pipeline: string,
  search: string | null,
) {
  const { rows: getIntegrationDocumentsRows } = await sql<Document>`
    select *
    from "langsync"."document"
    where "account" = ${account} and "pipeline" = ${pipeline} and
        (case when ${search}::text is null then true else "title" ilike '%' || ${search}::text || '%' end) and
        (case when ${search}::text is null then true else "url" ilike '%' || ${search}::text || '%' end)
    order by "updated_at" desc, "created_at" desc, "title" asc
    limit 10
  `;
  return getIntegrationDocumentsRows;
}

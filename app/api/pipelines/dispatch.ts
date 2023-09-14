import { SQS } from "@aws-sdk/client-sqs";
import {
  createPipelineRun,
  createPipelineRunStep,
  findAccountById,
  getPipelines,
  Integration,
  Pipeline,
  PipelineRunTrigger,
  SqlFunc,
  SyncMode,
} from "@/app/api/auth/callback/db";
import {
  enforceTotalIndexedDocumentQuota,
  QuotasExceededError,
  totalIndexedDocumentsLimit,
} from "@/app/api/quotas/quotas";

export enum ChangeAction {
  Create = "create",
  Update = "update",
  Delete = "delete",
}

export interface IntegrationChangeEvent {
  integration: Integration;
  change: { action: ChangeAction; documentId: string; documentType: string };
}

interface IndexMessage {
  kind: "index";
  accountId: string;
  messageId: string;
  payload: {
    pipelineId: string;
    runId: string;
    dataSourceId: string;
  };
}

export async function dispatchChangePipeline(
  sql: SqlFunc,
  accountId: string,
  integration: Integration,
  change: { action: ChangeAction; documentId: string; documentType: string },
) {
  try {
    await enforceTotalIndexedDocumentQuota(sql, accountId);
  } catch (err) {
    if (err instanceof QuotasExceededError) {
      console.warn(
        `Account ${accountId} exceeds quotas so we won't react to ${integration} change events`,
      );
      return;
    }
  }

  const indexMessages: IndexMessage[] = [];

  const pipelines = await getPipelines(sql, accountId);
  for (const pipeline of pipelines) {
    const dataSource = pipeline.config.data_sources.find(
      (ds) => ds.integration_name === integration,
    );
    if (!dataSource || !dataSource.is_enabled) {
      continue;
    }

    const run = await createPipelineRun(
      sql,
      pipeline.id,
      PipelineRunTrigger.IntegrationChangeEvent,
      SyncMode.SingleDocument,
      {
        integration: Integration.Linear,
        change,
      },
    );

    await createPipelineRunStep(sql, pipeline.id, run.id, dataSource.id);

    indexMessages.push({
      kind: "index",
      accountId: pipeline.account,
      messageId: `${pipeline.id}-${run.id}-${dataSource.id}`,
      payload: {
        pipelineId: pipeline.id,
        runId: run.id,
        dataSourceId: dataSource.id,
      },
    });
  }

  return dispatchMessages(indexMessages);
}

export async function dispatchPipeline(
  sql: SqlFunc,
  pipeline: Pipeline,
  trigger: PipelineRunTrigger,
) {
  await enforceTotalIndexedDocumentQuota(sql, pipeline.account);

  const run = await createPipelineRun(
    sql,
    pipeline.id,
    trigger,
    SyncMode.FullIndex,
  );

  const indexMessages: IndexMessage[] = [];

  for (const dataSource of pipeline.config.data_sources) {
    if (!dataSource.is_enabled) {
      continue;
    }

    // Create both combined index+sync step and push to SQS
    await createPipelineRunStep(sql, pipeline.id, run.id, dataSource.id);
    indexMessages.push({
      kind: "index",
      accountId: pipeline.account,
      messageId: `${pipeline.id}-${run.id}-${dataSource.id}`,
      payload: {
        pipelineId: pipeline.id,
        runId: run.id,
        dataSourceId: dataSource.id,
      },
    });
  }

  return dispatchMessages(indexMessages);
}

async function dispatchMessages(indexMessages: IndexMessage[]) {
  const sqsClient = new SQS({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const indexQueueUrl = process.env.INDEX_QUEUE_URL;
  if (!indexQueueUrl) {
    throw new Error("INDEX_QUEUE_URL is not set");
  }

  const batches = chunk(10, indexMessages);
  for (const batch of batches) {
    const res = await sqsClient.sendMessageBatch({
      Entries: batch.map((message, i) => ({
        Id: message.messageId,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          pipelineId: {
            DataType: "String",
            StringValue: message.payload.pipelineId,
          },
          accountId: {
            DataType: "String",
            StringValue: message.accountId,
          },
          runId: {
            DataType: "String",
            StringValue: message.payload.runId,
          },
          dataSourceId: {
            DataType: "String",
            StringValue: message.payload.dataSourceId,
          },
        },
        // Wait a bit, we have to end the transaction, otherwise we're racing
        DelaySeconds: 2,
      })),
      QueueUrl: indexQueueUrl,
    });
    if (res.Failed && res.Failed.length > 0) {
      throw new Error(
        `Failed to send batch to ${indexQueueUrl}: ${res.Failed.map(
          (f) => f.Message,
        ).join(", ")}`,
      );
    }
  }
}

// Split array into groups of batch size
export function chunk<T>(batchSize: number, array: T[]) {
  const chunks = [];
  for (let i = 0; i < array.length; i += batchSize) {
    chunks.push(array.slice(i, i + batchSize));
  }
  return chunks;
}

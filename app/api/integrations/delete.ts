import {
  deleteIntegrationConnection,
  deleteIntegrationDocuments,
  getPipelines,
  Integration,
  SqlFunc,
  updatePipeline,
} from "@/app/api/auth/callback/db";

export async function disconnectIntegration(
  sql: SqlFunc,
  accountId: string,
  integration: Integration,
) {
  // Delete all documents
  await deleteIntegrationDocuments(sql, accountId, integration);

  // Disable all related data sources
  const pipelines = await getPipelines(sql, accountId);
  for (const pipeline of pipelines) {
    pipeline.config.data_sources = pipeline.config.data_sources.map((ds) => {
      if (ds.integration_name === integration) {
        ds.is_enabled = false;
      }
      return ds;
    });
    await updatePipeline(
      sql,
      accountId,
      pipeline.id,
      pipeline.config,
      pipeline.is_enabled,
    );
  }

  // Delete the integration connection
  await deleteIntegrationConnection(sql, accountId, integration);
}

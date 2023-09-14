CREATE SCHEMA langsync;

CREATE TABLE "langsync"."account"(
    "id" varchar(64) NOT NULL,

    "email" varchar(128) NOT NULL,

    "name" varchar(256),

    "is_suspended" boolean NOT NULL DEFAULT false,
    "agree_to_terms" boolean NOT NULL DEFAULT false,

    "created_at" timestamp with time zone NOT NULL,

    "last_login_at" timestamp with time zone NOT NULL,

    "is_subscriber" boolean NOT NULL,
    "is_unlimited" boolean NOT NULL DEFAULT false,

    "total_indexed_document_count" integer NOT NULL DEFAULT 0,
    "total_indexed_document_tokens" integer NOT NULL DEFAULT 0,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "account_email_key" UNIQUE ("email")
);

CREATE TABLE "langsync"."auth_attempt" (
    "id" varchar(64) NOT NULL,

    "email" varchar(128) NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "confirmation_code" varchar(32) NOT NULL,

    CONSTRAINT "auth_attempt_pkey" PRIMARY KEY ("id")
);

-- index auth attempt by email
CREATE INDEX "auth_attempt_email_idx" ON "langsync"."auth_attempt" ("email");

CREATE TABLE "langsync"."integration_connection" (
    "account" varchar(64) NOT NULL,

    "integration_name" varchar(64) NOT NULL,

    "connected_at" timestamp with time zone,

    "config" jsonb NOT NULL,

    -- not necessarily unique, related workspace/organization/team entity for incoming change webhooks
    "workspace_id" varchar(64),

    CONSTRAINT "integration_connection_pkey" PRIMARY KEY ("account", "integration_name"),
    CONSTRAINT "integration_connection_account_fkey" FOREIGN KEY ("account") REFERENCES "langsync"."account" ("id") ON DELETE CASCADE
);

CREATE INDEX "integration_connection_workspace_id_idx" ON "langsync"."integration_connection" ("workspace_id");

CREATE TABLE "langsync"."pipeline" (
    "id" varchar(64) NOT NULL,
    "account" varchar(64) NOT NULL,
    "name" varchar(64) NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone,

    "config" jsonb NOT NULL,

    "is_enabled" boolean NOT NULL DEFAULT false,
    "is_default" boolean NOT NULL DEFAULT false,

    CONSTRAINT "pipeline_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipeline_account_fkey" FOREIGN KEY ("account") REFERENCES "langsync"."account" ("id") ON DELETE CASCADE
);

CREATE TABLE "langsync"."pipeline_run" (
    "id" varchar(64) NOT NULL,
    "pipeline" varchar(64) NOT NULL,
    "trigger" varchar(64) NOT NULL,

    "sync_mode" varchar(64) NOT NULL,
    "integration_change_event" jsonb,

    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone,

    CONSTRAINT "pipeline_run_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pipeline_run_pipeline_fkey" FOREIGN KEY ("pipeline") REFERENCES "langsync"."pipeline" ("id") ON DELETE CASCADE
);

CREATE TABLE "langsync"."pipeline_run_step" (
    "pipeline" varchar(64) NOT NULL,
    "pipeline_run" varchar(64) NOT NULL,
    "data_source" varchar(64) NOT NULL,
    "status" varchar(64) NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "error" jsonb,

    CONSTRAINT "pipeline_run_step_pkey" PRIMARY KEY ("pipeline_run", "data_source"),
    CONSTRAINT "pipeline_run_step_pipeline_run_fkey" FOREIGN KEY ("pipeline_run") REFERENCES "langsync"."pipeline_run" ("id") ON DELETE CASCADE
);

CREATE TABLE "langsync"."document" (
    "account" varchar(64) NOT NULL,
    "pipeline" varchar(64) NOT NULL,
    "integration_name" varchar(64) NOT NULL,

    "document_type" varchar(64) NOT NULL,
    "id" varchar(64) NOT NULL,
    "created_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone,

    "freshness_indicator" varchar(512),

    -- only include bare minimum fields to identify document, as this could contain
    -- sensitive data which we don't want to store in our database
    -- todo could allow external document store in addition to vector store for keeping track of documents
    "title" varchar(512),
    "url" varchar(512),

    "token_count" integer NOT NULL DEFAULT 0,
    "exceeds_token_limit" boolean NOT NULL DEFAULT false,

    CONSTRAINT "document_pkey" PRIMARY KEY ("account", "pipeline", "integration_name", "document_type", "id"),
    CONSTRAINT "document_account_fkey" FOREIGN KEY ("account") REFERENCES "langsync"."account" ("id") ON DELETE CASCADE,
    CONSTRAINT "document_pipeline_fkey" FOREIGN KEY ("pipeline") REFERENCES "langsync"."pipeline" ("id") ON DELETE CASCADE,
    CONSTRAINT "document_integration_fkey" FOREIGN KEY ("account", "integration_name") REFERENCES "langsync"."integration_connection" ("account", "integration_name") ON DELETE RESTRICT
);

-- index documents by account, pipeline, integration_name
CREATE INDEX "document_account_pipeline_integration_idx" ON "langsync"."document" ("account", "pipeline", "integration_name");

-- index documents by account, pipeline
CREATE INDEX "document_account_pipeline_idx" ON "langsync"."document" ("account", "pipeline");

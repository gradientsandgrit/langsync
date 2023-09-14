"use client";

import {
  useDefaultPipeline,
  useIntegrationConnections,
  useProfile,
  useQuotas,
} from "@/app/api";
import {
  Badge,
  Callout,
  Heading,
  IconButton,
  Link,
  Tabs,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import {
  DataSinkType,
  Integration,
  Pipeline,
  PipelineConfig,
  PipelineDataSink,
  PipelineDataSource,
  TextSplitterType,
  VectorStore,
  VectorStoreDataSink,
  VectorStoreType,
} from "@/app/api/auth/callback/db";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  PauseIcon,
} from "@heroicons/react/20/solid";
import { TabsTrigger } from "@/app/_components/tabs";
import React, { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useDelayedEffect } from "@/app/_components/hooks";
import { motion } from "framer-motion";
import { OnboardingLoader } from "@/app/_components/loader";
import { DataSources } from "@/app/_components/onboarding/data_sources";
import {
  DataSinks,
  supportedVectorStores,
} from "@/app/_components/onboarding/data_sinks";
import { RunHistory } from "@/app/_components/onboarding/pipeline_runs";
import { CalloutRoot } from "@/app/_components/callout";
import { SubmitButton } from "@/app/_components/account";
import { LinearLogo, NotionLogo, OpenAiIcon } from "@/app/_components/logo";
import { Sparkles } from "@/app/_components/sparkles";
import { PipelineDocs } from "@/app/_components/onboarding/pipeline_docs";
import classNames from "classnames";
import ConfettiExplosion from "react-confetti-explosion";

export const integrationDetails: Record<
  Integration,
  {
    icon: React.FC<{ size?: number }>;
    label: string;
    description: string;
  }
> = {
  [Integration.Notion]: {
    icon: NotionLogo,
    label: "Notion",
    description:
      "Notion is an all-in-one workspace where you can write, plan, collaborate and get organized - it allows users to create databases, kanban boards, wikis, calendars and reminders.",
  },
  [Integration.Linear]: {
    icon: LinearLogo,
    label: "Linear",
    description:
      "Linear is a modern project management tool for software teams. It's fast, flexible, and helps developers be more productive.",
  },
};

export function useQuotasExceeded() {
  const { data } = useQuotas();

  return {
    exceededQuotas:
      (data?.totalIndexedDocuments.percent || 0) >= 100 ||
      (data?.totalIndexedDocumentTokens.percent || 0) >= 100,
    quotas: data,
  };
}

export function OnboardingPage() {
  const { data: account } = useProfile();
  const { data: pipeline, mutate: mutatePipeline } = useDefaultPipeline();
  const { data: integrationConnections } = useIntegrationConnections();

  const [config, setConfig] = useState<PipelineConfig | null>(null);

  const { exceededQuotas, quotas } = useQuotasExceeded();

  const [formState, setFormState] = useState<
    "loading" | "initial" | "dirty" | "saving" | "saved"
  >("loading");

  const [integrationConnectionError, setIntegrationConnectionError] =
    useState<Integration | null>(null);

  useEffect(() => {
    if (pipeline) {
      setConfig(pipeline.config);
      setFormState("initial");
    }
  }, [pipeline]);

  useDelayedEffect(
    async () => {
      if (formState !== "dirty") {
        return;
      }
      if (!config || !pipeline) {
        return;
      }
      setFormState("saving");
      try {
        await fetch(`/api/pipelines/${pipeline.id}`, {
          method: "PATCH",
          body: JSON.stringify({ config: config }),
        });
        setFormState("saved");
      } catch (err) {
        console.error(err);
        setFormState("dirty");
      }
    },
    1000,
    [formState, config, pipeline],
  );

  const upsertDataSource = <T extends PipelineDataSource>(
    integration: T["integration_name"],
    is_enabled: boolean,
    text_splitter: T["text_splitter"],
  ) => {
    if (!config) {
      return;
    }
    // TODO adapt to multi-data-source-of-same-integration pipelines
    const existingSource = config.data_sources.find(
      (s) => s.integration_name === integration,
    );
    if (existingSource) {
      setConfig((c) => ({
        ...c!,
        data_sources: c!.data_sources.map((s) =>
          s.integration_name === integration
            ? {
                ...s,
                is_enabled,
                text_splitter,
              }
            : s,
        ),
      }));
    } else {
      setConfig((c) => ({
        ...c!,
        data_sources: [
          ...c!.data_sources,
          {
            id: nanoid(),
            integration_name: integration,
            is_enabled,
            text_splitter,
          },
        ],
      }));
    }
    if (formState !== "dirty") {
      setFormState("dirty");
    }
  };

  const upsertVectorStoreDataSink = (
    is_enabled: boolean,
    vectorStore: VectorStore,
  ) => {
    const existingSink = config?.data_sinks.find(
      (s) =>
        s.type === DataSinkType.VectorStore &&
        s.config.store_type === vectorStore.store_type,
    ) as VectorStoreDataSink | undefined;

    if (existingSink) {
      setConfig((c) => ({
        ...c!,
        data_sinks: c!.data_sinks.map((s) =>
          s.type === DataSinkType.VectorStore &&
          s.config.store_type === vectorStore.store_type
            ? {
                ...s,
                is_enabled,
                config: vectorStore,
              }
            : s,
        ),
      }));
    } else {
      const newSink: PipelineDataSink = {
        id: nanoid(),
        is_enabled,
        type: DataSinkType.VectorStore,
        config: vectorStore,
      };

      setConfig((c) => ({
        ...c!,
        data_sinks: [...c!.data_sinks, newSink],
      }));
    }

    if (formState !== "dirty") {
      setFormState("dirty");
    }
  };

  useEffect(() => {
    if (!config || !pipeline || formState !== "initial") {
      return;
    }
    // if ?enabled-integration is set, enable that integration
    const enabledIntegration = new URLSearchParams(window.location.search).get(
      "enabled-integration",
    );
    if (enabledIntegration) {
      // TODO adapt to multi-data-source-of-same-integration pipelines
      const existingSource = config.data_sources.find(
        (s) => s.integration_name === enabledIntegration,
      );

      upsertDataSource(
        enabledIntegration as Integration,
        true,
        existingSource?.text_splitter || {
          type: TextSplitterType.RecursiveCharacter,
          config: {},
        },
      );

      // Remove the query param
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [formState, config, pipeline, upsertDataSource]);

  useEffect(() => {
    const failedIntegration = new URLSearchParams(window.location.search).get(
      "failed-integration",
    );
    if (failedIntegration) {
      setIntegrationConnectionError(failedIntegration as Integration);

      // Remove the query param
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const mailtoLink = useMemo(() => {
    if (!account) {
      return "";
    }
    const title = "langsync - Requesting higher quotas";
    const body = `Please describe your use case and how many document indexes you need. We'll get back to you as soon as possible.
      
Use case:

Indexed documents needed:

Account ID: ${account.id}`;
    const address = "hey@gradientsandgrit.com";
    return encodeURI(`mailto:${address}?subject=${title}&body=${body}`);
  }, [account]);

  if (!pipeline || !integrationConnections || !config) {
    return <OnboardingLoader />;
  }

  return (
    <motion.div
      key={"onboarding"}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className={"grid grid-cols-1 lg:grid-cols-12"}
    >
      <div
        className={
          "col-span-1 lg:col-span-7 pt-8 pb-8 lg:pt-24 lg:max-h-[calc(100vh-96px)]"
        }
      >
        <div className={"px-4 lg:pl-48 h-full"}>
          <div
            className={
              "flex flex-col space-y-2 md:space-y-0 md:flex-row items-start md:justify-between px-2 py-4 shrink-0 grow-0"
            }
          >
            <div>
              <div className={"flex items-center space-x-2"}>
                <Heading as={"h1"} size={"7"}>
                  Connect your data
                </Heading>

                {formState === "saving" || formState === "saved" ? (
                  <Badge>
                    <CheckCircleIcon className={"w-4 h-4"} />
                    {formState.toUpperCase()}
                  </Badge>
                ) : null}
              </div>
              <Text size={"3"} color={"gray"}>
                Connect your tools and start syncing data into a vector store
              </Text>
            </div>
            {!pipeline.is_enabled ? (
              <TogglePipeline quotaExceeded={exceededQuotas} />
            ) : (
              <>
                <div className={"flex items-center space-x-2 select-none"}>
                  {quotas ? (
                    <Tooltip content="Every document indexed counts toward your total indexed documents quota">
                      <div className={"flex items-center space-x-1"}>
                        <ProgressGauge
                          percent={quotas.totalIndexedDocuments.percent}
                        />
                        <span className={"text-xs text-slate-500"}>
                          {quotas.totalIndexedDocuments.percent}%
                        </span>
                      </div>
                    </Tooltip>
                  ) : null}

                  <TriggerPipeline
                    disabled={exceededQuotas}
                    pipeline={pipeline}
                  />
                  <TogglePipeline quotaExceeded={exceededQuotas} />
                </div>
              </>
            )}
          </div>
          {exceededQuotas ? (
            <Callout.Root color="amber">
              <Callout.Icon>
                <ExclamationCircleIcon className={"w-5 h-5 text-red-700"} />
              </Callout.Icon>
              {account?.is_subscriber ? (
                <Callout.Text>
                  You have exceeded the maximum indexed documents limit. Please{" "}
                  <Link href={mailtoLink}>reach out to us</Link> to extend your
                  quota.
                </Callout.Text>
              ) : (
                <Callout.Text>
                  You have exceeded the maximum indexed documents limit. Please{" "}
                  subscribe to extend your quota for free.
                </Callout.Text>
              )}
            </Callout.Root>
          ) : null}
          {integrationConnectionError ? (
            <CalloutRoot
              color="red"
              onDismiss={() => setIntegrationConnectionError(null)}
            >
              <Callout.Icon>
                <ExclamationCircleIcon className={"w-5 h-5 text-red-700"} />
              </Callout.Icon>
              <Callout.Text>
                We could not successfully connect to{" "}
                {integrationDetails[integrationConnectionError].label}, please
                try again.
              </Callout.Text>
            </CalloutRoot>
          ) : null}
          <Tabs.Root
            defaultValue="data_sources"
            className={"lg:max-h-[calc(100vh-96px-96px-32px-16px-92px)]"}
          >
            <Tabs.List size={"2"}>
              <TabsTrigger value="data_sources">Data Sources</TabsTrigger>

              <TabsTrigger value={"embeddings"}>Embeddings</TabsTrigger>

              <TabsTrigger value={"data_sinks"}>Data Sinks</TabsTrigger>

              <TabsTrigger value={"documents"}>Documents</TabsTrigger>
            </Tabs.List>

            <div className={"flex flex-col grow h-full overflow-auto"}>
              <Tabs.Content value="data_sources" className={"px-4 pt-3 pb-3"}>
                <DataSources
                  accountId={account?.id}
                  integrationConnections={integrationConnections}
                  config={config}
                  upsertDataSource={upsertDataSource}
                />
              </Tabs.Content>
              <Tabs.Content value={"embeddings"} className={"px-4 pt-3 pb-3"}>
                <Embeddings config={config} accountId={account?.id} />
              </Tabs.Content>
              <Tabs.Content value={"data_sinks"} className={"px-4 pt-3 pb-3"}>
                <DataSinks
                  accountId={account?.id}
                  config={config}
                  upsertVectorStoreDataSink={upsertVectorStoreDataSink}
                />
              </Tabs.Content>
              <Tabs.Content value={"documents"}>
                <PipelineDocs pipelineId={pipeline.id} />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </div>
      </div>

      <div
        className={
          "col-span-1 md:col-span-5 px-8 p-4 h-full pt-8 pb-8 md:pt-24"
        }
        style={{
          // TODO Find a better way to do this
          height: "calc(100vh - 96px)",
        }}
      >
        <div
          className={
            "flex flex-col space-y-2 bg-slate-50 rounded-xl p-4 h-full overflow-auto"
          }
        >
          {pipeline.is_enabled ? (
            <RunHistory
              exceededQuotas={exceededQuotas}
              pipelineId={pipeline.id}
            />
          ) : (
            <PipelineIllustration config={config} />
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Embeddings({
  config,
  accountId,
}: {
  config: PipelineConfig;
  accountId: string | undefined;
}) {
  const mailtoLink = useMemo(() => {
    if (!accountId) {
      return "";
    }
    const title = "langsync - Requesting custom embeddings";
    const body = `Please describe your use case and the embeddings you need to use. We'll get back to you as soon as possible.
      
Use case:

Embeddings needed:

Account ID: ${accountId}`;
    const address = "hey@gradientsandgrit.com";
    return encodeURI(`mailto:${address}?subject=${title}&body=${body}`);
  }, [accountId]);

  return (
    <div className={"flex flex-col space-y-1"}>
      <Callout.Root>
        <Callout.Icon>
          <InformationCircleIcon className={"w-4 h-4"} />
        </Callout.Icon>
        <Callout.Text>
          Embeddings currently use the OpenAI Embeddings model with a managed
          key, so you do not have to supply your own key. If you require a
          different embedding model, please <Link>contact us</Link>.
        </Callout.Text>
      </Callout.Root>
    </div>
  );
}

export function PipelineIllustration({
  config,
}: {
  config: PipelineConfig | null;
}) {
  let enabledDataSources = config
    ? config.data_sources
        .filter((s) => s.is_enabled)
        .map((d) => d.integration_name)
    : [];
  if (enabledDataSources.length === 0) {
    enabledDataSources = [Integration.Notion, Integration.Linear];
  }

  let enabledDataSinks = config
    ? config.data_sinks
        .filter((s) => s.is_enabled)
        .map((d) => d.config.store_type)
    : [];
  if (enabledDataSinks.length === 0) {
    enabledDataSinks = [VectorStoreType.Pinecone];
  }

  return (
    <div className={"flex flex-col items-center justify-center h-full"}>
      <style jsx>
        {`
          @keyframes bubblesPulse {
            0% {
              transform: scale(1);
            }
            50% {
              transform: scale(1.1);
            }
            100% {
              transform: scale(1);
            }
          }

          .bubbles-ds > div {
            animation: bubblesPulse 3s ease-in-out infinite;
            animation-delay: 3s;
          }

          .bubbles-embeds > div {
            animation: bubblesPulse 3s ease-in-out infinite;
            animation-delay: 5s;
          }

          .bubbles-sinks > div {
            animation: bubblesPulse 3s ease-in-out infinite;
            animation-delay: 7s;
          }
        `}
      </style>

      <style jsx>{``}</style>

      <div className={"text-center mt-4 my-8"}>
        <Heading size={"5"}>
          Empower your LLM Applications with
          <br />
          <Sparkles>
            <span
              className={
                "text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-amber-600"
              }
            >
              Real-Time
            </span>
          </Sparkles>{" "}
          Context from All your Favorite Tools
        </Heading>
        <Text size={"2"} color={"gray"}>
          langsync continuously indexes data from your tools in real-time,
          <br /> so you can focus on creating value for your team and customers.
        </Text>
      </div>

      <div className={"bubbles-ds flex items-center space-x-3 z-10"}>
        {enabledDataSources.map((i) => {
          const { icon: Icon } = integrationDetails[i as Integration];
          return (
            <div
              key={i}
              className={
                "flex items-center justify-center p-2 rounded-full bg-white"
              }
            >
              <Icon size={48} />
            </div>
          );
        })}
      </div>

      <div className={"flex items-center space-x-4 -my-1"}>
        <div className={"w-14"} />

        <LoaderDivider />

        <DocumentsAnimation />
      </div>

      <div className={"bubbles-embeds flex flex-col items-center space-x-3"}>
        <div
          className={
            "flex items-center justify-center p-2 rounded-full bg-white grow-0 shrink-0 z-10"
          }
        >
          <OpenAiIcon className={"w-12 h-12"} />
        </div>
      </div>

      <div className={"flex items-center space-x-4 -my-1"}>
        <div className={"w-16"} />

        <LoaderDivider />

        <VectorsAnimation />
      </div>

      <div className={"bubbles-sinks flex items-center space-x-3 z-10"}>
        {enabledDataSinks.map((i) => {
          const { icon: Icon } = supportedVectorStores[i as VectorStoreType];
          return (
            <div
              key={i}
              className={
                "flex items-center justify-center p-2 rounded-full bg-white grow-0 shrink-0"
              }
            >
              <Icon size={48} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DocumentsAnimation() {
  return (
    <div className={"flex flex-col relative h-14 w-14"}>
      <div
        className={
          "h-14 w-12 rounded-md bg-white shadow space-y-1 p-1 z-30 absolute top-0 left-0"
        }
      >
        <NotionLogo />

        <div className={"w-8 h-1 rounded-full bg-slate-200"} />
        <div className={"w-4 h-1 rounded-full bg-slate-200"} />
        <div className={"w-6 h-1 rounded-full bg-slate-200"} />
        <div className={"w-2 h-1 rounded-full bg-slate-200"} />
      </div>

      <div
        className={
          "h-14 w-12 rounded-md bg-white shadow space-y-1 p-1 z-20 absolute top-0 left-0 rotate-6"
        }
      >
        <div className={"w-8 h-1 rounded-full bg-slate-200"} />
        <div className={"w-4 h-1 rounded-full bg-slate-200"} />
        <div className={"w-6 h-1 rounded-full bg-slate-200"} />
        <div className={"w-2 h-1 rounded-full bg-slate-200"} />
      </div>

      <div
        className={
          "h-14 w-12 rounded-md bg-white shadow space-y-1 p-1 z-10 absolute top-0 left-0 rotate-12"
        }
      >
        <div className={"w-8 h-1 rounded-full bg-slate-200"} />
        <div className={"w-4 h-1 rounded-full bg-slate-200"} />
        <div className={"w-6 h-1 rounded-full bg-slate-200"} />
        <div className={"w-2 h-1 rounded-full bg-slate-200"} />
      </div>
    </div>
  );
}

function VectorsAnimation() {
  const randomVector = () =>
    `[${Math.random().toFixed(4)},${Math.random().toFixed(
      4,
    )},${Math.random().toFixed(4)},${Math.random().toFixed(
      4,
    )},${Math.random().toFixed(4)}]`;

  return (
    <div className={"w-16"} style={{ fontSize: "6px" }}>
      <span suppressHydrationWarning={true}>{randomVector()}</span>
      <span suppressHydrationWarning={true}>{randomVector()}</span>
      <span suppressHydrationWarning={true}>{randomVector()}</span>
    </div>
  );
}

function LoaderDivider() {
  const delayProgressItem = (i: number) => `
  .progress-bar > :nth-child(${i}) {
    animation-delay: ${(i * 1.5).toFixed(1)}s;  
  } 
  `;

  const animationStyle = `
        

        ${new Array(4)
          .fill(0)
          .map((_, i) => delayProgressItem(i))
          .join("\n")}

        
      `;

  return (
    <div className={"flex flex-col items-center"}>
      <style jsx>{`
        .progress-item {
          animation: loaderProgress 3s ease-in-out infinite;
        }

        ${animationStyle}

        @keyframes loaderProgress {
          0% {
            transform: translateY(0px);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          75% {
            opacity: 1;
          }
          100% {
            /* move to the bottom of the parent */
            transform: translateY(96px);
            opacity: 0;
          }
        }
      `}</style>
      <div
        className={
          "progress-bar block h-24 w-2 rounded-full bg-slate-100 relative"
        }
      >
        {new Array(4).fill(null).map((_, i) => (
          <div
            key={i}
            className={
              "progress-item block h-2 w-2 rounded-full bg-slate-300 absolute top-0 left-0"
            }
          />
        ))}
      </div>
    </div>
  );
}

function TriggerPipeline({
  pipeline,
  disabled,
}: {
  pipeline: Pipeline;
  disabled?: boolean;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const triggerFullSync = async () => {
    if (disabled) {
      return;
    }
    setIsSubmitting(true);
    try {
      await fetch(`/api/pipelines/${pipeline.id}/trigger`, {
        method: "POST",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <Tooltip
      open={disabled ? tooltipOpen : false}
      onOpenChange={setTooltipOpen}
      content={"You have exceeded the maximum indexed documents limit."}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerFullSync();
        }}
      >
        <SubmitButton submitting={isSubmitting} invalid={disabled || false}>
          <ArrowPathIcon className={"w-4 h-4"} />
          <span>Trigger pipeline</span>
        </SubmitButton>
      </form>
    </Tooltip>
  );
}

function TogglePipeline({ quotaExceeded }: { quotaExceeded?: boolean }) {
  const { mutate: mutatePipeline, data } = useDefaultPipeline();

  const [isToggling, setIsToggling] = useState(false);

  const togglePipeline = async () => {
    if (!data) {
      return;
    }
    setIsToggling(true);
    try {
      await fetch(`/api/pipelines/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_enabled: !data.is_enabled }),
      });
      await mutatePipeline();
    } catch (err) {
      console.error(err);
    } finally {
      setIsToggling(false);
    }
  };

  if (data?.is_enabled) {
    return (
      <>
        <IconButton
          variant={"soft"}
          color={"amber"}
          size={"2"}
          onClick={togglePipeline}
          disabled={quotaExceeded || isToggling}
        >
          <PauseIcon className={"w-4 h-4"} />
        </IconButton>
      </>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        togglePipeline();
      }}
    >
      {isToggling ? (
        <ConfettiExplosion
          {...{
            force: 0.8,
            duration: 3000,
            particleCount: 250,
            width: 1600,
          }}
        />
      ) : null}

      <SubmitButton invalid={quotaExceeded || false} submitting={isToggling}>
        Start syncing
      </SubmitButton>
    </form>
  );
}

export function ProgressGauge({
  percent,
  large,
}: {
  percent: number;
  large?: boolean;
}) {
  const radius = large ? 7.5 : 6.5; // 16px
  const heightWidth = large ? "w-6 h-6" : "w-4 h-4"; // 16px

  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg className={classNames(heightWidth, "transform -rotate-90")}>
      <circle
        className="stroke-current text-slate-300"
        cx="50%"
        cy="50%"
        r={radius}
        strokeWidth="3"
        fill="transparent"
      />
      <circle
        className={classNames("stroke-current", {
          "text-green-500": percent < 50,
          "text-yellow-500": percent >= 50 && percent < 75,
          "text-red-500": percent >= 75,
        })}
        cx="50%"
        cy="50%"
        r={radius}
        strokeWidth="3"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        fill="transparent"
      />
    </svg>
  );
}

import {
  DataSinkType,
  PipelineConfig,
  PipelineDataSink,
  VectorStore,
  VectorStoreDataSink,
  VectorStoreType,
} from "@/app/api/auth/callback/db";
import React, { useMemo } from "react";
import { PineconeLogo } from "@/app/_components/logo";
import {
  Badge,
  Callout,
  Container,
  Flex,
  IconButton,
  Link,
  Switch,
  Tabs,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  CheckIcon,
  CircleStackIcon,
  EyeIcon,
  KeyIcon,
  QuestionMarkCircleIcon,
} from "@heroicons/react/20/solid";
import { TabsTrigger } from "@/app/_components/tabs";
import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/solid";

export const supportedVectorStores: Record<
  VectorStoreType,
  {
    icon: React.FC<{ size?: number }>;
    settingsView: React.FC<{
      vectorStoreType: VectorStoreType;
      vectorStoreConfig: VectorStore["config"] | null;
      upsertVectorStoreDataSink: (
        is_enabled: boolean,
        vectorStore: VectorStore,
      ) => void;
    }>;
    label: string;
  }
> = {
  [VectorStoreType.Pinecone]: {
    icon: PineconeLogo,
    settingsView: ({
      upsertVectorStoreDataSink,
      vectorStoreConfig,
      vectorStoreType,
    }) => {
      if (vectorStoreType !== VectorStoreType.Pinecone) {
        return null;
      }
      return (
        <>
          <TextField.Root>
            <TextField.Slot>
              <KeyIcon className={"h-4 w-4"} />
            </TextField.Slot>
            <TextField.Input
              placeholder={"API Key"}
              type={"password"}
              value={vectorStoreConfig?.api_key || ""}
              onChange={(e) => {
                upsertVectorStoreDataSink(true, {
                  store_type: VectorStoreType.Pinecone,
                  config: {
                    index_name: vectorStoreConfig?.index_name || "",
                    environment: vectorStoreConfig?.environment || "",
                    namespace: vectorStoreConfig?.namespace || "",
                    api_key: e.currentTarget.value,
                  },
                });
              }}
            ></TextField.Input>
            <TextField.Slot>
              <IconButton size={"1"} variant={"ghost"}>
                <EyeIcon className={"h-4 w-4"} />
              </IconButton>
            </TextField.Slot>
          </TextField.Root>
          <TextField.Root>
            <TextField.Slot>
              <CircleStackIcon className={"h-4 w-4"} />
            </TextField.Slot>
            <TextField.Input
              placeholder={"Environment"}
              type={"text"}
              value={vectorStoreConfig?.environment || ""}
              onChange={(e) => {
                upsertVectorStoreDataSink(true, {
                  store_type: VectorStoreType.Pinecone,
                  config: {
                    environment: e.currentTarget.value,
                    api_key: vectorStoreConfig?.api_key || "",
                    index_name: vectorStoreConfig?.index_name || "",
                    namespace: vectorStoreConfig?.namespace || "",
                  },
                });
              }}
            ></TextField.Input>
          </TextField.Root>

          <TextField.Root>
            <TextField.Slot>
              <CircleStackIcon className={"h-4 w-4"} />
            </TextField.Slot>
            <TextField.Input
              placeholder={"Index Name"}
              type={"text"}
              value={vectorStoreConfig?.index_name || ""}
              onChange={(e) => {
                upsertVectorStoreDataSink(true, {
                  store_type: VectorStoreType.Pinecone,
                  config: {
                    index_name: e.currentTarget.value,
                    api_key: vectorStoreConfig?.api_key || "",
                    environment: vectorStoreConfig?.environment || "",
                    namespace: vectorStoreConfig?.namespace || "",
                  },
                });
              }}
            ></TextField.Input>
          </TextField.Root>

          <TextField.Root>
            <TextField.Slot>
              <CircleStackIcon className={"h-4 w-4"} />
            </TextField.Slot>
            <TextField.Input
              placeholder={"Namespace"}
              type={"text"}
              value={vectorStoreConfig?.namespace || ""}
              onChange={(e) => {
                upsertVectorStoreDataSink(true, {
                  store_type: VectorStoreType.Pinecone,
                  config: {
                    namespace: e.currentTarget.value,
                    api_key: vectorStoreConfig?.api_key || "",
                    environment: vectorStoreConfig?.environment || "",
                    index_name: vectorStoreConfig?.index_name || "",
                  },
                });
              }}
            ></TextField.Input>
          </TextField.Root>
        </>
      );
    },
    label: "Pinecone",
  },
};

export function DataSinks({
  config,
  upsertVectorStoreDataSink,
  accountId,
}: {
  config: PipelineConfig;
  upsertVectorStoreDataSink: (
    is_enabled: boolean,
    vectorStore: VectorStore,
  ) => void;
  accountId?: string;
}) {
  const vectorStoreDataSinkForType = (t: VectorStoreType) =>
    config.data_sinks.find(
      (s) => s.type === DataSinkType.VectorStore && s.config.store_type === t,
    ) as VectorStoreDataSink | undefined;

  const mailtoLink = useMemo(() => {
    if (!accountId) {
      return "";
    }
    const title = "langsync - Requesting Data Sink";
    const body = `Please describe your use case and which data sink integration you'd like to see. We'll get back to you as soon as possible.
      
      Use case:
      
      Data Sink (vector store, etc.) needed:
      
      Account ID: ${accountId}`;
    const address = "hey@gradientsandgrit.com";
    return encodeURI(`mailto:${address}?subject=${title}&body=${body}`);
  }, [accountId]);

  return (
    <Tabs.Root defaultValue="pinecone">
      <Tabs.List
        style={{
          boxShadow: "none",
        }}
      >
        {Object.entries(supportedVectorStores).map(
          ([i, { icon: Icon, ...d }]) => {
            const ds = vectorStoreDataSinkForType(i as VectorStoreType);
            return (
              <TabsTrigger className={"custom"} key={i} value={i}>
                <Icon />
                <span>{d.label}</span>
                {ds?.is_enabled ? (
                  <Badge radius={"full"} color={"green"}>
                    <CheckIcon className={"h-4 w-4"} />
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          },
        )}

        <TabsTrigger
          className={"custom"}
          key={"request"}
          value={"request"}
          style={{
            backgroundColor: "none",
          }}
        >
          <QuestionMarkCircleIcon className={"h-4 w-4"} />
          <span>Not seeing your data sink?</span>
        </TabsTrigger>
      </Tabs.List>

      <div className={"flex flex-col space-y-2 px-3 py-2"}>
        {
          Object.keys(supportedVectorStores).map((i) => (
            <RenderVectorStoreSettings
              key={i}
              sink={vectorStoreDataSinkForType(i as VectorStoreType) || null}
              i={i as VectorStoreType}
              upsertVectorStoreDataSink={upsertVectorStoreDataSink}
            />
          )) as any
        }

        <Tabs.Content key={"request"} value={"request"}>
          <Callout.Root color={"blue"} size={"1"}>
            <Callout.Icon>
              <ChatBubbleLeftEllipsisIcon className={"w-4 h-4"} />
            </Callout.Icon>
            <Callout.Text>
              We are constantly adding new data sinks. If you would like to
              request a new integration, please{" "}
              <Link href={mailtoLink}>reach out</Link> to us!
            </Callout.Text>
          </Callout.Root>
        </Tabs.Content>
      </div>
    </Tabs.Root>
  );
}

function RenderVectorStoreSettings({
  upsertVectorStoreDataSink,
  sink,
  i,
}: {
  upsertVectorStoreDataSink: (
    is_enabled: boolean,
    vectorStore: VectorStore,
  ) => void;
  sink: VectorStoreDataSink | null;
  i: VectorStoreType;
}) {
  const { settingsView: SettingsView } = supportedVectorStores[i];

  return (
    <Tabs.Content value={i}>
      <div className={"flex flex-col space-y-2"}>
        <SettingsView
          vectorStoreType={i}
          vectorStoreConfig={sink?.config.config || null}
          upsertVectorStoreDataSink={upsertVectorStoreDataSink}
        />

        <div className={"shrink-0 whitespace-nowrap"}>
          <Text size="2">
            <label className={"select-none"}>
              <Switch
                mr="2"
                size={"2"}
                radius={"full"}
                checked={sink?.is_enabled || false}
                onCheckedChange={(c) =>
                  upsertVectorStoreDataSink(
                    c,
                    // TODO Proper default value
                    sink?.config || {
                      store_type: i,
                      config: {
                        index_name: "",
                        api_key: "",
                        namespace: "",
                        environment: "",
                      },
                    },
                  )
                }
              />
              Enabled
            </label>
          </Text>
        </div>
      </div>
    </Tabs.Content>
  );
}

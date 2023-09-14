import {
  Integration,
  IntegrationConnection,
  IntegrationConnectionBase,
  NotionDataSource,
  NotionIntegrationConnection,
  PipelineConfig,
  PipelineDataSource,
  PipelineDataSourceBase,
  TextSplitterType,
} from "@/app/api/auth/callback/db";
import React, { useMemo } from "react";
import {
  AlertDialog,
  Badge,
  Button,
  Callout,
  DropdownMenu,
  Flex,
  IconButton,
  Link,
  Switch,
  Tabs,
  Text,
} from "@radix-ui/themes";
import {
  CheckIcon,
  EllipsisHorizontalIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
} from "@heroicons/react/20/solid";
import { TabsTrigger } from "@/app/_components/tabs";
import { integrationDetails } from "@/app/_components/onboarding/onboarding";
import { SubmitButton } from "@/app/_components/account";
import { ChatBubbleLeftEllipsisIcon } from "@heroicons/react/24/solid";

const supportedDataSources: Record<
  Integration,
  {
    useConnect: () => () => Promise<void>;
    settingsView: React.FC<{
      connection: IntegrationConnection;
      dataSource: PipelineDataSource;
      upsertDataSource: (
        integration: Integration,
        is_enabled: boolean,
        text_splitter: PipelineDataSource["text_splitter"],
      ) => void;
      connectSource: () => Promise<void>;
    }>;
  }
> = {
  [Integration.Linear]: {
    useConnect: getConnectIntegration(Integration.Linear),
    settingsView: ({
      connection,
      dataSource,
      upsertDataSource,
      connectSource,
    }) => {
      if (connection.integration_name !== Integration.Linear) {
        return null;
      }
      return (
        <div className={"flex items-center space-x-2 select-none"}>
          <Text size={"2"} weight={"medium"}>
            Connected to
          </Text>
          <Badge color={"blue"} size={"1"}>
            {connection.config.organization_logo ? (
              <img
                src={connection.config.organization_logo}
                alt={"workspace image"}
                className={"rounded"}
                height={16}
                width={16}
              />
            ) : null}
            {connection.config.organization_name}
          </Badge>
          <ManageConnectionDropdown
            connectSource={connectSource}
            integration={Integration.Linear}
          />
        </div>
      );
    },
  },
  [Integration.Notion]: {
    useConnect: getConnectIntegration(Integration.Notion),
    settingsView: ({
      connection,
      dataSource,
      upsertDataSource,
      connectSource,
    }) => {
      if (connection.integration_name !== Integration.Notion) {
        return null;
      }

      return (
        <div className={"flex flex-col space-y-2"}>
          <Callout.Root color={"amber"} size={"1"}>
            <Callout.Icon>
              <ExclamationTriangleIcon className={"w-4 h-4"} />
            </Callout.Icon>
            <Callout.Text>
              Notion does not support webhooks. You will need to trigger the
              pipeline manually to sync data.
            </Callout.Text>
          </Callout.Root>

          <div className={"flex items-center space-x-2 select-none"}>
            <Text size={"2"} weight={"medium"}>
              Connected to
            </Text>
            <Badge color={"blue"} size={"1"}>
              <img
                src={connection.config.workspace_icon}
                alt={"workspace image"}
                className={"rounded"}
                height={16}
                width={16}
              />
              {connection.config.workspace_name}
            </Badge>
            <ManageConnectionDropdown
              connectSource={connectSource}
              integration={Integration.Notion}
            />
          </div>
        </div>
      );
    },
  },
};

export function DataSources({
  integrationConnections,
  config,
  upsertDataSource,
  accountId,
}: {
  integrationConnections: IntegrationConnection[];
  config: PipelineConfig;
  upsertDataSource: (
    integration: Integration,
    is_enabled: boolean,
    text_splitter: PipelineDataSource["text_splitter"],
  ) => void;
  accountId?: string;
}) {
  const mailtoLink = useMemo(() => {
    if (!accountId) {
      return "";
    }
    const title = "langsync - Requesting Data Source";
    const body = `Please describe your use case and which data source integration you'd like to see. We'll get back to you as soon as possible.
      
Use case:

Data Source needed:

Account ID: ${accountId}`;
    const address = "hey@gradientsandgrit.com";
    return encodeURI(`mailto:${address}?subject=${title}&body=${body}`);
  }, [accountId]);

  const connectionForIntegration = <T extends IntegrationConnectionBase>(
    i: Integration,
  ): T =>
    integrationConnections.find(
      (c) => c.integration_name === i,
    ) as unknown as T;

  const dataSourceForIntegration = <T extends PipelineDataSourceBase>(
    i: Integration,
  ) =>
    config.data_sources.find((s) => s.integration_name === i) as unknown as T;

  return (
    <div className={"flex flex-col space-y-2"}>
      <Tabs.Root defaultValue={Integration.Linear}>
        <Tabs.List
          style={{
            boxShadow: "none",
          }}
        >
          {Object.entries(supportedDataSources).map(([i, { ...d }]) => {
            const { icon: Icon, label } = integrationDetails[i as Integration];
            const ds = dataSourceForIntegration(i as Integration);
            return (
              <TabsTrigger
                className={"custom"}
                key={i}
                value={i}
                style={{
                  backgroundColor: "none",
                }}
              >
                <Icon />
                <span>{label}</span>
                {ds?.is_enabled ? (
                  <Badge radius={"full"} color={"green"}>
                    <CheckIcon className={"h-4 w-4"} />
                  </Badge>
                ) : null}
              </TabsTrigger>
            );
          })}

          <TabsTrigger
            className={"custom"}
            key={"request"}
            value={"request"}
            style={{
              backgroundColor: "none",
            }}
          >
            <QuestionMarkCircleIcon className={"h-4 w-4"} />
            <span>Not seeing your data source?</span>
          </TabsTrigger>
        </Tabs.List>

        <div className={"px-3 py-2"}>
          {Object.keys(supportedDataSources).map((i) => (
            <RenderDataSourceSettings
              key={i}
              connectionForIntegration={connectionForIntegration}
              dataSourceForIntegration={dataSourceForIntegration}
              i={i as Integration}
              upsertDataSource={upsertDataSource}
            />
          ))}

          <Tabs.Content key={"request"} value={"request"}>
            <Callout.Root color={"blue"} size={"1"}>
              <Callout.Icon>
                <ChatBubbleLeftEllipsisIcon className={"w-4 h-4"} />
              </Callout.Icon>
              <Callout.Text>
                We are constantly adding new data sources. If you would like to
                request a new integration, please{" "}
                <Link href={mailtoLink}>reach out</Link> to us!
              </Callout.Text>
            </Callout.Root>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

function ManageConnectionDropdown({
  connectSource,
  integration,
}: {
  connectSource: () => Promise<void>;
  integration: Integration;
}) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const disconnectIntegration = async () => {
    setIsSubmitting(true);
    try {
      await fetch(`/api/integrations/${integration}`, {
        method: "DELETE",
      });
      window.location.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AlertDialog.Root>
      <AlertDialog.Content style={{ maxWidth: 450 }}>
        <AlertDialog.Title>
          Disconnect {integrationDetails[integration].label}?
        </AlertDialog.Title>
        <AlertDialog.Description size="2">
          Disconnecting will keep all documents in your data sinks, and no new
          documents will be synced.
        </AlertDialog.Description>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            disconnectIntegration();
          }}
        >
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <SubmitButton danger submitting={isSubmitting} invalid={false}>
                Disconnect
              </SubmitButton>
            </AlertDialog.Action>
          </Flex>
        </form>
      </AlertDialog.Content>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton variant="soft" size={"1"}>
            <EllipsisHorizontalIcon className={"w-4 h-4"} />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size={"1"}>
          <DropdownMenu.Item onClick={connectSource} className={"space-x-2"}>
            <LinkIcon className={"w-4 h-4"} />
            <span>Reconnect</span>
          </DropdownMenu.Item>
          <DropdownMenu.Separator />

          <AlertDialog.Trigger>
            <DropdownMenu.Item color="red">
              <TrashIcon className={"w-4 h-4"} />
              <span>Disconnect</span>
            </DropdownMenu.Item>
          </AlertDialog.Trigger>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </AlertDialog.Root>
  );
}

function RenderDataSourceSettings({
  i,
  connectionForIntegration,
  dataSourceForIntegration,

  upsertDataSource,
}: {
  connectionForIntegration: <T extends IntegrationConnectionBase>(
    i: Integration,
  ) => T;
  dataSourceForIntegration: <T extends PipelineDataSourceBase>(
    i: Integration,
  ) => T;
  i: Integration;
  upsertDataSource: (
    integration: Integration,
    is_enabled: boolean,
    text_splitter: PipelineDataSource["text_splitter"],
  ) => void;
}) {
  const { icon: Icon, label } = integrationDetails[i];
  const { settingsView: SettingsView, useConnect } = supportedDataSources[i];

  const connection = connectionForIntegration<NotionIntegrationConnection>(i);
  const ds = dataSourceForIntegration<NotionDataSource>(i);

  const connectSource = useConnect();

  if (connection && connection.connected_at) {
    return (
      <Tabs.Content key={i} value={i}>
        <div
          className={
            "flex flex-col md:flex-row space-y-2 md:space-y-0 md:gap-4 justify-between"
          }
        >
          <SettingsView
            dataSource={ds}
            connection={connection}
            upsertDataSource={upsertDataSource}
            connectSource={connectSource}
          />
          <div className={"shrink-0 whitespace-nowrap"}>
            <Text size="2">
              <label className={"select-none"}>
                <Switch
                  mr="2"
                  size={"2"}
                  radius={"full"}
                  checked={ds?.is_enabled || false}
                  onCheckedChange={(c) =>
                    upsertDataSource(
                      i,
                      c,
                      ds?.text_splitter || {
                        type: TextSplitterType.RecursiveCharacter,
                        config: {},
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

  return (
    <Tabs.Content key={i} value={i}>
      <Button key={i} variant={"soft"} onClick={connectSource}>
        <Icon />

        <span>Connect {label}</span>
      </Button>
    </Tabs.Content>
  );
}

function getConnectIntegration(integration: Integration) {
  return () => {
    return async () => {
      const resp = await fetch(`/api/integrations/${integration}`, {
        method: "POST",
      });
      const { authorizeUrl } = await resp.json();

      window.location.href = authorizeUrl;
    };
  };
}

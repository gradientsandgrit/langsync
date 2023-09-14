import { usePipeline, usePipelineRuns, usePipelineRunSteps } from "@/app/api";
import {
  Integration,
  Pipeline,
  PipelineRun,
  PipelineRunStep,
  PipelineRunStepStatus,
  PipelineRunTrigger,
} from "@/app/api/auth/callback/db";
import { Badge, Callout, Heading, Text } from "@radix-ui/themes";
import * as Accordion from "@radix-ui/react-accordion";
import {
  formatDistanceStrict,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";
import classNames from "classnames";
import React, { useMemo, useState } from "react";
import { integrationDetails } from "@/app/_components/onboarding/onboarding";
import { ClockIcon } from "@heroicons/react/24/outline";
import { PauseIcon } from "@heroicons/react/20/solid";

export function RunHistory({
  pipelineId,
  exceededQuotas,
}: {
  pipelineId: string;
  exceededQuotas?: boolean;
}) {
  const { data: pipelineData } = usePipeline(pipelineId);
  const { data: runHistory } = usePipelineRuns(pipelineId);

  const [activeItem, setActiveItem] = useState<string>("");
  return (
    <div className="flex flex-col space-y-4 h-full">
      <div>
        <Heading as={"h3"} size={"3"}>
          Run History
        </Heading>
        <Text size={"2"} color={"gray"}>
          Recent pipeline runs are shown here
        </Text>
      </div>

      {exceededQuotas ? (
        <Callout.Root color="amber">
          <Callout.Icon>
            <PauseIcon className={"w-5 h-5 text-red-700"} />
          </Callout.Icon>
          <Callout.Text>
            Incoming change events will be ignored until you extend your service
            quotas.
          </Callout.Text>
        </Callout.Root>
      ) : null}

      <Accordion.Root
        type="single"
        value={activeItem}
        onValueChange={(value) => setActiveItem(value)}
        collapsible
        className={"h-full overflow-auto flex flex-col space-y-4"}
      >
        {pipelineData
          ? runHistory?.map((run) => (
              <PipelineRunItem
                isExpanded={activeItem === run.id}
                pipeline={pipelineData}
                key={run.id}
                run={run}
              />
            ))
          : null}
      </Accordion.Root>
    </div>
  );
}

function PipelineRunItem({
  run,
  pipeline,
  isExpanded,
}: {
  run: PipelineRun;
  pipeline: Pipeline;
  isExpanded: boolean;
}) {
  const isRecent = useMemo(
    () => parseISO(run.created_at).getTime() > Date.now() - 1000 * 60,
    [run.created_at],
  );

  const { data: steps } = usePipelineRunSteps(
    pipeline.id,
    run.id,
    isExpanded || isRecent,
  );

  const isRunning =
    steps &&
    steps.some((s) =>
      [PipelineRunStepStatus.Running, PipelineRunStepStatus.Pending].includes(
        s.status,
      ),
    );
  const earliestStart = steps
    ? steps
        .map((s) =>
          s.started_at ? parseISO(s.started_at).getTime() : new Date(),
        )
        .sort()[0]
    : null;
  const duration = earliestStart
    ? formatDistanceToNowStrict(earliestStart, { addSuffix: false })
    : null;

  return (
    <Accordion.Item
      value={run.id}
      className={"flex flex-col whitespace-nowrap"}
    >
      <Accordion.Trigger
        className={classNames(
          "relative inline-flex h-12 overflow-hidden p-[2px]",
          {
            "rounded-[7px]": !isExpanded,
            "rounded-t-md": isExpanded,
          },
        )}
      >
        <span
          className={classNames("absolute inset-[-1000%]  ", {
            "animate-[spin_2s_ease-in-out_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,var(--accent-1)_0%,var(--accent-9)_50%,var(--accent-1)_100%)]":
              isRunning,
          })}
        />

        <div
          className={classNames(
            "inline-flex h-full w-full cursor-pointer items-center justify-center bg-white px-3 py-1 text-sm font-medium text-white backdrop-blur-3xl",
            {
              "rounded-md": !isExpanded,
              "rounded-t-md": isExpanded,
            },
          )}
        >
          <Badge
            color={
              run.trigger === PipelineRunTrigger.System
                ? "orange"
                : run.trigger === PipelineRunTrigger.Manual
                ? "blue"
                : "green"
            }
            className={"text-sm"}
          >
            {toUpperFirst(
              run.trigger === PipelineRunTrigger.IntegrationChangeEvent
                ? "Integration"
                : run.trigger,
            )}
          </Badge>
          <span
            className={
              "ml-2 font-mono text-xs text-slate-800 bg-slate-100 rounded p-1"
            }
          >
            {run.id}
          </span>
          <div className={"ml-auto flex items-center space-x-2"}>
            {isRunning ? (
              <Badge>
                <svg
                  className="animate-spin h-3 w-3 text-[--accent-9]"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-10"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>

                {duration || "0s"}
              </Badge>
            ) : (
              <span className={"text-xs text-slate-600"}>
                {formatDistanceToNowStrict(parseISO(run.created_at), {
                  addSuffix: true,
                })}
              </span>
            )}
          </div>
        </div>
      </Accordion.Trigger>
      {isExpanded ? (
        <Accordion.Content
          className={
            "p-4 text-xs bg-white rounded-b-md flex flex-col space-y-2"
          }
        >
          {steps?.map((step) => (
            <StepRenderer
              step={step}
              pipeline={pipeline}
              key={step.data_source}
            />
          ))}
        </Accordion.Content>
      ) : null}
    </Accordion.Item>
  );
}

function StepRenderer({
  step,
  pipeline,
}: {
  pipeline: Pipeline;
  step: PipelineRunStep;
}) {
  const dataSource = pipeline.config.data_sources.find(
    (d) => d.id === step.data_source,
  );
  if (!dataSource) {
    return null;
  }

  const duration =
    step.started_at && step.completed_at
      ? formatDistanceStrict(
          parseISO(step.completed_at),
          parseISO(step.started_at),
        )
      : null;

  return (
    <div className={"flex items-center space-x-2"}>
      <IntegrationBadge integration={dataSource.integration_name} />
      <Badge
        color={
          step.status === "completed"
            ? "green"
            : step.status === "failed"
            ? "red"
            : "gray"
        }
      >
        {toUpperFirst(step.status)}
      </Badge>
      {duration ? (
        <Badge>
          <ClockIcon className={"w-4 h-4"} /> {duration}
        </Badge>
      ) : null}
    </div>
  );
}

function toUpperFirst(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function IntegrationBadge({
  integration,
}: {
  integration: Integration;
}) {
  const { icon: Icon, label } = integrationDetails[integration];
  return (
    <div className={"flex items-center space-x-1 select-none"}>
      <Icon />
      <span>{label}</span>
    </div>
  );
}

import { usePipelineDocuments } from "@/app/api";
import React, { useState } from "react";
import { Callout, Link, Table, TextField } from "@radix-ui/themes";
import {
  ArrowPathIcon,
  InformationCircleIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid";
import { useDebounce } from "@/app/_components/hooks";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { IntegrationBadge } from "@/app/_components/onboarding/pipeline_runs";

export function PipelineDocs({ pipelineId }: { pipelineId: string }) {
  const [search, setSearch] = useState<string>("");

  const debouncedSearchValue = useDebounce(search, 500);

  const { data, isValidating, isLoading } = usePipelineDocuments(
    pipelineId,
    debouncedSearchValue,
  );

  return (
    <div className={"relative flex flex-col overflow-auto max-h-full"}>
      <div className={"sticky top-0 z-10 bg-white p-2"}>
        <TextField.Root>
          <TextField.Slot>
            <MagnifyingGlassIcon className={"w-4 h-4"} />
          </TextField.Slot>
          <TextField.Input
            placeholder="Search the docs…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
          />
          {isLoading || isValidating ? (
            <TextField.Slot>
              <ArrowPathIcon className={"w-4 h-4 animate-spin"} />
            </TextField.Slot>
          ) : null}
        </TextField.Root>
      </div>

      {data ? (
        <>
          {data.length === 0 ? (
            <div className={"p-2"}>
              <Callout.Root>
                <Callout.Icon>
                  <InformationCircleIcon className={"w-4 h-4"} />
                </Callout.Icon>
                <Callout.Text>
                  We could not find any documents for this pipeline matching
                  your search.
                </Callout.Text>
              </Callout.Root>
            </div>
          ) : (
            <Table.Root>
              <Table.Header>
                <Table.Row className={"whitespace-nowrap"}>
                  <Table.ColumnHeaderCell>ID</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Integration</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Created at</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>
                    Last updated at
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>

              <Table.Body>
                {data?.map((doc) => {
                  let cleanedUrl = doc.url || "";
                  if (cleanedUrl.startsWith("https://")) {
                    cleanedUrl = cleanedUrl.substring(8);
                  }
                  if (cleanedUrl.startsWith("http://")) {
                    cleanedUrl = cleanedUrl.substring(7);
                  }
                  if (cleanedUrl.startsWith("www.")) {
                    cleanedUrl = cleanedUrl.substring(4);
                  }
                  if (cleanedUrl.length > 24) {
                    cleanedUrl = cleanedUrl.substring(0, 24) + "...";
                  }

                  let cleanedTitle = doc.title || "";
                  if (cleanedTitle.length > 36) {
                    cleanedTitle = cleanedTitle.substring(0, 36) + "...";
                  }

                  return (
                    <Table.Row key={doc.id} className={"whitespace-nowrap"}>
                      <Table.Cell>
                        <span
                          className={
                            "text-[10px] font-mono p-1 bg-slate-100 rounded"
                          }
                        >
                          {doc.id}
                        </span>
                      </Table.Cell>
                      <Table.RowHeaderCell>
                        {doc.url ? (
                          <Link
                            rel={"noopener noreferrer"}
                            target={"_blank"}
                            href={doc.url}
                          >
                            {cleanedTitle}
                          </Link>
                        ) : (
                          cleanedTitle
                        )}
                      </Table.RowHeaderCell>
                      <Table.Cell>
                        <IntegrationBadge integration={doc.integration_name} />
                      </Table.Cell>

                      <Table.Cell>
                        {formatDistanceToNowStrict(parseISO(doc.created_at), {
                          addSuffix: true,
                        })}
                      </Table.Cell>
                      <Table.Cell>
                        {doc.updated_at
                          ? formatDistanceToNowStrict(
                              parseISO(doc.updated_at),
                              {
                                addSuffix: true,
                              },
                            )
                          : "-"}
                      </Table.Cell>
                    </Table.Row>
                  );
                })}
              </Table.Body>
            </Table.Root>
          )}
        </>
      ) : (
        <div className={"p-2"}>
          <Callout.Root>
            <Callout.Icon>
              <svg
                className="animate-spin h-4 w-4 text-[--accent-9]"
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
            </Callout.Icon>
            <Callout.Text>Loading documents for this pipeline…</Callout.Text>
          </Callout.Root>
        </div>
      )}
    </div>
  );
}

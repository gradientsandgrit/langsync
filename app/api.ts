"use client";

import useSWR from "swr";
import {
  Account,
  IntegrationConnection,
  Pipeline,
  PipelineRun,
  PipelineRunStep,
  Document,
} from "@/app/api/auth/callback/db";
import { useCallback } from "react";
import { QuotasResponse } from "@/app/api/quotas/quotas";

export class FetcherError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends FetcherError {
  constructor(message: string, code: string) {
    super(message, code, 401);
  }
}

export async function extractErrorFromResponse(res: Response) {
  const body = await res.json();
  if (res.status === 401) {
    throw new UnauthorizedError(body.error, body.code);
  }
  throw new FetcherError(body.error, body.code, res.status);
}

export function fetcher<T>() {
  return async (url: string): Promise<T | null> => {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        await extractErrorFromResponse(res);
      }
      const body = await res.json();
      return body;
    } catch (err) {
      if (err instanceof FetcherError) {
        throw err;
      }
      if (err instanceof Error) {
        throw new FetcherError(err.message, "unknown", 500);
      }
      throw new FetcherError("Unknown error", "unknown", 500);
    }
  };
}

export function useProfile() {
  return useSWR<Account | null>("/api/profile", fetcher(), {
    keepPreviousData: true,
  });
}

export function useQuotas() {
  return useSWR<QuotasResponse | null>("/api/quotas", fetcher(), {
    keepPreviousData: true,
    refreshInterval: 10_000,
  });
}

export function useIsSignedIn() {
  const { data, error } = useProfile();
  return data && !error;
}

export function useSignout() {
  return useCallback(async (toLogin?: boolean) => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
      if (toLogin) {
        // go to /auth
        window.location.href = "/auth";
      } else {
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  }, []);
}

export function useDefaultPipeline() {
  return useSWR<Pipeline | null>("/api/pipelines/default", fetcher());
}

export function usePipeline(pipelineId: string) {
  return useSWR<Pipeline | null>(`/api/pipelines/${pipelineId}`, fetcher());
}

export function usePipelineRuns(pipelineId: string) {
  return useSWR<PipelineRun[] | null>(
    `/api/pipelines/${pipelineId}/runs`,
    fetcher(),
    {
      refreshInterval: 3000,
    },
  );
}

export function usePipelineRun(pipelineId: string, runId: string) {
  return useSWR<PipelineRun | null>(
    `/api/pipelines/${pipelineId}/runs/${runId}`,
    fetcher(),
  );
}

export function usePipelineRunSteps(
  pipelineId: string,
  runId: string,
  live: boolean,
) {
  return useSWR<PipelineRunStep[] | null>(
    `/api/pipelines/${pipelineId}/runs/${runId}/steps`,
    fetcher(),
    {
      refreshInterval: live ? 3000 : undefined,
    },
  );
}

export function usePipelineDocuments(pipelineId: string, search: string) {
  return useSWR<Document[] | null>(
    [`/api/pipelines/${pipelineId}/documents/search`, search],
    async <T>([url, search]: [string, string]): Promise<T | null> => {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: JSON.stringify({
            search,
          }),
        });
        if (res.status === 404) {
          return null;
        }
        if (!res.ok) {
          await extractErrorFromResponse(res);
        }
        const body = await res.json();
        return body;
      } catch (err) {
        if (err instanceof FetcherError) {
          throw err;
        }
        if (err instanceof Error) {
          throw new FetcherError(err.message, "unknown", 500);
        }
        throw new FetcherError("Unknown error", "unknown", 500);
      }
    },
    {
      keepPreviousData: true,
    },
  );
}

export function useIntegrationConnections() {
  return useSWR<IntegrationConnection[] | null>("/api/integrations", fetcher());
}

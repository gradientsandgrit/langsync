import { Account, findAccountById, SqlFunc } from "@/app/api/auth/callback/db";

export function totalIndexedDocumentsLimit(isSubscriber: boolean) {
  if (isSubscriber) {
    return 1000;
  }
  return 100;
}

export function totalIndexedDocumentTokensLimit(isSubscriber: boolean) {
  if (isSubscriber) {
    return 2_000_000; // 2 million tokens * $0,0001/1000 tokens = $0,2
  }
  return 100_000; // 100k tokens * $0,0001/1000 tokens = $0,01
}

export class QuotasExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotasExceededError";
  }
}

export function round(num: number) {
  if (num > 100) {
    return 100;
  }
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export async function enforceTotalIndexedDocumentQuota(
  sql: SqlFunc,
  accountId: string,
) {
  const account = await findAccountById(sql, accountId);
  if (account?.is_unlimited) {
    return;
  }

  if (!account || account.is_suspended) {
    throw new Error("Account not found");
  }

  const exceedsIndexedDocumentsLimit =
    account.total_indexed_document_count >=
    totalIndexedDocumentsLimit(account.is_subscriber);
  if (exceedsIndexedDocumentsLimit) {
    throw new QuotasExceededError(
      "You have exceeded the total indexed documents quota",
    );
  }

  const exceedsIndexedDocumentTokensLimit =
    account.total_indexed_document_tokens >=
    totalIndexedDocumentTokensLimit(account.is_subscriber);
  if (exceedsIndexedDocumentTokensLimit) {
    throw new QuotasExceededError(
      "You have exceeded the total indexed document tokens quota",
    );
  }
}

export interface ServiceQuotaProgress {
  current: number;
  max: number;
  percent: number;
}

export interface QuotasResponse {
  totalIndexedDocuments: ServiceQuotaProgress;
  totalIndexedDocumentTokens: ServiceQuotaProgress;
}

export async function getQuotaProgress(
  sql: SqlFunc,
  account: Account,
): Promise<QuotasResponse> {
  const totalIndexedDocuments = totalIndexedDocumentsLimit(
    account.is_subscriber,
  );
  const currentTotalIndexedDocuments = account.is_unlimited
    ? 0
    : account.total_indexed_document_count;

  const totalIndexedDocumentTokens = totalIndexedDocumentTokensLimit(
    account.is_subscriber,
  );
  const currentTotalIndexedDocumentTokens = account.is_unlimited
    ? 0
    : account.total_indexed_document_tokens;

  return {
    totalIndexedDocuments: {
      current: currentTotalIndexedDocuments,
      max: totalIndexedDocuments,

      percent: round(
        (currentTotalIndexedDocuments / totalIndexedDocuments) * 100,
      ),
    },
    totalIndexedDocumentTokens: {
      current: currentTotalIndexedDocumentTokens,
      max: totalIndexedDocumentTokens,
      percent: round(
        (currentTotalIndexedDocumentTokens / totalIndexedDocumentTokens) * 100,
      ),
    },
  };
}

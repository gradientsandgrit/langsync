import { NextResponse } from "next/server";
import { addMinutes, isAfter, parseISO } from "date-fns";
import {
  acceptAuthAttempt,
  createAccount,
  createPipeline,
  EmbeddingType,
  findAccountByEmail,
  findRecentAuthAttempt,
  updateIsSubscriber,
  updateLastLoginAt,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { createJWT } from "@/app/api/auth/callback/jwt";
import { getSubscriberStatus } from "@/app/api/auth/callback/subscriber";
import {
  reportError,
  reportEvent,
  sendSignupNotification,
} from "@/app/monitoring";

export const runtime = "edge";

export async function POST(req: Request) {
  const { email, code } = await req.json();

  return await withTransaction(async (sql) => {
    const attempt = await findRecentAuthAttempt(sql, email, code);
    if (!attempt) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    if (
        // Sanity check (already checked in query but just in case)
        attempt.email !== email ||
        attempt.confirmation_code !== code ||
        // Verify validity
        attempt.accepted_at !== null ||
        isAfter(new Date(), addMinutes(parseISO(attempt.created_at), 15))
    ) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    let createdAccount = false;
    let account;

    try {
      account = await findAccountByEmail(sql, email);
      if (!account) {
        account = await createAccount(
            sql,
            email,
            await getSubscriberStatus(email),
        );
        createdAccount = true;
        await reportEvent("signup", { email, accountId: account.id });
        await sendSignupNotification(account.id, email);
        await createPipeline(
            sql,
            account.id,
            "default",
            {
              data_sinks: [],
              embeddings: { type: EmbeddingType.OpenAI, config: {} },
              data_sources: [],
            },
            true,
            false,
        );
      } else {
        createdAccount =
            account.name === null || account.agree_to_terms === false;
        await updateLastLoginAt(sql, email);
        const isSubscriber = await getSubscriberStatus(email);
        await updateIsSubscriber(sql, email, isSubscriber);
        await reportEvent("login", {
          email,
          accountId: account.id,
          isSubscriber: isSubscriber,
        });
      }

      const token = await createJWT(account.id, email);

      await acceptAuthAttempt(sql, attempt.id);

      // set httpOnly cookie
      const tokenCookie = `langsync-token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict;`;

      return new Response(JSON.stringify({ success: "true", createdAccount }), {
        status: 200,
        headers: { "Set-Cookie": `${tokenCookie}` },
      });
    } catch (err) {
      if (err instanceof Error) {
        const attrs: Record<string, string | number | boolean> = {};
        if (account) {
          attrs.accountId = account.id;
        }
        await reportError(err, "auth_callback", false, {
          email,
          code,
          ...attrs,
        });
      }
      return NextResponse.json(
          { error: "Something went wrong" },
          { status: 500 },
      );
    }
  });
}

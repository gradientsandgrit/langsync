import { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { nanoid } from "nanoid";
import { reportError } from "@/app/monitoring";

// adapted from https://github.com/vercel/examples/blob/main/edge-middleware/jwt-authentication/lib/auth.ts

function retrieveKey(usage: "sign" | "verify") {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.JWT_SECRET!),
    { name: "HMAC", hash: { name: "SHA-256" } },
    false,
    [usage],
  );
}

export async function createJWT(accountId: string, email: string) {
  return await new SignJWT({
    email,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(nanoid())
    .setSubject(accountId)
    .setAudience("https://langsync.gradientsandgrit.com")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(await retrieveKey("sign"));
}

export async function verifyJwtMiddleware(req: NextRequest): Promise<
  | {
      accountId: string;
    }
  | {
      error: string;
      code: string;
    }
> {
  // load token from langsync-token cookie
  const token = req.cookies.get("langsync-token");

  if (!token) {
    await reportError(new Error("Missing token"), "jwt", true, {
      ip: req.ip || "unknown",
      country: req.geo?.country || "unknown",
    });
    return {
      error: "Missing token",
      code: "missing_token",
    };
  }

  try {
    const verified = await jwtVerify(token.value, await retrieveKey("verify"), {
      algorithms: ["HS256"],
      audience: "https://langsync.gradientsandgrit.com",
    });
    if (!verified.payload.sub) {
      throw new Error("Invalid token");
    }

    return {
      accountId: verified.payload.sub,
    };
  } catch (error) {
    console.error(error);
    await reportError(new Error("Invalid token"), "jwt", true, {
      ip: req.ip || "unknown",
      country: req.geo?.country || "unknown",
    });
    return {
      error: "Invalid token",
      code: "invalid_token",
    };
  }
}

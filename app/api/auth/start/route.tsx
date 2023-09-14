import { SESv2 } from "@aws-sdk/client-sesv2";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import {
  countRecentAuthAttempts,
  createAuthAttempt,
  withTransaction,
} from "@/app/api/auth/callback/db";
import { reportError, reportEvent } from "@/app/monitoring";

export const runtime = "edge";

function generateAuthCode() {
  let code = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  if (code[0] === "0") {
    code = `1${code.slice(1)}`;
  }
  if (
    code.length !== 6 ||
    code
      .split("")
      .some((c) => isNaN(parseInt(c)) || !Number.isInteger(parseInt(c)))
  ) {
    throw new Error("Invalid auth code");
  }

  return code;
}

export async function POST(req: Request) {
  const { email } = await req.json();
  if (!email) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const recentAttempts = await countRecentAuthAttempts(sql, email);
  if (recentAttempts > 3) {
    await reportEvent("auth_too_many_attempts", { email });
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  try {
    const sesClient = new SESv2({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    const confirmationCode = generateAuthCode();

    return await withTransaction(async (sql) => {
      const attempt = await createAuthAttempt(sql, email, confirmationCode);

      await sesClient.sendEmail({
        Content: {
          Simple: {
            Body: {
              Text: {
                Data:
                  "Hey! To sign in to LangSync, please enter this code: " +
                  confirmationCode,
                Charset: "UTF-8",
              },
              Html: {
                Data: `
              <!doctype html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><title></title><!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]--><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style type="text/css">#outlook a { padding:0; }
          body { margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%; }
          table, td { border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt; }
          img { border:0;height:auto;line-height:100%; outline:none;text-decoration:none;-ms-interpolation-mode:bicubic; }
          p { display:block;margin:13px 0; }</style><!--[if mso]>
        <noscript>
        <xml>
        <o:OfficeDocumentSettings>
          <o:AllowPNG/>
          <o:PixelsPerInch>96</o:PixelsPerInch>
        </o:OfficeDocumentSettings>
        </xml>
        </noscript>
        <![endif]--><!--[if lte mso 11]>
        <style type="text/css">
          .mj-outlook-group-fix { width:100% !important; }
        </style>
        <![endif]--><style type="text/css">@media only screen and (min-width:480px) {
        .mj-column-per-100 { width:100% !important; max-width: 100%; }
      }</style><style media="screen and (min-width:480px)">.moz-text-html .mj-column-per-100 { width:100% !important; max-width: 100%; }</style><style type="text/css">@media only screen and (max-width:480px) {
      table.mj-full-width-mobile { width: 100% !important; }
      td.mj-full-width-mobile { width: auto !important; }
    }</style></head><body style="word-spacing:normal;"><div><!--[if mso | IE]><table align="center" border="0" cellpadding="0" cellspacing="0" class="" style="width:600px;" width="600" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]--><div style="margin:0px auto;max-width:600px;"><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;"><!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]--><div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;"><div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,system-ui,sans-serif;font-size:13px;line-height:1;text-align:left;color:#000000;"><h1>Sign in to langsync</h1><p>To sign in to langsync, please enter this code:</p><h2>${confirmationCode}</h2></div></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><![endif]--></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><table align="center" border="0" cellpadding="0" cellspacing="0" class="" style="width:600px;" width="600" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]--><div style="margin:0px auto;max-width:600px;"><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;"><!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]--><div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="center" style="font-size:0px;padding:10px 25px;word-break:break-word;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;border-spacing:0px;"><tbody><tr><td style="width:200px;"><a href="https://langsync.gradientsandgrit.com" target="_blank"><img height="auto" src="https://gradientsandgrit.com/logo.png" style="border:0;display:block;outline:none;text-decoration:none;height:auto;width:100%;font-size:13px;" width="200"></a></td></tr></tbody></table></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><![endif]--></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><table align="center" border="0" cellpadding="0" cellspacing="0" class="" style="width:600px;" width="600" ><tr><td style="line-height:0px;font-size:0px;mso-line-height-rule:exactly;"><![endif]--><div style="margin:0px auto;max-width:600px;"><table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="width:100%;"><tbody><tr><td style="direction:ltr;font-size:0px;padding:20px 0;text-align:center;"><!--[if mso | IE]><table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr><td class="" style="vertical-align:top;width:600px;" ><![endif]--><div class="mj-column-per-100 mj-outlook-group-fix" style="font-size:0px;text-align:left;direction:ltr;display:inline-block;vertical-align:top;width:100%;"><table border="0" cellpadding="0" cellspacing="0" role="presentation" style="vertical-align:top;" width="100%"><tbody><tr><td align="left" style="font-size:0px;padding:10px 25px;word-break:break-word;"><div style="font-family:-apple-system,BlinkMacSystemFont,Helvetica Neue,Helvetica,Arial,system-ui,sans-serif;font-size:12px;line-height:1;text-align:left;color:#000000;"><p>If you didn't request this code, you can safely ignore this email.</p></div></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><![endif]--></td></tr></tbody></table></div><!--[if mso | IE]></td></tr></table><![endif]--></div></body></html>
              `,
                Charset: "UTF-8",
              },
            },
            Subject: {
              Data: "Sign in to langsync",
              Charset: "UTF-8",
            },
          },
        },
        Destination: {
          ToAddresses: [email],
        },
        FromEmailAddress: "hey@langsync.gradientsandgrit.com",
        ReplyToAddresses: ["hey@langsync.gradientsandgrit.com"],
      });

      await reportEvent("auth_start", { email });

      return NextResponse.json({ success: true, attemptId: attempt.id });
    });
  } catch (err) {
    if (err instanceof Error) {
      await reportError(err, "auth_start", false, { email });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 },
    );
  }
}

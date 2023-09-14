import { APIErrorCode, APIResponseError, Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import express, { json, RequestHandler } from "express";

async function main() {
  const app = express();

  const wrapExpressErrors = (handler: RequestHandler): RequestHandler => {
    return async (req, res, next) => {
      try {
        await handler(req, res, next);
      } catch (err) {
        next(err);
      }
    };
  };

  app.post(
    "/notion/markdown",
    json(),
    wrapExpressErrors(async (req, res) => {
      const { token, pageId } = req.body;

      console.log(`Attempting to convert page ${pageId} to markdown`);

      const notion = new Client({
        auth: token,
        timeoutMs: 60_000,
        fetch: async (url, opts) => {
          for (let attempt = 0; attempt < 10; attempt++) {
            console.log(`Fetching ${url}`);
            try {
              const resp = await fetch(url, opts);

              if (resp.status === 429) {
                console.log("Rate limited, sleeping for 3 seconds");
                await new Promise((resolve) => setTimeout(resolve, 3_000));
                continue;
              }

              return resp;
            } catch (err) {
              console.error(`Fetching ${url} failed with error`, err);
              throw err;
            }
          }
          throw new Error("Too many retries");
        },
      });

      const n2m = new NotionToMarkdown({
        notionClient: notion,
        config: {
          parseChildPages: false,
        },
      });

      try {
        const start = Date.now();
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdblocks);
        const end = Date.now();
        if (end - start > 10_000) {
          console.log(`Conversion took ${end - start}ms`);
        }
        res.json({ markdown: mdString.parent });
      } catch (err) {
        if (err instanceof APIResponseError) {
          console.error(
            "Fetching page failed with API error",
            err.code,
            err.message,
          );
          if (err.code === APIErrorCode.RateLimited) {
            res.status(429).json({ error: "Rate limited" });
            return;
          }
          if (err.code === APIErrorCode.Unauthorized) {
            res.status(401).json({ error: "Unauthorized" });
            return;
          }
          res.status(500).json({ error: "Internal server error" });
          return;
        }
        console.error("Fetching page failed with unknown error", err);
        res.status(500).json({ error: "Internal server error" });
        return;
      }
    }),
  );

  app.listen(8081, () => {
    console.log("Listening on port 8081");
  });
}

main();

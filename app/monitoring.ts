export async function reportError(
  err: Error,
  source: string,
  expected: boolean,
  {
    accountId,
    ...attributes
  }: {
    accountId?: string;
  } & Record<string, string | number | boolean>,
) {
  try {
    const extraAttributes: Record<string, string | number | boolean> = {};
    for (const key in attributes) {
      extraAttributes[`langsync.${key}`] = attributes[key];
    }

    // https://docs.newrelic.com/docs/data-apis/ingest-apis/event-api/introduction-event-api/
    // https://docs.newrelic.com/docs/data-apis/custom-data/custom-events/report-custom-event-data/#using-custom-events
    await fetch(
      `https://insights-collector.eu01.nr-data.net/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`,
      {
        method: "POST",
        headers: {
          "Api-Key": process.env.NEW_RELIC_LICENSE_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            eventType: "TransactionError",
            appName: "langsync",
            "error.class": err.name,
            "error.message": err.message,
            "error.stack": err.stack,
            "error.expected": expected,
            "langsync.accountId": accountId || "unknown",
            "langsync.source": source,
            ...extraAttributes,
          },
        ]),
      },
    );
  } catch (err) {
    console.error(err);
  }
}

export async function reportEvent(
  type: string,
  {
    accountId,
    ...rest
  }: {
    accountId?: string;
  } & Record<string, string | number | boolean>,
) {
  try {
    // https://docs.newrelic.com/docs/data-apis/ingest-apis/event-api/introduction-event-api/
    // https://docs.newrelic.com/docs/data-apis/custom-data/custom-events/report-custom-event-data/#using-custom-events

    const extraAttributes: Record<string, string | number | boolean> = {};
    for (const key in rest) {
      extraAttributes[`langsync.${key}`] = rest[key];
    }

    await fetch(
      `https://insights-collector.eu01.nr-data.net/v1/accounts/${process.env.NEW_RELIC_ACCOUNT_ID}/events`,
      {
        method: "POST",
        headers: {
          "Api-Key": process.env.NEW_RELIC_LICENSE_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            eventType: `LangSyncEvent`,
            "langsync.event": type,
            appName: "langsync",
            "langsync.accountId": accountId || "unknown",
            ...extraAttributes,
          },
        ]),
      },
    );
  } catch (err) {
    console.error(err);
  }
}

export async function sendSignupNotification(accountId: string, email: string) {
  if (!process.env.SLACK_NOTIFICATIONS_SIGNUP_WEBHOOK_URL) {
    console.error("Missing SLACK_NOTIFICATIONS_SIGNUP_WEBHOOK_URL");
    return;
  }
  try {
    await fetch(process.env.SLACK_NOTIFICATIONS_SIGNUP_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "We got a new signup! :tada:",
            },
          },
          {
            type: "divider",
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `*Account ID*: \`${accountId}\``,
              },
              {
                type: "mrkdwn",
                text: `*Email*: \`${email}\``,
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error(err);
  }
}

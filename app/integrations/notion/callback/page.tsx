"use client";

import { useEffect } from "react";
import { Integration } from "@/app/api/auth/callback/db";
import { IntegrationConnectionLoader } from "@/app/_components/loader";

export default function NotionIntegrationCallbackPage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    const error = params.get("error");
    if (error) {
      window.location.href = `/?failed-integration=${Integration.Notion}`;
    }

    const code = params.get("code");
    if (code) {
      (async () => {
        const resp = await fetch(`/api/integrations/notion/complete`, {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        if (resp.ok) {
          window.location.href = `/?enabled-integration=${Integration.Notion}`;
        } else {
          window.location.href = `/?failed-integration=${Integration.Notion}`;
        }
      })();
    }
  }, []);

  return <IntegrationConnectionLoader />;
}

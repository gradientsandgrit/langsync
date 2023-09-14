"use client";

import { useProfile } from "@/app/api";
import { SubscriptionModal } from "@/app/_components/subscribe";
import { ProfileUi } from "@/app/_components/account";
import { Logo } from "@/app/_components/logo";

export function NavigationBar() {
  const { data } = useProfile();

  return (
    <div
      className={
        "flex items-center justify-between h-24 max-h-24 shrink-0 px-8"
      }
    >
      <Logo />

      <div className={"flex items-center space-x-4"}>
        {data && !data.is_subscriber ? <SubscriptionModal small /> : null}

        <ProfileUi />
      </div>
    </div>
  );
}

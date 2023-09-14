import React from "react";
import { AuthFlow } from "@/app/_components/auth";
import { Logo } from "@/app/_components/logo";
import { PipelineIllustration } from "@/app/_components/onboarding/onboarding";

export default function AuthPage() {
  return (
    <div className={"h-full grid grid-cols-1 md:grid-cols-2"}>
      <div
        className={"col-span-1 flex flex-col grow pt-4 px-4 justify-between"}
      >
        <Logo />

        <AuthFlow />
      </div>
      <div className={"hidden md:block col-span-1 bg-slate-50 grow"}>
        <PipelineIllustration config={null} />
      </div>
    </div>
  );
}

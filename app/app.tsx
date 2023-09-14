import { ShowOnboardingProvider } from "@/app/_components/account";

import { PropsWithChildren } from "react";
import { NavigationBar } from "@/app/_components/navigation";

export function App({ children }: PropsWithChildren) {
  return (
    <ShowOnboardingProvider>
      <div className={"h-full flex flex-col"}>
        <NavigationBar />
        {children}
      </div>
    </ShowOnboardingProvider>
  );
}

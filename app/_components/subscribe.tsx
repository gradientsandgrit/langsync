"use client";

import React from "react";
import { useProfile, useQuotas } from "@/app/api";
import { Button, Dialog, IconButton } from "@radix-ui/themes";
import { DocumentTextIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { SubmitButton } from "@/app/_components/account";
import { Logo } from "@/app/_components/logo";
import { ArrowPathIcon, CheckCircleIcon } from "@heroicons/react/24/outline";

export function SubscriptionModal({ small }: { small?: boolean }) {
  const [open, setOpen] = React.useState(false);

  const { mutate: mutateProfile } = useProfile();
  const { mutate: mutateQuotas } = useQuotas();

  const [submitting, setSubmitting] = React.useState(false);

  const subscribeToGradientsAndGrit = async () => {
    if (submitting) {
      return false;
    }
    setSubmitting(true);
    try {
      await fetch(`/api/subscribe`, {
        method: "POST",
      });

      await mutateProfile();
      await mutateQuotas();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button>Subscribe</Button>
      </Dialog.Trigger>

      <Dialog.Content
        style={{ maxWidth: 600, height: 500 }}
        className={"flex flex-col"}
      >
        <div
          className={
            "flex items-center justify-between w-full p-4 shrink-0 grow-0"
          }
        >
          <div />

          <Logo />

          <Dialog.Close>
            <IconButton
              variant={"ghost"}
              className={
                "transition bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-50 p-1 rounded-full group"
              }
            >
              <XMarkIcon className={"w-5 h-5"} />
            </IconButton>
          </Dialog.Close>
        </div>

        <div
          className={
            "flex flex-col items-center text-center w-full shrink-0 grow-0"
          }
        >
          <Dialog.Title className="font-medium tracking-tight !mb-0" size={"7"}>
            Subscribe
          </Dialog.Title>
          <Dialog.Description className="text-base text-slate-500">
            Join the Gradients & Grit newsletter to
            <br />
            unlock the full power of langsync.
          </Dialog.Description>
        </div>

        <div className={"shrink-0 grow-0 px-8 py-4"}>
          <div className={"flex flex-col space-y-2"}>
            <div className={"flex items-start space-x-2"}>
              <div className={"p-1 rounded-full bg-blue-100"}>
                <CheckCircleIcon className={"w-5 h-5 text-blue-400"} />
              </div>
              <div className={"flex flex-col"}>
                <h3 className={"text-base font-medium"}>
                  Priority index queue
                </h3>
                <span className={"text-sm font-normal text-slate-500"}>
                  Get fresh data even faster
                </span>
              </div>
            </div>

            <div className={"flex items-start space-x-2 "}>
              <div className={"p-1 rounded-full bg-blue-100"}>
                <ArrowPathIcon className={"w-5 h-5 text-blue-400"} />
              </div>
              <div className={"flex flex-col"}>
                <h3 className={"text-base font-medium"}>
                  Increased full-index syncs
                </h3>
                <span className={"text-sm font-normal text-slate-500"}>
                  Receive more all-time full-index syncs
                </span>
              </div>
            </div>

            <div className={"flex items-start space-x-2 "}>
              <div className={"p-1 rounded-full bg-blue-100"}>
                <DocumentTextIcon className={"w-5 h-5 text-blue-400"} />
              </div>
              <div className={"flex flex-col"}>
                <h3 className={"text-base font-medium"}>
                  Large document support
                </h3>
                <span className={"text-sm font-normal text-slate-500"}>
                  Extended document size limits for all data sources
                </span>
              </div>
            </div>
          </div>
        </div>

        <form
          className="flex flex-col justify-end px-8 md:px-16 w-full grow"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            subscribeToGradientsAndGrit();
          }}
        >
          <div className={"flex flex-col items-center space-y-2"}>
            <SubmitButton submitting={submitting} invalid={false}>
              Subscribe
            </SubmitButton>
            <span className={"text-center text-xs font-medium text-blue-400"}>
              Subscribing is completely free, and you can unsubscribe at any
              time.
            </span>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

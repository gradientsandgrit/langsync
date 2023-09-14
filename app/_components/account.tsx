"use client";

import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  ChatBubbleLeftEllipsisIcon,
  FaceFrownIcon,
  LockClosedIcon,
  NoSymbolIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import { ClockIcon, XMarkIcon } from "@heroicons/react/24/outline";
import classNames from "classnames";
import {
  Button,
  Dialog,
  DropdownMenu,
  IconButton,
  TextField,
} from "@radix-ui/themes";
import { UnauthorizedError, useProfile, useSignout } from "@/app/api";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/20/solid";
import { motion } from "framer-motion";

export const ShowSignInContext = createContext(() => {});

function StepperNumber({
  num,
  active,
  done,
}: {
  num: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <div
      className={classNames(
        "flex items-center justify-center rounded-full text-xs p-2 w-[28px] h-[28px]",
        {
          "bg-neutral-100 text-neutral-300": !done && !active,
          "bg-blue-500 text-white ring-blue-300 ring ring-offset-1":
            !done && active,
          "bg-blue-100 text-blue-300": done && !active,
        },
      )}
    >
      <span>{num}</span>
    </div>
  );
}

function StepperSeparator({ done }: { done: boolean }) {
  return (
    <div
      className={classNames("w-[28px] h-[3px] rounded-full ", {
        "bg-neutral-100": !done,
        "bg-blue-300": done,
      })}
    />
  );
}

export enum OnboardingStep {
  SignIn = "signIn",
  EnterCode = "enterCode",
  EnterName = "enterName",
  AgreeTOS = "agreeTOS",
}

function OnboardingFinalizer({
  step,
  setStep,
  onDone,
}: {
  step: OnboardingStep;
  setStep: React.Dispatch<React.SetStateAction<OnboardingStep>>;
  onDone: () => void;
}) {
  const { mutate: mutateAccount, data: account } = useProfile();
  const signOut = useSignout();

  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");

  const invalid =
    step === OnboardingStep.EnterName ? !name || submitting : false;
  const updateName = useCallback(async () => {
    if (invalid) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
        }),
      });
      if (res.ok) {
        if (account) {
          mutateAccount({
            ...account,
            name,
          });
        }
        setStep(OnboardingStep.AgreeTOS);
      }
    } finally {
      setSubmitting(false);
    }
  }, [name, submitting, invalid]);

  const agreeToS = useCallback(async () => {
    if (invalid) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/profile`, {
        method: "PATCH",
        body: JSON.stringify({
          agreeToTerms: true,
        }),
      });
      if (res.ok) {
        onDone();
      }
    } finally {
      setSubmitting(false);
    }
  }, [name, submitting, invalid]);

  if (step === OnboardingStep.EnterName) {
    return (
      <>
        <div
          className={
            "flex flex-col items-center text-center w-full space-y-1 shrink-0 grow-0"
          }
        >
          <Dialog.Title className="text-4xl font-medium tracking-tight">
            What&apos;s your name?
          </Dialog.Title>
          <Dialog.Description className="text-base text-neutral-500">
            Let us know how we should call you.
          </Dialog.Description>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateName();
          }}
          className="mt-8 flex flex-col space-y-4 px-4 md:px-24 w-full grow shrink"
        >
          <div className={"flex flex-col h-full"}>
            <label className="text-sm text-neutral-500" htmlFor="email">
              Your name
            </label>
            <TextField.Root>
              <TextField.Input
                type={"text"}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </TextField.Root>
          </div>

          <div className={"mt-auto"}>
            <FormFooter>
              <SubmitButton submitting={submitting} invalid={invalid} />
              <Button
                variant={"soft"}
                onClick={() => {
                  signOut(true);
                }}
              >
                Switch account
              </Button>
            </FormFooter>
          </div>
        </form>
      </>
    );
  }

  if (step === OnboardingStep.AgreeTOS) {
    return (
      <>
        <div
          className={
            "flex flex-col items-center text-center w-full space-y-1 shrink-0 grow-0"
          }
        >
          <Dialog.Title className="text-4xl font-medium tracking-tight">
            One last thing.
          </Dialog.Title>
          <Dialog.Description className="text-base text-neutral-500 max-w-sm">
            Please carefully read our terms and guidelines before completing the
            signup.
          </Dialog.Description>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            agreeToS();
          }}
          className="flex flex-col px-8 w-full h-full"
        >
          <div className={"flex flex-col space-y-1"}>
            <span className={"text-sm text-red-400 text-center"}>
              The following behavior will get your account suspended
              permanently.
            </span>
            <div className={"flex flex-col space-y-1 bg-red-50 p-2 rounded-lg"}>
              <div className={"grid grid-cols-2 gap-4"}>
                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <ChatBubbleLeftEllipsisIcon
                      className={"w-5 h-5 text-red-400"}
                    />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    Harmful or malicious content
                  </span>
                </div>

                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <ClockIcon className={"w-5 h-5 text-red-400"} />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    Degrading experience of other users
                  </span>
                </div>

                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <LockClosedIcon className={"w-5 h-5 text-red-400"} />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    Violating people&apos;s privacy
                  </span>
                </div>

                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <FaceFrownIcon className={"w-5 h-5 text-red-400"} />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    Fraudulent or deceptive activity
                  </span>
                </div>

                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <PhotoIcon className={"w-5 h-5 text-red-400"} />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    DMCA protected content
                  </span>
                </div>

                <div className={"flex items-center space-x-2"}>
                  <div
                    className={
                      "w-7 h-7 rounded-full bg-red-100 flex items-center justify-center"
                    }
                  >
                    <NoSymbolIcon className={"w-5 h-5 text-red-400"} />
                  </div>
                  <span className={"text-xs text-red-500"}>
                    Anything illegal
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className={"mt-auto mb-8 flex flex-col space-y-4"}>
            <SubmitButton submitting={submitting} invalid={invalid} danger>
              I understand and agree
            </SubmitButton>
          </div>
        </form>
      </>
    );
  }

  return null;
}

export function ShowOnboardingProvider({ children }: PropsWithChildren) {
  const [open, setOpen] = useState(false);
  const [dismissable, setDismissable] = useState(true);

  const {
    data: account,
    mutate,
    error,
    isLoading,
    isValidating,
  } = useProfile();

  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.SignIn);

  const onDone = () => {
    mutate();
    setDismissable(true);
    setOpen(false);
  };

  useEffect(() => {
    if (isLoading || isValidating) {
      return;
    }

    if (error instanceof UnauthorizedError || (!error && !account)) {
      // Navigate to /auth
      window.location.href = "/auth";
    }

    if (account && !error) {
      if (account.name === null || account.agree_to_terms === false) {
        console.log("onboarding not complete, reopening", { account });
        setOpen(true);
        setStep(
          account.name ? OnboardingStep.AgreeTOS : OnboardingStep.EnterName,
        );
        setDismissable(false);
      }
    }
  }, [error, open, account, isLoading, isValidating]);

  return (
    <>
      <ShowSignInContext.Provider value={() => setOpen(true)}>
        {children}
      </ShowSignInContext.Provider>
      <Dialog.Root
        open={open}
        onOpenChange={(o) => {
          if (dismissable) {
            setOpen(o);
          }
        }}
      >
        <Dialog.Content
          style={{ maxWidth: 600, height: 500 }}
          className={"flex flex-col"}
        >
          <div
            className={
              "flex items-center justify-between w-full p-6 shrink-0 grow-0"
            }
          >
            <div />

            <div className={"flex items-center space-x-2"}>
              <StepperNumber
                num={1}
                active={step === OnboardingStep.SignIn}
                done={step !== OnboardingStep.SignIn}
              />
              <StepperSeparator done={step !== OnboardingStep.SignIn} />
              <StepperNumber
                num={2}
                active={step === OnboardingStep.EnterCode}
                done={
                  step === OnboardingStep.EnterName ||
                  step === OnboardingStep.AgreeTOS
                }
              />
              {step === OnboardingStep.EnterName ||
              step === OnboardingStep.AgreeTOS ? (
                <>
                  <StepperSeparator done={true} />

                  <StepperNumber
                    num={3}
                    active={step === OnboardingStep.EnterName}
                    done={step === OnboardingStep.AgreeTOS}
                  />
                  <StepperSeparator done={step === OnboardingStep.AgreeTOS} />

                  <StepperNumber
                    num={4}
                    active={step === OnboardingStep.AgreeTOS}
                    done={false}
                  />
                </>
              ) : null}
            </div>

            {dismissable ? (
              <Dialog.Close>
                <IconButton>
                  <XMarkIcon className={"w-5 h-5"} />
                </IconButton>
              </Dialog.Close>
            ) : (
              <div />
            )}
          </div>

          <OnboardingFinalizer step={step} setStep={setStep} onDone={onDone} />
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}

export function ProfileUi() {
  const { data, error, isLoading, isValidating } = useProfile();
  const signOut = useSignout();

  const showSignIn = useContext(ShowSignInContext);

  if (isLoading) {
    return null;
  }

  if (data && !error) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <button
            className={
              "appearance-none outline-none transition-opacity hover:opacity-80 active:opacity-70"
            }
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className={classNames("w-8 h-8 rounded-full", {
                "bg-gradient-to-tr from-blue-500 to-purple-500": data && !error,
                "bg-gradient-to-tr from-neutral-300 to-neutral-500":
                  !data || error,
              })}
            ></motion.div>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content size={"2"}>
          <DropdownMenu.Item
            className={"space-x-2"}
            onClick={async () => {
              if (error) {
                showSignIn();
              } else {
                signOut();
              }
            }}
          >
            <ArrowRightOnRectangleIcon className={"w-4 h-4"} />
            <span>{error ? "Sign in" : "Sign out"}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    );
  }

  return <Button onClick={() => showSignIn()}>Sign In</Button>;
}

export function FormFooter({ children }: PropsWithChildren) {
  return <div className={"mb-8 flex flex-col space-y-2"}>{children}</div>;
}

export function SubmitButton({
  invalid,
  submitting,
  children,
  danger,
}: PropsWithChildren<{
  submitting: boolean;
  invalid: boolean;
  danger?: boolean;
}>) {
  return (
    <Button
      className={"whitespace-nowrap"}
      type={"submit"}
      color={danger ? "red" : undefined}
      disabled={submitting || invalid}
    >
      {submitting ? (
        <svg
          key={"spinner"}
          aria-hidden="true"
          role="status"
          className={classNames("inline w-4 h-4 text-white animate-spin")}
          viewBox="0 0 100 101"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="#E5E7EB"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentColor"
          />
        </svg>
      ) : null}
      {!children || typeof children === "string" ? (
        <span key={"label"}>{children || "Continue"}</span>
      ) : (
        children
      )}
    </Button>
  );
}

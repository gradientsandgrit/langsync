"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TextField } from "@radix-ui/themes";
import {
  FormFooter,
  OnboardingStep,
  SubmitButton,
} from "@/app/_components/account";

export function AuthFlow() {
  const [step, setStep] = useState<OnboardingStep>(OnboardingStep.SignIn);

  const [submitting, setSubmitting] = useState(false);

  const [dirty, setDirty] = useState(false);

  const [email, setEmail] = useState("");
  const signIn = useCallback(async () => {
    if (!email || !email.includes("@") || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/start`, {
        method: "POST",
        body: JSON.stringify({
          email,
        }),
      });
      if (res.ok) {
        setStep(OnboardingStep.EnterCode);
      }
    } finally {
      setSubmitting(false);
    }
  }, [email, submitting]);

  const [code, setCode] = useState<Array<number | null>>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);
  const codeSet = useMemo(
    () =>
      code.length === 6 && code.every((v) => v !== null && Number.isInteger(v)),
    [code],
  );

  const confirmCode = useCallback(async () => {
    if (!codeSet || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/callback`, {
        method: "POST",
        body: JSON.stringify({
          email,
          code: code.join(""),
        }),
      });
      if (res.ok) {
        const body = await res.json();

        window.location.href = "/";
      }
    } finally {
      setSubmitting(false);
    }
  }, [code, codeSet, email, submitting]);

  useEffect(() => {
    if (codeSet) {
      confirmCode();
    }
  }, [codeSet, code]);

  const invalid =
    step === "signIn" ? email.length < 3 || !email.includes("@") : !codeSet;

  if (step === "signIn") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          signIn();
        }}
        className="flex flex-col px-4 md:px-24 lg:px-36 w-full grow justify-center"
      >
        <div className={"flex flex-col space-y-4"}>
          <div className={"flex flex-col items-start text-left space-y-1"}>
            <span className="text-3xl font-medium tracking-tight">
              Welcome back
            </span>
            <span className="text-base text-neutral-500">
              No waitlists, no credit card, retrieve your data in under 5
              minutes.
            </span>
          </div>

          <div>
            <TextField.Root>
              <TextField.Input
                type="email"
                placeholder={"name@company.com"}
                value={email}
                autoFocus={true}
                onChange={(e) => {
                  setDirty(true);
                  setEmail(e.target.value);
                }}
              />
            </TextField.Root>
          </div>

          <FormFooter>
            <SubmitButton submitting={submitting} invalid={invalid} />
          </FormFooter>
        </div>
      </form>
    );
  }

  if (step === "enterCode") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          confirmCode();
        }}
        className="flex flex-col px-4 md:px-24 w-full grow justify-center"
      >
        <div className={"flex flex-col space-y-4"}>
          <div className={"flex flex-col items-start text-left space-y-1"}>
            <span className="text-3xl font-medium tracking-tight">
              Welcome back
            </span>
            <span className="text-base text-neutral-500">
              To start syncing your data, please sign in with your email.
            </span>
          </div>

          <div className={"flex flex-col space-y-2"}>
            <label className="text-sm text-neutral-500">
              Confirmation code
            </label>

            <CodeInput code={code} setCode={setCode} />
          </div>

          <FormFooter>
            <SubmitButton submitting={submitting} invalid={invalid} />
          </FormFooter>
        </div>
      </form>
    );
  }

  return null;
}

function CodeInput({
  setCode,
  code,
}: {
  code: Array<number | null>;
  setCode: React.Dispatch<React.SetStateAction<Array<number | null>>>;
}) {
  const updateCodeDigit = useCallback(
    (digit: number, value: number | null) => {
      setCode((code) => {
        code[digit] = value;
        return [...code];
      });
    },
    [code],
  );

  const getDigitValue = useCallback(
    (digit: number) => {
      return code[digit];
    },
    [code],
  );

  return (
    <div className={"flex items-center justify-start space-x-2"}>
      <DigitInput
        value={getDigitValue(0)}
        isFirst
        onChange={(value) => updateCodeDigit(0, value)}
        onPaste={(value) => {
          setCode(value.split("").map((v) => parseInt(v, 10)));
        }}
      />
      <DigitInput
        value={getDigitValue(1)}
        onChange={(value) => updateCodeDigit(1, value)}
      />
      <DigitInput
        value={getDigitValue(2)}
        onChange={(value) => updateCodeDigit(2, value)}
      />
      <DigitInput
        value={getDigitValue(3)}
        onChange={(value) => updateCodeDigit(3, value)}
      />
      <DigitInput
        value={getDigitValue(4)}
        onChange={(value) => updateCodeDigit(4, value)}
      />
      <DigitInput
        value={getDigitValue(5)}
        onChange={(value) => {
          updateCodeDigit(5, value);
        }}
      />
    </div>
  );
}

function DigitInput({
  value,
  onChange,
  isFirst,
  onPaste,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  isFirst?: boolean;
  onPaste?: (code: string) => void;
}) {
  return (
    <TextField.Root className={"w-8 items-center"}>
      <TextField.Input
        onPaste={(e) => {
          if (!onPaste) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          const paste = e.clipboardData.getData("text");
          if (
            paste.length === 6 &&
            paste.split("").every((v) => !isNaN(parseInt(v, 10)))
          ) {
            onPaste(paste);
          }
        }}
        autoFocus={isFirst}
        onFocus={(e) => e.target.select()}
        style={{
          WebkitAppearance: "none",
          MozAppearance: "textfield",
        }}
        type={"number"}
        inputMode={"numeric"}
        value={value ?? ""}
        min={0}
        max={9}
        pattern={"[0-9]"}
        onChange={(e) => {
          onChange(e.target.value === "" ? null : parseInt(e.target.value, 10));
          // focus next input
          if (e.target.value.length > 0) {
            const nextInputContainer =
              e.target.parentElement?.nextElementSibling;
            const nextInput = nextInputContainer?.querySelector("input");
            if (nextInput) {
              nextInput.focus();
            }
          }
        }}
      />
    </TextField.Root>
  );
}

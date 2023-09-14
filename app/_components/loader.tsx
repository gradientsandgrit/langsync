import { Heading, Text } from "@radix-ui/themes";
import { motion } from "framer-motion";
import React from "react";

export function IntegrationConnectionLoader() {
  return (
    <motion.div
      key={"loading"}
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className={"grow flex flex-col space-y-4 items-center pt-48"}
    >
      <svg
        className="animate-spin h-12 w-12 text-slate-800"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-10"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>

      <div
        className={
          "text-center flex flex-col items-center space-y-2 max-w-sm md:max-w-none"
        }
      >
        <Heading as={"h1"}>
          Just a moment while we set things up for you...
        </Heading>
        <Text size={"2"} className={"text-slate-600"}>
          This should only take a few seconds. If you&apos;re seeing this for
          more than a minute, please contact us!
        </Text>
      </div>
    </motion.div>
  );
}

export function OnboardingLoader() {
  return (
    <motion.div
      key={"loading"}
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.2, delay: 0.1 }}
      className={"grow flex flex-col space-y-4 items-center pt-24"}
    >
      <svg
        className="animate-spin h-12 w-12 text-slate-800"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-10"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>

      <div
        className={
          "text-center flex flex-col items-center space-y-2 max-w-sm md:max-w-none"
        }
      >
        <Heading as={"h1"}>
          Just a moment, we&apos;re setting up your pipeline
        </Heading>
        <Text size={"2"} className={"text-slate-600"}>
          This should only take a few seconds. If you&apos;re seeing this for
          more than a minute, please contact us!
        </Text>
      </div>
    </motion.div>
  );
}

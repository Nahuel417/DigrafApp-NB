"use client";

import { SubmitButton } from "@/components/submit-button";
import { ArrowRight } from "lucide-react";

type AuthSubmitButtonProps = {
  idleLabel: string;
  pendingLabel: string;
};

export function AuthSubmitButton({
  idleLabel,
  pendingLabel,
}: AuthSubmitButtonProps) {
  return (
    <SubmitButton
      className="w-full font-sans"
      pendingLabel={pendingLabel}
      size="lg"
    >
      {idleLabel}
      <ArrowRight aria-hidden="true" data-icon="inline-end" />
    </SubmitButton>
  );
}

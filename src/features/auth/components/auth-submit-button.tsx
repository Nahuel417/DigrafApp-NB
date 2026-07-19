"use client";

import { SubmitButton } from "@/components/submit-button";

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
      className="w-full"
      pendingLabel={pendingLabel}
      size="lg"
    >
      {idleLabel}
    </SubmitButton>
  );
}

"use client";

import { LoaderCircle } from "lucide-react";
import { forwardRef } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = ButtonProps & {
  pendingLabel: string;
};

export const SubmitButton = forwardRef<HTMLButtonElement, SubmitButtonProps>(function SubmitButton(
  { children, disabled, pendingLabel, ...props },
  ref,
) {
  const { pending } = useFormStatus();

  return (
    <Button aria-busy={pending} disabled={disabled || pending} ref={ref} type={props.type ?? "submit"} {...props}>
      {pending ? <LoaderCircle aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : null}
      {pending ? pendingLabel : children}
    </Button>
  );
});

"use client";

import { LogOut } from "lucide-react";
import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import type { ButtonProps } from "@/components/ui/button";
import { useMutationToast } from "@/hooks/use-mutation-toast";
import type { MutationState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

import { logoutAction } from "../actions";

const initialState: MutationState = {};

type LogoutFormProps = {
  buttonClassName?: string;
  className?: string;
  label?: string;
  showIcon?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
};

export function LogoutForm({
  buttonClassName,
  className,
  label = "Salir",
  showIcon = true,
  size = "sm",
  variant = "ghost",
}: LogoutFormProps) {
  const [state, formAction] = useActionState(logoutAction, initialState);
  useMutationToast(state);

  return (
    <form action={formAction} className={className}>
      <SubmitButton
        className={cn(buttonClassName)}
        pendingLabel="Saliendo"
        size={size}
        variant={variant}
      >
        {showIcon ? <LogOut aria-hidden="true" data-icon="inline-start" /> : null}
        {label}
      </SubmitButton>
      {state.status === "error" ? <p className="sr-only" role="alert">{state.message}</p> : null}
    </form>
  );
}

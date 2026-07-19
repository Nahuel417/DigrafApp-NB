"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import type { MutationState } from "@/lib/action-state";

export function useMutationToast(state: MutationState) {
  useEffect(() => {
    if (!state.message || !state.status || !state.toastId) return;

    if (state.status === "success") {
      toast.success(state.message);
      return;
    }

    toast.error(state.message);
  }, [state.message, state.status, state.toastId]);
}

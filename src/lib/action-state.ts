export type MutationState = {
  fieldErrors?: Record<string, string[] | undefined>;
  message?: string;
  resetKey?: string;
  status?: "error" | "success";
  toastId?: string;
};

export function mutationResult(
  status: "error" | "success",
  message: string,
  fieldErrors?: MutationState["fieldErrors"],
): MutationState {
  return {
    fieldErrors,
    message,
    status,
    toastId: crypto.randomUUID(),
  };
}

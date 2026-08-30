"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

const noticeMessages = {
  "password-updated": "Contraseña actualizada. Tu acceso ya está habilitado.",
  "signed-in": "Sesión iniciada correctamente.",
  "signed-out": "Sesión cerrada correctamente.",
} as const;

export type MutationNoticeKind = keyof typeof noticeMessages;

export function MutationNotice({ notice }: { notice?: string }) {
  const announced = useRef(false);

  useEffect(() => {
    if (announced.current || !notice || !(notice in noticeMessages)) return;
    announced.current = true;
    toast.success(noticeMessages[notice as MutationNoticeKind]);
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(window.history.state, "", url);
  }, [notice]);

  return null;
}

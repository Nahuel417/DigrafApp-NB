"use client";

import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function OrderDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Log errors to an error tracking service in production.
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Pedidos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Detalle del pedido</h1>
      </header>
      <Alert variant="destructive">
        <AlertTitle>No se pudo cargar el pedido</AlertTitle>
        <AlertDescription>Intentá recargar la página. Si el problema persiste, contactá al administrador.</AlertDescription>
      </Alert>
      <button className="sr-only" onClick={reset} type="button">Reintentar</button>
    </main>
  );
}

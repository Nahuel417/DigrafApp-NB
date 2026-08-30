"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function OrdersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header><p className="text-sm text-muted-foreground">Pedidos</p><h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Tablero de pedidos</h1></header>
      <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>No pudimos cargar el tablero de pedidos</AlertTitle><AlertDescription><p>Verificá tu conexión y reintentá antes de continuar.</p><Button className="mt-4" onClick={reset} type="button" variant="outline">Reintentar</Button></AlertDescription></Alert>
    </main>
  );
}

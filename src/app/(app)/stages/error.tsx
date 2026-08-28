"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function StagesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header>
        <p className="text-[11px] font-medium uppercase tracking-label text-muted-foreground">Administración</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-display">Etapas</h1>
      </header>
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No pudimos cargar las etapas</AlertTitle>
        <AlertDescription>
          <p>Reintentá la operación. Si el problema continúa, verificá tu conexión antes de seguir.</p>
          <Button className="mt-4" onClick={reset} type="button" variant="outline">Reintentar</Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}

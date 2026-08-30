"use client";

import { AlertCircle, Layers } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function CatalogsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:px-10">
      <header>
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
          <Layers aria-hidden="true" className="size-3" /> Administración
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-display">Catálogos</h1>
      </header>
      <Alert className="mt-8 rounded-2xl" variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No pudimos cargar los catálogos</AlertTitle>
        <AlertDescription>
          <p>Reintentá la operación. Si el problema continúa, verificá tu conexión antes de seguir.</p>
          <Button className="mt-4 rounded-xl" onClick={reset} type="button" variant="outline">Reintentar</Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}

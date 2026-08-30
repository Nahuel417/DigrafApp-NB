"use client";

import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function UsersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administración</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-display sm:text-3xl">Usuarios</h1>
      </header>
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>No pudimos cargar los usuarios</AlertTitle>
        <AlertDescription>
          <p>Reintentá la operación. Si el problema continúa, verificá tu conexión antes de seguir.</p>
          <Button className="mt-4" onClick={reset} type="button" variant="outline">Reintentar</Button>
        </AlertDescription>
      </Alert>
    </main>
  );
}

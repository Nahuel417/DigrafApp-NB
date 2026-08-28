import Image from "next/image";
import { CheckCircle2, Layers, Shirt, Sparkles } from "lucide-react";

import loginHero from "../../../../docs/brand/references/login-hero.png";

const miniStats = [
  { icon: Shirt, label: "Prendas", value: "12.4k" },
  { icon: Layers, label: "Etapas", value: "6" },
  { icon: Sparkles, label: "Calidad", value: "99%" },
];

export function AuthBrandPanel() {
  return (
    <section
      aria-labelledby="auth-brand-heading"
      className="relative hidden w-full shrink-0 overflow-hidden font-sans lg:flex lg:w-1/2 lg:flex-col"
    >
      <div className="absolute inset-0">
        <Image
          alt="Estética textil Digraf"
          className="h-full w-full object-cover"
          height={1024}
          priority
          src={loginHero}
          width={1024}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background/20 to-transparent" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
        <div className="flex w-full items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 font-sans text-[11px] font-medium text-primary backdrop-blur-sm">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Producción activa
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-display text-foreground" id="auth-brand-heading">
            Impresión textil con precisión operativa
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Gestión integral de pedidos, caja, catálogos y producción en un solo lugar.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {miniStats.map(({ icon: Icon, label, value }) => (
              <div
                className="rounded-2xl border border-border/70 bg-background/70 p-4 backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background/90"
                key={label}
              >
                <Icon aria-hidden="true" className="size-5 text-primary" />
                <p className="mt-2 font-mono text-xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 font-sans backdrop-blur-sm">
            <CheckCircle2 aria-hidden="true" className="size-3 text-success" />
            Caja auditada
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1.5 font-sans backdrop-blur-sm">
            <CheckCircle2 aria-hidden="true" className="size-3 text-success" />
            Trazabilidad completa
          </span>
        </div>
      </div>
    </section>
  );
}

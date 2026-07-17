# Digraf

Aplicación interna para gestionar producción, pedidos y caja de Digraf. El repositorio está iniciando el MVP definido en `docs/plans/mvp-plan.md`.

## Requisitos

- Node.js 22
- pnpm 10.18.3
- Docker Desktop con el daemon activo

Supabase CLI se instala como dependencia del proyecto; no requiere instalación global.

## Desarrollo local

```bash
pnpm install
pnpm db:start
pnpm exec supabase status -o env
```

Crear `.env.local` a partir de `.env.example` y completar:

- `NEXT_PUBLIC_SUPABASE_URL` con `API_URL`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con `PUBLISHABLE_KEY`.

Luego iniciar la aplicación:

```bash
pnpm dev
```

La configuración local deshabilita el registro público. Las cuentas internas se implementarán en el corte de identidad correspondiente.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:reset
pnpm db:types
```

`pnpm db:types` regenera `src/lib/supabase/database.types.ts` desde Supabase local. El archivo generado se versiona y no se edita manualmente.

## Límites operativos

- Los datos locales y seeds deben ser sintéticos.
- `db push`, despliegues y cambios de producción requieren aprobación explícita.
- Los secretos no se versionan.
- Las claves privilegiadas se incorporan solo en el corte que las necesite y permanecen en módulos exclusivos de servidor.

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
- `SUPABASE_URL` con `API_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` con `SERVICE_ROLE_KEY`, solo para el bootstrap administrativo.

Luego iniciar la aplicación:

```bash
pnpm dev
```

La configuración local deshabilita el registro público. Las cuentas internas se crean únicamente mediante el bootstrap administrativo de identidad.

## Bootstrap local

Con Supabase local iniciado, definir credenciales sintéticas únicas en `.env.local` o exportarlas solo para la sesión de la terminal. La contraseña debe tener al menos 8 caracteres e incluir un número.

```bash
BOOTSTRAP_SUPER_ADMIN_EMAIL=<email-sintetico-local> \
BOOTSTRAP_SUPER_ADMIN_NAME=<nombre-descriptivo> \
BOOTSTRAP_SUPER_ADMIN_PASSWORD=<contrasena-sintetica-local> \
pnpm bootstrap:super-admin
```

`.env.local` está ignorado por Git y no debe compartirse. El script nunca imprime contraseñas ni claves. Si Auth se creó y el perfil falla, informa el `user_id` para reparar el perfil o, con confirmación explícita, limpiar el usuario de Auth. En entornos remotos exige `--confirm-remote`; crear cuentas reales requiere autorización explícita.

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

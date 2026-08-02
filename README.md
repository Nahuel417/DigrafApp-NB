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

### Cuentas estables de desarrollo

Definir `LOCAL_DEV_USERS_PASSWORD` únicamente en `.env.local`, sin compartir su valor. Con Supabase local iniciado:

```bash
pnpm db:users
```

El comando crea o restaura idempotentemente las cuatro cuentas locales de desarrollo, confirma Auth y repara sus perfiles. Para reconstruir la base local y recuperar inmediatamente estas cuentas:

```bash
pnpm db:reset:local
```

`db:reset:local` ejecuta reset, regenera tipos y restaura las cuentas en ese orden. No usarlo cuando deban conservarse datos locales.

## Entornos y flujo Git

| Entorno | Aplicación | Base | Datos | URL |
| --- | --- | --- | --- | --- |
| Local | `pnpm dev` | Supabase local | Sintéticos | `http://127.0.0.1:3000` |
| Preview por rama | Vercel Preview (protección Vercel Authentication) | Supabase Cloud staging | Sintéticos, prefijo `STG-<rama>-<fecha>-<caso>`, correos `@example.test` | Subdominio generado por Vercel |
| Staging | Proyecto Vercel `digraf-staging`, rama `staging` como Preview protegida | Supabase Cloud `digraf-staging` | Sintéticos | Subdominio generado por Vercel |
| Producción | Otro proyecto Vercel, otro Supabase, fuera de INF-01 | Fuera de alcance | Reales | No configurar en INF-01 |

Flujo Git obligatorio: `feat/* → develop → staging` mediante PR. `main` no se utiliza en este proyecto de staging y se excluye mediante `git.deploymentEnabled` en `vercel.json`. `staging` se crea inicialmente desde `develop` y se mantiene como Preview branch estable de validación.

Más detalle en `docs/runbooks/staging.md` y `docs/decisions.md`.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm db:reset
pnpm db:reset:local
pnpm db:users
pnpm db:types
```

`pnpm db:types` regenera `src/lib/supabase/database.types.ts` desde Supabase local. El archivo generado se versiona y no se edita manualmente.

## Límites operativos

- Los datos locales, de preview y de staging deben ser sintéticos. No introducir datos reales en ningún entorno no productivo.
- `db push` contra staging, despliegues, restores remotos y cualquier cambio de producción requieren aprobación explícita por escrito. No son una verificación automática.
- Los secretos no se versionan ni se imprimen. `SUPABASE_SERVICE_ROLE_KEY` nunca debe aparecer con prefijo `NEXT_PUBLIC_` ni en el bundle del cliente.
- Las claves privilegiadas se incorporan solo en el corte que las necesite y permanecen en módulos exclusivos de servidor.
- `supabase db reset --linked`, `db push` desde un preview y SQL de esquema ejecutado desde el Dashboard de Supabase están prohibidos durante INF-01.
- El plan gratuito de Supabase puede pausar el proyecto por inactividad y no ofrece PITR; la recuperación esperada es reconstruir desde migraciones y bootstrap.

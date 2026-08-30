# Arquitectura — Digraf

Leer esta guía antes de modificar estructura, Next.js, Supabase, RLS, Storage, autenticación, migraciones o dependencias.

## Principios

- Construir por cortes verticales y mantener los límites entre UI, aplicación, dominio e infraestructura sin sobrearquitectura.
- Server Components por defecto; Client Components solo cuando la interacción lo requiera.
- La UI consume contratos de servidor; no encapsular reglas de negocio sensibles en componentes.
- RLS es la defensa final de acceso a datos. Middleware/proxy solo complementa la experiencia de navegación.
- El modelo de datos y las migraciones son la fuente de verdad; los tipos se generan desde Supabase.

## Estructura objetivo

La estructura se confirma al iniciar el repositorio; esta es la dirección esperada:

```text
src/
  app/                 # rutas, layouts, páginas, Server Actions y handlers
  components/ui/       # componentes base de shadcn/ui
  features/            # auth, users, catalogs, orders, board, cash, audit
  lib/
    supabase/          # clientes server/browser y tipos generados
    validation/        # schemas Zod compartidos
    dates/             # conversiones de día operativo
    money/             # formato y operaciones seguras de importes
  stores/              # solo estado efímero de UI
supabase/
  migrations/
  seed.sql
tests/
  e2e/
```

No crear una capa, carpeta o patrón nuevo solo por simetría. Si el repositorio adopta una variación equivalente, documentarla aquí y preservar su consistencia.

## Supabase

- Todas las tablas de negocio deben tener RLS habilitado y policies explícitas.
- Auth identifica al actor; una tabla de perfiles almacena rol y datos de aplicación vinculados a `auth.users`.
- Usar el cliente de servidor para datos protegidos y el cliente de navegador solo con la clave pública.
- La `service_role` se limita a contexto de servidor con autorización previa del actor; nunca llega al cliente.
- Storage requiere policies para lectura, carga y reemplazo de diseños.
- Añadir índices, foreign keys, constraints y policies en la misma migración que introduce su necesidad.
- Usar `numeric` para importes, claves estables para roles/etapas y timestamps UTC.

## Autenticación y credenciales

- Solo Super admin puede crear cuentas o restablecer contraseñas mediante una operación de servidor previamente autorizada.
- La Admin API y la `service_role` deben permanecer en módulos `server-only`; Admin y los demás roles no acceden a ese cliente privilegiado.
- La contraseña temporal nunca se persiste ni se registra fuera de Supabase Auth. Su comunicación ocurre fuera de la aplicación.
- El perfil debe representar de forma confiable que el cambio de contraseña inicial es obligatorio. Mientras esa condición esté activa, la aplicación limita la sesión al cambio de contraseña y al cierre de sesión.
- Un restablecimiento de contraseña realizado por Super admin vuelve a activar la obligación de cambio.
- Toda policy y función de negocio debe comprobar que el perfil está activo. No alcanza con cerrar u ocultar la navegación del usuario desactivado.
- Las operaciones de roles deben impedir la autoelevación y conservar al menos un `super_admin` activo.
- El bootstrap del primer Super admin es un script administrativo manual, separado de las rutas de la aplicación. Puede usar una clave privilegiada solo en proceso server-side y nunca debe incluirla en variables públicas, migraciones o logs.
- El script crea Auth y perfil con `role = 'super_admin'`, `is_active = true` y `must_change_password = true`; debe informar y permitir reparación explícita ante fallos parciales entre ambos sistemas.
- Las cuentas creadas por bootstrap se confirman automáticamente. No se agrega confirmación por email ni recuperación pública en M1.

## Operaciones sensibles

Pago confirmado, reversión de pago, cierre de caja, anulación y movimiento de tarjeta auditado pueden requerir varias escrituras. Resolverlas con una transacción o función PostgreSQL que garantice éxito completo o rollback.

Las funciones SQL sensibles deben validar autorización, usar un `search_path` seguro y evitar `SECURITY DEFINER` salvo justificación y pruebas explícitas.

## Frontend

- Tailwind y shadcn/ui son la base visual. Reutilizar tokens y componentes existentes antes de crear variantes nuevas.
- Zod valida límites de entrada; React Hook Form maneja formularios complejos.
- dnd-kit maneja el tablero; incluir alternativa razonable a drag and drop para accesibilidad.
- Zustand administra filtros, paneles, modales, selección y optimismo descartable. No replicar datos de servidor como verdad global.
- Todos los flujos asincrónicos deben tener estados de carga, vacío, error y éxito.

## Dependencias y configuración

- Usar versiones estables fijadas en lockfile. No incorporar previews sin aprobación.
- Antes de sumar una dependencia, revisar si Next.js, shadcn/ui, Zod o una librería existente resuelven el caso.
- Mantener secretos fuera del repositorio. Documentar variables requeridas en `.env.example` con valores seguros.
- No desplegar, aplicar migraciones remotas ni cambiar configuración de producción como efecto colateral de una tarea local.

## Entornos y preview/staging

Digraf opera en cuatro entornos con separación estricta:

| Entorno | Aplicación | Base de datos | Datos | URL inicial |
| --- | --- | --- | --- | --- |
| Local | `pnpm dev` | Supabase local | Sintéticos | `http://127.0.0.1:3000` |
| Preview por rama | Vercel Preview, proyecto `digraf-staging` | Supabase Cloud `digraf-staging` | Sintéticos, prefijo `STG-<rama>-<fecha>-<caso>`, correos `@example.test` | Subdominio generado por Vercel |
| Staging estable | Vercel Preview, rama `staging` del proyecto `digraf-staging` | Supabase Cloud `digraf-staging` | Sintéticos | Subdominio generado por Vercel |
| Producción futura | Otro proyecto Vercel y otro Supabase, fuera de INF-01 | Fuera de alcance | Reales | No configurar en INF-01 |

Reglas de separación:

- `staging` se crea una sola vez desde `develop` y se mantiene como Preview branch estable del proyecto `digraf-staging`. El slot Production del proyecto queda sin uso y `main` se excluye del deploy mediante `git.deploymentEnabled` en `vercel.json`.
- Vercel Authentication se activa en `Production Environment` (con tipo `prod_deployment_urls_and_all_previews`) o, si la protección no alcanza, en `Preview` y en `All` para que tanto `staging` como las previews requieran autenticación.
- Producción futura nunca reutilizará este proyecto ni `staging`; tendrá su propio proyecto Vercel, su propio Supabase y su propio `main` con deployments productivos.

## Variables de entorno

| Variable | Exposición | Alcance | Notas |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Preview solamente | Requiere redeploy ante cambios. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública por diseño | Preview solamente | Segura para el navegador. |
| `SUPABASE_URL` | Servidor | Preview solamente | Igual valor que la pública, solo si el código actual la requiere. |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor, sensible | Preview solamente y solo si la app la usa | Nunca con prefijo `NEXT_PUBLIC_` y nunca en pruebas funcionales. |
| `LOCAL_DEV_USERS_PASSWORD` | Local | Solo `.env.local` | Prohibido en staging. |

Los secretos de migración (`SUPABASE_ACCESS_TOKEN`, project ref y db password) viven exclusivamente en el GitHub Environment `staging`. No se versionan, no se imprimen y no se cargan en Vercel. Los secret scanning de GitHub permanecen activos.

## Migraciones remotas

- `supabase db push` se aplica únicamente por ejecución manual autorizada contra el project ref de staging.
- Antes de cada push se ejecuta `supabase db push --dry-run` y se revisa la lista de migraciones esperadas.
- El workflow de GitHub Actions se gatilla por `workflow_dispatch` y se protege con GitHub Environment `staging`. Las ejecuciones concurrentes se bloquean con un job lock. El workflow debe existir en la rama por defecto para aparecer en la interfaz de ejecución manual.
- `supabase db reset --linked`, `supabase db push` desde un preview y cualquier SQL de esquema ejecutado desde el Dashboard de Supabase están prohibidos durante INF-01.
- Toda corrección de esquema se realiza con una migración nueva, nunca editando una migración ya aplicada.
- La recuperación esperada en el plan gratuito es reconstruir el proyecto desde migraciones y bootstrap, porque Supabase Free no ofrece PITR y el proyecto puede pausarse por inactividad.

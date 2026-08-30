# Runbook de staging y previews — Digraf

Documento operativo para los entornos no locales de Digraf durante INF-01. Complementa a `docs/decisions.md`, `docs/agent-guides/architecture.md` y `docs/agent-guides/verification.md`.

## Topología

| Entorno          | Aplicación                                                   | Base                             | Datos                                                                    | Protección            |
| ---------------- | ------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------ | --------------------- |
| Local            | `pnpm dev`                                                   | Supabase local (`pnpm db:start`) | Sintéticos                                                               | n/a                   |
| Preview por rama | Vercel Preview del proyecto `digraf-staging`                 | Supabase Cloud `digraf-staging`  | Sintéticos, prefijo `STG-<rama>-<fecha>-<caso>`, correos `@example.test` | Vercel Authentication |
| Staging estable  | Vercel Preview, rama `staging` del proyecto `digraf-staging` | Supabase Cloud `digraf-staging`  | Sintéticos                                                               | Vercel Authentication |

`main` no se despliega en este proyecto (`vercel.json` con `git.deploymentEnabled.main = false`). Producción futura tendrá su propio proyecto Vercel y su propio Supabase.

## Custodia de secretos

| Recurso                                                             | Ubicación                                                                | Quién lo custodia |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------- |
| Contraseña de base Supabase                                         | Gestor personal de secretos del dueño                                    | Dueño             |
| `SUPABASE_ACCESS_TOKEN`                                             | GitHub Environment `staging` (secret)                                    | Dueño             |
| `SUPABASE_PROJECT_ID` (project ref)                                 | GitHub Environment `staging` (variable)                                  | Dueño             |
| `SUPABASE_DB_PASSWORD`                                              | GitHub Environment `staging` (secret)                                    | Dueño             |
| `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel Project Settings, alcance Preview solamente                       | Dueño             |
| `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`                        | Vercel Project Settings, alcance Preview solamente, solo si la app las usa | Dueño             |

Reglas:

- Ningún secreto en Git, Trello, logs, builds, screenshots, issues, migraciones ni tickets.
- `service_role` nunca con prefijo `NEXT_PUBLIC_` y nunca en pruebas funcionales.
- Rotar inmediatamente cualquier credencial expuesta y registrar el incidente.
- Mantener MFA activa en Supabase, Vercel y GitHub.

## Preflight obligatorio

Antes de cualquier `supabase db push` contra staging:

1. `pnpm db:reset:local` y comprobar que las cuentas locales vuelven a estar disponibles.
2. `pnpm test` y `pnpm test:integration` en verde.
3. `pnpm db:types` y `git diff --exit-code -- src/lib/supabase/database.types.ts` sin diferencias.
4. Confirmar que el `project ref` de GitHub Environment `staging` coincide con el del proyecto.
5. `supabase login --token "$SUPABASE_ACCESS_TOKEN"` y `supabase link --project-ref "$SUPABASE_PROJECT_ID"`.
6. `supabase db push --dry-run` y revisar que aparezcan solo las migraciones esperadas.
7. Ejecutar `supabase db push` mediante una corrida manual aprobada en GitHub Actions.
8. Verificar el historial remoto con `supabase migration list` y comparar contra el local.

Prohibiciones explícitas durante INF-01:

- `supabase db reset --linked`.
- `supabase db push` desde un preview o desde CI automática.
- Cualquier SQL de esquema ejecutado desde el Dashboard de Supabase.
- Edición manual de una migración ya aplicada.
- Datos reales en staging, Storage, variables o logs.

## Vercel Authentication y rama estable

- Proyecto Vercel: `digraf-staging`. Nombre y equipo acordados con el dueño.
- Rama estable: `staging`, creada una sola vez desde `develop`.
- URL inicial: la generada por Vercel. No configurar dominio propio durante INF-01.
- Activar Vercel Authentication para que previews y `staging` requieran autenticación.
- Configurar en `vercel.json`:
    - `git.deploymentEnabled.main = false` para impedir deploys desde `main`.
    - Las ramas no listadas siguen el comportamiento por defecto de Vercel; no usar el archivo para sustituir la configuración del Dashboard.
    - `staging`, `develop` y `feat/*` deben generar previews durante INF-01.

## Checklist manual de fase 3

Ejecutar en este orden, sin entregar credenciales al agente:

1. Crear la rama remota `staging` desde `develop` mediante el flujo Git aprobado.
2. Crear o conectar el proyecto Vercel `digraf-staging` al repositorio de GitHub.
3. Mantener `staging` como rama Preview, no como Production Branch. El slot Production queda sin uso.
4. Confirmar que `main` no genera deployments por `vercel.json`; si el Dashboard muestra una configuración incompatible, detenerse y resolverla manualmente.
5. Activar Vercel Authentication para previews y URLs de deployment. Esta opción requiere el Dashboard y no se reemplaza con `vercel.json`.
6. En Vercel, crear únicamente variables Preview:
   - `NEXT_PUBLIC_SUPABASE_URL` con la URL de `digraf-staging`.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con la publishable key de `digraf-staging`.
   - `SUPABASE_URL` solo si el código actual la requiere en servidor.
   - `SUPABASE_SERVICE_ROLE_KEY` solo si el código actual la requiere en servidor; nunca como `NEXT_PUBLIC_*`.
7. Crear el GitHub Environment `staging`.
8. Agregar `SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD` como secrets del Environment.
9. Agregar `SUPABASE_PROJECT_ID` como variable del Environment, sin poner su valor en Git.
10. Configurar aprobadores y reglas de protección del Environment según las capacidades disponibles de la cuenta.
11. Verificar que `.github/workflows/deploy-staging-db.yml` aparece en la rama por defecto del repositorio. GitHub no ofrece el workflow manual en la interfaz hasta que el archivo exista allí.
12. No ejecutar el workflow durante esta fase. La fase 4 autorizará por separado el preflight, el dry-run y el push.

### Barreras del workflow

- El único trigger es `workflow_dispatch`; no responde a `push`, `pull_request` ni `schedule`.
- El job usa `environment: staging`, por lo que requiere las protecciones del Environment antes de iniciar.
- `concurrency` impide dos migraciones simultáneas.
- El workflow ejecuta el dry-run antes de la barrera textual `APPLY_STAGING_MIGRATIONS`.
- `db push` solo se alcanza si el dry-run terminó correctamente y la entrada manual coincide exactamente.
- El workflow no contiene valores de secretos; solo referencias a `secrets.*` y `vars.*`.
- El workflow debe estar en la rama por defecto para poder lanzarse desde GitHub Actions; hacerlo disponible allí requiere un PR/merge explícitamente autorizado.

## Variables de Vercel

| Variable                               | Entornos Vercel                             | Sensible           |
| -------------------------------------- | ------------------------------------------- | ------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Preview solamente                           | No                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview solamente                           | No                 |
| `SUPABASE_URL`                         | Preview solamente                           | No (solo servidor) |
| `SUPABASE_SERVICE_ROLE_KEY`            | Preview solamente, solo si la app la usa   | Sí                 |

Toda modificación de variable requiere un nuevo deployment. Instant Rollback no restaura valores anteriores.

## GitHub Actions para migraciones

- Workflow `deploy-staging-db.yml` en `.github/workflows/`, gatillado solo por `workflow_dispatch`.
- Usar `environment: staging` para exigir aprobación manual.
- Bloquear ejecuciones concurrentes con un `concurrency` group a nivel de job.
- Pasos: checkout, instalar Supabase CLI, link al project ref, dry-run, push y verificación de historial.
- Sin triggers automáticos desde `push`, `pull_request` ni `schedule`.
- No crear workflow equivalente para producción durante INF-01.

## Datos sintéticos y convenciones

- Sufijo visual en UI para distinguir staging y previews, por ejemplo banner o título.
- Nombres: `STG-<rama>-<fecha>-<caso>` (por ejemplo `STG-feat-pagos-2026-08-01-pruebaintegracion`).
- Correos: `@example.test`. Ningún dominio real.
- Clientes en pedidos: texto corto identificable.
- Storage: sin buckets, sin objetos, sin imágenes de prueba.

## Validación por rol

Aplicable a preview y staging, sin afectar Supabase local:

- Super admin: alta de cuenta, roles, desactivación, restablecimiento, última protección Super admin.
- Admin: cambio de rol entre Atención y Empleado y desactivación. Restricción de creación y credenciales.
- Atención: alta manual de pedido, comentarios, descripción.
- Empleado: sin acceso a creación de pedido, sin información financiera.
- Todos: rechazo de movimiento hacia o desde la etapa `paid`.

## Fase 4C: bootstrap sintético remoto

El único modo aprobado para crear las cuentas sintéticas es:

```bash
pnpm bootstrap:super-admin -- --all-roles --confirm-remote
```

El script rechaza cualquier URL o project ref remoto distinto de `digraf-staging`, exige `--confirm-remote`, valida emails `@example.test`, detecta duplicados antes de mutar y hace upsert únicamente de los cuatro roles configurados. Las cuentas sintéticas estables tienen `must_change_password = false` para permitir las validaciones focalizadas de RLS; no representan cuentas reales ni habilitan datos operativos.

Variables requeridas por nombre:

- `SUPABASE_URL`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_PUBLISHABLE_KEY`
- `BOOTSTRAP_SUPER_ADMIN_EMAIL`, `BOOTSTRAP_SUPER_ADMIN_NAME`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ATTENTION_EMAIL`, `BOOTSTRAP_ATTENTION_NAME`, `BOOTSTRAP_ATTENTION_PASSWORD`
- `BOOTSTRAP_EMPLOYEE_EMAIL`, `BOOTSTRAP_EMPLOYEE_NAME`, `BOOTSTRAP_EMPLOYEE_PASSWORD`

Después del upsert, el script verifica login, email confirmado, perfil activo, rol, visibilidad de `profiles` por rol, aislamiento financiero de `employee`, rechazo de actualización de permisos por `employee`, ausencia de acceso anónimo, tablas operativas vacías y Storage sin buckets. No usa migraciones, SQL manual ni crea datos de negocio.

## Recuperación

| Falla                                | Procedimiento                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Error de aplicación o de variable    | Reasignar URL estable al deployment anterior o redeployar. Recordar que Instant Rollback no restaura variables.                          |
| Variable rota o filtrada             | Restaurar desde el gestor, redeployar, invalidar el valor y rotarlo.                                                                     |
| Error de migración compatible        | Aplicar migración correctiva nueva. Nunca editar la migración original.                                                                  |
| Migración destructiva no deseada     | Si el proyecto aún es reconstruible, recrear desde migraciones y bootstrap. No usar PITR porque el plan gratuito no lo ofrece.           |
| Proyecto pausado por inactividad     | Restaurar desde el Dashboard de Supabase o recrear desde migraciones.                                                                    |
| Confusión entre staging y producción | No promovida a producción. Verificar que `staging` siga siendo Preview branch protegida y que producción futura use proyectos separados. |

## Documentación y trazabilidad

- Toda decisión nueva sobre staging se registra en `docs/decisions.md`.
- Toda configuración de Vercel, Supabase o GitHub se documenta en este runbook.
- Cada migración de staging se justifica en el PR y se cita en el resumen de la entrega.
- Las tarjetas de Trello del módulo INF-01 describen, sin secretos, el estado de cada fase.
- `AGENTS.md` mantiene los límites críticos; cualquier excepción se justifica explícitamente.

## Registro del proyecto

- Proyecto Supabase: `digraf-staging`
- Región efectiva: `São Paulo`
- Project ref: `saajtpvsttiedthuhxou`
- Fecha de creación: `2026-08-01`
- Estado: entorno exclusivo de staging, con datos sintéticos, sin Storage y reconstruible desde migraciones versionadas.

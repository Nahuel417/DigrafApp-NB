# Verificación — Digraf

Leer esta guía antes de cerrar cambios de código, tests, migraciones, CI o configuración de desarrollo.

## Principios

- Ejecutar la verificación más enfocada que aporte evidencia suficiente; aumentar cobertura con el riesgo.
- Siempre informar las comprobaciones realizadas y las que no pudieron ejecutarse.
- No sustituir tests de permisos o transacciones por pruebas manuales de interfaz.
- Tras el scaffolding, mantener esta guía sincronizada con los comandos reales de `package.json`, CI y Supabase.

## Comandos esperados

Una vez configurado el proyecto, los scripts esperados son:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm dev
```

Para cambios de esquema, usar los scripts locales del repositorio:

```bash
pnpm db:start
pnpm db:reset
pnpm db:types
```

`supabase db push` y cualquier operación contra un proyecto remoto requieren autorización explícita; nunca son una verificación automática.

## Matriz mínima por riesgo

| Área modificada | Evidencia mínima |
| --- | --- |
| UI aislada | lint, typecheck y prueba/manual visual enfocada |
| Lógica de dominio | test unitario del caso principal, bordes y regresión |
| Server Action o endpoint | validación de entrada, caso autorizado y denegado |
| RLS/roles/Storage | policy o integración para cada rol permitido y rechazado |
| Auth y usuarios | creación exclusiva de Super admin, bootstrap inicial, cambio inicial de contraseña, usuario desactivado, autoelevación rechazada y protección del último Super admin |
| Migración | reset local, tipos generados y prueba del contrato afectado |
| Caja/pago/anulación | atomicidad, idempotencia, estado abierto/cerrado y auditoría |
| Kanban | movimiento válido, reversión, rechazo de Empleado a Pagado y error de servidor |
| Catálogos y alta manual de pedido | Super admin/Admin/Atención pueden crear; solo Super admin/Admin administran catálogos; Empleado es rechazado; borrado físico conserva snapshots históricos; combinaciones, importes, saldo derivado, atomicidad, idempotencia, etapa inicial y visibilidad financiera |

## Antes de finalizar

1. Revisar `git diff` y confirmar que no hay cambios ajenos, secretos o logs.
2. Ejecutar lint y typecheck para cambios de código, salvo bloqueo explicado.
3. Ejecutar tests relevantes; agregar build cuando afecte rutas, configuración o integración.
4. Para frontend relevante, comprobar estados de carga, vacío, error, éxito y una resolución móvil/desktop representativa.
5. Para datos sensibles, revisar permisos y trazabilidad además del comportamiento feliz.

## Pruebas visuales

- Los snapshots visuales de Playwright no se ejecutan ni bloquean CI en Linux.
- GitHub Actions debe continuar ejecutando todos los recorridos E2E funcionales y los demás controles; cualquier fallo funcional sigue bloqueando CI.
- No reproducir Linux localmente para ejecutar o actualizar pruebas visuales.
- Ejecutar y actualizar snapshots visuales únicamente en Windows o macOS cuando corresponda.

Una tarea no está terminada si deja una migración sin tipos, un bypass conocido de permisos, un error silencioso o una verificación crítica omitida sin explicación.

Para administración de usuarios, verificar además que Admin no pueda crear cuentas ni asignar o restablecer credenciales, que solo pueda cambiar roles entre Atención y Empleado, y que una contraseña temporal o restablecida no habilite el resto de la aplicación hasta ser reemplazada por el usuario.

Para bootstrap, probar localmente la creación de Auth y perfil, el email confirmado, `must_change_password`, la ausencia de secretos en salida y el reporte de fallo parcial. La limpieza de un usuario Auth huérfano debe requerir confirmación explícita. No crear usuarios reales remotos como parte de pruebas automáticas.

## Verificación específica de staging y preview

Antes de cualquier acción remota, ejecutar las comprobaciones no destructivas de la fase 1:

- `git status` y `git diff --check` para confirmar que solo aparecen archivos esperados.
- `git rev-parse --verify develop` y comprobar que la rama activa es `feat/staging-environment` creada desde `develop`.
- Revisar que `staging` aún no existe y que `.atl/`, `.env.local` y otros artefactos locales están ignorados o no rastreados.
- `pnpm install --frozen-lockfile` solo si la fase 1 introduce cambios en `package.json`. En INF-01 no debería haberlos.
- `rg` para confirmar que la documentación nueva no contiene `service_role`, `access_token`, `project_ref` con valor, `db_password` ni correos reales.

Migraciones de esquema:

- Si la fase introduce migración nueva, antes de cualquier `db push`:
  - `pnpm db:reset:local` ejecutado y verificado.
  - `pnpm test` y `pnpm test:integration` en verde.
  - `pnpm db:types` y `git diff --exit-code -- src/lib/supabase/database.types.ts` sin diferencias.
  - `supabase db push --dry-run` revisado y comparado con la lista de migraciones esperadas.

Sin migraciones nuevas (caso de la fase 1):

- Confirmar que no hay archivos en `supabase/migrations/` modificados.
- No ejecutar `supabase db start` ni `pnpm db:reset` durante la fase 1; las acciones remotas no forman parte de la verificación local.
- Validar manualmente que la documentación describe los gates que las fases 2 a 5 sí exigirán.

Build de la aplicación:

- `pnpm lint`, `pnpm typecheck` y `pnpm build` cuando la fase 1 modifique código de la app. En INF-01 fase 1 no debería haberlos.

## Matriz de verificado/no verificado

Cada entrega debe cerrar con dos listas explícitas:

- Verificado: comandos ejecutados y su resultado.
- No verificado: comprobaciones omitidas por estar fuera de alcance de la fase, con justificación.

## Verificación de configuración de fase 3

- Validar `vercel.json` como JSON y confirmar que solo deshabilita deployments desde `main`.
- Validar el workflow mediante un parser YAML disponible localmente, sin ejecutarlo.
- Confirmar que el workflow contiene únicamente `workflow_dispatch`, `environment: staging`, `concurrency`, referencias a `secrets.*`/`vars.*` y la barrera explícita antes de `db push`.
- Confirmar que no contiene valores de secretos, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_*` sensibles, comandos de bootstrap, E2E remoto ni triggers automáticos.
- No ejecutar `supabase login`, `supabase link`, `supabase db push`, `supabase db push --dry-run`, deploys ni workflows como parte de fase 3.

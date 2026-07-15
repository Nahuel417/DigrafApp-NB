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
| Auth y usuarios | creación exclusiva de Super admin, cambio inicial de contraseña, usuario desactivado, autoelevación rechazada y protección del último Super admin |
| Migración | reset local, tipos generados y prueba del contrato afectado |
| Caja/pago/anulación | atomicidad, idempotencia, estado abierto/cerrado y auditoría |
| Kanban | movimiento válido, reversión, rechazo de Empleado a Pagado y error de servidor |

## Antes de finalizar

1. Revisar `git diff` y confirmar que no hay cambios ajenos, secretos o logs.
2. Ejecutar lint y typecheck para cambios de código, salvo bloqueo explicado.
3. Ejecutar tests relevantes; agregar build cuando afecte rutas, configuración o integración.
4. Para frontend relevante, comprobar estados de carga, vacío, error, éxito y una resolución móvil/desktop representativa.
5. Para datos sensibles, revisar permisos y trazabilidad además del comportamiento feliz.

Una tarea no está terminada si deja una migración sin tipos, un bypass conocido de permisos, un error silencioso o una verificación crítica omitida sin explicación.

Para administración de usuarios, verificar además que Admin no pueda crear cuentas ni asignar o restablecer credenciales, que solo pueda cambiar roles entre Atención y Empleado, y que una contraseña temporal o restablecida no habilite el resto de la aplicación hasta ser reemplazada por el usuario.

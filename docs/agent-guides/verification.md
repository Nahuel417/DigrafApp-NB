# Verificación — Digraf

Leer esta guía antes de cerrar cambios de código, tests, migraciones, CI o configuración de desarrollo.

## Principios

- Elegir la estrategia de pruebas según el riesgo, el comportamiento que puede
  romperse y la capa modificada; aumentar la evidencia con el riesgo.
- Antes de implementar, indicar la estrategia elegida y su motivo. Si el riesgo
  no es claro, detenerse y pedir una decisión.
- No usar Strict TDD por defecto ni omitir pruebas por no usarlo: toda tarea debe
  conservar la cobertura necesaria y aportar la verificación mínima relevante.
- Siempre informar las comprobaciones realizadas y las que no pudieron ejecutarse.
- No sustituir tests de permisos o transacciones por pruebas manuales de interfaz.
- Tras el scaffolding, mantener esta guía sincronizada con los comandos reales de `package.json`, CI y Supabase.

## Estrategia de pruebas

### Strict TDD

Aplicar el ciclo completo **RED → GREEN → TRIANGULATE → REFACTOR** cuando el
cambio afecte al menos una de estas áreas:

- reglas de negocio;
- dinero, saldos, caja, pagos o anulaciones;
- permisos, RLS o RPC;
- idempotencia o concurrencia;
- corrección de bugs;
- comportamiento con riesgo alto de regresión.

Cada etapa debe dejar evidencia observable: un test relevante falla por el
motivo esperado en RED, pasa con la implementación mínima en GREEN, los casos
adicionales fuerzan la generalización en TRIANGULATE y la suite permanece verde
durante REFACTOR.

### Verificación proporcional sin Strict TDD

No exigir Strict TDD para UI puramente visual, copy, layout, refactors mecánicos
o configuración sin cambio funcional. En esos casos, aplicar la comprobación
más pequeña que pueda detectar una regresión real, por ejemplo:

- revisión visual enfocada y accesibilidad para UI, copy o layout;
- lint, typecheck y tests existentes afectados para refactors mecánicos;
- validación de sintaxis, esquema o carga para configuración;
- tests de componente, integración o E2E cuando sí cambie comportamiento,
  aunque el trabajo no requiera el ciclo Strict TDD.

No usar Strict TDD nunca significa “sin pruebas”. Si cambia comportamiento,
agregar o actualizar la cobertura en la capa más cercana que lo demuestre; si no
cambia, ejecutar evidencia suficiente para confirmar que se preservó.

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

## Ejecución de base y E2E

- Durante el desarrollo local, ejecutar solo pruebas focalizadas que cubran el
  código y comportamiento modificados. Si ya pasaron y no hubo cambios posteriores,
  no repetirlas.
- Para RLS, RPC o migraciones, aplicar la migración local y ejecutar las pruebas
  de integración específicas de los permisos y operaciones afectados. No hacer un
  reset local como paso rutinario; CI valida migraciones, seed e integración desde
  una base limpia.
- CI ejecuta las suites completas, lint, typecheck y build. Si CI falla, investigar
  el log y ejecutar localmente solo la prueba o comando afectado para reproducirlo.
- La base local puede persistir durante el desarrollo. Los tests deben crear
  y limpiar sus propios datos; no depender de cuentas ni registros residuales.
- Nunca ejecutar `db:reset --linked` sin autorización explícita; jamás en
  producción.
- Para cambios de interfaz, ejecutar E2E focalizados del flujo afectado cuando
  existan. Si un comportamiento visual importante no tiene E2E, verificarlo
  manualmente en navegador. CI ejecuta la suite E2E completa.

## Matriz mínima por riesgo

| Área modificada                   | Evidencia mínima                                                                                                                                                                                                                                                      |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI aislada sin cambio funcional   | prueba manual visual enfocada; CI ejecuta lint y typecheck                                                                                                                                                                                                           |
| UI con cambio de comportamiento   | test de componente, integración o E2E del comportamiento afectado, más comprobación visual cuando corresponda                                                                                                                                                         |
| Lógica de dominio                 | test unitario del caso principal, bordes y regresión                                                                                                                                                                                                                  |
| Server Action o endpoint          | validación de entrada, caso autorizado y denegado                                                                                                                                                                                                                     |
| RLS/roles/Storage                 | policy o integración para cada rol permitido y rechazado                                                                                                                                                                                                              |
| Auth y usuarios                   | creación exclusiva de Super admin, bootstrap inicial, cambio inicial de contraseña, usuario desactivado, autoelevación rechazada y protección del último Super admin                                                                                                  |
| Migración                         | aplicar localmente y ejecutar integración focalizada del contrato afectado; CI valida reset, tipos y suite completa                                                                                                                                                 |
| Caja/pago/anulación               | atomicidad, idempotencia, estado abierto/cerrado y auditoría                                                                                                                                                                                                          |
| Kanban                            | movimiento válido, reversión, rechazo de Empleado a Pagado y error de servidor                                                                                                                                                                                        |
| Catálogos y alta manual de pedido | Super admin/Admin/Atención pueden crear; solo Super admin/Admin administran catálogos; Empleado es rechazado; borrado físico conserva snapshots históricos; combinaciones, importes, saldo derivado, atomicidad, idempotencia, etapa inicial y visibilidad financiera |

## Antes de finalizar

1. Revisar `git diff` y confirmar que no hay cambios ajenos, secretos o logs.
2. Ejecutar localmente las pruebas focalizadas afectadas; no repetir las que pasaron
   si no hubo cambios posteriores.
3. Confirmar que CI cubre suites completas, lint, typecheck y build; si un check de
   CI falla, reproducir localmente solo ese check o prueba.
4. Para un comportamiento visual importante sin E2E, verificar manualmente estados
   relevantes y una resolución móvil o desktop representativa.
5. Para datos sensibles, revisar permisos y trazabilidad además del comportamiento feliz.

## Pruebas visuales

- Los E2E funcionales son bloqueantes en CI.
- La tolerancia visual aplica solo a `toHaveScreenshot`.
- Los snapshots se marcan con `@visual` y CI en Linux los excluye con
  `--grep-invert @visual`.
- Ejecutar o actualizar snapshots solo en Windows o macOS.
- Desactivar animaciones, ocultar cursor y enmascarar contenido dinámico.
- No aumentar tolerancias ni actualizar snapshots sin revisar el diff visual.

Una tarea no está terminada si deja una migración sin tipos, un bypass conocido
de permisos, un error silencioso o una verificación crítica omitida sin
explicación.

Para administración de usuarios, verificar que Admin no pueda crear cuentas ni
asignar o restablecer credenciales; solo puede cambiar roles entre Atención y
Empleado. Una contraseña temporal o restablecida no habilita el resto de la
aplicación hasta que el usuario la reemplace.

Para bootstrap, probar localmente Auth y perfil, email confirmado,
`must_change_password`, ausencia de secretos en salida y reporte de fallo
parcial. Limpiar un Auth huérfano requiere confirmación explícita. No crear
usuarios remotos reales en pruebas automáticas.

## Flujo Git y controles CI

- Crear ramas `feat/*`, `fix/*` o `chore/*` desde `develop`; flujo normal por PR:
  rama de tarea → `develop` → `staging` → `main`. Revisar cambios, CI aplicable
  y realizar validación humana antes de cada merge. El usuario hace todos los
  commits, pushes, PR y merges; el agente solo prepara cambios y sugiere comandos.
- Excepción: el usuario puede hacer push directo manual a `staging`.
- En este repositorio, `.github/workflows/ci.yml` se dispara solo con PR dirigidos
  a `develop` o `main`. Ejecuta lint, typecheck, unitarias, build, integración con
  base limpia y E2E. No se dispara para PR dirigidos a `staging` ni para pushes
  directos a esa rama; por eso esos ingresos requieren revisión y validación humana
  en el entorno de staging, sin asumir que CI corrió allí. El PR `staging` → `main`
  sí activa el CI completo.
- `.github/workflows/deploy-staging-db.yml` es independiente: solo `workflow_dispatch`
  y con barrera manual antes de migrar la base de staging. No es un CI automático
  de aplicación ni existe aquí un workflow de migración a producción.

## Migraciones remotas

- Para cambios de esquema, aplicar localmente la migración y ejecutar las pruebas
  de integración focalizadas del contrato afectado.
- Antes de migrar Supabase staging, el usuario debe verificar CI aplicable, revisar
  `supabase db push --dry-run` y ejecutar manualmente el workflow autorizado. No
  ejecutar operaciones remotas ni el workflow desde el agente.

## Matriz de verificado/no verificado

Cada entrega debe cerrar con dos listas explícitas:

- Verificado: comandos ejecutados y su resultado.
- No verificado: comprobaciones omitidas por estar fuera de alcance de la fase, con justificación.

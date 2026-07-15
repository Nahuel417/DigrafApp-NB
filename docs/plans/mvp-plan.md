# Plan aprobado del MVP — Digraf

Estado: aprobado para planificación documental el 14 de julio de 2026. Este documento no autoriza por sí mismo despliegues, migraciones remotas, cambios de producción ni la creación del tablero de Trello.

## Propósito

Organizar el inicio del MVP por cortes verticales entregables, con permisos, trazabilidad y consistencia financiera desde la base. Las reglas de negocio detalladas siguen siendo canónicas en `docs/agent-guides/domain-rules.md`, `docs/agent-guides/quoting.md` y `docs/decisions.md`; este plan define orden, dependencias, arquitectura de inicio y criterio de terminado.

## Resultado esperado

El MVP permite que el equipo interno:

- Inicie sesión con cuentas creadas exclusivamente por Super admin.
- Gestione usuarios según la matriz de roles confirmada.
- Configure catálogos y etapas, cree pedidos y los siga en un Kanban auditado.
- Comente pedidos y mantenga una sola imagen vigente del diseño.
- Opere una caja diaria trazable y cierre cajas abiertas.
- Confirme y revierta pagos sin estados parciales ni ingresos duplicados.
- Anule, restaure y elimine pedidos conforme a la retención que se apruebe.
- Use un cotizador interno y descargue un PDF sin persistir cotizaciones.

El formulario público, pagos automáticos, cuenta corriente, proveedores, reportes avanzados e historial de imágenes permanecen fuera del MVP.

## Decisiones confirmadas para identidad

- Solo Super admin crea cuentas y credenciales en Supabase Auth.
- La cuenta se crea con email y una contraseña temporal definida y comunicada por Super admin.
- El usuario debe cambiar la contraseña temporal en su primer ingreso.
- Super admin puede activar, desactivar y restablecer la contraseña de cualquier usuario. Un restablecimiento vuelve a exigir cambio de contraseña.
- Admin no crea cuentas ni asigna o restablece credenciales.
- Admin puede desactivar usuarios Atención y Empleado y cambiar el rol entre esos dos códigos.
- Nadie puede elevar su propio privilegio.
- No se puede desactivar o degradar al último Super admin activo.
- Un usuario desactivado pierde acceso a los datos protegidos aunque conserve una sesión previa.
- No hay registro público.

Las contraseñas no se guardan en tablas de aplicación, auditorías ni logs. Supabase Auth es la única fuente de credenciales.

## Arquitectura inicial

```text
src/
  app/
    (auth)/
    (app)/
    api/
  components/ui/
  features/
    auth/
    users/
    catalogs/
    orders/
    board/
    cash/
    quote/
  lib/
    auth/
    supabase/
    validation/
    dates/
    money/
  stores/
supabase/
  migrations/
  seed.sql
tests/
  integration/
  e2e/
```

Principios de implementación:

- Server Components para lecturas iniciales y Client Components solo para interacción necesaria.
- Server Actions o Route Handlers validan entradas con Zod y vuelven a comprobar sesión y autorización.
- RLS es la frontera final de permisos; la navegación y los controles visuales no sustituyen autorización.
- Zustand contiene únicamente estado efímero y optimismo descartable.
- PostgreSQL resuelve operaciones sensibles multi-escritura en una transacción.
- No se agregan ORM, API separada, repositorios genéricos, CQRS ni servicios externos sin necesidad concreta.
- El pago se modela separado de la etapa actual. La interfaz muestra etapa, pago y entrega como condiciones diferenciadas.

## Configuración inicial

- Next.js 16 estable, App Router, TypeScript `strict` y pnpm.
- Tailwind CSS y componentes shadcn/ui incorporados a demanda.
- Clientes Supabase de servidor y navegador separados.
- `proxy.ts` para renovación de sesión, nunca como autorización final.
- `.env.example` sin secretos y `.gitignore` para entornos, builds, dependencias y artefactos locales.
- Scripts esperados: `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e` y `db:types`.
- CI separada en validación estática, integración con Supabase local y recorridos E2E.

## Estrategia de Supabase

### Entornos

| Entorno | Propósito | Datos | Aplicación de migraciones |
| --- | --- | --- | --- |
| Local | Desarrollo y pruebas | Solo sintéticos | `supabase db reset` |
| Desarrollo | Integración y previews | Sintéticos, nunca reales | Acción explícita sobre proyecto separado |
| Producción | Operación real | Reales | Migración revisada y aprobación explícita |

Supabase Branching se posterga hasta que la interferencia entre previews justifique su costo. Ninguna prueba ejecuta `db push` automáticamente contra un proyecto remoto.

### Migraciones

Secuencia orientativa por corte:

1. `identity_and_access`
2. `catalogs_orders_and_board`
3. `order_collaboration`
4. `cash`
5. `order_payments`
6. `quote_products`
7. `order_archive`
8. `order_retention`

Cada migración incorpora conjuntamente constraints, claves foráneas, índices, grants, RLS, policies y funciones indispensables para usar el corte de forma segura. Las etapas y categorías iniciales necesarias en producción se introducen como datos de referencia en migraciones; usuarios, pedidos, catálogos y precios ficticios pertenecen solo al entorno local.

Después de un cambio de esquema se ejecutan reset local, generación de tipos y pruebas de integración. Los tipos generados se versionan y nunca se editan manualmente.

### Modelo incremental

| Recurso | Responsabilidad |
| --- | --- |
| `profiles` | Rol, estado activo, cambio obligatorio de contraseña y vínculo con Auth |
| `workflow_stages` | Código estable, nombre visible, orden y semántica especial |
| `catalog_items` | Prendas, cuellos, moldes, telas y extras sin precios |
| `orders` | Datos operativos, etapa actual y anulación |
| `order_financials` | Total y seña con permisos diferenciados |
| `order_catalog_items` | Especificaciones elegidas |
| `order_stage_events` | Historial append-only de movimientos |
| `order_comments` | Comentarios con actor y timestamp del servidor |
| `audit_events` | Cambios sensibles no cubiertos por otro historial |
| `cash_days` | Caja por día operativo, estado y cierre |
| `cash_opening_balance_events` | Auditoría del saldo inicial |
| `cash_categories` | Categorías administrables de egresos |
| `cash_movements` | Movimientos manuales y automáticos, incluidos anulados |
| `order_payments` | Confirmaciones y reversiones de pago |
| `quote_products` | Productos, adicionales, grupos y precios del cotizador |

Las tablas históricas no exponen actualización o borrado directo. Los importes usan `numeric`; los eventos usan `timestamptz` y el día operativo se deriva en `America/Argentina/Cordoba`.

### Autenticación y credenciales

- La creación y el restablecimiento de credenciales se ejecutan en servidor con la Admin API de Supabase, después de autorizar al Super admin autenticado.
- La `service_role` permanece en un módulo exclusivo de servidor y nunca se usa para operaciones ordinarias de negocio.
- La aplicación mantiene un indicador confiable de cambio obligatorio de contraseña. Mientras esté activo, el usuario solo puede acceder al flujo de cambio de contraseña y cierre de sesión.
- Al completar el cambio, el servidor actualiza el indicador. Al restablecer una contraseña, Super admin lo activa nuevamente.
- Toda policy y función de negocio exige `profiles.is_active = true`; desactivar un perfil corta el acceso aunque el token siga vigente.
- Se protege al último Super admin activo en servidor y base de datos.

### Operaciones transaccionales

Funciones previstas:

- `create_order`
- `move_order`
- `confirm_order_payment`
- `reverse_order_payment`
- `ensure_cash_day`
- `set_opening_balance`
- `create_manual_cash_movement`
- `update_manual_cash_movement`
- `void_cash_movement`
- `close_cash_day`
- `cancel_order`
- `restore_order`

Las operaciones reintentables reciben una clave de idempotencia. Las funciones sensibles obtienen actor y hora desde el servidor, validan el rol vigente y usan bloqueos transaccionales cuando existe concurrencia sobre pedido o caja.

### Storage

- Bucket privado para diseños.
- Un path vigente por pedido, por ejemplo `{order_id}/current`.
- Policies ligadas a la visibilidad y los permisos del pedido.
- Sin historial de versiones en el MVP.
- La carga contempla el fallo parcial entre Storage y PostgreSQL y permite reintento o limpieza controlada.

## Fases y criterio de terminado

| Fase | Entregable | Dependencias | Evidencia mínima | Terminado cuando |
| --- | --- | --- | --- | --- |
| 0 | Scaffold reproducible | Ninguna | Reset local, lint, typecheck, unit, build y smoke E2E | Un desarrollador levanta app y Supabase desde cero |
| 1 | Login y usuarios internos | Fase 0 | Matriz de Auth/RLS, contraseña temporal, usuario inactivo | Las cuentas operan solo dentro de su autoridad |
| 2 | Alta de pedido y Kanban no financiero | Fase 1 y decisiones de pedido | Creación, denegaciones, movimientos, auditoría y rollback UI | Un pedido recorre etapas productivas; `paid` sigue protegido |
| 3 | Detalle, comentarios, imagen y etapas | Fase 2 | RLS, Storage, accesibilidad y referencias históricas | El equipo colabora sin romper semántica ni historial |
| 4 | Caja y movimientos manuales | Fase 1 y decisiones de caja | Día Córdoba, caja abierta/cerrada, roles y cálculo exacto | La caja diaria es operable y auditable |
| 5 | Pago y reversión | Fases 2 y 4 | Atomicidad, idempotencia, concurrencia y rollback | Pedido, pago y caja nunca quedan parciales |
| 6 | Cotizador y PDF | Fase 1 y decisiones del cotizador | Cálculo exacto, permisos y revisión visual | Se descarga un presupuesto sin persistencia |
| 7 | Archivo, restauración y purga | Fases 3 y 5, política de retención | Autorización, 29/30 días, Storage y conservación financiera | El ciclo de anulación no destruye trazabilidad requerida |

Las fases 3, 4 y 6 pueden ejecutarse en paralelo con responsables distintos, sin editar las mismas migraciones.

## Dependencias previstas

Producción:

- `next`, `react`, `react-dom`
- `@supabase/supabase-js`, `@supabase/ssr`
- `zod`, `react-hook-form`, `@hookform/resolvers`
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- `zustand`
- Dependencias puntuales generadas por los componentes shadcn/ui usados

Desarrollo:

- TypeScript, ESLint y Tailwind
- Supabase CLI
- Vitest, jsdom y Testing Library
- Playwright

La librería de generación de PDF requiere una decisión específica antes de incorporarse. No se agrega inicialmente una biblioteca de fechas, dinero, consultas o un ORM sin evidencia de necesidad.

## Definition of Done global

- Entradas no confiables validadas con Zod en servidor.
- Autorización probada para roles permitidos y rechazados.
- Migración reconstruible y tipos Supabase regenerados.
- Estados de carga, vacío, error y éxito.
- Revisión representativa en móvil y escritorio.
- Alternativa accesible al drag and drop.
- Lint, typecheck, pruebas relevantes y build exitosos.
- Sin secretos, `any`, supresiones ni logs de depuración.
- Diff revisado por bypasses, inconsistencias y cambios accidentales.

## Decisiones todavía pendientes

La aprobación de este plan no resuelve estas reglas de producto:

| ID | Decisión | Bloquea |
| --- | --- | --- |
| D-02 | Saldo restante, escala y restricciones de la seña | Pedido y cotizador |
| D-03 | Conducta al salir de `paid`, revertir o reconfirmar | Pago |
| D-04 | Apertura, cierre automático y anulación manual de caja | Caja |
| D-05 | Eliminación de etapas y catálogos referenciados | Administración |
| D-06 | Anulación de pedidos pagados y retención por entidad | Archivo y purga |
| D-07 | Uso del cotizador por Super admin, vigencia, branding y PDF | Cotizador |
| D-08 | Permisos y límites de imágenes, catálogos y precios iniciales | Storage y cotizador |

También deben definirse campos obligatorios y combinaciones válidas por tipo de pedido, visibilidad financiera para Empleado, permisos de Atención sobre descripción e imagen y formato del identificador visible del pedido.

## Riesgos y controles

| Riesgo | Control previsto |
| --- | --- |
| Exposición de `service_role` | Módulo `server-only`, revisión de bundle y autorización previa |
| Bloqueo del último Super admin | Constraint/función y prueba de integración |
| Sesión válida de usuario desactivado | Comprobación de perfil activo en RLS y funciones |
| Pérdida o filtración de contraseñas temporales | No persistirlas ni auditarlas; comunicación fuera de la aplicación |
| Movimientos Kanban concurrentes | Bloqueo o versión de fila y respuesta canónica del servidor |
| Cobros duplicados | Idempotencia, constraints y bloqueo transaccional |
| Cálculos flotantes | Strings decimales o unidades enteras exactas |
| Purga incompatible con auditoría o backups | Matriz de retención aprobada antes de implementar |
| Estado parcial entre Storage y base | Operación reintentable y limpieza de huérfanos |
| Dependencia de conectividad | Riesgo aceptado para MVP; no se incorpora modo offline |
| Interferencia entre previews | Datos sintéticos y evaluación posterior de branching |

## Propuesta de Trello

La creación del tablero requiere una confirmación separada del usuario.

### Tablero y listas

Nombre: `Digraf - MVP operativo`

1. `00 - Decisiones / Bloqueos`
2. `10 - Backlog MVP ordenado`
3. `20 - Ready`
4. `30 - En curso (WIP 1)`
5. `40 - Revisión técnica`
6. `50 - Verificación funcional`
7. `60 - Listo para piloto`
8. `70 - Hecho MVP`
9. `90 - Post-MVP / No iniciar`
10. `99 - Descartado / Reemplazado`

### Tarjetas MVP en orden

| ID | Tarjeta | Dependencias | Checklist específico resumido |
| --- | --- | --- | --- |
| M0 | Scaffold reproducible | Ninguna | Next/pnpm; Supabase local; env/gitignore; scripts; CI/smoke |
| M1 | Login, sesión y perfil activo | M0 | Perfil; contraseña temporal; cambio obligatorio; usuario inactivo; navegación protegida |
| M2 | Gestión segura de usuarios | M1 | Alta exclusiva Super admin; roles; desactivación; restablecimiento; auditoría |
| M3 | Catálogos y alta manual de pedido | M2, D-02, D-05 | Catálogos; moldes separados; formulario; importes; etapa inicial |
| M4 | Kanban y movimientos auditados | M3 | Etapas; dnd-kit; alternativa accesible; historial; rollback optimista |
| M5 | Detalle y edición del pedido | M4, D-02 | Edición sensible/menor; fecha auditada; timeline; concurrencia |
| M6 | Comentarios internos | M5 | Roles; actor servidor; validación; orden cronológico |
| M7 | Imagen vigente protegida | M5, D-08 | Bucket; policies; carga; reemplazo; fallo parcial |
| M8 | Administración de etapas | M4, D-05 | Crear; renombrar; reordenar; retirar; proteger semántica |
| M9 | Caja diaria y movimientos manuales | M2, D-04 | Día Córdoba; saldo inicial; movimientos; categorías; filtros |
| M10 | Correcciones y cierre de caja | M9, D-04 | Edición; anulación; cierre manual; cierre automático; inmutabilidad |
| M11 | Pago atómico desde Kanban | M4, M10, D-02, D-03 | Confirmación; RPC; ingreso total; idempotencia; rollback |
| M12 | Reversión de pago | M11, D-03 | Caja abierta; anular ingreso; permisos; reintento; historial |
| M13 | Precios y calculador | M2, D-07, D-08 | Grupos; TPU; bandera; cálculo exacto; no persistencia |
| M14 | PDF descargable | M13, D-07 | Cliente; líneas; paginado; impresión; revisión visual |
| M15 | Anular, archivar y restaurar | M5, M12, D-06 | Motivo; archivo privado; restauración; concurrencia; pedido pagado |
| M16 | Eliminación y purga a 30 días | M15, D-06 | 29/30 días; idempotencia; Storage; finanzas; scheduler |

Cada tarjeta de implementación incluye los checklists `Dependencias`, `Alcance`, `Implementación y seguridad`, `Pruebas` y `Criterio de terminado`. Las tarjetas de decisión incluyen `Alternativas`, `Resolución aprobada`, `Documentación actualizada`, `Criterios de aceptación` y `Casos de prueba derivados`.

### Post-MVP

- PM-01 Formulario público con enlace único.
- PM-02 Integración automática de pagos.
- PM-03 Cuenta corriente de clientes.
- PM-04 Proveedores y cuentas por pagar.
- PM-05 Reportes, gráficos y exportaciones.
- PM-06 Evolución del cotizador.
- PM-07 Historial de imágenes.

Estas tarjetas permanecen en `90 - Post-MVP / No iniciar` hasta una aprobación explícita de alcance.

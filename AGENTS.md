# Digraf — guía para agentes

Instrucciones obligatorias para Codex y OpenCode. Digraf es una aplicación
interna para una gráfica textil: el MVP prioriza confiabilidad, seguridad,
trazabilidad, claridad y baja carga cognitiva.

## Límites críticos

- No ejecutar `git commit` ni crear tags hasta que el usuario lo solicite
  explícitamente. Aprobar un plan o implementación no autoriza un commit.
- Trello es estrictamente de solo lectura: nunca crear, editar, mover, archivar,
  eliminar, comentar ni marcar ítems.
- `push`, PR, merge, deploy, release, migraciones remotas y configuración externa
  requieren una solicitud explícita para esa acción concreta.
- No modificar producción, datos reales, credenciales ni infraestructura como
  efecto colateral de una tarea local.

## Fuentes y contexto

Leer solo lo necesario. Ante diferencias, aplicar este orden:

1. Instrucción explícita más reciente del usuario.
2. `docs/decisions.md` y guías canónicas de `docs/agent-guides/`.
3. Alcance y criterios de aceptación del módulo aprobado.
4. `docs/plans/mvp-plan.md` para orden y dependencias.
5. Historias originales, Trello y resúmenes como contexto histórico.
6. Código existente como evidencia del estado actual, no como regla de producto.

Si una contradicción afecta alcance, permisos, seguridad, datos o comportamiento,
señalarla y pedir decisión. Registrar toda decisión nueva durable en su guía.

| Área | Leer primero |
| --- | --- |
| Roles, pedidos, tablero, pagos, caja, catálogos, imágenes o anulaciones | `docs/agent-guides/domain-rules.md` |
| Cotizador | `docs/agent-guides/domain-rules.md` y `docs/agent-guides/quoting.md` |
| Next.js, Supabase, Auth, RLS, Storage, migraciones o dependencias | `docs/agent-guides/architecture.md` |
| Tests, CI, validación o comandos | `docs/agent-guides/verification.md` |
| Decisiones o ambigüedades | `docs/decisions.md` |
| Inicio o planificación de módulo | `docs/plans/mvp-plan.md` y guías aplicables |
| UI, UX, responsive, accesibilidad o componentes | `docs/agent-guides/design-system.md` |

No cargar guías, archivos, historiales, MCPs ni agentes sin necesidad.

## Trabajo y calidad

- Cumplir objetivo, restricciones y criterios con la solución más simple que
  preserve seguridad y mantenibilidad.
- No inventar reglas, ampliar el MVP ni adelantar módulos sin aprobación.
- Limitar cambios al alcance y preservar modificaciones ajenas.
- Resolver autónomamente detalles locales, reversibles y no sensibles; detenerse
  ante decisiones materiales, destructivas, externas o fuera de alcance.
- Escribir código claro, cohesivo, tipado y fácil de probar. Aplicar SOLID,
  separación de responsabilidades y abstracciones solo cuando reduzcan
  complejidad real; evitar sobrearquitectura y duplicación prematura.
- No afirmar que algo funciona sin evidencia. Usar `rg` y `pnpm`.

## Stack, convenciones y seguridad

- Next.js 16, App Router y TypeScript `strict`; preferir Server Components.
- Supabase PostgreSQL, Auth, Storage y RLS; Tailwind CSS y shadcn/ui.
- Zod, React Hook Form, dnd-kit y Zustand solo cuando el módulo los requiera.
- Vitest para dominio/integración y Playwright para recorridos críticos.
- `package.json` define dependencias y scripts disponibles. Instalar paquetes,
  componentes, servicios o infraestructura requiere aprobación.
- Código, esquema y nombres técnicos en inglés; interfaz y mensajes en español.
- Dinero ARS en `numeric`, nunca `float`; instantes en UTC y día operativo o
  presentación en `America/Argentina/Cordoba`.
- No entregar `any`, supresiones injustificadas, secretos, datos reales ni logs.
- RLS y validación de servidor son la frontera de autorización; la UI no concede
  permisos. Validar sesión, perfil activo, `must_change_password`, rol, actor,
  identificadores, importes y entradas no confiables.
- Mantener claves privilegiadas en módulos `server-only` y usarlas solo en
  operaciones administrativas autorizadas.
- Zustand es solo estado efímero de UI, nunca sesión, permisos o negocio.
- Usar migraciones versionadas y regenerar tipos de Supabase; no editarlos a mano.
- Operaciones sensibles multi-escritura deben ser atómicas, trazables e
  idempotentes cuando puedan reintentarse. No borrar registros auditables.

## Planificación e implementación

Usar Plan Mode antes de editar si la tarea es ambigua o transversal; afecta datos,
permisos, seguridad, caja o arquitectura; cambia reglas; abarca varios cortes
verticales; o implica una operación destructiva o externa.

En Plan Mode solo inspeccionar. No editar, crear ramas, instalar, mutar bases,
crear credenciales ni ejecutar acciones externas. El plan debe cubrir resultado,
alcance y fuera de alcance, hallazgos, solución, permisos/datos/archivos, pruebas,
riesgos y decisiones pendientes. Tareas pequeñas y reversibles pueden ejecutarse
directamente; un módulo comienza solo tras su aprobación.

Antes de editar:

1. Revisar `git status`, rama y cambios existentes.
2. Crear o usar una rama `feat/*` para el módulo aprobado.
3. Identificar guías, permisos y verificaciones aplicables.

Implementar secuencialmente: invariantes/autorización/migraciones, servidor, UI,
pruebas y revisión del diff. Ejecutar pruebas específicas durante el desarrollo;
repetir solo las fallidas y correr la suite completa una vez al cierre, según
`docs/agent-guides/verification.md`.

Antes de `pnpm db:reset`, verificar un procedimiento autorizado y reproducible
para restaurar cuentas locales. Si no existe, advertir que elimina usuarios y
detenerse. El reset no autoriza crear o cambiar credenciales.

Una tarea queda lista para validar cuando cumple criterios, prueba casos permitidos
y rechazados, supera verificaciones aplicables, no deja problemas críticos ni
cambios accidentales y actualiza decisiones durables. La entrega debe resumir
resultado, archivos/migraciones, verificaciones, riesgos y prueba manual; explicar
comprobaciones omitidas. Recomendar el cambio en Trello sin realizarlo.

## Git, skills y herramientas

- Usar `git` para el repositorio y `gh` para GitHub; no usar GitHub MCP.
- `main` es estable: nunca hacer push directo. Usar Conventional Commits.
- Tras implementar, presentar cambios y verificaciones y esperar la orden de
  commit. Esa orden no autoriza push, PR, merge, deploy ni Trello.
- No usar `git reset --hard`, `git clean`, `git checkout --`, force push ni
  reescribir historial sin autorización explícita.
- Cargar `frontend-design` para cambios visuales importantes; `shadcn` para sus
  componentes; `vercel-react-best-practices` para Next.js/React;
  `supabase-postgres-best-practices` para SQL/RLS/concurrencia; `webapp-testing`
  para Playwright; Context7 para documentación externa versionada.
- Leer el `SKILL.md` antes de usar una skill y no cargar recursos redundantes.
- Usar subagentes solo con autorización y para trabajo independiente; el agente
  principal integra. No editar simultáneamente los mismos archivos o migraciones.
- `.opencode/agents/ui-designer.md` es solo para planificar/revisar UX/UI.
- Trello MCP: solo lecturas necesarias. Supabase MCP: solo local/desarrollo con
  datos sintéticos; preferir migraciones y CLI. Aplicar mínimos privilegios.

## Mantenimiento

Mantener este archivo en 180 líneas o menos. Las reglas detalladas pertenecen a
las guías canónicas. Documentar solo decisiones, reglas, comandos o aprendizajes
reutilizables, no estados transitorios.

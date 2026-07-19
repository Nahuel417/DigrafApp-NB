# Digraf — guía para agentes

Aplicar estas instrucciones antes de trabajar en este repositorio. `AGENTS.md` es la fuente canónica para Codex y OpenCode; no crear ni mantener un `CLAUDE.md` duplicado.

Digraf es una aplicación interna para una gráfica textil: pedidos de producción en Kanban, roles, caja diaria y trazabilidad. El objetivo del MVP es un flujo operativo confiable, no una plataforma genérica.

## Contrato operativo

- Trabajar hacia el resultado pedido, sus restricciones y criterio de terminado; elegir el camino técnico más simple que los cumpla.
- No inventar reglas de negocio ni sustituir decisiones confirmadas por supuestos técnicos.
- Preservar cambios ajenos y limitar la modificación al alcance de la tarea.
- No afirmar que algo funciona sin evidencia de la verificación pertinente.
- Preferir decisiones reversibles. Explicar las suposiciones no bloqueantes y detenerse solo ante una decisión material.
- Usar `rg` para búsquedas y `pnpm` como gestor de paquetes, salvo que el repositorio establezca otra cosa.

## Carga de contexto bajo demanda

Leer únicamente la guía relevante antes de actuar; su contenido es obligatorio para la tarea correspondiente.

| Si la tarea toca…                                                        | Leer primero                                                                             |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Roles, pedidos, tablero, pagos, caja, catálogos, cotizador o anulaciones | `docs/agent-guides/domain-rules.md` y, para el cotizador, `docs/agent-guides/quoting.md` |
| Next.js, Supabase, RLS, Storage, migraciones o estructura                | `docs/agent-guides/architecture.md`                                                      |
| Tests, validación, CI o comandos de desarrollo                           | `docs/agent-guides/verification.md`                                                      |
| Una decisión confirmada, un cambio de alcance o una ambigüedad previa    | `docs/decisions.md`                                                                      |
| Planificación, fases, dependencias o inicio de implementación del MVP    | `docs/plans/mvp-plan.md` y las guías temáticas que correspondan                          |
| UI, UX, responsive, accesibilidad, identidad visual o componentes        | `docs/agent-guides/design-system.md`                                                     |

No cargar todas las guías por rutina. Si una guía y una instrucción reciente del usuario difieren, prevalece la instrucción reciente y debe actualizarse la documentación durable al cerrar la tarea.

## Stack y convenciones

- Next.js 16 estable, App Router y TypeScript `strict`.
- Supabase: PostgreSQL, Auth, Storage y RLS.
- Tailwind CSS, shadcn/ui, dnd-kit, Zustand, Zod y React Hook Form.
- Vitest para reglas de dominio; Playwright para recorridos críticos.
- Vercel para hosting y CI/CD; Supabase CLI para desarrollo y migraciones.
- Código, tablas y nombres técnicos en inglés. Interfaz y mensajes en español.
- Usar `numeric` para dinero, nunca `float`; moneda ARS.
- Persistir instantes en UTC y usar `America/Argentina/Cordoba` para día operativo y presentación.
- No usar `any`, supresiones de TypeScript/lint, secretos, datos reales ni logs de depuración en código entregado.

## Invariantes no negociables

- RLS y validación de servidor son la frontera de permisos. La interfaz nunca es autorización.
- Un rol, actor o importe enviado por el cliente no es confiable hasta validarse en servidor/base de datos.
- Cambios de pago, caja, anulación y auditoría deben ser atómicos, trazables e idempotentes cuando puedan reintentarse.
- No borrar movimientos de caja; se anulan y conservan actor y timestamp.
- No borrar pedidos operativos de inmediato; seguir el flujo de archivo de 30 días definido en las reglas de dominio.
- No exponer claves privilegiadas de Supabase al navegador.
- No implementar funcionalidades fuera del MVP sin aprobación explícita.

## Arquitectura y datos

- Preferir Server Components. Crear Client Components solo para interacción, APIs del navegador o estado local.
- Toda entrada no confiable se valida con Zod en el límite de servidor.
- Zustand es solo estado efímero de UI; no es fuente de verdad para sesión, permisos, pedidos, tablero ni caja.
- Usar migraciones versionadas para cualquier cambio de esquema. No compensar con cambios manuales en entornos remotos.
- Generar tipos desde Supabase después de cambios de esquema; no editar tipos generados a mano.
- Para operaciones multi-escritura sensibles, preferir transacciones o funciones PostgreSQL seguras antes que coordinación desde el cliente.
- No agregar dependencias de producción, servicios externos o infraestructura nueva sin aprobación en el plan.

## Modo Plan y autonomía

Usar modo Plan para tareas ambiguas, transversales, de datos, seguridad, permisos, caja, arquitectura o más de un corte vertical. Antes de editar, presentar:

1. Resultado y criterios de aceptación entendidos.
2. Hallazgos relevantes del repositorio y guías leídas.
3. Propuesta recomendada, archivos/datos afectados y pruebas.
4. Riesgos o tradeoffs reales.
5. Decisiones que requieren aprobación.

El agente puede proponer mejoras, detectar inconsistencias, decidir detalles locales y hacer refactors pequeños necesarios. Debe pedir aprobación antes de cambiar reglas confirmadas, ampliar el MVP, introducir dependencias/costos, hacer migraciones destructivas, debilitar controles o modificar producción/datos reales.

Para tareas pequeñas, bien delimitadas y sin esos riesgos, implementar directamente y explicar cualquier suposición relevante al finalizar.

## Implementación y verificación

1. Inspeccionar el código y estado de Git antes de editar.
2. Implementar primero invariantes, autorización y migraciones; luego lógica de servidor y UI.
3. Cubrir permisos y comportamiento afectado con pruebas proporcionales al riesgo.
4. Ejecutar las verificaciones definidas en `docs/agent-guides/verification.md`.
5. Revisar el diff por regresiones, bypasses de permisos, datos inconsistentes y cambios accidentales.

La entrega final debe indicar: resultado, archivos relevantes, verificaciones ejecutadas y bloqueos/riesgos pendientes. Si una verificación no pudo ejecutarse, decir por qué y cuál es el siguiente mejor control.

## Git y operaciones externas

- Usar `git` CLI para ramas, staging, commits y push; usar `gh` CLI para repositorios, issues, PRs y releases.
- No usar un MCP de GitHub para operaciones normales de repositorio.
- El agente puede crear ramas `feat/*` y commits locales al finalizar una tarjeta
  aprobada, después de ejecutar y validar las verificaciones pertinentes.
- El agente no debe hacer `push` automáticamente. Solo puede pushear una rama
  cuando el usuario lo solicite explícitamente
- Antes de cada commit, resumir brevemente los cambios y verificaciones.
- Antes de cada acción externa, como push, PR, deploy o migración remota,
  resumir el recurso afectado y esperar aprobación explícita.
- `main` es la rama estable: no hacer push directo, merge, release, deploy, migraciones remotas ni cambios de configuración de producción sin aprobación explícita.
- No usar `git reset --hard`, `git clean`, `git checkout --`, force push ni reescritura de historial sin autorización explícita.
- Usar Conventional Commits.

## Agentes, skills y MCPs

- Usar subagentes solo para trabajo independiente que mejore calidad o velocidad: exploración, revisión de seguridad/RLS, análisis de pruebas o revisión final.
- El agente principal conserva síntesis, decisiones y responsabilidad final. No permitir ediciones simultáneas en los mismos archivos o migraciones.
- Para OpenCode, usar Plan para análisis sin cambios; reservar Build para ejecución aprobada. Para Codex, solicitar delegación explícita cuando sea útil.
- Al añadir agentes especializados de OpenCode, ubicarlos en `.opencode/agents/` y darles objetivo acotado y permisos mínimos. Mantener la configuración de Codex separada en `.codex/` cuando se necesite.
- Las skills reutilizables no deben inflar este archivo. Para compatibilidad con OpenCode, preferir `.agents/skills/<nombre>/SKILL.md`; las rutas alternativas deben ser enlaces, no copias. Documentar cuándo se usa cada skill y mantener su alcance estrecho.
- Añadir MCPs solo cuando aporten una integración real. Configurar mínimos privilegios, no exponer credenciales y documentar propósito, datos accesibles y aprobación requerida.
- Usar Trello MCP solo cuando la tarea pida crear, actualizar o consultar planificación.
- Usar Supabase MCP únicamente sobre Supabase local o el proyecto de desarrollo configurado; nunca conectarlo a producción ni a datos reales de clientes.
- Los cambios de producción se realizan desde migraciones revisadas mediante CLI o CI, y requieren aprobación explícita.
- Antes de una acción externa, resumir qué recurso se creará o modificará y su impacto.
- Cargar `frontend-design` al definir o implementar una nueva pantalla,
  identidad visual, layout o sistema de diseño. No usarla para cambios menores
  sin impacto visual.
- Cargar `shadcn` al crear, buscar, componer, actualizar o personalizar
  componentes shadcn/ui. Usar pnpm como package runner del proyecto.
- Si una skill sugiere instalar un componente o bloque de un registro externo,
  explicar qué resuelve y qué archivos o dependencias agregará, y pedir
  autorización explícita antes de instalarlo.
- Cargar `vercel-react-best-practices` al implementar o revisar páginas,
  componentes, Server Components, fetching, hidratación o rendimiento en
  Next.js.
- Cargar `supabase-postgres-best-practices` al tocar esquema, SQL, índices,
  consultas, migraciones, RLS o concurrencia en Supabase.
- Cargar `webapp-testing` al implementar o revisar pruebas Playwright de la
  aplicación.
- Usar Context7 para consultar documentación externa versionada cuando una API,
  framework o librería pueda haber cambiado. Priorizar documentación oficial y
  mencionar brevemente cuándo se utilizó.
- No cargar skills por rutina. Cargar únicamente las que correspondan a la
  tarea actual y evitar skills redundantes.
- Antes de confiar en una skill externa, revisar su `SKILL.md`, sus comandos,
  permisos y origen. No ejecutar comandos incluidos en una skill sin entender
  su efecto.
    - Delegar en `ui-designer`, ubicado en `.opencode/agents/ui-designer.md`,
      la planificación o revisión especializada de identidad visual, UX,
      responsive y accesibilidad cuando la tarea tenga impacto relevante en la
      interfaz.la implementación y la decisión final permanecen en el agente principal.

## Mantenimiento

- Mantener este archivo corto, concreto y libre de duplicaciones; las reglas detalladas pertenecen a las guías enlazadas.
- Tras descubrir una fricción repetida, proponer el cambio mínimo en la guía o skill adecuada.
- No agregar reglas universales por una excepción local; usar una guía, skill o agente especializado.
- Al cerrar una tarea, si se confirmó una decisión, regla, comando, limitación
  o aprendizaje reutilizable, actualizar el documento durable correspondiente.
  No documentar detalles transitorios ni duplicar información.

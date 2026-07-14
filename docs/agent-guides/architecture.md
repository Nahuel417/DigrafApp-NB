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


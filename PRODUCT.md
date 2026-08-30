# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Los usuarios primarios son Admin y Atención durante la operación diaria: registran pedidos, consultan su avance y resuelven tareas de atención, producción y cobro según sus permisos. Empleado participa en producción con un alcance acotado. Super admin administra cuentas, credenciales y configuraciones sensibles.

## Product Purpose

Digraf centraliza la operación interna de una gráfica textil. Hace posible registrar pedidos textiles, seguir su producción, identificar responsables, confirmar pagos y operar caja con trazabilidad. El éxito es que el equipo complete esos recorridos de forma confiable, clara y consistente.

## Positioning

Digraf unifica en un flujo operativo trazable el pedido textil estructurado, las etapas de producción, los responsables y las operaciones financieras, con permisos y auditoría que preservan la consistencia del negocio.

## Operating Context

La aplicación se utiliza internamente durante la jornada de una gráfica textil. El trabajo parte de la recepción y especificación de un pedido, sigue por etapas de producción y concluye con pago, entrega, archivo o anulación según corresponda. La interfaz debe reducir carga cognitiva y permitir lectura y acción rápidas.

## Capabilities and Constraints

- Roles internos: Super admin, Admin, Atención y Empleado. No hay registro público.
- Pedidos con identificador visible `PED-000001`, cliente o equipo como texto libre y especificación de prendas, telas y extras.
- Flujo previsto: Pedido recibido, Diseño, Corte, Estampado, Costura, Control de calidad, Pagado y Entregado.
- Pagado y Entregado son condiciones independientes. Confirmar Pagado genera una única operación de ingreso por el total; la seña es informativa y no genera caja.
- El dinero se almacena en ARS con precisión decimal. Los instantes se almacenan en UTC y el día operativo se interpreta en `America/Argentina/Cordoba`.
- Autorización en servidor, RLS, perfil activo, validación de entradas y auditoría son requisitos de seguridad. Las operaciones sensibles de múltiples escrituras deben ser atómicas; las reintentables, idempotentes.
- El MVP admite una única imagen vigente por pedido. Los historiales auditables no se eliminan.
- Están fuera del MVP: formulario público, pagos automáticos, cuenta corriente, proveedores y cuentas por pagar, reportes avanzados, exportaciones e historial de imágenes.
- Decisiones aún abiertas: reglas al salir o reconfirmar Pagado, anulación de pedidos pagados, vigencia y branding del cotizador, límites de imágenes y datos iniciales de productos y precios.

## Brand Commitments

El producto se llama Digraf. La interfaz y sus mensajes están en español rioplatense, con voseo, tono directo, operativo, respetuoso y no promocional. El logo oficial existe pero todavía no fue entregado; cuando esté disponible se conservará bajo `public/brand/` sin reconstruirlo, deformarlo, recolorearlo ni usar el nombre textual como sustituto del logo.

## Evidence on Hand

El repositorio contiene las reglas y decisiones del producto, historias de usuario históricas, migraciones, pruebas y una implementación navegable de autenticación, usuarios, catálogos y alta manual de pedidos. También contiene capturas de interfaz de referencia en `docs/brand/references/`.

No hay testimonios, clientes, métricas de adopción, casos de éxito, datos reales, afirmaciones de disponibilidad en producción, precios, SLA, slogan ni activos oficiales de logo disponibles en el repositorio. No se deben fabricar esas afirmaciones o recursos.

## Product Principles

1. La trazabilidad y la consistencia operativa prevalecen sobre la velocidad aparente.
2. Los permisos y la validación del servidor protegen cada operación sensible.
3. La información debe poder escanearse y accionarse con baja carga cognitiva.
4. La interfaz refleja estados reales y nunca inventa actividad, métricas o capacidades.
5. La evolución visual conserva el sistema aprobado y mejora gradualmente su claridad, accesibilidad y consistencia.

## Accessibility & Inclusion

La aplicación requiere HTML semántico, landmarks y un `h1` por pantalla; navegación y acciones completas por teclado; foco visible; diálogos con retorno de foco; contraste suficiente; color nunca como única señal; alternativa al drag and drop; etiquetas persistentes y errores asociados en formularios; y validación con lector de pantalla, zoom al 200 %, reduced motion y forced colors.

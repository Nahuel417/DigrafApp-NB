# Reglas de dominio — Digraf

Leer esta guía antes de modificar roles, pedidos, tablero, pagos, caja, catálogos, imágenes, historial o anulaciones.

## Roles

| Capacidad | Super admin | Admin | Atención | Empleado |
| --- | ---: | ---: | ---: | ---: |
| Control técnico total | Sí | No | No | No |
| Crear cuenta y asignar contraseña temporal | Sí | No | No | No |
| Activar/desactivar cualquier usuario | Sí | No | No | No |
| Desactivar Atención y Empleado | Sí | Sí | No | No |
| Cambiar rol entre Atención y Empleado | Sí | Sí | No | No |
| Restablecer contraseña de cualquier usuario | Sí | No | No | No |
| Crear pedido manual | Sí | Sí | No | No |
| Administrar etapas y catálogos | Sí | Sí | No | No |
| Mover pedido | Sí | Sí | Sí | Sí, excepto Pagado |
| Confirmar pago | Sí | Sí | Sí | No |
| Ver y operar caja | Sí | Sí | Sí | No |
| Cerrar caja | Sí | Sí | No | No |
| Comentar pedido | Sí | Sí | Sí | Sí |
| Editar datos sensibles | Sí | Sí | No | No |

`super_admin`, `admin`, `attention` y `employee` son códigos estables. No deducir permisos de etiquetas de UI ni del estado de un store cliente.

Solo Super admin crea credenciales. Define el email y una contraseña temporal, la comunica fuera de la aplicación y el usuario debe cambiarla en su primer ingreso. Super admin puede restablecer la contraseña de cualquier cuenta; cada restablecimiento vuelve a exigir el cambio en el siguiente ingreso. Admin no crea cuentas ni asigna o restablece contraseñas.

Nadie puede elevar su propio privilegio. Admin solo puede cambiar roles entre `attention` y `employee` y desactivar usuarios con esos roles. Super admin puede administrar cualquier rol, pero el sistema debe impedir desactivar o degradar al último `super_admin` activo.

Las contraseñas se almacenan únicamente en Supabase Auth y nunca en perfiles, auditorías o logs. Toda autorización debe exigir un perfil activo para bloquear a un usuario desactivado aunque conserve una sesión previa.

## Operaciones sensibles

- Toda acción sensible iniciada desde la interfaz usa dos pasos y confirma mediante `AlertDialog`. Incluye activar o desactivar usuarios, cambiar permisos, restablecer credenciales, anular, eliminar y operaciones equivalentes.
- La confirmación identifica la entidad afectada, explica la consecuencia y declara si puede revertirse. Una acción destructiva se distingue visualmente de cancelar o continuar.
- Cerrar el diálogo restaura el foco al disparador. Mientras una mutación está pendiente se impide el doble envío.
- Toda mutación comunica éxito o error mediante toast accesible. Los errores de campos y resultados que deban releerse permanecen también inline; el toast no los reemplaza.
- La confirmación de interfaz no sustituye autorización, atomicidad, idempotencia ni auditoría de servidor/base de datos.
- No se implementan borrados físicos cuando las reglas exigen archivo, anulación, retención o conservación de auditoría. Las eliminaciones expresamente permitidas conservan sus condiciones de dominio.
- La limpieza compensatoria de una identidad Auth creada durante un fallo parcial no es una eliminación operativa: conserva el contrato específico de bootstrap/creación y no habilita borrado de usuarios administrables.

## Bootstrap inicial

La primera cuenta `super_admin` de cada entorno es una excepción inicial: un desarrollador autorizado la crea mediante un script administrativo manual. El script crea el usuario en Supabase Auth y el perfil asociado con `role = 'super_admin'`, `is_active = true` y `must_change_password = true`.

- Recibe email y contraseña temporal por variables de entorno o entrada interactiva; nunca los persiste en Git, migraciones, perfiles, auditorías o logs.
- Usa una clave privilegiada solo durante la ejecución administrativa server-side; nunca llega al navegador ni a variables públicas.
- Confirma el email automáticamente. M1 no implementa confirmación por email ni recuperación pública.
- Ante un fallo parcial, informa el `user_id` y el estado de Auth/perfil. La reparación debe reintentar el perfil o eliminar el usuario Auth únicamente con confirmación explícita; no debe ocultar usuarios huérfanos.
- Solo se crea un Super admin sintético en el entorno local de pruebas. Crear usuarios reales en desarrollo remoto o producción exige autorización explícita.

## Pedidos y tablero

Un pedido se representa como tarjeta Kanban. Se puede crear manualmente por Admin/Super admin.

Etapas iniciales:

1. Pedido recibido.
2. Diseño.
3. Corte.
4. Estampado.
5. Costura.
6. Control de calidad.
7. Pagado.
8. Entregado.

Admin puede crear, renombrar, reordenar y eliminar etapas. Las reglas no deben depender del texto visible: las etapas de pago y entrega requieren claves semánticas estables, por ejemplo `paid` y `delivered`. Si se pretende eliminar o cambiar el significado de una etapa especial, presentar el impacto en modo Plan.

Los pedidos pueden moverse hacia adelante y atrás. Cada movimiento debe registrar pedido, etapa anterior, etapa siguiente, actor y timestamp del servidor. El drag and drop debe manejar rechazo del servidor y revertir su estado optimista.

Un pedido pagado puede no estar entregado. No derivar uno de otro.

## Campos del pedido

Campos mínimos:

- Cliente/equipo como texto libre.
- Cantidad total de unidades.
- Tipo de pedido: conjunto o prenda individual.
- Fecha de pedido y fecha prometida de entrega.
- Tipo de prenda, cuello, molde, tela y extras desde catálogos.
- Descripción libre.
- Imagen actual del diseño.
- Seña manual y monto total manual.

Los catálogos son listas simples sin precio. Los moldes de prendas superiores y de short/pollera deben mantenerse diferenciados para evitar combinaciones inválidas.

Solo Admin/Super admin pueden cambiar cliente, cantidad, fechas, especificaciones e importes. La fecha prometida puede cambiar solo por Admin/Super admin y debe quedar auditada. Empleado puede modificar descripción e imagen cuando se le solicita, sin alterar datos sensibles.

El MVP conserva una sola imagen vigente de diseño; no implementar historial de versiones todavía.

## Pago y caja

Al mover a `Pagado`, Super admin/Admin/Atención deben confirmar explícitamente el cobro. El movimiento, la confirmación y la creación del ingreso automático deben ocurrir como una operación atómica e idempotente.

Decisión confirmada:

- La seña se guarda como dato informativo del pedido y no crea un movimiento de caja.
- Al confirmar `Pagado`, caja registra un único ingreso automático por el monto total completo del pedido.

No cambiar esta regla para registrar seña y saldo por separado sin aprobación explícita.

Admin puede revertir el pago solamente mientras la caja del día correspondiente esté abierta. La reversión anula el ingreso automático; no lo elimina. Atención puede confirmar pago, pero no revertirlo salvo decisión futura.

## Caja diaria

- Cada día operativo tiene una caja en `America/Argentina/Cordoba`.
- Admin/Atención cargan el saldo inicial y pueden editarlo mientras la caja está abierta.
- La edición de saldo inicial requiere auditoría de valor anterior, valor nuevo, actor y timestamp; incluir motivo cuando corresponda.
- Saldo final = saldo inicial + ingresos válidos − egresos válidos.
- Admin/Atención pueden crear ingresos y egresos manuales.
- Egresos iniciales: materiales/insumos, sueldos, servicios, mantenimiento/equipos y otros. Admin puede sumar categorías.
- Movimientos manuales se editan solo con caja abierta.
- Cualquiera de los dos Admin puede cerrar caja manualmente. Atención no puede cerrarla.
- Al iniciar el día siguiente, la caja anterior se cierra automáticamente si sigue abierta.
- La caja cerrada bloquea toda edición y debe mostrar un mensaje claro.
- Los movimientos anulados se conservan con actor y timestamp de anulación.
- El historial diferencia ingresos por pedido, ingresos manuales y egresos manuales.

## Comentarios, imágenes y auditoría

Todos los roles internos pueden comentar tarjetas. Las imágenes de diseño se almacenan con políticas de Storage que reflejen los permisos del pedido.

Toda operación sensible registra el actor autenticado y la hora del servidor. No confiar en timestamps o identificadores de actor provenientes del navegador.

## Pedidos anulados

- Admin puede anular un pedido indicando motivo.
- Los anulados se ven en un archivo solo para Admin/Super admin.
- Se pueden restaurar o eliminar definitivamente antes de 30 días.
- Al cumplir 30 días se eliminan automáticamente.
- Antes de implementar la eliminación programada, definir retención de datos relacionados y probar restauración, autorización y vencimiento.

## Fuera del MVP

No implementar sin aprobación explícita:

- Formulario público con enlace único para clientes. Será la siguiente fase tras el MVP; su objetivo es crear o completar un pedido e ingresarlo al Kanban.
- Integración automática de pagos.
- Cuenta corriente de clientes.
- Proveedores y cuentas por pagar.
- Reportes avanzados, gráficos o exportaciones.

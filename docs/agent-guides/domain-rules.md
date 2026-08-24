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
| Crear pedido manual | Sí | Sí | Sí | No |
| Administrar etapas y catálogos | Sí | Sí | No | No |
| Mover pedido | Sí | Sí | Sí | Sí, excepto Pagado |
| Confirmar pago | Sí | Sí | Sí | No |
| Ver y operar caja | Sí | Sí | Sí | No |
| Cerrar caja | Sí | Sí | No | No |
| Comentar pedido | Sí | Sí | Sí | Sí |
| Editar datos sensibles | Sí | Sí | Sí | No |
| Purgar manualmente pedido anulado | Sí | Sí | No | No |

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

Desde PR 1A un pedido nuevo tiene uno o más renglones posicionados. Cada renglón
es una prenda individual, conjunto, bandera, bolso o escudo; el conjunto conserva
sus partes superior e inferior dentro de la configuración del mismo renglón y
usa una cantidad común. El pedido mantiene un único importe total.

Un pedido se representa como tarjeta Kanban. Se puede crear manualmente por Super admin, Admin o Atención. Empleado no puede crear pedidos manuales.

Etapas iniciales:

1. Pedido recibido.
2. Diseño.
3. Corte.
4. Estampado.
5. Costura.
6. Control de calidad.
7. Pagado.
8. Entregado.

Super admin y Admin pueden crear, renombrar, reordenar y retirar etapas. Las nuevas etapas ordinarias se crean activas al final y su código estable lo asigna el servidor; luego se pueden reordenar. Las reglas no deben depender del texto visible: `received`, `paid` y `delivered` permanecen activas, no se retiran y sus códigos no cambian. El retiro se rechaza si la etapa tiene pedidos y debe conservarse al menos una etapa ordinaria activa.

Los pedidos pueden moverse hacia adelante y atrás. Cada movimiento debe registrar pedido, etapa anterior, etapa siguiente, actor y timestamp del servidor. El drag and drop debe manejar rechazo del servidor y revertir su estado optimista.

Durante M4, y hasta que M11/M12 incorporen cobro y reversión, toda transición hacia o desde la etapa con código semántico `paid` se rechaza para cualquier rol. Las demás etapas, incluida `delivered`, pueden recorrerse hacia adelante o atrás según los permisos generales; llegar a `delivered` no implica pago.

Cada movimiento nuevo conserva el snapshot de los nombres de etapa de origen y destino junto con sus identificadores. Los eventos anteriores a esta regla no tienen snapshot y muestran el nombre actual de la etapa; no se los presenta como nombres históricos.

Un pedido pagado puede no estar entregado. No derivar uno de otro.

## Campos del pedido

Campos mínimos:

- Cliente, equipo y teléfono como textos separados y obligatorios en pedidos nuevos.
- Los pedidos históricos pueden conservar `customer_name` como referencia y tener los tres campos nuevos en NULL hasta su próxima edición.
- La cantidad total se deriva de los renglones.
- Tipo de pedido: conjunto o prenda individual para históricos compatibles; los pedidos nuevos pueden combinar tipos de renglón.
- Fecha de pedido y fecha prometida de entrega.
- Tipo de prenda, cuello, molde, tela y extras desde catálogos.
- Descripción libre.
- Colección privada de 0 a 3 imágenes de diseño, con una primaria opcional.
- Monto total manual, monto de seña y estado de seña pagada.

Los catálogos son listas sin precio, organizadas por secciones y productos. Banderas, bolsos y escudos tienen secciones propias; las categorías de escudos solo las administran Admin y Super admin. Las opciones de producto son opcionales y admiten selección simple o múltiple.

La matriz de especificaciones del alta manual es:

- Conjunto: una prenda superior, una prenda inferior, cuello, molde superior, molde inferior y tela.
- Prenda individual superior: una prenda superior, cuello, molde superior y tela.
- Prenda individual inferior: una prenda inferior, molde inferior y tela; no lleva cuello.
- Cualquier tipo puede tener cero o más extras.

La imagen de diseño queda nullable y fuera del alta de M3; se incorpora en M7.

Los importes del pedido se almacenan como `numeric(14,2)`:

- `total_amount` es obligatorio y no puede ser negativo.
- `deposit_amount` es obligatorio, puede ser `0` y no puede superar `total_amount`.
- `deposit_paid` indica si la seña fue abonada; una seña no pagada puede tener monto `0`.
- `saldo_visible` se calcula y no se persiste: si la seña fue pagada, es `total_amount - deposit_amount`; si no, es `total_amount`.
- Registrar la seña no genera caja. Al confirmar el estado `Pagado`, caja registra un único ingreso por `total_amount`.

Solo Super admin, Admin y Atención pueden crear el pedido manual. Solo Super admin y Admin pueden administrar catálogos. Empleado no obtiene permisos adicionales en M3. Los importes son visibles para Super admin, Admin y Atención; Empleado no puede leerlos.

Los productos, categorías, opciones y valores se desactivan en lugar de borrarse destructivamente. Los pedidos conservan snapshots de productos, escudos, opciones y valores, por lo que cambios posteriores del catálogo no alteran su historia.

Solo Super admin, Admin y Atención pueden cambiar cliente, cantidad, fechas, especificaciones e importes después del alta. La fecha prometida debe quedar auditada. Todos los roles operativos pueden modificar descripción; Super admin, Admin y Atención pueden gestionar la colección de imágenes mediante altas, reemplazos, eliminaciones y selección o limpieza explícita de la primaria.

Decisión durable PR2: Atención recibe la autoridad equivalente a Admin únicamente para la edición aprobada del pedido, la gestión de imágenes y la reversión de pagos. No recibe autoridad administrativa no relacionada, como administrar catálogos, etapas, usuarios o cerrar caja; Empleado permanece rechazado para esas operaciones. El servidor y RLS son la frontera final de autorización.

- El MVP conserva hasta tres imágenes actuales de diseño, sin orden manual ni interfaz de historial. La primaria es opcional; tablero y vista rápida solo pueden proyectarla o mostrar un placeholder, y el detalle puede mostrar la colección privada completa.

## Pago y caja

Al mover a `Pagado`, Super admin/Admin/Atención deben confirmar explícitamente el cobro. El movimiento, la confirmación y la creación del ingreso automático deben ocurrir como una operación atómica e idempotente.

Decisión confirmada:

- La seña se guarda como dato informativo del pedido y no crea un movimiento de caja.
- Al confirmar `Pagado`, caja registra un único ingreso automático por el monto total completo del pedido.

No cambiar esta regla para registrar seña y saldo por separado sin aprobación explícita.

M12 agrega una única entrada de servidor para la reversión: `reverse_order_payment`. Super admin, Admin y Atención pueden ejecutarla, con reconfirmación explícita y las mismas validaciones; Empleado y las llamadas directas sin actor autenticado son rechazados. Esta excepción de Atención no modifica ninguna semántica financiera.

- La reversión exige que el pedido esté en `paid` y restaura exactamente la etapa previa registrada en la confirmación. Luego permite reconfirmar el pago mediante un nuevo pago activo.
- Si el importe es positivo, la caja correspondiente debe estar abierta. Se crea una contrapartida `expense` enlazada al pago, sin borrar el ingreso original. El motivo es opcional.
- Si el importe es cero, no se exige caja ni se crea movimiento de caja.
- Se mantienen las protecciones M10: los movimientos vinculados a pagos no se pueden corregir ni anular.

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

Todos los roles internos pueden comentar tarjetas. Las imágenes de diseño se almacenan en un bucket privado con policies que reflejan los permisos del pedido; Super admin, Admin y Atención pueden gestionar la colección y los demás roles conservan únicamente la lectura interna autorizada.

Toda operación sensible registra el actor autenticado y la hora del servidor. No confiar en timestamps o identificadores de actor provenientes del navegador.

## Pedidos anulados

- M15 permite a Admin/Super admin anular un pedido indicando un motivo normalizado de 2 a 500 caracteres; un pago activo debe revertirse primero mediante M12.
- La anulación conserva el pedido en `orders` con `lifecycle_state = cancelled`, excluye el pedido del tablero y congela las operaciones normales. Archivo deriva de ese estado y no es una transición adicional.
- Los anulados se ven en un Archivo histórico solo para Admin/Super admin. El acceso directo no autorizado responde como recurso no accesible.
- La restauración devuelve el pedido a su etapa operativa previa antes de `cancelled_at + 30×24 horas` en UTC. La fecha exacta de vencimiento ya no admite restauración.
- M15 conserva relaciones, eventos append-only, finanzas, imágenes y Storage; no elimina ni purga datos y nunca escribe caja.
- M16 permite la purga manual inmediata únicamente a Admin/Super admin sobre `lifecycle_state = cancelled`, con motivo recortado solo en los extremos y de 2 a 500 caracteres. El actor, la hora y la fuente se derivan en servidor; la auditoría conserva el motivo completo y un snapshot inmutable para replay.
- La purga automática de M16 sigue siendo exclusiva de `service_role` y solo procede desde `cancelled_at + 30×24 horas` en UTC. La purga conserva el tombstone de `orders`, finanzas, pagos, caja y auditoría; elimina únicamente los datos operativos permitidos y deja los fallos de Storage en reintento durable.

## Fuera del MVP

No implementar sin aprobación explícita:

- Formulario público con enlace único para clientes. Será la siguiente fase tras el MVP; su objetivo es crear o completar un pedido e ingresarlo al Kanban.
- Integración automática de pagos.
- Cuenta corriente de clientes.
- Proveedores y cuentas por pagar.
- Reportes avanzados, gráficos o exportaciones.

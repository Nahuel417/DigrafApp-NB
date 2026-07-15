# Decisiones de producto y técnica — Digraf

Este documento registra decisiones confirmadas. Actualizarlo cuando se cierre una decisión durable; no usarlo como lista de ideas.

## Confirmadas

| Decisión               | Estado           | Nota                                                                                                                                                                                                                                                |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                  | Confirmada       | Next.js 16 estable, TypeScript, Supabase, Tailwind/shadcn, Zustand, dnd-kit y Vercel.                                                                                                                                                               |
| Cuentas internas       | Confirmada       | Solo Super admin crea cuentas y credenciales. Define el email y una contraseña temporal que el usuario debe cambiar en su primer ingreso; no hay registro público interno.                                                                          |
| Gestión de credenciales | Confirmada      | Super admin puede activar, desactivar y restablecer la contraseña de cualquier usuario. Un restablecimiento vuelve a exigir cambio de contraseña. Admin no crea cuentas ni asigna o restablece credenciales.                                       |
| Cambios de rol         | Confirmada       | Admin puede cambiar roles únicamente entre Atención y Empleado y puede desactivar esos usuarios. Nadie puede elevar su propio privilegio y no se puede desactivar o degradar al último Super admin activo.                                           |
| Cliente                | Confirmada       | En MVP es solo un nombre de texto en el pedido.                                                                                                                                                                                                     |
| Tablero                | Confirmada       | Kanban estilo Trello.                                                                                                                                                                                                                               |
| Imágenes               | Confirmada       | Una imagen vigente por pedido en MVP.                                                                                                                                                                                                               |
| Catálogos              | Confirmada       | Listas simples, sin precios.                                                                                                                                                                                                                        |
| Pago                   | Confirmada       | La seña es informativa; al pasar a Pagado se registra un único ingreso por el total completo.                                                                                                                                                       |
| Pagado y entregado     | Confirmada       | Son estados independientes; un pedido puede estar pagado sin estar entregado.                                                                                                                                                                       |
| Caja                   | Confirmada       | Tiene saldo inicial editable mientras está abierta y saldo final calculado al cierre.                                                                                                                                                               |
| Cierre de caja         | Confirmada       | Automático al iniciar el siguiente día; Admin puede cerrar manualmente. Atención no cierra.                                                                                                                                                         |
| Anulación de pedidos   | Confirmada       | Archivo exclusivo de Admin/Super admin por 30 días, restaurable o eliminable antes del vencimiento.                                                                                                                                                 |
| Formulario de clientes | Posterior al MVP | Enlace único al cliente; será la primera fase posterior al MVP.                                                                                                                                                                                     |
| Cotizador interno      | Confirmada       | Admin y Atención pueden cotizar. Solo Super admin administra precios. Calcula productos unitarios por cantidad, adicionales TPU y banderas desde una base de 1 m × 1,5 m. Genera PDF descargable sin historial ni persistencia de cotizaciones/PDF. |

Las contraseñas pertenecen exclusivamente a Supabase Auth: no se guardan en perfiles, tablas de auditoría ni logs de la aplicación. La desactivación debe cortar el acceso a datos protegidos aunque el usuario conserve una sesión previa.

## Preguntas abiertas no bloqueantes

- Definir la pantalla exacta de reportes, gráficos y exportaciones cuando entren en alcance.
- Definir UX y seguridad detallada del formulario público al iniciar esa fase: expiración de enlaces, adjuntos, validación y si crea pedido o solicitud.

## Regla de actualización

Si una tarea depende de una decisión ausente o contradictoria, proponer alternativas en modo Plan y registrar la decisión resultante aquí y, cuando afecte comportamiento, en la guía de dominio correspondiente.

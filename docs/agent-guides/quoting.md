# Cotizador — Digraf

Leer esta guía antes de modificar precios, cotizaciones, PDF o permisos del cotizador.

## Alcance del MVP

El cotizador es una sección interna e independiente de los pedidos. Calcula un presupuesto a partir de precios vigentes y permite descargar el resultado en PDF.

No crea pedidos, no reserva stock, no registra pagos y no genera historial de cotizaciones.

## Permisos

- `admin` y `attention` pueden usar el cotizador y descargar el PDF.
- Solo `super_admin` puede crear, editar, activar o desactivar precios del cotizador.
- Los precios nunca se hardcodean en la interfaz ni se deducen de catálogos de pedidos.

## Productos y cálculo

- Existen grupos de productos para Adultos, Niños y Banderas.
- Cada producto tiene precio unitario administrable por Super admin.
- El total de cada ítem es precio unitario por cantidad.
- El escudo TPU es un adicional opcional con precio unitario administrable y una cantidad explícita.
- La bandera base se cotiza como `1 m × 1,5 m`; su precio también es administrable. No asumir un importe ni una fórmula adicional sin una decisión de producto.
- El total de la cotización es la suma de todos los ítems y adicionales seleccionados.
- Todos los importes se manejan como ARS con precisión decimal; nunca usar punto flotante.

## PDF

- El PDF descargable es el único medio de conservación de una cotización en el MVP.
- No persistir cotizaciones, líneas de cotización, archivos PDF ni historial en la base de datos o Storage.
- El PDF incluye cliente/equipo opcional, fecha de emisión, detalle de ítems, cantidades, adicionales, subtotales y total.
- Incluir una leyenda de cotización y su vigencia si el producto define una política de vigencia; no inventar un plazo.
- Generar una salida clara, imprimible y apta para compartir. Verificar visualmente el PDF antes de considerar terminada la funcionalidad.

## Límites

No agregar descuentos por volumen, impuestos, envío, seña, conversión automática a pedido, envío por WhatsApp, historial ni edición de PDFs sin aprobación explícita.


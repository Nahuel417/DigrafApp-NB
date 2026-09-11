# Cotizador — Digraf

Leer esta guía antes de modificar precios, cotizaciones, PDF o permisos del cotizador.

## Alcance del MVP

El cotizador es una sección interna e independiente de los pedidos. Calcula un presupuesto a partir de precios vigentes y permite descargar el resultado en PDF.

No crea pedidos, no reserva stock, no registra pagos y no genera historial de cotizaciones.

## Permisos

- `super_admin`, `admin` y `attention` pueden usar el cotizador, descargar el PDF y administrar precios.
- Los precios nunca se hardcodean en la interfaz ni se deducen de catálogos de pedidos.

## Productos y cálculo

- Existen grupos de productos para Adultos, Niños, Banderas y Adicionales.
- Cada producto tiene precio unitario administrable. El código visible es opcional; el identificador interno UUID se usa para cotizar.
- En una importación, un código informado actualiza por código; una fila sin código actualiza el producto existente por nombre normalizado o crea uno nuevo si no existe.
- El total de cada ítem es precio unitario por cantidad.
- El escudo TPU es un adicional opcional con precio unitario administrable y una cantidad explícita.
- Las banderas se cotizan por metro lineal; su precio también es administrable.
- El total de la cotización es la suma de todos los ítems y adicionales seleccionados.
- Todos los importes se manejan como ARS con precisión decimal; nunca usar punto flotante.

## PDF

- El PDF descargable es el único medio de conservación de una cotización en el MVP.
- No persistir cotizaciones, líneas de cotización, archivos PDF ni historial en la base de datos o Storage.
- El PDF incluye cliente/equipo opcional, fecha de emisión, detalle de ítems, cantidades, adicionales, subtotales y total.
- Incluir una leyenda de cotización y su vigencia si el producto define una política de vigencia; no inventar un plazo.
- Generar una salida clara, imprimible y apta para compartir. Verificar visualmente el PDF antes de considerar terminada la funcionalidad.

## Límites

La importación acepta una fila de encabezados opcional. Sin encabezados, cada fila debe seguir el orden `nombre | grupo | unidad | precio`, por ejemplo `Camiseta sola | Adultos | Unidad | $14.000`. Con encabezados, `grupo`, `nombre`, `unidad` y `precio` son obligatorios, mientras `codigo` y `activo` son opcionales. `Conjunto` se interpreta como `Unidad`; `Todas las edades` se infiere como `Banderas` para banderas o metro lineal y como `Adicionales` para otros productos. Acepta XLSX, DOCX, PDF de texto o texto pegado con columnas separadas por tabulaciones o `|`; no usa OCR ni CSV. No agregar descuentos por volumen, impuestos, envío, seña, conversión automática a pedido, envío por WhatsApp, historial ni edición de PDFs sin aprobación explícita.


# Sistema de diseño — Digraf

Estado: fundaciones light aprobadas e implementadas. Dark mode y el logo oficial quedan diferidos.

Esta guía es la fuente canónica para cambios visuales. Debe leerse antes de crear o modificar pantallas, componentes, estilos, navegación o estados de interfaz.

## Propósito

Digraf es una aplicación interna para una gráfica textil. Su interfaz prioriza, en este orden:

1. Claridad operativa.
2. Velocidad de lectura y acción.
3. Accesibilidad.
4. Densidad controlada.
5. Consistencia.
6. Personalidad visual sobria.

La interfaz no es una landing page y nunca reemplaza autorización de servidor o RLS.

## Dirección visual

### Registro de taller

“Registro de taller” expresa trazabilidad mediante estructura, alineación, ritmo y estados explícitos. Debe sentirse profesional, ágil y operativa.

- La jerarquía responde a tareas, no a impacto promocional.
- Las superficies se separan primero con fondo y borde; la sombra representa elevación real.
- La densidad permite escanear información sin reducir legibilidad ni objetivos táctiles.
- El verde se concentra en acción principal, selección y foco.
- No se usan texturas, costuras simuladas, papel, sellos, rusticidad ni decoración industrial.
- No se inventan métricas, gráficos o módulos para completar una composición.

### Firma visual

Una línea de registro operativo puede indicar sección activa, selección, foco relevante o etapa elegida. Debe representar una condición real y acompañarse con texto, posición o foco. No se usa como trama decorativa general.

## Referencia visual principal

`docs/brand/references/` es la referencia visual principal de Digraf. Sus capturas se reproducen con alta fidelidad en composición, proporciones, densidad, espaciado, bordes, radios, navegación, tablas y componentes.

Las capturas no son una inspiración genérica y no admiten interpretación visual libre. Desde ahora queda aprobado un shell autenticado con sidebar compacto, compuesto únicamente por rutas reales y autorizadas para la sesión.

No se copian marcas, logos, datos, textos, métricas ni funcionalidades inexistentes. Cuando existe un conflicto, prevalecen la accesibilidad, el comportamiento responsive, las reglas de negocio, los permisos y la autorización de servidor/RLS.

La captura y la implementación anteriores del login son un resultado rechazado y no constituyen una referencia. Login y cambio de contraseña derivan su estética de las capturas aprobadas de `docs/brand/references/`, adaptándola solamente a sus contenidos y acciones reales.

## Logo y activos

El logo oficial todavía no está incorporado. Cuando se entregue:

- Se ubicará bajo `public/brand/`.
- Se conservarán proporción, colores y variantes oficiales.
- Se documentarán fondos permitidos, área de seguridad y tamaño mínimo.
- No se reconstruirá como texto, CSS o SVG manual.
- No se deformará, recoloreará ni decorará.

Hasta entonces puede mostrarse “Digraf” como nombre textual, sin presentarlo como reemplazo del logo. La ausencia del activo no bloquea tipografía, tokens, componentes ni accesibilidad.

## Color

### Alcance inicial

La primera implementación es exclusivamente light. Los tokens dark se conservan en el anexo como propuesta futura, pero no se agrega selector `.dark`, toggle, provider de tema ni validación duplicada.

### Mapeo semántico

| Token | Uso |
| --- | --- |
| `background` | Canvas general |
| `foreground` | Texto principal |
| `card` | Superficie contenida |
| `popover` | Superficie flotante no modal |
| `primary` | Acción principal y selección fuerte |
| `secondary` | Acción o superficie secundaria |
| `muted` | Superficie de baja prominencia |
| `muted-foreground` | Texto secundario |
| `accent` | Selección o énfasis contextual |
| `destructive` | Acción destructiva o de riesgo |
| `error` | Operación fallida o entrada inválida |
| `border` | Separación de superficies |
| `input` | Límite de controles |
| `ring` | Foco visible |
| `sidebar-*` | Shell y navegación autenticada |
| `chart-*` | Reserva para visualizaciones futuras |

`primary` no significa éxito. `destructive` representa acciones de riesgo; `error` representa fallos y validación. Ambos pueden compartir temporalmente un valor cromático sin compartir semántica.

### Feedback semántico

| Rol | Significado |
| --- | --- |
| `success` | Operación completada correctamente |
| `warning` | Situación que requiere atención o confirmación |
| `info` | Orientación o contexto neutral |
| Error | Operación fallida o entrada inválida; no equivale siempre a una acción destructiva |

El color nunca es la única señal. Alertas y mensajes incluyen texto explícito y, cuando ayuda, icono o título.

Los estados de negocio conservan badges específicos: rol, activo/inactivo, cambio obligatorio de contraseña, etapa, pago, entrega, caja, movimiento y anulación. No se deducen automáticamente de `success`, `warning` o `info`. Pago y entrega permanecen separados.

### Ajustes light medidos

Las mediciones usan conversión OKLCH a sRGB lineal con clipping de gamut y la fórmula de contraste WCAG 2.x. Deben volver a comprobarse sobre colores computados en navegador durante la validación visual.

| Token | Valor original | Valor aplicado | Par medido | Original | Aplicado | Justificación |
| --- | --- | --- | --- | ---: | ---: | --- |
| `background` / `sidebar` | `oklch(0.9841 0.0017 145.5622)` | `oklch(0.9771 0.0034 145.55)` (`#F6F8F6`) | Texto principal / borde de input | 16.38:1 / 3.07:1 | 16.06:1 / 3.01:1 | Reduce deslumbramiento sin volver gris el canvas; cards y popovers permanecen blancos |
| `primary` | `oklch(0.5745 0.1033 130.8937)` | `oklch(0.54 0.1033 130.8937)` | Blanco | 4.23:1 | 4.89:1 | Permite texto normal blanco con margen AA sin cambiar tono ni croma |
| `border` | `oklch(0.9168 0.0034 145.5475)` | Sin cambio | Card blanco | 1.28:1 | 1.28:1 | Es separador estructural secundario, no única señal de un control o estado |
| `input` | `oklch(0.9168 0.0034 145.5475)` | `oklch(0.65 0.015 145.5)` | Blanco | 1.28:1 | 3.21:1 | Hace identificable el límite del control sin depender del fondo |
| `ring` | `oklch(0.5745 0.1033 130.8937)` | Sin cambio, opaco | Background | 4.05:1 | 3.97:1 | El problema era usar alpha 20–50%; el ring completo supera 3:1 sobre el fondo aprobado |

Los componentes usan ring de 2 px y offset de 2 px. No se usa `ring/50` como única señal de foco.

### Valores de feedback light

| Rol | Fondo | Foreground | Contraste calculado |
| --- | --- | --- | ---: |
| Success | `oklch(0.92 0.04 145)` | `oklch(0.34 0.09 145)` | 9.08:1 |
| Warning | `oklch(0.94 0.05 85)` | `oklch(0.35 0.09 65)` | 9.67:1 |
| Info | `oklch(0.93 0.035 240)` | `oklch(0.35 0.08 245)` | 9.20:1 |

Error usa inicialmente `oklch(0.5771 0.2152 27.325)` sobre background, separado del token `destructive` aunque ambos compartan valor.

### Proceso para futuros ajustes

Todo cambio de color debe registrar antes de aplicarse:

1. Token y valor original.
2. Uso real y estados afectados.
3. Par de colores medido.
4. Herramienta, resultado y umbral aplicable.
5. Valor propuesto.
6. Justificación e impacto visual.
7. Aprobación.

## Tipografía

### Familias

- Inter: interfaz, navegación, formularios y texto.
- Source Code Pro: IDs, importes, fechas, estados y datos operativos compactos.

Ambas se cargan con `next/font/google`, `display: swap` y variables CSS. No se usan enlaces externos ni otra dependencia tipográfica.

Mappings:

- `--font-sans` → `--font-inter`.
- `--font-mono` → `--font-source-code-pro`.
- No existe `--font-serif`: se confirmó que no tenía consumidores.

### Roles y tracking

| Rol | Fuente | Tracking |
| --- | --- | --- |
| Cuerpo y labels | Inter | Normal |
| Títulos de sección | Inter | Normal |
| Títulos de página | Inter | `tracking-display`, moderado |
| Etiquetas uppercase breves | Inter | `tracking-label`, positivo y controlado |
| IDs, importes, fechas y estados | Source Code Pro | `tracking-data`, normal |

No se aplica letter spacing global al `body`. Se evita uppercase en texto largo, tracking extremo y mono en instrucciones.

Aplicar `font-variant-numeric: tabular-nums` a importes, cantidades comparables, fechas, horas, totales e IDs numéricos. Importes y columnas numéricas se alinean a la derecha y no se parten.

## Espaciado, radios, sombras y densidad

- La escala de espaciado usa múltiplos de `0.25rem`.
- El radio base es `0.6rem`; los tamaños derivados siguen el mapping de Tailwind.
- Cards normales usan borde y sombra mínima o nula.
- Popovers, diálogos y drag preview pueden usar elevación.
- Acciones frecuentes apuntan a 40 px en escritorio y 44 px en superficies táctiles cuando la densidad lo permita.
- La densidad nunca justifica texto ilegible, acciones ambiguas o targets menores al mínimo aplicable de WCAG 2.2.

Las sombras dark originales quedan diferidas. Antes de una fase dark se debe reducir su opacidad y blur, especialmente los niveles de 0.4 y 1.0, y validar halos sobre listas extensas.

## Navegación

- Mostrar la sección activa con texto, posición y línea de registro.
- No depender solo del color.
- Mantener visible la identidad de sesión.
- No mostrar módulos inexistentes para completar el layout.
- Los destinos visibles reflejan permisos, pero no sustituyen autorización.
- El shell autenticado usa un sidebar compacto con únicamente los destinos reales y autorizados para la sesión; en mobile conserva acceso equivalente sin ocultar información operativa.
- Canvas, sidebar y cabecera mobile comparten `background`/`sidebar` en `#F6F8F6`; la continuidad no se rompe con una sidebar blanca. Cards y popovers continúan en blanco.

## Formularios

Cada campo incluye label persistente, control, ayuda cuando corresponde y error específico. Se relacionan con `aria-describedby`; el control inválido usa `aria-invalid` y su `Field` usa `data-invalid`.

- No usar placeholder como único label.
- Conservar datos tras errores recuperables.
- Pending deshabilita el submit correspondiente y cambia su texto.
- Pending bloquea el doble envío y conserva la geometría del control.
- Success usa una región de estado.
- Error se anuncia cuando requiere atención inmediata.
- No depender del rojo.
- Toda acción sensible usa un flujo de dos pasos con `AlertDialog`; explica entidad, consecuencia y reversibilidad, distingue la acción destructiva y devuelve foco al disparador al cerrar.

## Información operativa y tablas

Usar Table en desktop cuando comparar columnas simultáneamente sea parte de la tarea. Debe tener headers semánticos, números alineados, acciones asociadas a la fila y overflow limitado a su propia región.

En mobile se prefieren registros apilados que preserven label, valor y acciones:

```text
┌──────────────────────────┐
│ Nombre o identificador   │
│ Rol          [Empleado]  │
│ Estado       [Activo]    │
│ Email        …           │
│ Acciones     …           │
└──────────────────────────┘
```

No duplicar DOM accesible. Permitir overflow horizontal solo cuando comparar columnas sea indispensable y otra presentación produzca pérdida de información.

## Kanban

Desktop usa columnas desplazables horizontalmente, etapa y cantidad visibles, tarjetas compactas y drag preview estable. Un rechazo del servidor revierte el cambio optimista y comunica el error.

Teclado y mobile tienen alternativa completa al drag: selector explícito de destino, grupos por etapa y navegación rápida. Las reglas no se deducen del nombre o color de una etapa.

## Cards, badges, alertas y toast

### Cards

- Usar solo cuando la agrupación aporte significado.
- Borde por defecto y sombra mínima.
- Header, contenido y acciones mantienen estructura estable.
- No envolver cada bloque en una card.

### Badges

- Texto breve y explícito.
- No depender solo del color.
- Source Code Pro cuando representan un dato operativo.
- Mantener separados estado, pago y entrega.
- No reutilizar feedback semántico como clasificación automática del negocio.

### Alertas

- Error: qué ocurrió y próximo paso.
- Success: operación completada con el mismo vocabulario que la acción.
- Warning: consecuencia o condición que requiere evaluación.
- Info: contexto neutral no bloqueante.

### Toast

Toda mutación emite un toast accesible de éxito o error. Toast sirve para confirmación transitoria y nunca es el único registro de un resultado sensible: errores de campos y resultados que deban releerse permanecen también en la pantalla o historial correspondiente. Se implementa con Sonner en modo light, sin provider de tema.

## Estados de interfaz

- Loading: texto pending en acciones; Skeleton solo cuando preserva geometría.
- Empty: explicar qué está vacío y mostrar una acción solo si existe y está autorizada.
- Error: explicar qué ocurrió y cómo continuar, sin detalles técnicos.
- Success: confirmar con el mismo vocabulario que la acción.
- Disabled: mantener legibilidad y explicar el motivo cuando no sea evidente.
- Focus: `:focus-visible`, ring opaco, 2 px de ancho y offset.

Todos los flujos asincrónicos cubren carga, vacío, error y éxito cuando aplican.

## Responsive

Rangos de validación, no breakpoints obligatorios:

- 320–479 px.
- 480–767 px.
- 768–1023 px.
- 1024–1439 px.
- 1440 px o más.

Elegir breakpoints por quiebre de contenido y preferir defaults de Tailwind. No ocultar información operativa, evitar scroll horizontal global y validar teclado virtual, orientación y zoom 200%.

## Accesibilidad

- HTML semántico antes que ARIA.
- Un `h1` por pantalla y landmarks identificables.
- Foco visible y orden de lectura lógico.
- Nombres accesibles contextualizados para acciones repetidas.
- Texto normal con al menos 4.5:1; texto grande y componentes esenciales con 3:1.
- Color nunca como única señal.
- Objetivos de tamaño suficiente según WCAG 2.2.
- Zoom 200%, lector de pantalla, reduced motion y forced colors en controles críticos.

## Componentes shadcn/ui

Configuración: estilo `new-york`, base Radix, RSC habilitado, Tailwind v4 y alias `@/components/ui`.

Primer lote incorporado:

- Button.
- Field/Input.
- Select.
- Table.
- Badge.
- Alert.
- Skeleton.
- Sonner para Toast.
- AlertDialog para confirmaciones sensibles con foco contenido y retorno al disparador.

La CLI incorporó Label y Separator como dependencias de Field. No crear variantes nuevas sin una necesidad demostrada. Antes de sumar otro componente se documentan necesidad, alternativa, archivos, dependencias, API, límites RSC/Client, bundle y accesibilidad.

## Rendimiento y React

- Server Components por defecto.
- Client Components solo para interacción necesaria.
- No convertir el shell completo en cliente por estilos o tema.
- Minimizar props serializadas y evitar providers globales innecesarios.
- No duplicar sesión, permisos o datos de negocio en Zustand.
- Cargar Kanban y módulos pesados solo en su ruta.
- Paralelizar lecturas independientes y usar Suspense por región útil.
- Reservar geometría para evitar layout shift.
- Medir antes de memoizar o refactorizar.

## Orden de adopción

1. Documentación y fundaciones.
2. Shell y navegación.
3. Autenticación.
4. Gestión de usuarios.
5. Pedidos y Kanban.
6. Detalle.
7. Caja y pagos.
8. Cotizador.
9. Archivo.
10. Regresión integral.

## Validación visual

Viewports mínimos: 320×568, 375×667, 390×844, 768×1024, 1024×768, 1280×720 y 1440×900.

Cubrir default, focus, pending, loading, empty, error, success, disabled, contenido largo y lista extensa. Verificar teclado, lector de pantalla, contraste computado, zoom 200%, reduced motion, overflow, estabilidad visual, límites RSC/Client, hidratación, bundle y regresión visual.

## Anexo A — Tokens provisionales originales

Estos son los valores recibidos antes de los ajustes light documentados. Se conservan como trazabilidad, no como autorización para revertir valores aprobados.

### Light original

```css
:root {
  --background: oklch(0.9841 0.0017 145.5622);
  --foreground: oklch(0.2235 0.0049 145.4099);
  --card: oklch(1.0000 0 0);
  --card-foreground: oklch(0.2235 0.0049 145.4099);
  --popover: oklch(1.0000 0 0);
  --popover-foreground: oklch(0.2235 0.0049 145.4099);
  --primary: oklch(0.5745 0.1033 130.8937);
  --primary-foreground: oklch(1.0000 0 0);
  --secondary: oklch(0.9621 0.0034 145.5491);
  --secondary-foreground: oklch(0.2235 0.0049 145.4099);
  --muted: oklch(0.9621 0.0034 145.5491);
  --muted-foreground: oklch(0.4913 0.0140 145.3581);
  --accent: oklch(0.9220 0.0223 123.6501);
  --accent-foreground: oklch(0.3182 0.0361 127.9930);
  --destructive: oklch(0.5771 0.2152 27.3250);
  --destructive-foreground: oklch(1.0000 0 0);
  --border: oklch(0.9168 0.0034 145.5475);
  --input: oklch(0.9168 0.0034 145.5475);
  --ring: oklch(0.5745 0.1033 130.8937);
  --radius: 0.6rem;
  --tracking-normal: 0.01em;
  --spacing: 0.25rem;
}
```

Charts light: `oklch(0.5745 0.1033 130.8937)`, `oklch(0.4513 0.0680 128.7070)`, `oklch(0.6750 0.0501 127.5916)`, `oklch(0.7948 0.0453 127.2415)` y `oklch(0.8939 0.0277 129.8292)`.

Sombras light originales: x 0, y 2 px, blur 10 px; 2xs/xs con opacidad 0.03; sm a xl con base 0.05 y segundo lóbulo; 2xl con 0.13.

### Dark diferido

```css
.dark {
  --background: oklch(0.1822 0 0);
  --foreground: oklch(0.9328 0.0119 145.4789);
  --card: oklch(0.2264 0 0);
  --card-foreground: oklch(0.9328 0.0119 145.4789);
  --popover: oklch(0.2264 0 0);
  --popover-foreground: oklch(0.9328 0.0119 145.4789);
  --primary: oklch(0.6689 0.1154 130.1150);
  --primary-foreground: oklch(0.1822 0 0);
  --secondary: oklch(0.2727 0.0070 145.3813);
  --secondary-foreground: oklch(0.9328 0.0119 145.4789);
  --muted: oklch(0.2727 0.0070 145.3813);
  --muted-foreground: oklch(0.6969 0.0201 145.3548);
  --accent: oklch(0.3316 0.0154 145.2173);
  --accent-foreground: oklch(0.9328 0.0119 145.4789);
  --destructive: oklch(0.4437 0.1613 26.8994);
  --destructive-foreground: oklch(0.9356 0.0309 17.7172);
  --border: oklch(0.2850 0 0);
  --input: oklch(0.2850 0 0);
  --ring: oklch(0.6689 0.1154 130.1150);
  --sidebar: oklch(0.2090 0 0);
  --sidebar-foreground: oklch(0.9328 0.0119 145.4789);
  --sidebar-primary: oklch(0.6689 0.1154 130.1150);
  --sidebar-primary-foreground: oklch(0.1822 0 0);
  --sidebar-accent: oklch(0.2727 0.0070 145.3813);
  --sidebar-accent-foreground: oklch(0.9328 0.0119 145.4789);
  --sidebar-border: oklch(0.2850 0 0);
  --sidebar-ring: oklch(0.6689 0.1154 130.1150);
}
```

Charts dark: `oklch(0.6689 0.1154 130.1150)`, `oklch(0.7390 0.0564 123.8131)`, `oklch(0.5612 0.0784 143.8914)`, `oklch(0.4347 0.0569 149.4401)` y `oklch(0.3986 0.0387 162.2613)`.

Sombras dark originales: x 0, y 4 px, blur 20 px; 2xs/xs con opacidad 0.20; sm a xl con 0.40; 2xl con 1.00. Estos valores deben reducirse y medirse antes de una implementación dark.

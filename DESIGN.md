---
name: Digraf
description: Sistema visual operativo para la gestion interna de una grafica textil.
colors:
  background: "oklch(0.975 0.006 95)"
  card: "#FFFFFF"
  popover: "#FFFFFF"
  primary: "oklch(0.54 0.1033 130.8937)"
  input: "oklch(0.65 0.015 145.5)"
  ring: "oklch(0.5745 0.1033 130.8937)"
  success-background: "oklch(0.92 0.04 145)"
  success-foreground: "oklch(0.34 0.09 145)"
  warning-background: "oklch(0.94 0.05 85)"
  warning-foreground: "oklch(0.35 0.09 65)"
  info-background: "oklch(0.93 0.035 240)"
  info-foreground: "oklch(0.35 0.08 245)"
  error: "oklch(0.5771 0.2152 27.325)"
typography:
  body:
    fontFamily: "Outfit"
    letterSpacing: "normal"
  data:
    fontFamily: "JetBrains Mono"
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
rounded:
  base: "0.6rem"
spacing:
  base: "0.25rem"
---

# Design System: Digraf

## Overview

**Creative North Star: "Registro de taller"**

Digraf es una aplicacion interna, light y operativa. La interfaz expresa trazabilidad mediante estructura, alineacion, ritmo y estados explicitos; prioriza claridad, velocidad de lectura y accion, accesibilidad, densidad controlada, consistencia y personalidad visual sobria.

La jerarquia responde a las tareas reales, no al impacto promocional. La referencia visual principal es `docs/brand/references/`: sus capturas se reproducen con alta fidelidad en composicion, proporciones, densidad, espaciado, bordes, radios, navegacion, tablas y componentes. La evolucion es gradual; no reemplaza el sistema existente ni crea modulos, metricas o funcionalidades inexistentes.

## Brand Assets

El favicon usa `public/brand/digraf-favicon.png`, una variante transparente derivada de `public/brand/digraf-mark.png`. Los lockups visibles usan `public/brand/digraf-logo.png` junto con el nombre de Digraf y la leyenda operativa en Outfit. Los activos se mantienen sin deformar ni recolorear.

**Key Characteristics:**
- Operativa, profesional y agil.
- Estructura y estados reales antes que decoracion.
- Superficies diferenciadas por fondo y borde; elevacion solo cuando corresponde.
- Verde concentrado en accion principal, seleccion y foco.

## Colors

La paleta light usa neutrales suaves para continuidad del shell y blanco para superficies contenidas; el verde tiene significado funcional, no decorativo.

### Primary
- **Verde operativo:** accion principal, seleccion fuerte y foco visible.

### Neutral
- **Canvas y shell:** canvas, sidebar y cabecera mobile comparten el fondo claro; cards y popovers permanecen blancos.
- **Limites de control:** los inputs conservan un borde visible para no depender solamente del fondo.

### Named Rules
**The Semantic Feedback Rule.** `primary` no significa exito; `destructive` representa acciones de riesgo y `error` fallos o validacion. Los estados de negocio conservan badges propios y nunca se deducen automaticamente del color de feedback.

**The Explicit State Rule.** El color nunca es la unica senal: alertas, mensajes, navegacion, foco y estados incluyen texto, posicion, icono o foco cuando corresponde.

## Typography

**Body Font:** Outfit.
**Label/Mono Font:** JetBrains Mono.

**Character:** Outfit sostiene interfaz, navegacion, formularios, cuerpo y labels. JetBrains Mono distingue IDs, importes, fechas, estados y datos operativos compactos sin invadir instrucciones o texto largo.

### Hierarchy
- **Page titles:** Outfit con `tracking-display` moderado.
- **Section titles:** Outfit con tracking normal.
- **Body and labels:** Outfit con tracking normal.
- **Short uppercase labels:** Outfit con `tracking-label` positivo y controlado.
- **Operational data:** JetBrains Mono con `tracking-data` normal y numeros tabulares para importes, cantidades comparables, fechas, horas, totales e IDs.

**The Operational Data Rule.** Los importes y columnas numericas se alinean a la derecha y no se parten. No se aplica letter spacing global, uppercase a texto largo ni tipografia mono a instrucciones.

## Layout

La escala de espaciado usa multiplos de `0.25rem`. La densidad permite escanear informacion sin comprometer legibilidad, objetivos tactiles ni acciones inequivocas. Las acciones frecuentes apuntan a 40 px en escritorio y 44 px en superficies tactiles cuando la densidad lo permite.

El shell autenticado usa sidebar compacto con destinos reales y autorizados. En mobile conserva acceso equivalente; cuando no entran en una fila, la navegacion puede organizarse en una cuadricula compacta de dos columnas sin crear un drawer nuevo ni ocultar informacion operativa.

Los rangos de validacion son 320-479 px, 480-767 px, 768-1023 px, 1024-1439 px y 1440 px o mas. Los quiebres responden al contenido; se evita el scroll horizontal global y se valida zoom al 200 %, teclado virtual y orientacion.

## Elevation & Depth

La profundidad es funcional y sobria. Las superficies se separan primero por fondo y borde; cards normales usan sombra minima o nula. Popovers, dialogos y drag preview pueden usar elevacion real. Las sombras dark quedan diferidas junto con todo dark mode.

**The Structural Elevation Rule.** La sombra representa elevacion real, no decoracion; no se usan texturas, costuras simuladas, papel, sellos, rusticidad ni decoracion industrial.

## Shapes

Las formas son suavemente redondeadas con radio base de `0.6rem` y sus derivados de Tailwind. Los bordes estructuran cards, campos y superficies contenidas. La consistencia de radios, bordes y densidad sigue las capturas de referencia aprobadas.

## Components

### Buttons
- **Character:** acciones operativas explicitas y estables.
- **Primary:** reserva el verde para la accion principal.
- **States:** todo control distingue hover, active, focus-visible, disabled y pending cuando aplica. Pending conserva etiqueta y geometria, bloquea repeticiones y usa `aria-busy` cuando corresponde.
- **Focus:** ring opaco de 2 px con offset de 2 px, sin animacion.

### Cards / Containers
- **Corner Style:** radio base y derivados consistentes.
- **Background:** cards y popovers blancos sobre canvas y shell claros.
- **Shadow Strategy:** borde por defecto y sombra minima; elevacion solo en superficies flotantes o drag preview.
- **Usage:** una card agrupa solo cuando aporta significado; no se envuelve cada bloque en una card.

### Inputs / Fields
- **Style:** label persistente, control, ayuda cuando corresponde y error especifico asociado mediante `aria-describedby`.
- **Focus:** ring opaco de 2 px con offset de 2 px; no se usa un ring translucido como unica senal.
- **Error / Disabled:** el control invalido usa `aria-invalid` y el field `data-invalid`; los datos se conservan ante errores recuperables y disabled mantiene legibilidad.

### Navigation
- **Style:** sidebar compacto con identidad de sesion, destinos reales y autorizados, texto y posicion de la seccion activa junto con una linea de registro.
- **States:** no depende solo del color; los permisos visibles no sustituyen autorizacion de servidor.

### Badges, Alerts and Toast
- **Badges:** texto breve y explicito; JetBrains Mono para datos operativos; estado, pago y entrega se mantienen separados.
- **Alerts:** comunican que ocurrio y el siguiente paso; success usa el vocabulario de la accion, warning su consecuencia e info contexto neutral.
- **Toast:** Sonner en modo light confirma mutaciones, pero nunca es el unico registro de un resultado sensible.

## Do's and Don'ts

### Do:
- **Do** reproducir con alta fidelidad la composicion y componentes de `docs/brand/references/`, adaptados solo a contenido y acciones reales.
- **Do** usar HTML semantico, un `h1` por pantalla, foco visible, contraste suficiente y una alternativa completa al drag and drop.
- **Do** mantener estados loading, empty, error, success, disabled y pending cuando apliquen.
- **Do** usar Lucide React para iconos de interfaz y mantener texto visible en acciones ambiguas, operativas o sensibles.
- **Do** limitar el movimiento a transiciones funcionales de 150 ms en controles y hasta 200 ms en overlays, toasts y reordenamientos; respetar `prefers-reduced-motion`.

### Don't:
- **Don't** agregar dark mode, selector `.dark`, toggle, provider de tema ni validacion duplicada.
- **Don't** inventar metricas, graficos, modulos, rutas, marcas, logos, datos, textos o funcionalidades para completar una composicion.
- **Don't** usar el nombre textual como reemplazo del logo oficial, ni reconstruir, deformar, recolorear o decorar los activos entregados.
- **Don't** ocultar informacion operativa, depender solo del color, usar placeholders como unico label o reducir targets por densidad.
- **Don't** mezclar librerias de iconos, emojis o SVGs personalizados de interfaz.

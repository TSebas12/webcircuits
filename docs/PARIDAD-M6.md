# Paridad M6 — Personalización, colores y temas

> Hito **M6** (20/20). Documenta cómo funciona el tema, qué se puede cambiar y qué queda
> pendiente. El detalle de cada paso está en `PASOS.md`; el seguimiento, en `TODO.md`.

## Qué hay

| Pieza | Dónde | Qué hace |
|---|---|---|
| Catálogo de tokens | `src/core/theme/tokens.ts` | Lista única de todo lo que un tema puede cambiar |
| Modelo de tema | `src/core/theme/theme.ts` | `Theme` serializable, validación, serialización y `cssVarsFor` |
| Presets | `src/core/theme/presets.ts` | Claro, Oscuro, Alto contraste, Daltónico, Monocromo |
| Contraste WCAG | `src/core/theme/contrast.ts` | Luminancia, ratio y umbrales AA/AAA |
| Aplicación | `src/app/theme.ts` | Resuelve la elección y vuelca el tema al documento |
| Puente al canvas | `src/render/theme-bridge.ts` | Lee las variables ya calculadas y las convierte en `RenderTheme` |
| Selector | `src/app/SettingsPanel.svelte` | Automático + los 5 presets + el tema propio |
| Editor visual | `src/app/ThemeEditor.svelte` | Edita cada token con vista previa en vivo |
| Color por cable | `src/app/Inspector.svelte` | Selector de color para el cable seleccionado |

## Cómo se aplica un tema

1. `app/theme.ts` resuelve la elección a un `Theme`.
2. Escribe **todas** sus variables CSS como estilo en línea en `<html>`.
3. Ajusta `data-theme` (`light`/`dark`) y `color-scheme` para los controles nativos.
4. `theme-bridge.ts` detecta el cambio (`MutationObserver` sobre `style`), relee las
   variables y repinta el canvas.

Las reglas de `app.css` son el **respaldo** previo a que arranque JavaScript: `:root` para
claro y `[data-theme='dark']` para oscuro. La fuente de verdad de los colores son los
presets de `core/theme/presets.ts`; el script anti-destello de `index.html` solo decide
`light`/`dark` para no enseñar un fogonazo.

## Tokens

`--wc-*` es lo que consume el canvas; el resto es cromo de la interfaz.

| Grupo | Tokens |
|---|---|
| Lienzo | `canvas.background`, `canvas.grid`, `canvas.gridStrong` |
| Cables | `wire.idle`, `wire.high`, `wire.low`, `wire.floating`, `wire.bus`, `wire.selected` |
| Compuertas | `gate.fill`, `gate.stroke`, `gate.text`, `gate.error` |
| Estados | `state.off`, `state.zero`, `state.one` |
| Interacción | `interaction.selection`, `interaction.hover`, `interaction.pinDot`, `interaction.handle` |
| Interfaz | `ui.bg`, `ui.fg`, `ui.fgMuted`, `ui.panel`, `ui.panelHover`, `ui.border`, `ui.accent`, `ui.accentFg` |
| Tipografía | `font.sans`, `font.mono`, `font.baseSize` |

### Semántica del dibujado

- **Cable**: seleccionado > hover > color propio > bus > señal (`high`/`low`/`floating`) >
  reposo.
- **Flotante**: además del color, va **discontinuo** (no depende solo del color).
- **Bus**: color propio y **2,5×** de grosor.
- **Selección**: el símbolo o cable se perfila con `interaction.selection`; un cable
  seleccionado enseña tiradores en las puntas (`interaction.handle`).

## Presets

| Preset | Base | Idea |
|---|---|---|
| ☀️ Claro | light | El de trabajo por defecto |
| 🌙 Oscuro | dark | Para poca luz |
| 🔲 Alto contraste | dark | Negro/blanco/amarillo; texto a 21:1 |
| 👁️ Daltónico | light | Okabe-Ito: azul/naranja en vez de rojo/verde |
| 🖨️ Monocromo | light | Solo grises, para imprimir |

`M6-19` comprueba en tests que **todos** cumplen AA en el texto de la interfaz, en el de
las compuertas y en el texto sobre el acento, y 3:1 entre cable y lienzo.

## Tema propio

- **Preferencias → Editar tema…** abre el editor.
- Se parte del tema que esté puesto (preset resuelto o el propio).
- Cada cambio se ve al momento en la interfaz y en el lienzo.
- **Guardar tema** lo conserva como `custom` en `localStorage` (`wc-theme-custom`).
- **Importar… / Exportar…** usan el mismo proveedor de ficheros que el resto de la app y
  el formato `.theme.json` (`format: "webcircuits-theme"`, `formatVersion: 1`).
- Un fichero con tokens desconocidos o incompletos se tolera: los desconocidos se ignoran
  y los que faltan se rellenan con el tema claro.

## Color por cable

- El inspector del cable permite fijar un color solo para ese cable (`wire.color`).
- En **modo cableado** (W) la barra superior ofrece la paleta rápida: cinco colores y
  «quitar color». El elegido se marca con un anillo y un halo, para que se vea aunque el
  color sea claro u oscuro.
- Se guarda en el **JSON nativo** y entra en el historial (deshacer lo revierte).
- **No** se exporta al `.CircuitProject` XML del original: su formato no tiene ese campo.
  Es una extensión web, igual que las capas.
- «Color del tema» borra el color propio y devuelve el cable a la regla por estado.

## Sistema

- `auto` sigue `prefers-color-scheme` y se actualiza si el sistema cambia.
- `prefers-reduced-motion` ya desactiva animaciones en `app.css`.
- El editor de temas y el selector no dependen del sistema: si el usuario elige un preset,
  manda el usuario.

## Cero colores a pelo

`tests/unit/theme-hardcoded.test.ts` recorre todo `src/` y falla si encuentra un color
hexadecimal fuera de:

- `core/theme/presets.ts` (donde viven los colores de fábrica),
- `app.css` (respaldo anti-destello),
- `render/theme-bridge.ts` (valores de emergencia),
- `core/model/diagram.ts` (gris por defecto de una **capa**, que es dato del usuario).

Los comentarios se ignoran para no confundir un `#ff0000` explicativo con un color real.

## Límites conocidos

- `gate.text` **sí se consume**: es el color de las etiquetas del canvas (pines, constantes,
  subcircuitos, notación de sensores y RAM/ROM de las memorias). `gate.error` sigue en el
  catálogo sin uso: no hay un estado de error por dispositivo.
- La **densidad** de la rejilla es automática (LOD): el token controla el color, no cuántos
  puntos se dibujan. La visibilidad sigue en Preferencias.
- La tipografía se aplica al cromo. Las etiquetas del canvas usan `system-ui` directamente,
  así que `font.sans`/`font.baseSize` todavía no cambian el texto de los símbolos.
- El color propio de un cable no viaja al XML del original (ver arriba).

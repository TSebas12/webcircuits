# WebCircuits

Simulador de circuitos lógicos digitales **en el navegador**.

Reescritura web de [LogicCircuit](https://www.logiccircuit.org) (C#/WPF), con **capas**,
**temas y colores personalizables** y gestión de archivos propia del navegador.

<!-- Cuando haya una captura decente: ![WebCircuits](docs/captura.png) -->

> **En construcción.** 168 de 258 pasos hechos (65 %). La app ya sirve para dibujar,
> guardar y simular circuitos de varios niveles, con capas, temas, buses visuales y tablas
> de verdad; quedan los buses cómodos, la síntesis, la exportación y el pulido. Ver
> [Estado](#estado).

## Estado

**M1 · Slice vertical** ✅ — el camino de datos funciona de punta a punta: colocar,
cablear, pulsar un interruptor y ver el LED encenderse. A partir de ahí se han ido
añadiendo el resto de piezas, la persistencia, la jerarquía y la instrumentación.

Lo que ya funciona:

- Lienzo con rejilla, desplazamiento y zoom de **0,1× a 3×** anclado al cursor
- Paleta de **23 piezas**: compuertas, tri-estado, reloj, LED, display de 7 segmentos,
  sonda, sensor, memoria RAM/ROM, altavoz, interruptor, pines, constantes y repartidores
- Seleccionar, arrastrar, copiar/pegar, borrar y deshacer/rehacer, con ajuste a la rejilla
- Cableado arrastrando desde un pin (`Esc` cancela), con **buses multi-bit**, uniones,
  colores por cable y modo cableado (W)
- **Buses visuales**: seleccionar varios cables con `Ctrl`/`Cmd`+clic y agruparlos, con
  asignación automática de bits; el bus se pliega en una línea y se puede desagrupar
- Motor con compuertas, reloj, memoria (lectura/escritura por flanco), sensores, sondas,
  interruptores y **subcircuitos jerárquicos**
- Guardar y abrir `.CircuitProject` (XML) y JSON nativo, con archivos recientes
- **Capas**: crear, ocultar, bloquear y ajustar opacidad
- **Temas**: claro, oscuro, alto contraste, daltónico, monocromo y editor propio
- **Tabla de verdad** con filtro, inversión, bus multi-bit, subcircuitos y exportación CSV/HTML
- Ejemplos con vista previa, notas y marcadores persistentes

Lo que todavía **no** funciona, y en qué hito llega:

- Las **matrices gráfica y de LED** tienen modelo, persistencia y silueta, pero aún no
  tienen pines ni función de simulación; no se ofrecen en la paleta (M3/M11)
- La **nota de texto** se conserva al abrir un archivo, pero el lienzo no la pinta
- El **altavoz** es solo un indicador visual; el audio real llega con M11
- **Buses cómodos** (M3B-02..09: rutado, etiquetas, plegado configurable, inspector y
  splitters), biblioteca de subcircuitos (M4C), síntesis desde tabla de verdad (M8B),
  export Verilog (M9), scripting Python (M10) y modo didáctico (M11B)
- Los **retardos de propagación** tienen módulos y pruebas (M7B), pero aún no están
  integrados en el `CircuitRunner`; la integración y el rendimiento llegan con M12

**Calidad (2026-10-22):** `npm run check` sin errores ni avisos, `lint` limpio, **600 tests**
verdes y `build` correcto. El oráculo C# queda en **174/179**: 3 fallos de cultura y 2 de
rendimiento bajo carga, explicados en `docs/BASELINE-TESTS.md`.

## Probar

Requiere **Node.js 22+** (probado con 22.18.0) y **npm 10+**.

```bash
npm install
npm run dev
```

Y abrir <http://localhost:5173>. El botón **Ejemplo** coloca dos interruptores, una AND y un
LED ya cableados: pulsando los interruptores se enciende el LED.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (<http://localhost:5173>) |
| `npm run build` | Compila a `dist/` |
| `npm run preview` | Sirve lo compilado |
| `npm run check` | Comprueba tipos (svelte-check + tsc) |
| `npm run lint` | Análisis estático (ESLint) |
| `npm run format` | Formatea el código (Prettier) |
| `npm run test` | Tests (Vitest) |
| `npm run test:ui` | Tests con interfaz gráfica |

## Arquitectura

```
src/core/     dominio puro: modelo, simulación, persistencia. CERO navegador
src/render/   dibujado en Canvas 2D
src/app/      interfaz (Svelte)
src/worker/   simulación en Web Worker
src/i18n/     reservado para traducciones (M11)
tests/unit/   tests
bench/        mediciones de rendimiento
```

> **Regla de oro:** `src/core/` **nunca** importa de `render/`, `app/` ni `worker/`.
> Si `src/core/` menciona `window` o `document`, la arquitectura está rota.

Dos ideas que explican casi todo el diseño:

- **El modelo va en unidades de rejilla, no en píxeles.** El lienzo se dibuja bajo una única
  transformación, así que un símbolo se define una vez y sirve para cualquier zoom.
- **El renderizador no conoce el modelo.** Sólo recibe una escena ya resuelta, de modo que
  Canvas 2D se pueda cambiar por WebGL más adelante sin tocar el dominio.

Criterio de fidelidad, que se aplica en cada decisión:

| Interno (fiel al original) | Interfaz (libre) |
|---|---|
| Modelo de datos, simulación, formato `.CircuitProject`, geometría de la rejilla, semántica de pines y compuertas | Colores, tipografías, paneles, menús, iconos y animaciones |

## Roadmap

258 pasos repartidos en 18 hitos. Los marcados como **nuevos** no existen en el original; los
marcados como **diferenciador** son las funciones con las que este proyecto pretende aportar
algo que el original no tiene.

| Hito | Qué | Pasos | Estado |
|---|---|---|---|
| M0 | Preparación: andamiaje y línea base del original | 12 | ✅ |
| M1 | Slice vertical: colocar, cablear y simular | 15 | ✅ |
| M2 | Motor y edición básica | 30 | 🟡 (29/30) |
| M3 | Jerarquía y buses | 16 | ✅ |
| M3B | Buses excelentes · *diferenciador* | 9 | ⬜ |
| M4 | Persistencia y archivos (web) | 24 | 🟡 (19/24) |
| M4C | Biblioteca de subcircuitos · *nuevo* | 7 | ⬜ |
| M5 | Capas · *nuevo* | 23 | 🟡 (21/23) |
| M6 | Personalización, colores y temas · *nuevo* | 20 | ✅ |
| M7 | Instrumentación | 12 | ✅ |
| M7B | Retardos de propagación y análisis de tiempo · *diferenciador* | 13 | ✅ (módulos; integración en M12) |
| M8 | Tablas de verdad | 10 | ✅ |
| M8B | Síntesis: tabla de verdad → circuito · *nuevo* | 8 | ⬜ |
| M9 | Export Verilog | 10 | ⬜ |
| M10 | Scripting Python | 8 | ⬜ |
| M11 | Pulido y extras | 18 | ⬜ |
| M11B | Modo didáctico · *nuevo* | 9 | ⬜ |
| M12 | Rendimiento y despliegue | 14 | ⬜ |
| | **Total** | **258** | **167 (65 %)** |

## Licencia y atribución

Este proyecto **porta funcionalidad de LogicCircuit** (© LogicCircuit.org), bajo
**Apache License 2.0**:

- [`LICENSE`](LICENSE) — el texto completo de la licencia
- [`NOTICE`](NOTICE) — el copyright de la obra original y la declaración de cambios
- [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md) — de dónde viene cada cosa y las
  dependencias con sus licencias

El nombre «WebCircuits» es propio, porque Apache 2.0 no concede derechos de marca.

Para saber hasta qué punto esto se comporta como el original, y qué desviaciones son
deliberadas: [`docs/PARIDAD.md`](docs/PARIDAD.md).

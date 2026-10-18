# WebCircuits

Simulador de circuitos lógicos digitales **en el navegador**.

Reescritura web de [LogicCircuit](https://www.logiccircuit.org) (C#/WPF), con **capas**,
**temas y colores personalizables** y gestión de archivos propia del navegador.

<!-- Cuando haya una captura decente: ![WebCircuits](docs/captura.png) -->

> **En construcción.** 27 de 258 pasos hechos (10 %). Ya funciona un circuito pequeño de
> punta a punta, pero esto todavía **no sirve para trabajar en serio**: faltan compuertas,
> guardar y abrir circuitos, y el motor completo. Ver [Estado](#estado).

## Estado

**M1 · Slice vertical** ✅ — se pueden colocar interruptores, una compuerta AND y un LED,
cablearlos con el ratón, pulsarlos y ver el LED encenderse. Eso es todo el camino de datos
funcionando de punta a punta.

Lo que ya funciona:

- Lienzo con rejilla, desplazamiento y zoom de **0,1× a 3×** anclado al cursor
- Colocar interruptores, compuertas AND y LEDs
- Seleccionar, arrastrar y borrar, con ajuste a la rejilla
- Cablear arrastrando desde un pin (`Esc` cancela)
- El motor evalúa AND, OR, XOR y NOT, con salidas invertidas incluidas (ojo: hoy sólo la
  AND se puede colocar desde la barra)
- Apagar el circuito entero (en el original, *Circuito → Encender*)
- Tema claro, oscuro o automático, con memoria

Lo que todavía **no** funciona, y en qué hito llega:

- Sólo hay tres símbolos; el resto de compuertas y la edición completa son M2
- No se pueden guardar ni abrir circuitos (M4)
- No hay capas (M5) ni temas propios (M6)
- El motor no detecta conflictos ni simula retardos de propagación (M2 y M7B)

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
src/i18n/     traducciones
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
| M2 | Motor y edición básica | 30 | ⬜ |
| M3 | Jerarquía y buses | 16 | ⬜ |
| M3B | Buses excelentes · *diferenciador* | 9 | ⬜ |
| M4 | Persistencia y archivos (web) | 24 | ⬜ |
| M4C | Biblioteca de subcircuitos · *nuevo* | 7 | ⬜ |
| M5 | Capas · *nuevo* | 23 | ⬜ |
| M6 | Personalización, colores y temas · *nuevo* | 20 | ⬜ |
| M7 | Instrumentación | 12 | ⬜ |
| M7B | Retardos de propagación y análisis de tiempo · *diferenciador* | 13 | ⬜ |
| M8 | Tablas de verdad | 10 | ⬜ |
| M8B | Síntesis: tabla de verdad → circuito · *nuevo* | 8 | ⬜ |
| M9 | Export Verilog | 10 | ⬜ |
| M10 | Scripting Python | 8 | ⬜ |
| M11 | Pulido y extras | 18 | ⬜ |
| M11B | Modo didáctico · *nuevo* | 9 | ⬜ |
| M12 | Rendimiento y despliegue | 14 | ⬜ |
| | **Total** | **258** | **27 (10 %)** |

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

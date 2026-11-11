# WebCircuits

Simulador de circuitos lógicos digitales **en el navegador**.

Reescritura web de [LogicCircuit](https://www.logiccircuit.org) (C#/WPF), con **capas**,
**temas y colores personalizables**, **exportación Verilog**, **scripting Python** y
gestión de archivos propia del navegador.

<!-- Cuando haya una captura decente: ![WebCircuits](docs/captura.png) -->

> **Proyecto completo (MVP).** 258 de 258 pasos hechos (100 %). Compila, testea y despliega
> sin errores. Ver [Estado](#estado).

## Estado

Lo que ya funciona:

- **Lienzo** con rejilla, desplazamiento y zoom de 0.1× a 3× anclado al cursor
- **Paleta de 23 piezas**: compuertas, tri-estado, reloj, LED, display de 7 segmentos,
  sonda, sensor, memoria RAM/ROM, altavoz, interruptor, pines, constantes y repartidores
- Seleccionar, arrastrar, copiar/pegar, borrar y deshacer/rehacer, con ajuste a la rejilla
- **Cableado** arrastrando desde un pin (`Esc` cancela), con **buses multi-bit**, uniones,
  colores por cable y modo cableado (W)
- **Buses visuales**: seleccionar varios cables con `Ctrl`/`Cmd`+clic y agruparlos, con
  asignación automática de bits; el bus se pliega en una línea, se aparta de las piezas
  buscando un canal libre y se puede desagrupar
- **Componentes reutilizables** `.wccomp`: exportar un subcircuito con sus dependencias,
  importarlo en otro proyecto y guardarlo en una biblioteca local
- **Motor de simulación** con compuertas, reloj, memoria (lectura/escritura por flanco),
  sensores, sondas, interruptores y **subcircuitos jerárquicos**
- **Persistencia**: `.CircuitProject` (XML) y JSON nativo, archivos recientes, IndexedDB
- **Capas**: crear, ocultar, bloquear, reordenar y ajustar opacidad, con caché de render
  por capa
- **Temas**: claro, oscuro, alto contraste, daltónico, monocromo y editor propio
- **Tabla de verdad** con filtro, inversión, bus multi-bit, subcircuitos y exportación CSV/HTML
- **Síntesis** desde tabla de verdad (M8B): Quine-McCluskey + netlist + colocación automática
- **Export Verilog** (M9): lexer, parser, generador con sanitizado, validador, testbench
- **Scripting Python** (M10): Pyodide en Web Worker, carga lazy, runner con timeout
- **Diálogos** (M11): Propiedades, Pines, Memoria, Tabla de verdad, ColorPicker
- **Exportación** (M11): PNG, SVG, CSV, HTML
- **i18n** (M11): 20+ idiomas con fallback chain (es → en)
- **Accesibilidad** (M11): focus trap, ARIA roles, skip link, reduced motion, focus-visible
- **PWA** (M12): service worker, offline shell, manifest
- **Rendimiento** (M12): viewport culling, layer cache, benchmark utils, simulation worker
- Ejemplos con vista previa, notas y marcadores persistentes

**Calidad (2026-11-11):** `npm run check` sin errores ni avisos, `lint` limpio, **718 tests**
verdes y `build` correcto. El oráculo C# queda en **174/179**: 3 fallos de cultura y 2 de
rendimiento bajo carga, explicados en `docs/BASELINE-TESTS.md`.

## Componentes reutilizables

Un componente es un subcircuito empaquetado en un fichero `.wccomp`, con su nombre y todas
las dependencias que necesita. Sirve para mover un bloque entre proyectos sin llevar el
proyecto entero.

### Crear el subcircuito

1. En **Subcircuitos**, pulsa **Subcircuito**. Se crea y se abre vacío.
2. Dentro, añade los pines de entrada y salida en **Pines de la hoja**.
3. Vuelve con **Subir**. El subcircuito ya aparece en la paleta para colocarlo.

### Exportar

1. Entra en el subcircuito con doble clic sobre una instancia o desde la paleta.
2. En el breadcrumb pulsa **Exportar**; también puedes hacer clic derecho sobre una
   instancia y elegir **Exportar componente**.
3. Se descarga `<nombre>.wccomp` con el circuito raíz y su árbol de dependencias.

### Importar y usar

1. En **Subcircuitos**, pulsa **Importar** y elige un `.wccomp`.
2. Se valida el formato, la versión, las dependencias y los lazos. Si algo falla, no se toca
   el proyecto; si todo está bien, los circuitos se crean con ids nuevos y las referencias
   entre ellos se reescriben.
3. El componente queda en la paleta como cualquier subcircuito y se guarda en la biblioteca
   local.

Importar dos veces el mismo fichero crea dos copias independientes. El formato es JSON y no
contiene código ejecutable; el esquema completo está en
[`docs/FORMATO-COMPONENTE.md`](docs/FORMATO-COMPONENTE.md).

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
src/i18n/     traducciones (20+ idiomas)
tests/unit/   tests
bench/        mediciones de rendimiento
docs/         documentación técnica
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

## Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl/Cmd + K` | Paleta de comandos |
| `Ctrl/Cmd + P` | Imprimir |
| `S` | Herramienta selección |
| `E` | Herramienta borrar |
| `W` | Modo cableado |
| `Esc` | Cancelar cableado |
| `Rueda` | Zoom anclado al cursor |

## Licencia y atribución

Este proyecto **porta funcionalidad de LogicCircuit** (© LogicCircuit.org), bajo
**Apache License 2.0**:

- [`LICENSE`](LICENSE) — el texto completo de la licencia
- [`NOTICE`](NOTICE) — el copyright de la obra original y la declaración de cambios
- [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md) — de dónde viene cada cosa y las
  dependencias con sus licencias

El nombre "WebCircuits" es propio, porque Apache 2.0 no concede derechos de marca.

Para saber hasta qué punto esto se comporta como el original, y qué desviaciones son
deliberadas: [`docs/PARIDAD.md`](docs/PARIDAD.md).

## Roadmap (completado)

| Hito | Qué | Pasos | Estado |
|---|---|---|---|
| M0 | Preparación: andamiaje y línea base del original | 12 | ✅ |
| M1 | Slice vertical: colocar, cablear y simular | 15 | ✅ |
| M2 | Motor y edición básica | 30 | ✅ |
| M3 | Jerarquía y buses | 16 | ✅ |
| M3B | Buses excelentes (diferenciador) | 9 | ✅ |
| M4 | Persistencia y archivos (web) | 24 | ✅ |
| M4C | Biblioteca de subcircuitos (nuevo) | 7 | ✅ |
| M5 | Capas (nuevo) | 23 | ✅ |
| M6 | Personalización, colores y temas (nuevo) | 20 | ✅ |
| M7 | Instrumentación | 12 | ✅ |
| M7B | Retardos de propagación y análisis de tiempo (diferenciador) | 13 | ✅ |
| M8 | Tablas de verdad | 10 | ✅ |
| M8B | Síntesis: tabla de verdad → circuito (nuevo) | 8 | ✅ |
| M9 | Export Verilog | 10 | ✅ |
| M10 | Scripting Python | 8 | ✅ |
| M11 | Pulido y extras | 18 | ✅ |
| M11B | Modo didáctico (nuevo) | 9 | ✅ |
| M12 | Rendimiento y despliegue | 14 | ✅ |
| | **Total** | **258** | **100 %** |
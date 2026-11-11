# WebCircuits

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org)
[![Tests](https://img.shields.io/badge/tests-718%20passing-brightgreen.svg)]()

Simulador de circuitos lógicos digitales **en el navegador**.

Reescritura web de [LogicCircuit](https://www.logiccircuit.org) (C#/WPF), con **capas**,
**temas personalizables**, **exportación Verilog**, **scripting Python** y gestión de
archivos propia del navegador.

<!-- Cuando haya una captura decente: ![WebCircuits](docs/captura.png) -->

## ✨ Características

- **Lienzo interactivo** — rejilla, zoom (0.1×–3×), desplazamiento, ajuste a rejilla
- **23 piezas** — compuertas, tri-estado, reloj, LED, display 7-seg, sonda, sensor,
  memoria RAM/ROM, altavoz, interruptor, pines, constantes y repartidores
- **Cableado** arrastrando entre pines, con **buses multi-bit**, uniones y colores por cable
- **Buses visuales** — agrupar cables, pliegue automático, desagrupar
- **Componentes reutilizables** `.wccomp` — exportar/importar subcircuitos con dependencias
- **Motor de simulación** — compuertas, reloj, memoria, sensores, sondas, subcircuitos jerárquicos
- **Persistencia** — `.CircuitProject` (XML), JSON nativo, IndexedDB, archivos recientes
- **Capas** — crear, ocultar, bloquear, reordenar, opacidad, caché de render por capa
- **Temas** — claro, oscuro, alto contraste, daltónico, monocromo y editor propio
- **Tabla de verdad** — filtro, inversión, bus multi-bit, subcircuitos, export CSV/HTML
- **Síntesis** — tabla de verdad → circuito (Quine-McCluskey + netlist)
- **Export Verilog** — lexer, parser, generador sanitizado, validador, testbench
- **Scripting Python** — Pyodide en Web Worker, carga lazy, runner con timeout
- **Diálogos** — propiedades, pines, memoria, tabla de verdad, color picker
- **Exportación** — PNG, SVG, CSV, HTML
- **i18n** — 20+ idiomas con fallback automático
- **Accesibilidad** — focus trap, ARIA roles, skip link, reduced motion, focus-visible
- **PWA** — service worker, offline shell, manifest
- **Rendimiento** — viewport culling, layer cache, benchmark utils, simulation worker

## 🚀 Probar

Requiere **Node.js 22+** y **npm 10+**.

```bash
npm install
npm run dev
```

Abrir <http://localhost:5173>. El botón **Ejemplo** coloca dos interruptores, una AND y un
LED ya cableados.

## ⌨️ Atajos de teclado

| Atajo | Acción |
|-------|--------|
| `Ctrl/Cmd + K` | Paleta de comandos |
| `Ctrl/Cmd + P` | Imprimir |
| `S` | Herramienta selección |
| `E` | Herramienta borrar |
| `W` | Modo cableado |
| `Esc` | Cancelar cableado |
| `Rueda` | Zoom anclado al cursor |

## 🏗️ Arquitectura

```
src/core/     dominio puro: modelo, simulación, persistencia (CERO navegador)
src/render/   dibujado en Canvas 2D
src/app/      interfaz (Svelte)
src/worker/   simulación en Web Worker
src/i18n/     traducciones (20+ idiomas)
tests/unit/   tests
docs/         documentación técnica
```

> **Regla de oro:** `src/core/` nunca importa de `render/`, `app/` ni `worker/`.

## 🧪 Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compila a `dist/` |
| `npm run preview` | Sirve lo compilado |
| `npm run check` | Comprueba tipos |
| `npm run lint` | Análisis estático |
| `npm run format` | Formatea el código |
| `npm run test` | Tests (Vitest) |
| `npm run test:ui` | Tests con interfaz gráfica |

## 📚 Documentación

| Archivo | Descripción |
|---------|-------------|
| [`docs/PARIDAD.md`](docs/PARIDAD.md) | Contrato de paridad con el original |
| [`docs/PYTHON.md`](docs/PYTHON.md) | Scripting Python vs IronPython |
| [`docs/I18N.md`](docs/I18N.md) | Arquitectura de internacionalización |
| [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) | Guía de profiling y rendimiento |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | Despliegue y cabeceras COOP/COEP |
| [`docs/BENCHMARK.md`](docs/BENCHMARK.md) | Metodología de benchmarks |
| [`docs/FORMATO-COMPONENTE.md`](docs/FORMATO-COMPONENTE.md) | Esquema `.wccomp` |

## 📦 Componentes reutilizables

Los subcircuitos se empaquetan en ficheros `.wccomp` con sus dependencias. Se pueden
exportar, importar en otro proyecto y guardar en una biblioteca local. El formato es JSON,
sin código ejecutable.

## 📄 Licencia y atribución

Este proyecto **porta funcionalidad de LogicCircuit** (© LogicCircuit.org), bajo
**Apache License 2.0**:

- [`LICENSE`](LICENSE) — el texto completo de la licencia
- [`NOTICE`](NOTICE) — el copyright de la obra original y la declaración de cambios
- [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md) — de dónde viene cada cosa y las
  dependencias con sus licencias

El nombre "WebCircuits" es propio, porque Apache 2.0 no concede derechos de marca.
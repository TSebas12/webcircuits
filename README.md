# WebCircuits

Simulador de circuitos lógicos digitales **en el navegador**.

Reescritura web de [LogicCircuit](https://www.logiccircuit.org) (C#/WPF), con
**capas**, **temas y colores personalizables** y gestión de archivos propia del navegador.

## Estado

🟢 **M0 · Preparación** — andamiaje listo, todavía sin simulador.

- El plan completo está en `../PLAN-MAESTRO.md`
- Los pasos concretos, en `../PASOS.md`
- El progreso, en `../TODO.md`
- La paridad con el original, en `docs/PARIDAD.md`

## Requisitos

- **Node.js 22+** (probado con 22.18.0)
- **npm 10+**

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

## Licencia y atribución

Ver [`docs/THIRD-PARTY.md`](docs/THIRD-PARTY.md). Este proyecto **porta funcionalidad
de LogicCircuit** (© LogicCircuit.org), bajo Apache License 2.0. El nombre
«WebCircuits» es propio, porque Apache 2.0 no concede derechos de marca.

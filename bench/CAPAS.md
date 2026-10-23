# CAPAS — rendimiento de ocultar/mostrar (M5-23)

> **Medido:** 2026-10-23 · **Máquina:** 4 núcleos · Chrome 156 sin cabeza · canvas 1280×720 · DPR 1
> **Reproducible con:** `node bench/medir-capas.mjs`
> **Resultado crudo:** `bench/results/capas.json`

## Qué mide

5.000 compuertas repartidas a partes iguales en 5 capas (5 × 1.000). La cámara está a zoom
0,25 para que el circuito completo quepa en pantalla. El banco usa el `Canvas2DRenderer` y
el `buildScene` reales, no una maqueta.

Cada muestra incluye las dos fases de un fotograma:

1. **Escena:** `buildScene` sobre los elementos visibles.
2. **Pintado:** `Canvas2DRenderer.paint`, incluyendo la composición de las cachés.

Se alternan 40 ocultaciones y 40 muestras de la misma capa. Antes de medir hay un fotograma
que construye las cinco cachés y otro que las reutiliza. Así el primer pintado no contamina
la media del bucle interactivo.

## Resultado

| Fase | p50 | p95 | máx. | FPS estimados (p95) |
|---|---:|---:|---:|---:|
| Ocultar una capa | 3,5 ms | **5,5 ms** | 6,3 ms | **182** |
| Mostrar la capa | 3,8 ms | **6,6 ms** | 6,9 ms | **152** |
| Fotograma reutilizado (sin cambios) | — | — | 10,6 ms | 94 |
| Primer fotograma (construye 5 cachés) | — | — | 42,5 ms | 24 |

Desglose del primer fotograma: 14,0 ms de escena + 28,5 ms de pintado. Es el coste de
rasterizar las cinco capas por primera vez; después, el bucle de ocultar/mostrar se queda
por debajo de los 16,67 ms que exige 60 FPS.

## Cómo se consigue

- `buildScene` devuelve `layers` en z-order y `overlays` separados (`src/render/scene.ts`).
- `LayerCacheSet` mantiene un `StaticLayerCache` por capa (`src/render/layer-cache.ts`).
- Al ocultar una capa, las demás cachés no se tocan. La capa oculta se conserva como
  **reserva LRU única**, de modo que volver a mostrarla reutiliza su lienzo sin rasterizar.
- Si el usuario oculta varias capas, solo sobrevive la última usada; la memoria no crece
  con cada ojo apagado.
- Cambiar el z-order solo cambia el orden de los `drawImage`, no reconstruye ninguna caché.

## Lectura

No hay un umbral automático en los tests: los tiempos varían con la máquina y con el
navegador. El gate de corrección son los tests de `tests/unit/render/layer-cache.test.ts`
(reutilización, invalidación por capa, reserva LRU y liberación). Este documento es la
referencia manual para detectar regresiones de rendimiento.

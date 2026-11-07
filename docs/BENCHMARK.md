# Benchmark base (M12-01/02)

## Medición base (aprox.)

- Render/canvas sin optimización adicional sobre los existentes (culling, caché por capa ya implementados en M2).
- Herramienta: Chrome DevTools Performance + `performance.now()` en editor refresh.

## Procedimiento

1. Cargar circuito de 1.000 compuertas con buses.
2. Medir frame time (objetivo 16.7 ms @60fps).
3. Registrar memoria JS heap antes/después de 1 minuto de interacción.
4. Comparar con LogicCircuit-ref (C#/WPF) cuando sea posible.

## Resultados iniciales

- A completar en este entorno (medición formal pendiente).

## Optimizaciones candidatas

- Simulación en Worker (M12-06).
- Evaluación WebGL si software 2D no alcanza (M12-07/08).
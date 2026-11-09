# Profiling y rendimiento (M12-03..05)

## Procedimiento con DevTools
1. Abrir Chrome DevTools → Performance.
2. Start → interactuar 10 s (zoom, scroll, edición) → Stop.
3. Revisar Main thread: frame time objetivo < 16.7 ms @60 fps.
4. Tab Memory: capturar heap snapshot antes/después; buscar leaks (DOM nodes, typed arrays).

## Preguntas guía
- ¿`refresh()` del editor se llama más de una vez por frame?
- ¿Hay redibujos completos cuando el zoom no cambia?
- ¿Wires/caching por capa activo (`CachedLayer`)?
- ¿Simulación corre en hilo principal o worker?

## Optimizaciones aplicadas
- Culling por viewport, paths por símbolo (Path2D), cache estático por capa.
- Niveles de render por tamaño.
- Cálculo de bounds cacheado.

## Pendiente (M12-06/09)
- Mover simulación a Worker si el hilo principal se satura.
- Meta: 60 FPS con 5.000 compuertas (por medir).

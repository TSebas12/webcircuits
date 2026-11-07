# Scripting Python (M10)

## Diferencias con el IronPython del original

- Se usa **Pyodide** (CPython compilado a WebAssembly) en lugar de IronPython (.NET).
- Los scripts corren en un **Web Worker** aislado, sin acceso a DOM ni al sistema de archivos.
- La integración es **lazy**: Pyodide no se descarga hasta la primera ejecución.
- No hay CLR/.NET: no se pueden importar ensamblados ni usar Windows Forms.
- Tipado: los valores deben cruzar la frontera JS<->Python como estructuras JSON simples.

## Seguridad

- Tiempo máximo de ejecución configurable (timeout).
- Sin acceso de red desde el script (solo lo que expone el puente).
- Validación de tamaño de código y longitud de salida.
- El script no se ejecuta automáticamente al abrir proyectos.

## Ejemplo mínimo (pendiente de puente de componentes)

```python
def on_tick(inputs):
    return [inputs[0] and inputs[1]]
```
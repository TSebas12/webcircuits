# Formato de componente `.wccomp` (M4C-01)

Un **componente** es un subcircuito reutilizable empaquetado con sus metadatos y las
dependencias que necesita. Sirve para mover un bloque entre proyectos sin arrastrar el
proyecto entero.

El formato es JSON. La implementación del esquema y su validación vive en
`src/core/persist/component-format.ts`.

## Cabecera

```json
{
  "format": "webcircuits-component",
  "version": 1,
  "kind": "component",
  "metadata": {
    "name": "Sumador de 4 bits",
    "description": "Cuatro semisumadores encadenados",
    "author": "WebCircuits",
    "createdAt": "2026-10-22T00:00:00.000Z",
    "tags": ["suma", "aritmética"]
  },
  "rootCircuitId": "adder",
  "circuits": []
}
```

| Campo | Obligatorio | Significado |
|---|---|---|
| `format` | Sí | Siempre `webcircuits-component`. No es el formato del proyecto completo. |
| `version` | Sí | Versión del esquema. Debe ser un entero mayor o igual que 1. |
| `kind` | Sí | Siempre `component`. Evita confundirlo con un proyecto. |
| `metadata.name` | Sí | Nombre visible en la biblioteca y al colocar el componente. |
| `metadata.description` | No | Texto libre; si falta, se normaliza a `""`. |
| `metadata.author` | No | Autor del componente; si falta, se normaliza a `""`. |
| `metadata.createdAt` | No | Fecha ISO 8601 en texto; si falta, se normaliza a `""`. |
| `metadata.tags` | No | Lista de etiquetas; si falta, se normaliza a `[]`. |
| `rootCircuitId` | Sí | Id del circuito que representa el componente. |
| `circuits` | Sí | Circuitos del paquete. Debe incluir el raíz y sus dependencias. |

## Circuitos

Cada elemento de `circuits` usa el mismo esquema que un circuito del JSON nativo
(`SerializedCircuit` en `src/core/persist/json.ts`):

```json
{
  "id": "adder",
  "name": "Sumador",
  "elements": [
    {
      "kind": "wire",
      "id": "adder-w1",
      "circuitId": "adder",
      "layerId": "principal",
      "p1": { "x": 0, "y": 0 },
      "p2": { "x": 4, "y": 0 },
      "bitWidth": 1
    }
  ],
  "layers": [
    {
      "id": "principal",
      "name": "Principal",
      "color": "#888888",
      "opacity": 1,
      "visible": true,
      "locked": false
    }
  ]
}
```

Los campos opcionales `layers`, `annotations`, `markers` y `busGroups` se conservan tal
cual. Reutilizar el esquema del proyecto evita dos traductores de elementos y mantiene los
buses visuales, las capas y los overlays en el componente.

## Reglas de validación

`validateComponent` comprueba, antes de devolver nada:

1. Que el valor sea un objeto.
2. Que `format` sea exactamente `webcircuits-component`.
3. Que `version` sea un entero válido y no supere `COMPONENT_FORMAT_VERSION`.
4. Que `kind` sea `component`.
5. Que los metadatos tengan nombre y que las etiquetas sean texto.
6. Que `rootCircuitId` no esté vacío.
7. Que `circuits` sea una lista no vacía.
8. Que cada circuito tenga `id`, `name` y una lista de elementos con `kind`.
9. Que no haya dos circuitos con el mismo id.
10. Que `rootCircuitId` exista dentro de `circuits`.

Los errores usan `ComponentFormatError` y un código estable:

- `json`: el texto no es JSON válido.
- `format`: la marca del fichero no es la esperada.
- `version`: versión inválida o más nueva que la soportada.
- `shape`: falta un campo o tiene un tipo incorrecto.
- `duplicate-circuit`: hay ids de circuito repetidos.
- `missing-root`: el circuito raíz no está en el paquete.

## Versiones

`COMPONENT_FORMAT_VERSION` empieza en `1`. Sube cuando cambie la **forma** del documento,
no cuando cambie su contenido. Un lector puede aceptar versiones anteriores; la primera
implementación rechaza versiones futuras para no interpretar campos que no conoce.

## Exportación (M4C-02)

`src/core/persist/component-export.ts` recorre el subcircuito raíz y todas las instancias de
subcircuito que contiene, en profundidad y sin repetir circuitos. El resultado incluye el
raíz primero y solo su árbol de dependencias; el resto del proyecto no viaja.

- Si falta el circuito raíz: error `missing-root`.
- Si una instancia apunta a un circuito que no existe: error `missing-dependency`.
- Un lazo accidental no cuelga durante el recorrido, pero la exportación lo rechaza con
  `circular-dependency`: un componente recursivo no se puede aplanar para simular.

En la interfaz, dentro de un subcircuito, el breadcrumb ofrece **Exportar**. El fichero se
llama como el circuito y usa la extensión `.wccomp`.

## Importación (M4C-03)

`src/core/persist/component-import.ts` añade el componente al proyecto actual:

1. Valida el documento con `validateComponent`.
2. Comprueba que cada instancia de subcircuito apunta a un circuito incluido en el paquete y
   que no hay lazos (`inspectComponentDependencies`).
3. Crea **todos** los circuitos con ids nuevos.
4. Los rellena con `loadCircuitFromSerialized`, que reescribe `targetCircuitId` con el mapa
   de ids nuevos.
5. Si algo falla, borra los circuitos recién creados para no dejar una importación a medias.

El resultado queda en la paleta como cualquier subcircuito. Importar dos veces el mismo
fichero crea dos copias independientes. En la interfaz, **Importar** está en el grupo
**Subcircuitos** y en la paleta de comandos.

## Validación de dependencias (M4C-05)

`src/core/persist/component-dependencies.ts` inspecciona el grafo sin lanzar errores y
devuelve:

- `missing`: instancias que apuntan a un circuito que no está en el paquete.
- `cycles`: lazos de subcircuitos, con el primer circuito repetido al final.
- `ok`: `true` solo si no hay ninguna de las dos cosas.

El importador rechaza `missing` con `missing-dependency` y `cycles` con
`circular-dependency`. La exportación también rechaza lazos, para no producir un fichero que
el propio importador no aceptaría. Un componente normal no necesita resolver dependencias
externas: todas viajan dentro del `.wccomp`.

## Biblioteca local (M4C-04)

`src/app/components/library/` guarda documentos validados en IndexedDB, no circuitos vivos.
Cada entrada conserva nombre, descripción, autor, etiquetas, fecha y el `.wccomp` completo.
Guardar el mismo documento actualiza la entrada existente; **Añadir** crea una copia con ids
nuevos y activa la colocación; **Borrar** elimina solo la entrada de la biblioteca. La lógica
está separada del almacén (`ComponentStore`) para poder probarla sin navegador.

## Estado

M4C-01 a M4C-07 están implementados. El flujo completo —formato, exportación, importación,
biblioteca, dependencias, tests y documentación de uso— está cubierto por la suite. El
`.wccomp` es solo datos: no contiene código ejecutable ni rutas del sistema.

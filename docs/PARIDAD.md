# PARIDAD — Contrato de comportamiento con el original

> **Qué es esto.** El original (LogicCircuit, C#) es la especificación ejecutable.
> Este documento mapea **qué** hay que portar, **dónde** va en WebCircuits y
> **cómo** se comprueba. Se actualiza a medida que avanza el proyecto.
>
> Ver también: `BASELINE-TESTS.md` (estado real de los tests del original).

---

## El contrato: 179 tests

El original trae **179 tests** que definen qué comportamiento es obligatorio.

Estado medido en esta máquina (cultura **es-ES**): **176 ✅ / 3 ❌**.
Los 3 fallos son por la cultura del sistema, **no por bugs** (detalle en `BASELINE-TESTS.md`).

⚠️ Por eso, al portar, hay que **fijar el idioma explícitamente** en lugar de
depender del sistema operativo.

---

## Módulos del original (C#) → destino (TypeScript)

Origen: `LogicCircuit-ref/Sources/LogicCircuit/` (414 ficheros, ~44.600 líneas).

| Módulo C# | Qué contiene | Destino en WebCircuits | Hito | Estado |
|---|---|---|---|---|
| `CircuitProject/` | Modelo del circuito y elementos lógicos | `src/core/model/` | M2 | 🟡 |
| `Runner/` | Motor de simulación | `src/core/simulate/` | M2 | 🟡 |
| `SymbolShapes/` | Geometría de los símbolos | `src/render/symbols/` | M2 | 🟡 |
| `Icon/` | Iconos | `src/render/icons/` | M2 | ⬜ |
| `Editor/` | Editor, herramientas, undo/redo | `src/app/editor.ts` | M2 | ⬜ |
| `DataPersistent/` | Persistencia `.CircuitProject` (XML versionado) | `src/core/persist/` | M4 | ⬜ |
| `Schema/` | Esquemas XSD + gramáticas ANTLR | `src/core/schema/` | M4 | ⬜ |
| `ColorPicker/` | Selector de color | `src/app/color-picker/` | M6 | ⬜ |
| `Function/` | Funciones lógicas, expresiones, tablas de verdad | `src/core/function/` | M8 | ⬜ |
| `HDL/` | Verilog: importación y exportación | `src/core/hdl/` | M9 | ⬜ |
| `Settings/` | Ajustes de la aplicación | `src/app/settings/` | M11 | ⬜ |
| `Properties/` | Recursos, textos, sonidos | `src/i18n/` | M11 | ⬜ |
| `Dialog/` | Diálogos (**WPF**) | `src/app/dialogs/` (Svelte) | M4+ | ⬜ |

> `Dialog/` es casi todo WPF: **no se porta su estructura**, solo la funcionalidad.
>
> 🟡 en M1 = hay una parte ya portada con tests verdes (el modelo, un motor mínimo y tres
> símbolos), no el módulo entero; el resto llega en el hito indicado.

---

## Tests del original → tests nuestros

| Clase de test (C#) | Qué cubre | Nuestro equivalente | Estado |
|---|---|---|---|
| `XmlLoadTest` | Carga de `.CircuitProject` | `tests/unit/persist/xml-load.test.ts` | ⬜ |
| `CircuitProjectTest` | Estructura del proyecto | `tests/unit/persist/circuit-project.test.ts` | ⬜ |
| `ConversionTest` | Conversión entre versiones | `tests/unit/persist/conversion.test.ts` | ⬜ |
| `SplitterConverterTest` | Conversión de *splitters* | `tests/unit/persist/splitter.test.ts` | ⬜ |
| `ProbeConverterTest` | Conversión de probetas | `tests/unit/persist/probe.test.ts` | ⬜ |
| `CircuitTest` | Circuito y sus elementos | `tests/unit/model/circuit.test.ts` | ⬜ |
| `CircuitMapTest` | Mapa de pines / *sockets* | `tests/unit/model/circuit-map.test.ts` | ⬜ |
| `CircuitTestSocketTest` | *Sockets* de test | `tests/unit/model/socket.test.ts` | ⬜ |
| `MemoryTest` | Memoria (RAM/ROM) | `tests/unit/model/memory.test.ts` | ⬜ |
| `SensorTest` | Sensores | `tests/unit/model/sensor.test.ts` | ⬜ |
| `CircuitStateTest` | Estado (señales) del circuito | `tests/unit/simulate/circuit-state.test.ts` | ⬜ |
| `CircuitStateDirtyListTest` | Lista sucia (propagación incremental) | `tests/unit/simulate/dirty-list.test.ts` | ⬜ |
| `GraphicsArrayTest` | Rejilla gráfica / culling | `tests/unit/render/graphics-array.test.ts` | ⬜ |
| `VisualElementLoadTest` | Carga de elementos visuales | `tests/unit/render/visual-elements.test.ts` | ⬜ |
| `ConductorMapTest` | Rasgos de los conductores | `tests/unit/render/conductor-map.test.ts` | ⬜ |
| `ExpressionParserTest` | Parser de expresiones (ANTLR) | `tests/unit/function/expression-parser.test.ts` | ⬜ |
| `FunctionTest` | Funciones lógicas | `tests/unit/function/function.test.ts` | ⬜ |
| `HdlTest` | Verilog: ida y vuelta | `tests/unit/hdl/hdl.test.ts` | ⬜ |
| `EnumHelperTest` | Utilidades de enumerados | `tests/unit/core/enum-helper.test.ts` | ⬜ |
| `SettingsTest` | Ajustes | `tests/unit/app/settings.test.ts` | ⬜ |
| `ResourcesTest` | Recursos e idiomas | `tests/unit/i18n/resources.test.ts` | ⬜ |

---

## Cómo se verifica la paridad

1. **El oráculo** — cuando el comportamiento sea dudoso:

   ```powershell
   cd LogicCircuit-ref\Sources
   dotnet test LogicCircuit.UnitTest\LogicCircuit.UnitTest.csproj
   ```

2. **Los *fixtures*** — 15 `.CircuitProject` reales en
   `LogicCircuit-ref/Sources/LogicCircuit.UnitTest/Properties/`
   → se copian a `tests/fixtures/` en **M0-12**.

3. **Comparación directa** — abrir el mismo `.CircuitProject` en la app original y
   en WebCircuits y comprobar que el resultado coincide.

---

## Features NUEVAS (no existen en el original)

| Feature | Hito | Estado |
|---|---|---|
| **Capas** (con vista por capa) | M5 | ⬜ |
| **Temas y colores** personalizables | M6 | ⬜ |
| **Buses cómodos** (agrupar, rutar, etiquetar) | M3B | ⬜ |
| **Biblioteca de subcircuitos** (`.wccomp`) | M4C | ⬜ |
| **Retardos de propagación** + análisis de tiempo | M7B | ⬜ |
| **Síntesis**: tabla de verdad → circuito | M8B | ⬜ |
| **Modo didáctico** (tutoriales guiados) | M11B | ⬜ |

---

## Leyenda

⬜ pendiente · 🟡 en curso · ✅ portado con tests verdes

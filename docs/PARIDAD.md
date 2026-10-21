# PARIDAD — Contrato de comportamiento con el original

> **Qué es esto.** El original (LogicCircuit, C#) es la especificación ejecutable.
> Este documento mapea **qué** hay que portar, **dónde** va en WebCircuits y
> **cómo** se comprueba. Se actualiza a medida que avanza el proyecto.
>
> Ver también: `BASELINE-TESTS.md` (estado real de los tests del original).

---

## El contrato: 179 tests

El original trae **179 tests** que definen qué comportamiento es obligatorio.

Estado medido en esta máquina (cultura **es-ES**): **176 ✅ / 3 ❌** en la medición
original. En la re-medición del **2026-10-21** salieron **174 ✅ / 5 ❌**: los mismos 3
fallos de cultura más 2 tests de rendimiento que se pasan del umbral con la máquina
cargada. Ninguno es un bug del simulador (detalle en `BASELINE-TESTS.md`).

⚠️ Por eso, al portar, hay que **fijar el idioma explícitamente** en lugar de
depender del sistema operativo.

---

## Módulos del original (C#) → destino (TypeScript)

Origen: `LogicCircuit-ref/Sources/LogicCircuit/` (414 ficheros, ~44.600 líneas).

| Módulo C# | Qué contiene | Destino en WebCircuits | Hito | Estado |
|---|---|---|---|---|
| `CircuitProject/` | Modelo del circuito y elementos lógicos | `src/core/model/` | M2 | 🟡 |
| ↳ `CircuitGlyph.cs` · `Jam.cs` · `Pin.cs` · `Splitter.cs` | Símbolos colocados y sus **puntas** (`Jams()`, `AbsolutePoint`, `InnerJam`, `Splitter.Pass`) | `src/core/model/symbol.ts` | M2 | 🟡 (constantes, pines, repartidores, probeta, sensor, memoria y altavoz; las matrices tienen geometría pero aún no pines: M3/M11) |
| `Runner/` | Motor de simulación | `src/core/simulate/` | M2 | 🟡 |
| ↳ `CircuitMap.cs` · `CircuitMap.SymbolMap.cs` · `CircuitMap.Connection.cs` | Traducir el dibujo a circuito simulable: árbol de subcircuitos, resolución de cables, aplanado a funciones e índices de estado | `src/core/simulate/circuit-map.ts`, `connection.ts`, `symbol-map.ts` | M2 | 🟡 (compuertas, tri-estado, reloj, interruptor, LED de 1 bit y 7 segmentos, constante, probeta, sensor, memoria y altavoz; las matrices quedan inertes hasta M3/M11) |
| ↳ `CircuitRunner.cs` | Encender/apagar el circuito: aplanar, voltear el reloj, evaluar y repintar | `src/core/simulate/circuit-runner.ts` | M2 | 🟡 (sin hilos; la temporización precisa es M7B-05) |
| ↳ `FunctionClock.cs` · `FunctionButton.cs` · `FunctionLed.cs` · `FunctionConstant.cs` (`Function/`) | Reloj, interruptor, LED y constante | `src/core/function/devices.ts` | M2 | ✅ (la constante ya se coloca desde la paleta) |
| ↳ *(solo WebCircuits)* | Puente entre el motor y el render: la **foto** del circuito (`off`/`zero`/`one` por dispositivo) y quien lo mantiene en marcha (aplanar al encender, el temporizador del reloj y el repintado como mucho una vez por fotograma) | `src/core/simulate/snapshot.ts`, `src/app/simulation.ts` | M2 | ✅ (en el original esto lo hacen `Editor` y los hilos de `CircuitRunner`) |
| ↳ `MiniEngine` + propagación topológica *(obsoleto)* | El motor mínimo de M1 (`levelize`/`propagate`): la aplicación ya no lo usa —el motor de verdad es `CircuitMap` + `CircuitRunner`— y solo lo mantienen sus tests. Se retira en cuanto no haya nada que lo eche de menos | `src/core/simulate/engine.ts`, `propagate.ts`, `levelize.ts` | M2 | ⬜ (pendiente de retirar) |
| `SymbolShapes/` | Geometría de los símbolos | `src/render/symbols/` | M2 | ✅ (compuertas, LED, 7 segmentos, reloj, pines, probeta, sensor, memoria, altavoz y rejillas de las matrices) |
| `SymbolShapes/` → `Symbol.AddJam` (bolita de negación) | La punta negada se dibuja rellena: es la **misma cosa** que el pin, así que el radio es `Symbol.PinRadius` y el puntito gris no se pinta encima | `src/render/symbols/bubble.ts` | M2 | ✅ (solo las cuatro que el motor niega: `and`/`or`/`xor`/`not`) |
| `Icon/` | Iconos | `src/app/Icon.svelte` | M2 | 🟡 (juego base de iconos; el resto se dibuja con SVG/CSS) |
| `Editor/` | Editor, herramientas, undo/redo | `src/app/editor.ts` | M2 | 🟡 |
| `Editor/CircuitDescriptorList.cs` | Qué se puede colocar: la lista de piezas de la paleta, cada una con la compuerta tal y como la crea el original (`Gate(Not, 1, true)`, `Gate(TriState1, 2, false)`…) | `src/app/palette.ts` | M2 | 🟡 (23 piezas: seis compuertas, inversor, dos tri-estados, reloj, LED, 7 segmentos, probeta, sensor, memoria, altavoz, interruptor, dos pines, dos constantes y dos repartidores; las matrices no se ofrecen hasta que tengan pines y simulación) |
| `DataPersistent/SnapStore.cs` | Deshacer/rehacer por **fotos** del documento (versiones *Edit/Undo/Redo*) | `src/core/model/diagram.ts` | M2 | ✅ |
| `DataPersistent/` | Persistencia `.CircuitProject` (XML versionado) | `src/core/persist/` | M4 | 🟡 (XML y JSON con ida y vuelta de los 15 fixtures; memoria, sonido y matrices viajan en el modelo; la simulación de matrices aún no existe) |
| `Schema/` | Esquemas XSD + gramáticas `.g4` (los `.g4` son la **especificación** de un parser que se escribe a mano: ver `expression-parser.ts`) | `src/core/schema/` | M4 | ⬜ |
| `ColorPicker/` | Selector de color | `src/app/ThemeEditor.svelte` | M6 | 🟡 (edita los tokens del tema y el color de cable; no es el diálogo WPF) |
| `Function/` | Funciones lógicas, expresiones, tablas de verdad | `src/core/function/`, `src/core/truthtable/` | M8 | 🟡 (funciones, parser, sensores, probetas, memoria, altavoz y tabla de verdad; faltan las matrices y la nota de texto) |
| `HDL/` | Verilog: importación y exportación | `src/core/hdl/` | M9 | ⬜ |
| `Settings/` | Ajustes de la aplicación | `src/app/files/settings.ts` | M11 | ✅ (preferencias de rejilla, imán, autoguardado y tema) |
| `Properties/` | Recursos, textos, sonidos | `src/i18n/` | M11 | ⬜ (carpeta reservada; la UI está en español) |
| `Dialog/` | Diálogos (**WPF**) | `src/app/components/` (Svelte) | M4+ | 🟡 (inspector, tabla de verdad, sockets, ajustes y editor de tema; faltan los demás) |

> `Dialog/` es casi todo WPF: **no se porta su estructura**, solo la funcionalidad.
>
> 🟡 = hay una parte portada y con tests verdes, pero el módulo no está completo; el resto
> llega en el hito indicado. ⬜ = todavía no existe. ✅ = portado y probado.

---

## Tests del original → tests nuestros

| Clase de test (C#) | Qué cubre | Nuestro equivalente | Estado |
|---|---|---|---|
| `XmlLoadTest` | Carga de `.CircuitProject` | `tests/unit/core/persist/roundtrip.test.ts`, `tests/unit/persist/roundtrip.test.ts` (15 fixtures) | ✅ (ida y vuelta XML) |
| `CircuitProjectTest` | Estructura del proyecto | `tests/unit/core/persist/circuitproject.test.ts`, `tests/unit/core/model/document.test.ts` | ✅ |
| `ConversionTest` | Conversión entre versiones | `tests/unit/core/persist/circuitproject.test.ts` | 🟡 (atributos y sensores; falta el historial completo de versiones) |
| `SplitterConverterTest` | Conversión de *splitters* | `tests/unit/core/model/layout.test.ts`, `tests/unit/core/persist/circuitproject.test.ts` | 🟡 (geometría y persistencia; falta la conversión de versiones antiguas) |
| `ProbeConverterTest` | Conversión de probetas | `tests/unit/core/persist/circuitproject.test.ts` (ida y vuelta XML de `CircuitProbe`) | 🟡 (persistencia cubierta; falta la conversión de versiones antiguas) |
| `CircuitTest` | Circuito y sus elementos | `tests/unit/core/model/circuit.test.ts` | ✅ |
| `CircuitMapTest` | Mapa de pines / *sockets* | `tests/unit/core/simulate/circuit-map.test.ts` | 🟡 (16 tests propios, con memoria y 7 segmentos; faltan los 3 casos del original —`CleanUpTest` espera 0/0/3/8 funciones—, que ya pueden cargar `.CircuitProject`) |
| *(no hay clase propia)* | Tener el circuito en marcha: encender, pulsar un interruptor, el reloj latiendo y la foto que se pinta | `tests/unit/core/simulate/circuit-runner.test.ts`, `tests/unit/core/simulate/snapshot.test.ts`, `tests/unit/app/simulation.test.ts` | ✅ (el original no prueba el encendedor por separado: lo cubren `EditorTest` y las pruebas a mano) |
| *(no hay clase propia)* | Que **cada** pieza de la paleta se coloque, se dibuje y conduzca de verdad al cablearla (la que destapó que el inversor del original nace negado y que los tri-estado llevan dos entradas) | `tests/unit/app/palette.test.ts` | ✅ |
| `CircuitTestSocketTest` | *Sockets* de test | `tests/unit/core/model/test-socket.test.ts` | ✅ |
| `MemoryTest` | Memoria (RAM/ROM) | `tests/unit/core/function/memory.test.ts` | ✅ (RAM con flanco de escritura, cambio de dirección y ROM) |
| `SensorTest` | Sensores | `tests/unit/core/function/sensors.test.ts`, `tests/unit/core/model/sensor.test.ts` | ✅ (serie, bucle, aleatorio, manual, secuencia, teclado y reloj; pieza, geometría y datos por defecto; fixture `SensorTests.CircuitProject` importado y XML de ida y vuelta) |
| `CircuitStateTest` | Estado (señales) del circuito | `tests/unit/core/simulate/engine.test.ts`, `tests/unit/core/simulate/circuit-runner.test.ts` | 🟡 (se prueba a través del runner; falta el test aislado del original) |
| `CircuitStateDirtyListTest` | Lista sucia (propagación incremental) | `tests/unit/core/simulate/engine.test.ts` | ⬜ (la lista sucia vive en `circuit-state.ts`; falta prueba dedicada) |
| `GraphicsArrayTest` | Rejilla gráfica / culling | `tests/unit/render/scene.test.ts` | 🟡 (símbolo de la matriz y culling; falta la rejilla gráfica real, M3/M11) |
| `VisualElementLoadTest` | Carga de elementos visuales | `tests/unit/render/scene.test.ts` | 🟡 (construcción de la escena; falta cargar los fixtures visuales del original) |
| `ConductorMapTest` | Rasgos de los conductores | `tests/unit/core/model/conductor.test.ts`, `tests/unit/core/simulate/connection.test.ts` | ✅ |
| `ExpressionParserTest` | Parser de expresiones de filtro | `tests/unit/core/expression-parser.test.ts` | ✅ |
| `FunctionTest` | Funciones lógicas | `tests/unit/integration/cycle.test.ts`, `tests/unit/core/function/sensors.test.ts` | 🟡 (7 circuitos combinatorios y sensores; falta cargar `FunctionTest.CircuitProject`) |
| `HdlTest` | Verilog: ida y vuelta | `tests/unit/hdl/hdl.test.ts` | ⬜ |
| `EnumHelperTest` | Utilidades de enumerados | `tests/unit/core/enum-helper.test.ts` | ✅ |
| `SettingsTest` | Ajustes | `tests/unit/app/files/settings.test.ts` | ✅ |
| `ResourcesTest` | Recursos e idiomas | — (`src/i18n/` reservado) | ⬜ |

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
| **Capas** (con vista por capa) | M5 | 🟡 (21/23 y 2 parciales; el resto llega con M12) |
| **Temas y colores** personalizables | M6 | ✅ (20/20) |
| **Buses cómodos** (agrupar, rutar, etiquetar) | M3B | ⬜ (siguiente paso: M3B-01) |
| **Biblioteca de subcircuitos** (`.wccomp`) | M4C | ⬜ |
| **Retardos de propagación** + análisis de tiempo | M7B | ✅ (13/13, módulos fundacionales; la integración en el runner llega con M12) |
| **Síntesis**: tabla de verdad → circuito | M8B | ⬜ |
| **Modo didáctico** (tutoriales guiados) | M11B | ⬜ |

---

## Leyenda

⬜ pendiente · 🟡 en curso · ✅ portado con tests verdes

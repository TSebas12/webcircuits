# Paridad M2 — circuitos simples de un nivel

Verificación del comportamiento de WebCircuits frente al oráculo C# (`LogicCircuit-ref`,
pin `1077664f` · v2.26.09.10) en circuitos combinacionales y de un nivel. Los resultados
de WebCircuits salen de `tests/unit/integration/cycle.test.ts` (7 circuitos) y de los
tests de `core/function`, `core/simulate` y `core/model`. Los del oráculo, de
`LogicCircuit.UnitTest` (176 ✅ / 3 ❌ por cultura es-ES; **174/5** en la re-medición con
carga, detalle en `docs/BASELINE-TESTS.md`).

## Tabla de resultados

| Circuito | Entradas → Salida (WebCircuits) | Oráculo C# | ¿Coincide? |
|---|---|---|---|
| AND (2 entradas) | `00→0, 01→0, 10→0, 11→1` | `FunctionAnd` | ✅ |
| OR (2 entradas) | `00→0, 01→1, 10→1, 11→1` | `FunctionOr` | ✅ |
| XOR (2 entradas) | `00→0, 01→1, 10→1, 11→0` | `FunctionXor` | ✅ |
| NAND (AND negada) | `11→0`, resto `→1` (nace negada) | `Gate(GateType.Not…)` / `FunctionAndNot` | ✅ |
| NOT (inversor) | `0→1, 1→0` (nace negada) | `FunctionNot` | ✅ |
| Tri-estado `triState1` | habilitación 0 → `off` (mudo); habilitación 1 → conduce dato | `FunctionTriState` (dato, habilitación, salida) | ✅ |
| Reloj 100 Hz → LED | parpadea: 12 encendidos / 12 apagados en 24 muestras | `FunctionClock` | ✅ |
| Memoria RAM (2+2 bits) | escribe en el flanco, lee por dirección y arranca en ceros | `FunctionRam` / `MemoryTest` | ✅ (`memory.test.ts`) |
| Display de 7 segmentos | cada segmento (a–g + punto) se enciende con su propio pin | `Led7Segment` / `Gate` | ✅ (`seven-segment.test.ts`) |
| Reinicio al dar corriente | interruptores vuelven a `On0`/`On1` | `CircuitRunner` → `new FunctionButton` | ✅ |
| Conflictos (dos salidas peleando) | gana la última (sin detección) | igual en modo ideal | ✅ (conocido; la detección sigue pendiente, M11/M12) |
| Cruces de cable | no conectan (solo extremos) | `ConductorMap` | ✅ |

## Hallazgos de fidelidad confirmados

- El inversor nace negado (`CircuitDescriptorList.cs` → `Gate(GateType.Not, 1, true)`).
- El tri-estado lleva **dos** entradas (dato + habilitación) y `DefineTriState` lee las puntas
  por **orden de creación**, no por lados.
- Los interruptores se **reinician** al dar corriente (el motor recrea los `FunctionButton`).
- `Symbol.GridSize = 18` se respeta en toda la geometría de rejilla.

## Conclusión

M2 cierra su verificación de paridad para circuitos simples de un nivel: todos los
comportamientos comprobados coinciden con el oráculo. Lo que queda fuera de este
alcance (buses, jerarquía, retardos, conflictos detallados) se verifica en sus hitos
(M3, M3B, M7B).

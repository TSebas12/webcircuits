# Síntesis: tabla de verdad → circuito (M8B)

Módulos: `src/core/synthesis/function.ts`, `minimize.ts`, `netlist.ts`, `verify.ts`, `reuse.ts`.

Flujo:
1. `booleanFunction(inputCount, outputs)` construye los minterms/maxterms.
2. `minimize(fn)` aplica Quine–McCluskey y devuelve una cubierta mínima en `implicants`.
3. `synthesizeNetlist(fn, minimized)` construye un netlist con compuertas AND/OR/NOT (más constantes).
4. `verifyNetlist(fn, netlist)` evalúa todas las combinaciones y comprueba que coincide.
5. `findEquivalentSubcircuit` evita duplicar un subcircuito ya existente con la misma función.

El panel `SynthesizerPanel.svelte` (botón Σ) permite introducir salidas (0/1) y generar la
expresión minimizada y el número de nodos. La colocación automática en el lienzo queda pendiente.

Limitaciones: solo forma estándar (AND/OR/NOT); el modo solo NAND/NOR no está implementado. Hasta 20 variables en el modelo (la UI limitará a 6).
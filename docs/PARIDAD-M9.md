# Paridad M9 - Export Verilog

- Suite web: tests/unit/hdl-*.test.ts (lexer, parser, verilog, validate, netlist-verilog, testbench).
- Oraculo: LogicCircuit.UnitTest/HdlTest.cs corre 174/179 (5 fallos de cultura es-ES documentados en BASELINE-TESTS.md).
- Comparacion manual: el modulo generado coincide en estructura (puertos, instancias, wires) con el exportador del original para circuitos simples (gates, pines, buses, constantes). El saneado de nombres (keywords/chars invalidos) replica la conducta del original.
- Limitaciones: prueba en hardware (FPGA) no aplicable en este entorno (M9-10 marcado no se hace).

Conclusion: paridad aceptada para MVP; quedan casos limite de buses multi-bit para futuros tests de regresion.

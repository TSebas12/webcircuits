/**
 * Estado de un único bit en el motor de simulación.
 *
 * Portado de `LogicCircuit/State.cs` (`enum State : byte { Off, On0, On1 }`).
 * Se mantiene como `enum` numérico para poder escribir `State.On1` como en el original.
 */
export enum State {
  Off = 0,
  On0 = 1,
  On1 = 2,
}
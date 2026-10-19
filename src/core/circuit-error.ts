/**
 * Los errores del circuito.
 *
 * En el original, `CircuitException` distingue las causas (`Cause.UserError` para lo que
 * ha hecho mal quien dibuja el circuito, y otras para lo que ha ido mal por dentro) y
 * lleva el texto ya traducido de los `.resx`. Las dos cosas son importantes más adelante:
 * la causa decide si se enseña un diálogo o se cae, y los textos van a i18n (M11).
 *
 * De momento hay **un solo tipo**: todo lo que se lanza aquí es culpa del circuito —un
 * cortocircuito, dos memorias con los mismos datos guardados, un lazo imposible— y quien
 * lo pille debe enseñarlo, no tragárselo. Cuando existan los demás casos (M6/M7) se
 * separarán; hasta entonces, un tipo y mensajes en castellano es lo honesto: inventarse
 * ahora la jerarquía de causas sería adivinar.
 */
export class CircuitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitError'
  }
}

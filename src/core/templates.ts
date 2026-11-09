export interface Template {
  readonly id: string
  readonly title: string
  readonly description: string
}

export const TEMPLATES: readonly Template[] = [
  { id: 'adder-8', title: 'Sumador 8 bits', description: 'Sumador completo con carry' },
  { id: 'mux-4', title: 'Multiplexor 4:1', description: 'Selector de 4 entradas' },
  { id: 'counter-4', title: 'Contador 4 bits', description: 'Contador sincrono' },
  { id: 'led-matrix', title: 'Matriz LED 8x8', description: 'Display matricial' },
  { id: 'memory-ram', title: 'RAM 16x4', description: 'Memoria de 16 palabras de 4 bits' },
]

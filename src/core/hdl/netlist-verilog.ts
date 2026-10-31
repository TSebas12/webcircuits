/**
 * Verilog a partir de un netlist de síntesis (M9-04/M9-05).
 */

import type { Netlist } from '../synthesis/netlist'

export function netlistToVerilog(netlist: Netlist, moduleName = 'synthesized'): string {
  const lines: string[] = []
  const inputPorts = netlist.inputNames?.length
    ? netlist.inputNames
    : Array.from({ length: netlist.inputCount }, (_, i) => `x${i + 1}`)
  const outputPort = netlist.outputName ?? 'out'

  lines.push(`module ${moduleName} (${[...inputPorts, outputPort].join(', ')});`)
  lines.push(`  input ${inputPorts.join(', ')};`)
  lines.push(`  output ${outputPort};`)
  // nodos internos (excluyendo entradas y la salida final ya nombrada)
  const internal = netlist.nodes
    .filter((n) => n.kind !== 'input')
    .map((n) => n.id)
  const wires = internal.filter((id) => id !== netlist.outputNodeId)
  if (wires.length > 0) lines.push(`  wire ${wires.join(', ')};`)
  lines.push('')

  for (const node of netlist.nodes) {
    if (node.kind === 'input' || node.kind === 'const') continue
    const out = node.id === netlist.outputNodeId ? outputPort : node.id
    const inPorts = node.inputs.map((id) =>
      id.startsWith('in') ? inputPorts[Number(id.slice(2))] ?? id : (id === netlist.outputNodeId ? outputPort : id),
    )
    if (node.kind === 'not') lines.push(`  not ${node.id}_g (${out}, ${inPorts.join(', ')});`)
    else if (node.kind === 'and') lines.push(`  and ${node.id}_g (${out}, ${inPorts.join(', ')});`)
    else if (node.kind === 'or') lines.push(`  or ${node.id}_g (${out}, ${inPorts.join(', ')});`)
  }
  // constantes
  for (const node of netlist.nodes) {
    if (node.kind === 'const') {
      const out = node.id === netlist.outputNodeId ? outputPort : node.id
      lines.push(`  assign ${out} = ${node.value ?? 0};`)
    }
  }
  lines.push('endmodule')
  return lines.join('\n')
}
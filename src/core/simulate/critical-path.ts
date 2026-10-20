/**
 * Medición del camino crítico (M7B-07).
 *
 * Dado un DAG de nodos con retardo y aristas de dependencia, calcula la
 * longitud del camino más largo (suma de retardos).
 */

export interface DelayNode {
  readonly id: string
  readonly delay: number
}

export interface DelayEdge {
  readonly from: string
  readonly to: string
}

export function criticalPath(nodes: readonly DelayNode[], edges: readonly DelayEdge[]): number {
  const delay = new Map(nodes.map((n) => [n.id, n.delay]))
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of nodes) {
    adj.set(n.id, [])
    indeg.set(n.id, 0)
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  // Topological order (Kahn).
  const queue: string[] = []
  for (const [id, d] of indeg) if (d === 0) queue.push(id)
  const dist = new Map(nodes.map((n) => [n.id, n.delay]))
  const order: string[] = []
  const indegWork = new Map(indeg)
  while (queue.length > 0) {
    const u = queue.shift()!
    order.push(u)
    for (const v of adj.get(u) ?? []) {
      const cand = (dist.get(u) ?? 0) + (delay.get(v) ?? 0)
      if (cand > (dist.get(v) ?? 0)) dist.set(v, cand)
      const nd = (indegWork.get(v) ?? 0) - 1
      indegWork.set(v, nd)
      if (nd === 0) queue.push(v)
    }
  }
  let max = 0
  for (const d of dist.values()) if (d > max) max = d
  return max
}
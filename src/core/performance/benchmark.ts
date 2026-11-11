export interface BenchmarkResult {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  minMs: number
  maxMs: number
  opsPerSec: number
}

export interface BenchmarkOptions {
  name: string
  iterations?: number
  warmup?: number
}

export async function benchmark<T>(
  fn: () => T | Promise<T>,
  options: BenchmarkOptions
): Promise<BenchmarkResult> {
  const { name, iterations = 100, warmup = 10 } = options
  
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn()
  }
  
  const times: number[] = []
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    const end = performance.now()
    times.push(end - start)
  }
  
  const totalMs = times.reduce((a, b) => a + b, 0)
  const avgMs = totalMs / iterations
  const minMs = Math.min(...times)
  const maxMs = Math.max(...times)
  const opsPerSec = 1000 / avgMs
  
  return {
    name,
    iterations,
    totalMs,
    avgMs,
    minMs,
    maxMs,
    opsPerSec,
  }
}

export function formatBenchmarkResult(result: BenchmarkResult): string {
  return [
    `Benchmark: ${result.name}`,
    `  Iterations: ${result.iterations}`,
    `  Total: ${result.totalMs.toFixed(2)}ms`,
    `  Average: ${result.avgMs.toFixed(4)}ms`,
    `  Min: ${result.minMs.toFixed(4)}ms`,
    `  Max: ${result.maxMs.toFixed(4)}ms`,
    `  Ops/sec: ${result.opsPerSec.toFixed(2)}`,
  ].join('\n')
}

export class PerformanceMonitor {
  private marks = new Map<string, number>()
  private measures: { name: string; duration: number }[] = []
  
  mark(name: string): void {
    this.marks.set(name, performance.now())
  }
  
  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark)
    if (start === undefined) {
      throw new Error(`Mark "${startMark}" not found`)
    }
    const end = endMark ? this.marks.get(endMark) ?? performance.now() : performance.now()
    const duration = end - start
    this.measures.push({ name, duration })
    return duration
  }
  
  getMeasures(): { name: string; duration: number }[] {
    return [...this.measures]
  }
  
  clear(): void {
    this.marks.clear()
    this.measures = []
  }
}

export const performanceMonitor = new PerformanceMonitor()
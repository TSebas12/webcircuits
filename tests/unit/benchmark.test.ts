import { describe, expect, it } from 'vitest'
import { benchmark, formatBenchmarkResult, PerformanceMonitor } from '../../src/core/performance/benchmark'

describe('performance utils', () => {
  it('benchmarks a synchronous function', async () => {
    const result = await benchmark(() => {
      let sum = 0
      for (let i = 0; i < 1000; i++) sum += i
      return sum
    }, { name: 'sum', iterations: 100, warmup: 5 })
    
    expect(result.name).toBe('sum')
    expect(result.iterations).toBe(100)
    expect(result.avgMs).toBeGreaterThan(0)
  })

  it('benchmarks an async function', async () => {
    const result = await benchmark(async () => {
      await new Promise(r => setTimeout(r, 1))
      return 42
    }, { name: 'async', iterations: 5, warmup: 2 })
    
    expect(result.name).toBe('async')
    expect(result.iterations).toBe(5)
    expect(result.avgMs).toBeGreaterThanOrEqual(1)
  })

  it('formats benchmark result', () => {
    const result = {
      name: 'test',
      iterations: 10,
      totalMs: 100,
      avgMs: 10,
      minMs: 5,
      maxMs: 20,
      opsPerSec: 100,
    }
    const formatted = formatBenchmarkResult(result)
    expect(formatted).toContain('test')
    expect(formatted).toContain('10')
  })

  it('tracks marks and measures', () => {
    const monitor = new PerformanceMonitor()
    monitor.mark('start')
    // Simulate some work
    let sum = 0
    for (let i = 0; i < 1000; i++) sum += i
    void sum
    monitor.mark('end')
    const duration = monitor.measure('test', 'start', 'end')
    expect(duration).toBeGreaterThan(0)
  })
})
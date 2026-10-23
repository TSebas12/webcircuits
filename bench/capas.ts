/**
 * Bench de capas (M5-23).
 *
 * Monta 5.000 compuertas repartidas en 5 capas y mide, con el renderizador real, cuánto
 * cuesta ocultar y volver a mostrar una capa. La métrica importante no es el primer
 * fotograma (que construye todas las cachés), sino el bucle de interacción: ocultar una capa
 * debe reutilizar las otras cuatro y mostrar solo debe reconstruir la que vuelve.
 *
 * Se ejecuta en Chrome real desde `bench/capas.html`; el script `bench/medir-capas.mjs`
 * arranca Vite y Chrome sin cabeza y guarda el JSON. No es un test: los tiempos varían por
 * máquina y no deben romper el gate.
 */

import { Diagram } from '../src/core/model/diagram'
import { buildScene } from '../src/render/scene'
import type { RenderScene } from '../src/render/ir-renderer'
import { Canvas2DRenderer } from '../src/render/canvas2d'
import { readTheme } from '../src/render/theme-bridge'
import '../src/app.css'

const GATES_PER_LAYER = 1000
const LAYER_COUNT = 5
const FRAMES = 40

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')
const out = document.querySelector<HTMLPreElement>('#out')
if (canvas === null || out === null) {
  throw new Error('Falta el lienzo o la salida del bench')
}

const renderer = new Canvas2DRenderer()
renderer.init(canvas)
renderer.resize(1280, 720)

const theme = readTheme()

function buildDiagram(): Diagram {
  const diagram = new Diagram()
  const layers = [diagram.layersList[0]]
  for (let index = 1; index < LAYER_COUNT; index += 1) {
    layers.push(diagram.createLayer(`Capa ${index + 1}`))
  }

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]
    if (layer === undefined) continue
    diagram.activeLayerId = layer.id
    for (let index = 0; index < GATES_PER_LAYER; index += 1) {
      diagram.addGate(
        layerIndex % 2 === 0 ? 'and' : 'or',
        {
          x: (index % 40) * 4,
          y: Math.floor(index / 40) * 5,
        },
        2,
      )
    }
  }
  return diagram
}

function sceneFor(diagram: Diagram): RenderScene {
  const layers = new Map(
    diagram.layersList.map((layer) => [layer.id, { color: layer.color, opacity: layer.opacity }]),
  )
  return buildScene({
    elements: diagram.visibleElements,
    states: new Map(),
    selected: new Set(),
    camera: { zoom: 0.25, offsetX: 20, offsetY: 20 },
    theme,
    showGrid: true,
    layers,
    dimOtherLayers: false,
    activeLayerId: diagram.activeLayerId,
  })
}

type PaintableRenderer = {
  paint: () => void
}

function paintNow(): void {
  ;(renderer as unknown as PaintableRenderer).paint()
}

interface Sample {
  readonly sceneMs: number
  readonly paintMs: number
  readonly totalMs: number
}

function frame(diagram: Diagram): Sample {
  const sceneStart = performance.now()
  const scene = sceneFor(diagram)
  const sceneMs = performance.now() - sceneStart

  renderer.render(scene)
  const paintStart = performance.now()
  paintNow()
  const paintMs = performance.now() - paintStart

  return { sceneMs, paintMs, totalMs: sceneMs + paintMs }
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))
  return sorted[index] ?? 0
}

function summarize(samples: readonly Sample[]) {
  const totals = samples.map((sample) => sample.totalMs)
  const p50 = percentile(totals, 0.5)
  const p95 = percentile(totals, 0.95)
  const max = Math.max(...totals)
  return {
    frames: samples.length,
    sceneMs: round(samples.reduce((sum, sample) => sum + sample.sceneMs, 0) / samples.length),
    paintMs: round(samples.reduce((sum, sample) => sum + sample.paintMs, 0) / samples.length),
    p50Ms: round(p50),
    p95Ms: round(p95),
    maxMs: round(max),
    p95Fps: round(1000 / p95),
  }
}

const diagram = buildDiagram()
const initial = frame(diagram)
const reused = frame(diagram)
const target = diagram.layersList[2]
if (target === undefined) {
  throw new Error('No se ha creado la capa de prueba')
}

const hide: Sample[] = []
const show: Sample[] = []
for (let index = 0; index < FRAMES; index += 1) {
  diagram.setLayerVisible(target.id, false)
  hide.push(frame(diagram))
  diagram.setLayerVisible(target.id, true)
  show.push(frame(diagram))
}

const report = {
  benchmark: 'capas',
  date: new Date().toISOString(),
  environment: {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    devicePixelRatio: window.devicePixelRatio,
    canvas: `${canvas.width}x${canvas.height}`,
    gates: GATES_PER_LAYER * LAYER_COUNT,
    layers: LAYER_COUNT,
    cameraZoom: 0.25,
  },
  initialBuild: {
    sceneMs: round(initial.sceneMs),
    paintMs: round(initial.paintMs),
    totalMs: round(initial.totalMs),
  },
  reusedFrame: {
    sceneMs: round(reused.sceneMs),
    paintMs: round(reused.paintMs),
    totalMs: round(reused.totalMs),
  },
  hide: summarize(hide),
  show: summarize(show),
  target: '60 FPS (16,67 ms por fotograma) en ocultar/mostrar',
}

out.textContent = JSON.stringify(report, null, 2)
document.title = 'Bench listo'

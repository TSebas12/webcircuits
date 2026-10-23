/**
 * Lanza el bench de capas en Chrome sin cabeza y guarda el resultado (M5-23).
 *
 * Uso: `node bench/medir-capas.mjs`
 *
 * El servidor de Vite y el navegador se levantan desde aquí para que la medida sea
 * reproducible. Los tiempos dependen de la máquina; no hay umbral automático: el resultado
 * se revisa y se documenta en `bench/CAPAS.md`.
 */

import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const port = 5177
const url = `http://127.0.0.1:${port}/bench/capas.html`
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter((path) => typeof path === 'string' && path !== '')
const chrome = chromeCandidates.find((path) => existsSync(path))
if (chrome === undefined) {
  throw new Error('No se ha encontrado Chrome ni Edge. Define CHROME_PATH.')
}

const vite = spawn(process.execPath, [
  join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--strictPort',
], { cwd: root, stdio: 'ignore' })

const profile = await mkdtemp(join(tmpdir(), 'webcircuits-capas-'))
let result

try {
  await waitForServer(url)
  const dom = await runChrome(chrome, profile)
  result = parseReport(dom)
  await mkdir(join(root, 'bench', 'results'), { recursive: true })
  await writeFile(
    join(root, 'bench', 'results', 'capas.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
  )
  printSummary(result)
} finally {
  vite.kill()
  await rm(profile, { recursive: true, force: true })
}

function waitForServer(target) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const attempt = async () => {
      try {
        const response = await fetch(target)
        if (response.ok) {
          resolve()
          return
        }
      } catch {
        // Vite todavía no escucha.
      }
      if (Date.now() - started > 20_000) {
        reject(new Error('Vite no ha arrancado en 20 s.'))
        return
      }
      setTimeout(attempt, 200)
    }
    void attempt()
  })
}

function runChrome(executable, profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--hide-scrollbars',
      '--window-size=1280,800',
      '--virtual-time-budget=60000',
      `--user-data-dir=${profileDir}`,
      '--dump-dom',
      url,
    ], { stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Chrome terminó con ${code}.\n${stderr.slice(-2000)}`))
        return
      }
      resolve(stdout)
    })
  })
}

function parseReport(dom) {
  const match = /<pre id="out">([\s\S]*?)<\/pre>/.exec(dom)
  if (match === null) {
    throw new Error('No se encontró la salida del bench en el DOM.')
  }
  const text = match[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
  return JSON.parse(text)
}

function printSummary(report) {
  process.stdout.write(
    [
      `Capas: ${report.environment.layers}, compuertas: ${report.environment.gates}`,
      `Primer fotograma: ${report.initialBuild.totalMs} ms`,
      `Fotograma reutilizado: ${report.reusedFrame.totalMs} ms`,
      `Ocultar: p95 ${report.hide.p95Ms} ms (${report.hide.p95Fps} FPS)`,
      `Mostrar: p95 ${report.show.p95Ms} ms (${report.show.p95Fps} FPS)`,
      `JSON: bench/results/capas.json`,
      '',
    ].join('\n'),
  )
}

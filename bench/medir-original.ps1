#Requires -Version 5.1
<#
.SYNOPSIS
    Mide el rendimiento de la app original de LogicCircuit sobre un circuito.

.DESCRIPTION
    Lanza el ejecutable con el circuito indicado como argumento y toma medidas
    automáticas: tiempo de arranque, tiempo de carga, memoria, CPU y si la
    ventana se queda congelada mientras carga.

    Escribe el resultado en formato Markdown para pegarlo en BASE-ORIGINAL.md.

.EXAMPLE
    .\medir-original.ps1 -Circuit ..\tests\fixtures\FunctionTest.CircuitProject
    .\medir-original.ps1 -Circuit ..\tests\fixtures\ExternalCalculator.CircuitProject -KeepOpen
#>
param(
    [Parameter(Mandatory = $true)][string]$Circuit,
    [int]$TimeoutSeconds = 300,
    [int]$SampleMs = 100,
    [double]$IdleCpuMs = 8,
    [int]$IdleSamples = 15,
    [int]$AfterLoadSeconds = 5,
    [switch]$KeepOpen
)

$ErrorActionPreference = 'Stop'
$cores = [Environment]::ProcessorCount

$exeRelative = '..\..\LogicCircuit-ref\Sources\LogicCircuit\bin\Release\net10.0-windows\win-x64\LogicCircuit.exe'
$exe = (Resolve-Path (Join-Path $PSScriptRoot $exeRelative)).Path
$circuitPath = (Resolve-Path $Circuit).Path
$name = [IO.Path]::GetFileNameWithoutExtension($circuitPath)
$sizeMB = [math]::Round((Get-Item $circuitPath).Length / 1MB, 1)

# ── Entorno limpio ─────────────────────────────────────────────────────────
Get-Process -Name 'LogicCircuit' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1000

# ── Lanzar ─────────────────────────────────────────────────────────────────
$sw = [Diagnostics.Stopwatch]::StartNew()
$proc = Start-Process -FilePath $exe -ArgumentList ('"' + $circuitPath + '"') -PassThru

# ── 1) Esperar a que aparezca la ventana ───────────────────────────────────
$tWindow = $null
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Milliseconds 20
    $proc.Refresh()
    if ($proc.HasExited) { break }
    if ($proc.MainWindowHandle -ne 0) { $tWindow = $sw.Elapsed.TotalSeconds; break }
}

if ($proc.HasExited) {
    Write-Host "ERROR: la aplicacion termino sola. Codigo: $($proc.ExitCode)"
    exit 1
}

# ── 2) Esperar a que la CPU se asiente (= circuito cargado y dibujado) ─────
$frozenSamples = 0
$totalSamples = 0
$prevCpu = $proc.TotalProcessorTime.TotalMilliseconds
$idleRun = 0
$tIdle = $null

while ($sw.Elapsed.TotalSeconds -lt $TimeoutSeconds) {
    Start-Sleep -Milliseconds $SampleMs
    $proc.Refresh()
    if ($proc.HasExited) { break }

    $responding = $true
    try { $responding = $proc.Responding } catch { }
    $totalSamples++
    if (-not $responding) { $frozenSamples++ }

    $cpu = $proc.TotalProcessorTime.TotalMilliseconds
    if (($cpu - $prevCpu) -lt $IdleCpuMs) { $idleRun++ } else { $idleRun = 0 }
    $prevCpu = $cpu

    if ($idleRun -ge $IdleSamples) { $tIdle = $sw.Elapsed.TotalSeconds; break }
}

$cpuTotal = $proc.TotalProcessorTime.TotalSeconds
$ramIdle = [math]::Round($proc.WorkingSet64 / 1MB, 0)
$ramPeak = [math]::Round($proc.PeakWorkingSet64 / 1MB, 0)

# ── 3) CPU en los segundos siguientes (reposo o simulando) ─────────────────
$cpu0 = $proc.TotalProcessorTime.TotalMilliseconds
Start-Sleep -Seconds $AfterLoadSeconds
$proc.Refresh()
$cpu1 = $proc.TotalProcessorTime.TotalMilliseconds
$cpuAfter = [math]::Round((($cpu1 - $cpu0) / ($AfterLoadSeconds * 1000 * $cores)) * 100, 0)

# ── 4) Resultado ───────────────────────────────────────────────────────────
$loadSeconds = if ($tIdle) { [math]::Round($tIdle - $tWindow, 1) } else { $null }
$frozenPct = if ($totalSamples -gt 0) { [math]::Round(($frozenSamples / $totalSamples) * 100, 0) } else { 0 }
$frozenText = if ($frozenPct -ge 10) { "SI (el $frozenPct % del tiempo)" } else { "no" }

Write-Host ''
Write-Host "===== $name ($sizeMB MB) =====" -ForegroundColor Cyan
Write-Host ("Arranque (ventana visible)     : {0} s" -f [math]::Round($tWindow, 2))
Write-Host ("Carga del circuito             : {0} s" -f $(if ($loadSeconds) { $loadSeconds } else { 'NO TERMINO (timeout)' }))
Write-Host ("Ventana congelada al cargar    : $frozenText")
Write-Host ("RAM en reposo                  : $ramIdle MB")
Write-Host ("RAM pico                       : $ramPeak MB")
Write-Host ("CPU total consumida al cargar  : {0} s" -f [math]::Round($cpuTotal, 2))
Write-Host ("CPU tras cargar ($AfterLoadSeconds s)        : $cpuAfter % (del total de $cores hilos)")

# Fila lista para pegar en la tabla Markdown
$fluidez = if ($frozenPct -ge 50) { '1' } elseif ($frozenPct -ge 10) { '2' } else { '5' }
Write-Host ''
Write-Host 'Fila para BASE-ORIGINAL.md:'
Write-Host ("| ``$name`` | $sizeMB MB | $loadSeconds | $ramIdle | $ramPeak | - | $cpuAfter | - | $fluidez |")

if (-not $KeepOpen) {
    Start-Sleep -Milliseconds 500
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

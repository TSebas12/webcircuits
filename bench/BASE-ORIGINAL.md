# BASE-ORIGINAL — Línea base de rendimiento

> **Estado: ✅ medido** el **2026-10-18**.
> **Paso:** M0-12 (primera referencia). Se refinará en **M12-01**.
> **Contraparte:** `bench/PROPIO.md` (M12-02) será esta misma tabla, medida en WebCircuits.
> **Reproducible con:** `bench/medir-original.ps1` (ver «Cómo reproducirlo»).

## Para qué sirve

Sin una referencia, «optimizar» es adivinar. Esta tabla dice **cuánto tarda y cuánta
memoria come la app original** en circuitos reales. Cuando WebCircuits tenga su propio
motor, se comparan las dos tablas y se sabe **con datos** si vamos bien o mal.

Importa sobre todo en **esta** máquina, que es humilde: si aguantamos aquí, aguantamos
en cualquier sitio.

---

## Entorno de medida

| | |
|---|---|
| **CPU** | Intel Core i3-1115G4 @ 3,00 GHz — **2 núcleos / 4 hilos** |
| **RAM** | 7,7 GB |
| **GPU** | Intel UHD Graphics (integrada) |
| **Pantalla** | 1366 × 768 |
| **SO** | Windows 11 Home Single Language — build 26200 |
| **Build medido** | **Release** · `net10.0-windows` · `win-x64` (autocontenido) |
| **Versión** | LogicCircuit **2.26.09.10** · commit `1077664f9d9c5f18abece41ba00f5c58cd64fc00` |
| **Ejecutable** | `LogicCircuit-ref\Sources\LogicCircuit\bin\Release\net10.0-windows\win-x64\LogicCircuit.exe` |

> Se midió en **Release**, no en Debug: un build Debug falsearía la comparación a la baja.
> Compilado con `dotnet build LogicCircuit.slnx -c Release` → **0 errores**.

---

## Circuitos de prueba

Los más grandes de los 15 *fixtures* reales del proyecto original (`tests/fixtures/`).

| Circuito | Tamaño | Qué lo hace interesante |
|---|---|---|
| `ExternalCalculator` | 2,4 MB | El más grande de todos |
| `IntegerCalculator` | 800 KB | Carga pesada sin ser el extremo |
| `HDLTests` | 297 KB | Muchos circuitos internos |
| `Digital Clock` | 356 KB | **Animado**: se le ve funcionar (reloj) |
| `FunctionTest` | 152 KB | Tamaño medio, útil como escalón |

---

## Resultados

### Arranque

| Métrica | Valor |
|---|---|
| Arranque en frío (ventana visible) | **0,8 – 1,5 s** |
| RAM con la ventana recién abierta | ~80 MB *(antes de cargar circuito)* |

### Por circuito

| Circuito | Tamaño | Arranque (s) | **Carga (s)** | RAM reposo (MB) | RAM pico (MB) | ¿Se congeló? | CPU en reposo (%) | Fluidez |
|---|---|---|---|---|---|---|---|---|
| `ExternalCalculator` | 2,4 MB | 0,84 | **7,6** | 247 | 248 | no | 4 | 5/5 |
| `IntegerCalculator` | 800 KB | 0,81 | **5,8** | 237 | 237 | no | 6 | 5/5 |
| `HDLTests` | 297 KB | 1,42 | **6,2** | 223 | 223 | no | 0 | 5/5 |
| `Digital Clock` | 356 KB | 1,36 | **4,5** | 217 | 218 | no | 0 | 5/5 |
| `FunctionTest` | 152 KB | 1,47 | **4,2** | 227 | 227 | no | 7 | 5/5 |

> «Carga» = desde que aparece la ventana hasta que el circuito está dibujado y
> el proceso deja de trabajar. «CPU en reposo» = con el circuito **apagado**, solo la interfaz.

### Simulación

| Métrica | Valor |
|---|---|
| **CPU simulando a 2 Hz** (`Digital Clock`) | **0,2 % de media · 1,6 % de pico** |
| ¿Se puede usar la ventana mientras simula? | Sí, va fluida |
| ¿FPS de pan/zoom? | **No medido** — el original no tiene contador de FPS y no hay overlay instalado |

---

## Conclusiones (esto es lo importante)

1. **El original NO se congela al cargar.** Yo había supuesto que sí y me equivoqué. La
   carga ocurre en un **hilo aparte** (`MainFrame.xaml.cs`: `new Thread(...)` → `Edit(file)`),
   y por eso la ventana sigue respondiendo durante los 7,6 s. **No partimos de una ventaja
   aquí: es el listón que hay que igualar.**

2. **El grueso del tiempo no es el tamaño del fichero.** Hay un coste fijo de **~4 s**
   (abrir, parsear y montar la interfaz) y luego ~3 s más para el proyecto grande. Es
   decir: **4 de los 7,6 s no son culpa del circuito**. Ahí hay margen claro.

3. **La memoria es muy estable:** 217 – 248 MB. Es prácticamente todo el runtime de .NET
   y WPF, no el circuito (2,4 MB de fichero solo añaden ~25 MB).

4. **A 2 Hz la simulación es gratis** (0,2 % de CPU). El coste real aparece con circuitos
   que conmutan mucho o a máxima velocidad; eso **no se midió** (requiere pulsar
   «Ejecutar a la máxima velocidad», que no se puede activar sin interfaz).

5. **El original ya trae un aviso de CPU alta** («Aviso CPU con carga alta»). Es decir,
   el problema de «la simulación se come el equipo» lo conocen y lo vigilan. Nosotros lo
   resolvemos de raíz simulando en un **Web Worker**.

---

## Objetivos que nos marcamos a partir de esto

| Métrica | Objetivo de WebCircuits | Listón del original |
|---|---|---|
| Arranque en frío | < 1,5 s | 0,8 – 1,5 s |
| Apertura del circuito más pesado | **< 7,6 s** (hay margen: 4 s son coste fijo) | 7,6 s |
| RAM con el proyecto grande | **≤ 300 MB** | 247 MB |
| Interfaz congelada | **nunca** | nunca (ya lo cumple) |
| Fluidez pan/zoom | **60 FPS** con *culling* de viewport | no medido |

> Honestidad por delante: el punto 1 nos quita un argumento fácil («ellos se congelan,
> nosotros no»). El argumento real es el **2**: el coste fijo de 4 s es donde podemos
> ganar de forma visible, y el motor en Worker es lo que nos permite no bloquear nunca.

---

## Hallazgos para el port (M4 · persistencia)

Encontrados al montar el medidor, son gratis para el diseño del formato:

- El `.CircuitProject` guarda **`<lc:Frequency>`** y **`<lc:IsMaximumSpeed>`** en el
  elemento `<lc:Project>` (`Schema/CircuitProject.xml`, líneas 38-39).
- El **estado encendido/apagado NO se guarda**: `Mainframe.File.cs` pone `Power = false`
  al abrir cualquier fichero. Es estado de sesión, no del documento.
- La app acepta la ruta del circuito como **argumento de línea de comandos**
  (`App.xaml.cs` → `CommandLine.Parse`). De ahí que el medidor funcione en automático.
- Existe un modo `-run <script>` con **IronPython** (`App.xaml.cs`) — a tener en cuenta
  cuando lleguemos a M10 (equivale a nuestro Pyodide).

---

## Cómo reproducirlo

```powershell
cd webcircuits
.\bench\medir-original.ps1 -Circuit 'tests\fixtures\ExternalCalculator.CircuitProject'
```

El script lanza la app, mide sola y deja una fila lista para pegar en la tabla.
Opciones: `-KeepOpen` (no cerrar al terminar), `-TimeoutSeconds`, `-AfterLoadSeconds`.

---

## Registro

| Fecha | Qué |
|---|---|
| 2026-10-18 | Documento creado. Build Release compilado (0 errores) |
| 2026-10-18 | **Medidos los 5 circuitos.** Corregida la suposición errónea sobre el congelamiento de la interfaz |

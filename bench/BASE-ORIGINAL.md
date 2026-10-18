# BASE-ORIGINAL — Línea base de rendimiento

> **Estado: ⬜ pendiente de medir** (la rellena el usuario).
> **Paso:** M0-12 (primera referencia). Se refinará en **M12-01**.
> **Contraparte:** `bench/PROPIO.md` (M12-02) será la misma tabla, medida en WebCircuits.

## Para qué sirve

Sin una referencia, «optimizar» es adivinar. Esta tabla dice **cuánto tarda y cuánta
memoria come la app original** en circuitos reales. Cuando WebCircuits tenga su propio
motor, se comparan las dos tablas y se sabe **con datos** si vamos bien, mal o igual.

Importa sobre todo en esta máquina, que es humilde: si aguantamos aquí, aguantamos en
cualquier sitio.

---

## Entorno de medida

| | |
|---|---|
| **CPU** | Intel Core i3-1115G4 @ 3,00 GHz — **2 núcleos / 4 hilos** |
| **RAM** | 7,7 GB |
| **GPU** | Intel UHD Graphics (integrada) |
| **Pantalla** | 1366 × 768 |
| **SO** | Windows 11 Home Single Language — build 26200 (10.0.26200) |
| **Build medido** | **Release** · `net10.0-windows` · `win-x64` (autocontenido) |
| **Versión** | LogicCircuit **2.26.09.10** · commit `1077664f9d9c5f18abece41ba00f5c58cd64fc00` |
| **Ejecutable** | `LogicCircuit-ref\Sources\LogicCircuit\bin\Release\net10.0-windows\win-x64\LogicCircuit.exe` |

> Se mide en **Release**, no en Debug: un build Debug daría cifras pesimistas y falsearía
> la comparación. Compilado con `dotnet build LogicCircuit.slnx -c Release` → **0 errores**.

---

## Circuitos de prueba

Los grandes de los 15 *fixtures* reales del proyecto original (`tests/fixtures/`).

| Circuito | Tamaño | Qué lo hace interesante |
|---|---|---|
| `ExternalCalculator.CircuitProject` | 2,4 MB | El más grande de todos. Muchos subcircuitos |
| `IntegerCalculator.CircuitProject` | 800 KB | Carga pesada, sin ser el extremo |
| `Digital Clock.CircuitProject` | 356 KB | **Animado**: simula solo al arrancar. Ideal para CPU/FPS en marcha |
| `HDLTests.CircuitProject` | 297 KB | Circuito de pruebas amplio |
| `FunctionTest.CircuitProject` | 152 KB | Tamaño medio, útil como escalón |

---

## Método (paso a paso)

Se mide **sin otras aplicaciones abiertas** (cerrar navegador) y **cerrando la app entre
circuitos**, para que las cifras sean comparables.

1. **Abrir la app.** Mide el **arranque en frío**: cronómetro desde el doble clic hasta
   que la ventana está lista para usar.
   ```powershell
   & 'C:\Users\sebas\Downloads\VsCode\LogicCircuit\LogicCircuit-ref\Sources\LogicCircuit\bin\Release\net10.0-windows\win-x64\LogicCircuit.exe'
   ```
   *(También: si Windows asocia `.CircuitProject` al ejecutable, vale doble clic en el fichero.)*

2. **Abrir el circuito**: `File → Open` (`Ctrl+O`) → carpeta
   `webcircuits\tests\fixtures\` → elige el `.CircuitProject`.
   Cronómetro desde que confirmas hasta que está **dibujado y responde**.

3. **En reposo** (10 s sin tocar nada): anota **RAM** y **CPU**.
   - RAM: `Administrador de tareas → Detalles → LogicCircuit.exe → Conjunto de trabajo (KB)`, pasa a MB.
   - CPU: `Administrador de tareas → Procesos → LogicCircuit.exe → CPU`.

4. **Pan y zoom** (unos 15 s moviendo y acercando/alejando sin parar): anota la **RAM
   máxima**, el **%CPU** y la **fluidez**.
   - **FPS**: si tienes contador (barra de juegos de Windows `Win+G`, o el overlay del
     driver), apunta el número. Si no, valora de **1 a 5** y descríbelo.

5. **Simulando** (solo circuitos que arrancan solos, p. ej. el *Digital Clock*, o dándole a
   `Run`): anota `%CPU` y si la interfaz **responde o se atasca**.

6. Repite el **paso 2 en adelante** con cada circuito.

> Nota: los FPS exactos solo salen si hay overlay. Si no, la columna queda con la
> valoración 1-5 y una frase corta. Preferimos una cifra honesta a una inventada.

---

## Resultados

### Arranque

| Métrica | Valor |
|---|---|
| Arranque en frío (s) | ⬜ |
| RAM tras arrancar, ventana vacía (MB) | ⬜ |

### Por circuito

| Circuito | Tamaño | Apertura (s) | RAM reposo (MB) | RAM pico (MB) | CPU reposo (%) | CPU simulando (%) | FPS pan/zoom | Fluidez (1-5) |
|---|---|---|---|---|---|---|---|---|
| `ExternalCalculator` | 2,4 MB | | | | | | | |
| `IntegerCalculator` | 800 KB | | | | | | | |
| `Digital Clock` | 356 KB | | | | | | | |
| `HDLTests` | 297 KB | | | | | | | |
| `FunctionTest` | 152 KB | | | | | | | |

### Observaciones

- **Puntos donde sufre:** *(rellenar — p. ej. «la apertura de ExternalCalculator tarda
  X s y congela la ventana todo ese tiempo»)*
- **Puntos donde va bien:** *(rellenar)*
- **¿Se puede usar mientras simula?** *(rellenar)*

---

## Qué significará para nosotros

Criterios que nos marcamos a partir de esta tabla (se ajustan cuando haya números):

| Métrica | Objetivo de WebCircuits |
|---|---|
| Apertura del circuito más pesado | **≤** lo que tarde el original, idealmente menos |
| RAM en reposo | **≤** el original (aun aceptando que el navegador pesa más de base) |
| Fluidez pan/zoom | **60 FPS** estables con *culling* de viewport (ver skill `webcircuits-canvas`) |
| Simulación | Sin bloquear la interfaz → **Web Worker** (decisión ya tomada en el plan) |

> La ventaja estructural que sí tenemos: WebCircuits simula en un **Web Worker**, así que
> la interfaz **nunca** debería congelarse al abrir o simular. Si el original congela la
> ventana en la apertura, ese es un punto donde podemos ganar de forma visible.

---

## Registro

| Fecha | Qué |
|---|---|
| 2026-10-18 | Documento creado. Build Release compilado ✅. Pendiente de que el usuario tome las medidas |

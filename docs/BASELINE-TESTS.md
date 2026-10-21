# BASELINE — Tests del original (el oráculo C#)

> **Entregable de M0-05 · Línea base de corrección.**
> Fecha: 2026-10-18 · Proyecto: **WebCircuits**

## Por qué existe este documento

El proyecto original (`LogicCircuit-ref/`) trae **179 tests**. Son el **contrato de
corrección** de WebCircuits: si nuestra versión produce los mismos resultados que
estos tests esperan, vamos por buen camino.

Aquí queda registrado *cuántos* son y *en qué estado* están **antes de empezar**, para
no confundir nuestros bugs futuros con bugs que ya existían.

---

## Entorno de la medición

| Dato | Valor |
|---|---|
| Commit de referencia | `1077664f9d9c5f18abece41ba00f5c58cd64fc00` (2026-10-15) |
| Versión de LogicCircuit | `2.26.09.10` |
| SDK | .NET **10.0.402** |
| Target | `net10.0-windows` (WPF) |
| Framework de test | MSTest `4.5.1` + Microsoft.NET.Test.Sdk `18.10.1` |
| Sistema | Windows 11 Home · **cultura es-ES** |
| Duración de la suite | ~35 s |

---

## Resultado

| Métrica | Valor |
|---|---|
| **Tests totales** | **179** |
| ✅ Superados | **176** |
| ❌ Fallidos | **3** |
| ⏭️ Omitidos | 0 |

### Los 3 fallos — todos por la cultura del equipo, NO por bugs del producto

| Test | Causa raíz |
|---|---|
| `HdlTestTruthTables` | `Double.Parse("19.7")` **sin** `InvariantCulture` → en es-ES el `.` es separador de miles, así que `"19.7"` es inválido → `FormatException` |
| `HdlTestLocale` | **El mismo** bug de `Double.Parse` en `HdlTest.SortByNote` (línea 39) |
| `FunctionTest` | El test espera el mensaje **en inglés** (`"Function name 'c' is conflicting with pin name"`), pero la app responde en **español**. Aserción dependiente del idioma |

> **Conclusión:** en un equipo con cultura en-US la suite daría **179/179**. Los 3 fallos
> son defectos **de los propios tests**, no del simulador.
>
> ⚠️ **Probado y descartado:** ejecutar con `DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`
> **empeora** el resultado (**13 fallos**), porque desactiva ICU y rompe los tests de
> localización. **No usar.**

### Re-medición (2026-10-21)

Se volvió a ejecutar la suite completa durante la revisión de los módulos. Resultado:
**174 ✅ / 5 ❌** en **6 min 11 s** (frente a los ~35 s de la medición original).

| Test | Causa |
|---|---|
| `HdlTestTruthTables`, `HdlTestLocale`, `FunctionTest` | Los **3 mismos fallos de cultura** de la medición original |
| `CircuitMapApplyPerfTest1`, `CircuitMapApplyPerfTest2` | **Umbral de rendimiento**: el equipo estaba ejecutando a la vez la suite de Vitest y Chrome; el mapa se crea y aplica bien, pero tarda más de lo que el test exige. No es un fallo funcional |

> **Cómo leerlo:** los 3 fallos de cultura son de los tests, no del simulador. Los 2 de
> rendimiento son **dependientes de la carga de la máquina** y no aparecen cuando la suite
> corre sola. Para comparar rendimiento hay que usar la medición de M12, no este umbral.

---

## Cómo reproducir la medición

```powershell
cd C:\Users\sebas\Downloads\VsCode\LogicCircuit\LogicCircuit-ref\Sources

# M0-04 · Compilar el original
dotnet build LogicCircuit.slnx

# M0-05 · Ejecutar los tests
dotnet test LogicCircuit.UnitTest\LogicCircuit.UnitTest.csproj
```

### El build exige 7-Zip

El target `ZipIronPythonStdLibFiles` (`Sources\Directory.Build.targets`, línea 50)
empaqueta el *stdlib* de IronPython y **aborta el build si no encuentra
`C:\Program Files\7-Zip\7z.exe`**.

No es un error de compilación: `LogicCircuit.dll` se genera correctamente; solo falla
el paso de empaquetado posterior.

**Solución sin instalar nada** (una sola vez; después el target se salta solo por
incrementalidad, porque la salida ya es más nueva que la entrada):

```powershell
$out = 'LogicCircuit\bin\Debug\net10.0-windows'
Compress-Archive -Path "$out\lib\*" -DestinationPath "$out\IPyLib.zip" -Force
```

**Solución aplicada (2026-10-18):** 7-Zip **26.04** instalado con `winget install 7zip.7zip`.
Verificado borrando el `IPyLib.zip` y reconstruyendo: 7-Zip lo regenera (635 ficheros,
4,8 MB) y la compilación queda **verde (0 errores)**. El paso manual ya **no** es necesario.

*(Se deja el workaround documentado por si alguien compila en una máquina sin 7-Zip.)*

---

## Lecciones para WebCircuits (¡importantes!)

1. **Nunca parsear números dependiendo de la cultura.** El bug de `Double.Parse("19.7")`
   es exactamente el tipo de fallo que debemos evitar. En TypeScript: usar `Number()`
   sobre datos propios (JSON), y **jamás** parsear texto localizado.
2. **La app original está localizada a 22 idiomas**, y eso *rompe sus propios tests*
   cuando el idioma del sistema no es inglés. Nuestros tests deben **fijar el idioma
   explícitamente** en lugar de depender del entorno. (Apunta directo a los hitos M6 y M11.)
3. **Los 179 tests son el contrato de paridad.** Aunque aquí fallen 3, los 176 que pasan
   definen el comportamiento esperado de WebCircuits: parser XML `.CircuitProject`,
   Verilog, tablas de verdad, *splitters*, sensores, tipos de datos, etc. Ver `PARIDAD.md`.

---

## Logs crudos

| Fichero | Qué es |
|---|---|
| `docs/baseline/lc-tests.log` | Salida completa con cultura es-ES → **176/179** |
| `docs/baseline/lc-tests-invariante.log` | Prueba descartada (invariante) → 166/179 |

> Nota: los logs vienen de la consola de Windows, así que las tildes pueden verse como
> `��` o similar. Los números y el contenido son correctos.

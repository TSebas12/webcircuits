# THIRD-PARTY — Atribuciones y licencias

## LogicCircuit (la obra original)

Este proyecto **porta funcionalidad de LogicCircuit** (© LogicCircuit.org),
licenciado bajo **Apache License 2.0**.

- Referencia: <https://github.com/eugenelepekhin/LogicCircuit>
- Commit de referencia: `1077664f9d9c5f18abece41ba00f5c58cd64fc00`
- Versión de referencia: `2.26.09.10`

Las **gramáticas ANTLR (`.g4`)** y los **esquemas XSD** derivan de esa fuente.

### Qué implica Apache 2.0

| Permitido | Requisitos |
|---|---|
| Uso comercial, modificar, distribuir, sublicenciar | Mantener el aviso de copyright y la licencia · indicar los cambios realizados |

**Nota importante:** Apache 2.0 **no concede derechos de marca**. Por eso este
proyecto se llama **WebCircuits** y no «LogicCircuit».

---

## Dependencias

### Actuales

| Dependencia | Licencia | Para qué |
|---|---|---|
| Svelte | MIT | Framework de UI |
| Vite | MIT | Empaquetado y servidor de desarrollo |
| TypeScript | Apache 2.0 | Lenguaje |
| Vitest | MIT | Tests |
| ESLint | MIT | Análisis estático |
| Prettier | MIT | Formato de código |

### Previstas

| Dependencia | Licencia | Para qué | Hito |
|---|---|---|---|
| Pyodide | MPL 2.0 | Scripting Python (sustituye a IronPython) | M10 |
| ANTLR4 (JS) | BSD 3-Clause | Filtros de tabla de verdad (`.g4`) | M8 |

> Se irán añadiendo conforme entren en el proyecto.

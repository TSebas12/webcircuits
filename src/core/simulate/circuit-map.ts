/**
 * El mapa de simulación: el árbol de circuitos y el aplanado que lo convierte en funciones.
 *
 * Portado de `LogicCircuit/Runner/CircuitMap.cs` (y sus dos parciales, `SymbolMap` y
 * `Connection`).
 *
 * Ésta es la pieza que el resto del motor daba por hecha. `CircuitState` sabe evaluar una
 * lista de funciones, pero **nadie se la daba**: el modelo guarda un circuito como una
 * lista de piezas y cables, no como un grafo de quién alimenta a quién. El mapa es ese
 * traductor, y lo hace en tres pasos que conviene tener separados en la cabeza:
 *
 * 1. **Expandir** (`expand`): bajar por el árbol. Cada subcircuito colocado se convierte en
 *    un hijo. Si al bajar se vuelve a pasar por un circuito que ya está en la rama, es un
 *    lazo y se avisa: un circuito no puede ser parte de sí mismo.
 * 2. **Conectar** (`connectMap` + `connect`): mirar la rejilla y decidir qué punta alimenta
 *    a cuál. Cada punta de salida busca su conductor (`ConductorMap`) y todo lo que toque
 *    ese conductor son entradas suyas. Es la traducción de «cables que se tocan» a «esto
 *    alimenta aquello».
 * 3. **Aplanar** (`collect` + `connectResults` + `cleanup`): recorrer el árbol y quedarse
 *    con las hojas —los símbolos primitivos—, dando a cada bit un índice. En el camino se
 *    atraviesan los pines de hoja (que llevan de dentro a fuera) y los repartidores (que
 *    llevan de un bit a otro).
 *
 * Al final, `apply` pide los índices al `CircuitState`, crea una función por símbolo y
 * devuelve el estado listo para evaluar.
 *
 * ⚠️ **Dos cuentas distintas que parecen la misma.** Los cables se resuelven **por
 * circuito** (`ConnectionSet`), porque las puntas pertenecen al símbolo colocado dentro de
 * un circuito y valen para todas sus colocaciones. El aplanado, en cambio, es **por
 * colocación**: cada instancia tiene sus propios índices de estado. Confundirlas hace que
 * un circuito con dos subcircuitos iguales simule mal, y solo se nota cuando los dos
 * subcircuitos evolucionan distinto (un contador, por ejemplo).
 */

import { CircuitError } from '../circuit-error'
import {
  FunctionAnd,
  FunctionAndNot,
  FunctionNot,
  FunctionOr,
  FunctionOrNot,
  FunctionTriState,
  FunctionTriStateGroup,
  FunctionXor,
  FunctionXorNot,
} from '../function/gates'
import type { CircuitFunction } from '../function/circuit-function'
import { SymbolMap, SymbolMapKey, SymbolMapList, jamBitKey, type Result } from './symbol-map'
import { ConnectionSet } from './connection'
import { CircuitState } from './circuit-state'
import {
  conductorMapOf,
  isPrimitive,
  jamsByPinOrder,
  symbolsOf,
  type CircuitSymbol,
  type Jam,
  type SymbolIndex,
} from '../model/symbol'
import type { Circuit, Gate, GateType, GridPoint, Id, Wire } from '../model/types'

/**
 * Ancho de la rejilla de un circuito lógico, para ordenar los hijos (original:
 * `Symbol.LogicalCircuitGridWidth = 170`).
 *
 * Solo se usa para dar un orden estable a los subcircuitos —de arriba abajo y de izquierda
 * a derecha—, de modo que el aplanado salga igual en dos ejecuciones. No influye en el
 * resultado, pero sí en qué error se avisa primero cuando hay varios.
 */
const LOGICAL_CIRCUIT_GRID_WIDTH = 170

/** La clave de un punto de la rejilla. */
function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

let nextMapId = 1

export class CircuitMap {
  /** Identificador único dentro del árbol, para las claves (original: identidad del objeto). */
  readonly mapId: number = nextMapId++

  /** Los símbolos colocados en esta hoja, tal cual. */
  private symbols: CircuitSymbol[] = []

  /** Los subcircuitos colocados, por símbolo. */
  private childMaps: Map<CircuitSymbol, CircuitMap> | null = null

  /** Solo existe en la raíz: el aplanado, para poder volver de un símbolo a su estado. */
  private readonly rootResults: Map<string, SymbolMap> | null

  /** Solo existe en la raíz: las puntas de cada circuito, por punto. */
  private jamMaps: Map<Id, Map<string, Jam[]>> | null = null

  private turnedOn = false

  private constructor(
    private readonly index: SymbolIndex,
    readonly circuit: Circuit,
    readonly parent: CircuitMap | null,
    readonly circuitSymbol: CircuitSymbol | null,
  ) {
    this.rootResults = parent === null ? new Map() : null
  }

  /**
   * El mapa de un circuito entero, listo para aplanar.
   *
   * Se llama en la raíz —el circuito que se está simulando— y es el único sitio donde se
   * baja por el árbol: si hay un lazo, salta aquí.
   */
  static create(index: SymbolIndex, circuit: Circuit): CircuitMap {
    const map = new CircuitMap(index, circuit, null, null)
    map.expand()
    return map
  }

  /** Baja por el árbol: cada subcircuito colocado pasa a ser un hijo. */
  private expand(): void {
    this.symbols = []
    for (const symbol of symbolsOf(this.index, this.circuit.id)) {
      this.symbols.push(symbol)
      if (symbol.depicted.kind !== 'subcircuit') {
        continue
      }
      const inner = symbol.depicted.circuit
      if (this.hasLoop(inner)) {
        throw new CircuitError(
          `El circuito «${inner.name}» se contiene a sí mismo, directa o indirectamente ` +
            `(a través de «${this.circuit.name}»). Un circuito no puede ser parte de sí mismo.`,
        )
      }
      const child = new CircuitMap(this.index, inner, this, symbol)
      this.childMaps ??= new Map()
      this.childMaps.set(symbol, child)
      child.expand()
    }
  }

  /** ¿Este circuito ya está en la rama de arriba? Entonces es un lazo. */
  private hasLoop(circuit: Circuit): boolean {
    return this.circuit === circuit || this.ancestors.some((map) => map.circuit === circuit)
  }

  /** Los mapas de arriba, de padre a raíz (el primero es el padre). */
  private get ancestors(): CircuitMap[] {
    const list: CircuitMap[] = []
    let map = this.parent
    while (map !== null) {
      list.push(map)
      map = map.parent
    }
    return list
  }

  /** El mapa de un subcircuito colocado, si lo tiene. */
  child(symbol: CircuitSymbol): CircuitMap | null {
    return this.childMaps?.get(symbol) ?? null
  }

  /** Los hijos, de arriba abajo y de izquierda a derecha (orden estable). */
  get children(): CircuitMap[] {
    return [...(this.childMaps?.values() ?? [])].sort((a, b) => childSortKey(a) - childSortKey(b))
  }

  get root(): CircuitMap {
    return this.ancestors.at(-1) ?? this
  }

  get isRoot(): boolean {
    return this.parent === null
  }

  /** El camino hasta aquí, para los mensajes de error. */
  path(): string {
    const parent = this.parent === null ? '' : this.parent.path()
    const local =
      this.circuitSymbol === null
        ? ''
        : `(${this.circuitSymbol.position.x},${this.circuitSymbol.position.y})`
    // El original usa `Properties.Resources.CircuitMapPathSeparator`; esto es texto para
    // personas, así que se queda en la barra mientras los demás textos esperan a i18n (M11).
    return `${parent}/${this.circuit.name}${local}`
  }

  /**
   * Las puntas de cada circuito, por punto de la rejilla (original: `JamMap`).
   *
   * Se calcula una vez por circuito y se guarda en la raíz: lo usan tanto la conexión como
   * la búsqueda de índices de estado, y recalcularlo en cada consulta sería recorrer el
   * circuito entero cada vez.
   */
  private get jamMap(): Map<string, Jam[]> {
    const root = this.root
    root.jamMaps ??= new Map()
    let map = root.jamMaps.get(this.circuit.id)
    if (map === undefined) {
      map = new Map()
      root.jamMaps.set(this.circuit.id, map)
      for (const symbol of this.symbols) {
        for (const jam of symbol.jams) {
          const key = pointKey(jam.point)
          const list = map.get(key)
          if (list === undefined) {
            map.set(key, [jam])
          } else {
            list.push(jam)
          }
        }
      }
    }
    return map
  }

  /** El mapa de conductores de esta hoja. */
  private conductorMap() {
    return conductorMapOf(this.index, this.circuit.id)
  }

  /** Resuelve los cables de todo el árbol (solo desde la raíz). */
  connectionSet(): ConnectionSet {
    // Tracer.Assert(this.isRoot, 'Solo tiene sentido en la raíz')
    const connectionSet = new ConnectionSet()
    this.connectMap(connectionSet)
    return connectionSet
  }

  private connectMap(connectionSet: ConnectionSet): void {
    if (!connectionSet.isConnected(this.circuit.id)) {
      for (const child of this.childMaps?.values() ?? []) {
        child.connectMap(connectionSet)
      }
      this.connect(connectionSet)
      connectionSet.markConnected(this.circuit.id)
    }
  }

  /**
   * Decide qué punta alimenta a qué punta en **esta** hoja.
   *
   * Dos pasadas con un mapa de puntas en medio: primero se apuntan todas las puntas que
   * pueden **recibir** (todo lo que no sea una salida), por punto; luego, cada salida busca
   * su conductor y todo lo que caiga en ese conductor son sus receptoras.
   *
   * El cuidado está en `inJam === outJam`: una punta no se conecta consigo misma. Y en el
   * ancho: si una entrada y una salida tienen anchos distintos, es un error del circuito.
   * El original perdona el caso de que la receptora sea una **probeta**, que se conecta a
   * cualquier ancho porque solo mira; como las probetas no existen todavía (M2-12), aquí no
   * se perdona nada, y cuando lleguen hay que añadir esa excepción.
   */
  private connect(connectionSet: ConnectionSet): void {
    // Tracer.Assert(!connectionSet.isConnected(this.circuit.id))

    const inJamMap = new Map<string, Jam[]>()
    for (const symbol of this.symbols) {
      for (const jam of symbol.jams) {
        if (jam.effectivePinType === 'output') {
          continue
        }
        const key = pointKey(jam.point)
        const list = inJamMap.get(key)
        if (list === undefined) {
          inJamMap.set(key, [jam])
        } else {
          list.push(jam)
        }
      }
    }

    const conductorMap = this.conductorMap()
    for (const symbol of this.symbols) {
      for (const outJam of symbol.jams) {
        if (outJam.effectivePinType === 'input') {
          continue
        }
        const conductor = conductorMap.tryGetValue(outJam.point)
        if (conductor === undefined) {
          continue
        }
        for (const point of conductor.points) {
          const list = inJamMap.get(pointKey(point))
          if (list === undefined) {
            continue
          }
          for (const inJam of list) {
            if (inJam === outJam) {
              continue
            }
            if (inJam.bitWidth !== outJam.bitWidth) {
              throw new CircuitError(
                `Dos piezas de «${this.circuit.name}» están conectadas por un cable de ` +
                  `${inJam.bitWidth} bits y otro de ${outJam.bitWidth} bits. Un cable no ` +
                  `puede llevar dos anchos distintos.`,
              )
            }
            connectionSet.connect(inJam, outJam)
          }
        }
      }
    }
  }

  /**
   * Aplana el circuito y devuelve el estado listo para evaluar.
   *
   * Los pasos están en el orden del original y el orden importa: primero se recoge (qué
   * hay), luego se conecta (quién alimenta a quién), luego se limpia (fuera lo que no
   * alimenta a nadie), luego se valida (¿hay algo imposible?) y solo entonces se piden los
   * índices de estado. Pedirlos antes de limpiar dejaría huecos en el array.
   */
  apply(probeCapacity: number): CircuitState {
    // Tracer.Assert(this.isRoot, 'Solo tiene sentido en la raíz')
    const connectionSet = this.connectionSet()

    const list = new SymbolMapList()
    this.collect(list)
    this.connectResults(connectionSet, list)

    cleanup(list)
    validate(list)

    const circuitState = new CircuitState(3)
    for (const symbolMap of list.symbolMaps) {
      for (const result of symbolMap.results) {
        result.allocate(circuitState)
      }
    }

    for (const symbolMap of list.symbolMaps) {
      applySymbol(circuitState, symbolMap, probeCapacity)
      symbolMap.circuitMap.root.rootResults?.set(
        new SymbolMapKey(symbolMap.circuitMap, symbolMap.circuitSymbol).key,
        symbolMap,
      )
    }
    circuitState.endDefinition()

    return circuitState
  }

  /**
   * Recoge los símbolos primitivos de todo el árbol.
   *
   * Un símbolo primitivo entra en la lista con un resultado por cada bit de salida. Un
   * subcircuito no entra: se baja a él. Y lo que no es ni una cosa ni la otra —un pin de
   * hoja o un repartidor— tampoco: se atraviesa durante la conexión, no se simula.
   */
  private collect(list: SymbolMapList): void {
    for (const symbol of this.symbols) {
      if (isPrimitive(symbol.depicted)) {
        list.addSymbol(this, symbol)
        for (const jam of symbol.jams) {
          if (jam.pin.type === 'output') {
            for (let bit = 0; bit < jam.bitWidth; bit += 1) {
              list.addResult(this, jam, bit)
            }
          }
        }
      } else if (symbol.depicted.kind === 'subcircuit') {
        this.child(symbol)?.collect(list)
      } else {
        // Tracer.Assert(el símbolo es un pin de hoja o un repartidor)
      }
    }
  }

  /**
   * Los índices de estado de una punta concreta de esta hoja.
   *
   * Es lo que necesita el editor para saber qué mirar cuando alguien pregunta por un cable
   * (por ejemplo, para pintar su valor): los cables no tienen estado, quien lo tiene son
   * los bits de los símbolos a los que toca.
   */
  stateIndexes(wire: Wire): number[] {
    // Tracer.Assert(this.circuit == wire.LogicalCircuit)
    const conductor = this.conductorMap().tryGetValue(wire.p1)
    if (conductor === undefined) {
      return []
    }
    const jams = this.jamsOn(conductor.points)
    if (jams.length === 0) {
      return []
    }

    for (const jam of jams) {
      if (!isPrimitive(jam.symbol.depicted)) {
        continue
      }
      const symbolMap = this.symbolMapOf(jam)
      if (symbolMap === null) {
        continue
      }
      if (jam.pin.type === 'output') {
        return symbolMap.results.map((result) => result.stateIndex)
      }
      return symbolMap.allParameters(jam).map((parameter) => parameter.result.stateIndex)
    }

    const start = jams.find((jam) => !isPrimitive(jam.symbol.depicted))
    if (start !== undefined) {
      const list: number[] = []
      this.stateIndexesAt(list, start.point, false, 0, start.bitWidth, new Set())
      return list
    }
    return []
  }

  /**
   * Busca los índices de estado desde un punto, atravesando lo que haga falta.
   *
   * El recorrido es el mismo que el del aplanado, pero al revés: dado un cable, ¿qué bits
   * guardan su valor? Hay que atravesar pines de hoja —hacia arriba, hasta la hoja donde
   * vive el subcircuito—, bajar por subcircuitos y cruzar repartidores.
   *
   * `ignore` es lo que evita morderse la cola: al entrar en un sitio ya visitado, no se
   * vuelve a mirar el punto por el que se ha entrado.
   */
  private stateIndexesAt(
    list: number[],
    point: GridPoint,
    ignore: boolean,
    start: number,
    count: number,
    visited: Set<string>,
  ): boolean {
    const conductor = this.conductorMap().tryGetValue(point)
    if (conductor === undefined) {
      return false
    }
    const jams = this.jamsOn(conductor.points)

    for (const jam of jams) {
      if (!isPrimitive(jam.symbol.depicted)) {
        continue
      }
      const symbolMap = this.symbolMapOf(jam)
      if (symbolMap === null) {
        continue
      }
      if (jam.pin.type === 'output') {
        list.push(
          ...symbolMap.results.slice(start, start + count).map((result) => result.stateIndex),
        )
      } else {
        list.push(
          ...symbolMap
            .allParameters(jam)
            .slice(start, start + count)
            .map((parameter) => parameter.result.stateIndex),
        )
      }
      return true
    }

    for (const jam of jams) {
      if (isPrimitive(jam.symbol.depicted)) {
        continue
      }
      if (ignore && pointKey(jam.point) === pointKey(point)) {
        continue
      }

      const depicted = jam.symbol.depicted
      if (depicted.kind === 'subcircuit') {
        if (visited.has(jamBitKey(this.mapId, jam, start))) {
          continue
        }
        visited.add(jamBitKey(this.mapId, jam, start))
        const child = this.child(jam.symbol)
        const inner = jam.innerJam
        if (child !== null && inner !== null) {
          if (child.stateIndexesAt(list, inner.point, true, start, count, visited)) {
            return true
          }
        }
      } else if (depicted.kind === 'pin') {
        if (this.parent !== null) {
          const outer = this.circuitSymbol === null ? null : outerJam(this.circuitSymbol, jam)
          if (
            outer !== null &&
            this.parent.stateIndexesAt(list, outer.point, true, start, count, visited)
          ) {
            return true
          }
        }
      } else if (depicted.kind === 'splitter') {
        if (
          splitterStateIndexes(jam, start, count, (theJam, theStart, theCount) =>
            this.stateIndexesAt(list, theJam.point, true, theStart, theCount, visited),
          )
        ) {
          return true
        }
      } else {
        // Tracer.Fail()
      }
    }
    return false
  }

  /** Las puntas que caen en un conjunto de puntos de esta hoja. */
  private jamsOn(points: readonly GridPoint[]): Jam[] {
    const map = this.jamMap
    const jams: Jam[] = []
    for (const point of points) {
      jams.push(...(map.get(pointKey(point)) ?? []))
    }
    return jams
  }

  /** El trozo de aplanado de un símbolo de esta hoja. */
  private symbolMapOf(jam: Jam): SymbolMap | null {
    return this.root.rootResults?.get(new SymbolMapKey(this, jam.symbol).key) ?? null
  }

  /**
   * Recorre los resultados y anota de dónde lee cada entrada (original:
   * `CircuitMap.Connect`, el estático).
   *
   * El conjunto de visitados se limpia por cada resultado: cada uno explora su propio
   * camino, pero dentro de un camino no se repite el par (punta, bit).
   */
  private connectResults(connectionSet: ConnectionSet, list: SymbolMapList): void {
    for (const symbolMap of list.symbolMaps) {
      for (const result of symbolMap.results) {
        symbolMap.circuitMap.connectResult(
          connectionSet,
          list,
          result,
          result.jam,
          result.bitNumber,
          new Set(),
        )
      }
    }
  }

  /**
   * Sigue el cable de un bit hasta sus entradas.
   *
   * Aquí está la parte más delicada del port: el mismo procedimiento atraviesa cuatro cosas
   * distintas —un símbolo primitivo, un pin de hoja (que sale del circuito), un subcircuito
   * (que entra) y un repartidor (que cambia de bit)— y lo hace recursivamente.
   *
   * ⚠️ **`this` cambia al atravesar.** Un pin de hoja y un subcircuito se siguen desde el
   * mapa del otro lado (`this.parent` / `this.child(symbol)`), y el parámetro se anota en el
   * mapa donde vive la punta que **recibe** —no en el del resultado—, que es lo que hace que
   * cada bit quede apuntando a su función aunque cruce hojas.
   */
  private connectResult(
    connectionSet: ConnectionSet,
    list: SymbolMapList,
    result: Result,
    jam: Jam,
    bitNumber: number,
    visited: Set<string>,
  ): void {
    // Tracer.Assert(bitNumber < jam.Pin.BitWidth)
    const key = jamBitKey(this.mapId, jam, bitNumber)
    if (visited.has(key)) {
      return
    }
    visited.add(key)

    for (const connection of connectionSet.selectByOutput(jam)) {
      const target = connection.inJam
      const depicted = target.symbol.depicted

      if (isPrimitive(depicted)) {
        list.addParameter(result, this, target, bitNumber)
      } else if (depicted.kind === 'pin') {
        if (this.parent !== null && this.circuitSymbol !== null) {
          const outer = outerJam(this.circuitSymbol, target)
          if (outer !== null) {
            this.parent.connectResult(connectionSet, list, result, outer, bitNumber, visited)
          }
        }
      } else if (depicted.kind === 'subcircuit') {
        const child = this.child(target.symbol)
        const inner = target.innerJam
        if (child !== null && inner !== null) {
          child.connectResult(connectionSet, list, result, inner, bitNumber, visited)
        }
      } else if (depicted.kind === 'splitter') {
        const passed = splitterPass(target, bitNumber)
        this.connectResult(connectionSet, list, result, passed.jam, passed.bit, visited)
      } else {
        // Tracer.Fail()
      }
    }
  }

  // ── Encendido y apagado ──────────────────────────────────────────────────────────────

  /**
   * Enciende lo que tenga estado propio.
   *
   * Las constantes emiten su valor y los indicadores (probetas, interruptores, sensores…)
   * se enganchan a la simulación. Todavía **no hay ninguno**: las funciones visuales llegan
   * en M2-04/M2-12, así que las colecciones están vacías y esto se recorre entero sin hacer
   * nada. Se deja portado para no tener que volver a la estructura.
   */
  turnOn(): void {
    if (!this.turnedOn) {
      // TODO(M2-04/M2-12): encender indicadores y constantes
      this.turnedOn = true
    }
  }

  turnOff(): void {
    if (this.turnedOn) {
      // TODO(M2-04/M2-12): apagar indicadores, constantes y memorias
      this.turnedOn = false
    }
    for (const child of this.childMaps?.values() ?? []) {
      child.turnOff()
    }
  }
}

// ── El aplanado: los pasos estáticos ───────────────────────────────────────────────────

/**
 * Quita del aplanado lo que no alimenta a nadie (original: `CircuitMap.CleanUp`).
 *
 * Un símbolo con salidas pero sin ningún consumidor no influye en nada: se quita de la
 * lista, y sus parámetros se quitan también de los resultados que los alimentaban. Eso deja
 * a los que lo alimentaban sin consumidor, y en la vuelta siguiente caen ellos: la poda
 * avanza **hacia atrás**, desde lo que ya no llega a ninguna parte hasta la fuente que solo
 * existía para eso. Se repite hasta que no queda nada que quitar.
 *
 * La excepción es la matriz gráfica, que existe **para mirarla**: aunque no alimente a
 * nada, quitarla cambiaría lo que se dibuja.
 */
function cleanup(list: SymbolMapList): void {
  const unconnected = new Set<SymbolMap>()
  do {
    unconnected.clear()
    for (const symbolMap of list.symbolMaps) {
      if (!symbolMap.hasResults || isGraphicsArray(symbolMap)) {
        continue
      }
      const connected = symbolMap.results.some((result) => result.parameters.length > 0)
      if (connected) {
        continue
      }
      for (const parameter of symbolMap.parameters) {
        const owner = parameter.result.parameters
        const index = owner.indexOf(parameter)
        if (index >= 0) {
          owner.splice(index, 1)
        }
      }
      unconnected.add(symbolMap)
    }
    for (const map of unconnected) {
      list.remove(map)
    }
  } while (unconnected.size > 0)
}

/** ¿Este símbolo es una matriz gráfica? (No se limpia aunque no alimente a nadie.) */
function isGraphicsArray(symbolMap: SymbolMap): boolean {
  const depicted = symbolMap.circuitSymbol.depicted
  return depicted.kind === 'device' && depicted.element.kind === 'graphicsArray'
}

/**
 * Comprueba lo que el circuito no puede hacer (original: `CircuitMap.Validate`).
 *
 * De momento solo hay un caso: dos memorias que guardan sus datos entre ejecuciones no
 * pueden arrancar con los mismos datos, porque entonces no se sabe cuál manda. La
 * comprobación está portada pero **no puede saltar todavía**: las memorias no saben
 * colocarse ni tienen `OnStart` en el modelo (M2-05).
 */
function validate(list: SymbolMapList): void {
  const persisted = new Set<CircuitSymbol>()
  for (const symbolMap of list.symbolMaps) {
    const depicted = symbolMap.circuitSymbol.depicted
    if (depicted.kind === 'device' && depicted.element.kind === 'memory') {
      // TODO(M2-05): cuando el modelo tenga `onStart`, comprobar que dos memorias que
      // conservan sus datos no arranquen con los mismos datos iniciales.
      persisted.add(symbolMap.circuitSymbol)
    }
  }
}

/**
 * Crea la función de un símbolo primitivo (original: `CircuitMap.Apply`).
 *
 * ⚠️ Solo están portadas las que ya tienen función: las compuertas y el tri-estado. Las
 * demás —reloj, LED, interruptor, constante, memoria, probeta, sensor, sonido, matriz—
 * avisan en vez de simular mal. Llegan con M2-04/M2-05/M2-12, que es cuando existen sus
 * clases de función.
 */
function applySymbol(
  circuitState: CircuitState,
  symbolMap: SymbolMap,
  probeCapacity: number,
): void {
  void probeCapacity // TODO(M2-12): las probetas necesitan su capacidad al crearse

  const depicted = symbolMap.circuitSymbol.depicted

  if (depicted.kind === 'gate') {
    switch (depicted.element.gateType) {
      case 'not':
      case 'or':
      case 'and':
      case 'xor':
        defineGate(depicted.element, circuitState, symbolMap)
        return
      case 'triState1':
      case 'triState2':
        defineTriState(circuitState, symbolMap)
        return
      case 'clock':
      case 'led':
        throw new CircuitError(
          `La simulación de «${depicted.element.gateType}» todavía no está portada (M2-04).`,
        )
      default:
        throw new CircuitError(`La compuerta «${depicted.element.gateType}» no se puede simular.`)
    }
  }

  const what =
    depicted.kind === 'button'
      ? 'el interruptor'
      : depicted.kind === 'device'
        ? `«${depicted.element.kind}»`
        : `«${depicted.kind}»`
  throw new CircuitError(`La simulación de ${what} todavía no está portada (M2-04/M2-05/M2-12).`)
}

/** La función de una compuerta (original: `CircuitMap.DefineGate`). */
function defineGate(
  gate: Gate,
  circuitState: CircuitState,
  symbolMap: SymbolMap,
): CircuitFunction | null {
  const result = singleResult(symbolMap.results)
  const mapList: number[] = []
  for (const parameter of symbolMap.parameters) {
    const index = parameter.result.stateIndex
    if (0 < index) {
      mapList.push(index)
    }
  }
  if (mapList.length === 0) {
    // Una compuerta sin ninguna entrada conectada no tiene nada que evaluar: el original
    // devuelve null y no crea función.
    return null
  }
  mapList.sort((a, b) => a - b)
  const parameter = mapList

  if (gate.invertedOutput) {
    switch (gate.gateType) {
      case 'not':
        return new FunctionNot(circuitState, parameter[0]!, result)
      case 'or':
        return FunctionOrNot.create(circuitState, parameter, result)
      case 'and':
        return FunctionAndNot.create(circuitState, parameter, result)
      case 'xor':
        return FunctionXorNot.create(circuitState, parameter, result)
    }
  } else {
    switch (gate.gateType) {
      case 'or':
        return FunctionOr.create(circuitState, parameter, result)
      case 'and':
        return FunctionAnd.create(circuitState, parameter, result)
      case 'xor':
        return FunctionXor.create(circuitState, parameter, result)
    }
  }
  // Tracer.Fail()
  return null
}

/**
 * La función de una compuerta tri-estado (original: `CircuitMap.DefineTriState`).
 *
 * El tri-estado es el único que necesita saber **quién más escribe** en su cable: si hay
 * varios, se crea un grupo que junta sus índices privados y decide cuál está emitiendo.
 *
 * Las puntas se leen **por orden de creación**, no por lados: `jam[0]` es el dato, `jam[1]`
 * la habilitación y `jam[2]` la salida. Con una compuerta normal daría igual, pero el
 * tri-estado tiene la habilitación arriba o abajo, y por lados el orden sería otro.
 */
function defineTriState(circuitState: CircuitState, symbolMap: SymbolMap): CircuitFunction | null {
  const jam = jamsByPinOrder(symbolMap.circuitSymbol)
  // Tracer.Assert(jam.length === 3)
  // Tracer.Assert(jam[0] y jam[1] son entradas y jam[2] es la salida)
  const dataJam = jam[0]!
  const enableJam = jam[1]!
  const outputJam = jam[2]!

  const result = symbolMap.result(outputJam, 0)
  if (result === null) {
    return null
  }

  const group = result.triStateMembers()
  if (group !== null && group.size > 0) {
    defineTriStateGroup(
      circuitState,
      [...group].map((member) => member.privateIndex),
      result.stateIndex,
    )
    group.clear()
  }

  const parameter = symbolMap.parameter(dataJam, 0)
  const enable = symbolMap.parameter(enableJam, 0)
  if (parameter === null || enable === null) {
    // Sin dato o sin habilitación no hay nada que emitir.
    return null
  }

  return new FunctionTriState(
    circuitState,
    parameter.result.stateIndex,
    enable.result.stateIndex,
    result.privateIndex,
  )
}

function defineTriStateGroup(
  circuitState: CircuitState,
  group: number[],
  stateIndex: number,
): FunctionTriStateGroup {
  return new FunctionTriStateGroup(circuitState, group, stateIndex)
}

/** El único índice de estado de un símbolo (original: `CircuitMap.SingleResult`). */
function singleResult(results: readonly Result[]): number {
  let index = 0
  for (const result of results) {
    if (index === 0) {
      index = result.stateIndex
    } else {
      throw new CircuitError('Un símbolo con resultados de varios bits necesita su propia función.')
    }
  }
  return index
}

// ── Repartidores ───────────────────────────────────────────────────────────────────────

/** De qué punta a qué bit lleva un repartidor (original: `Splitter.Pass`). */
function splitterPass(
  enterJam: Jam,
  enterBit: number,
): { readonly jam: Jam; readonly bit: number } {
  const list = jamsByPinOrder(enterJam.symbol)
  // Tracer.Assert(2 < list.length && la punta ancha mide la suma de las finas)

  if (enterJam === list[0]) {
    // Punta ancha: ¿a qué cable fino va este bit?
    let width = 0
    for (let index = 1; index < list.length; index += 1) {
      const jam = list[index]!
      if (enterBit < width + jam.bitWidth) {
        return { jam, bit: enterBit - width }
      }
      width += jam.bitWidth
    }
  } else {
    // Punta fina: ¿en qué bit del cable ancho cae éste?
    let width = 0
    for (let index = 1; index < list.length; index += 1) {
      const jam = list[index]!
      if (enterJam === jam) {
        return { jam: list[0]!, bit: enterBit + width }
      }
      width += jam.bitWidth
    }
  }

  throw new CircuitError('Un repartidor recibió un bit que no le corresponde.')
}

/**
 * Los índices de estado a través de un repartidor (original: la rama `Splitter` de
 * `CircuitMap.StateIndexes`).
 *
 * Es la misma idea que `splitterPass`, pero al revés y por intervalos: un reparto de varios
 * bits se traduce en varios repartos de un tramo cada uno, y basta con que uno encuentre su
 * resultado para dar el rodeo por bueno (`done`).
 */
function splitterStateIndexes(
  jam: Jam,
  start: number,
  count: number,
  walk: (jam: Jam, start: number, count: number) => boolean,
): boolean {
  const list = jamsByPinOrder(jam.symbol)
  const wide = list[0]!

  if (jam === wide) {
    let done = false
    let jamStart = 0
    for (let index = 1; index < list.length && jamStart < start + count; index += 1) {
      const bitWidth = list[index]!.bitWidth
      if (start < jamStart + bitWidth) {
        const localStart = Math.max(0, start - jamStart)
        const localCount = Math.min(start + count, jamStart + bitWidth) - (jamStart + localStart)
        done = walk(list[index]!, localStart, localCount) || done
      }
      jamStart += bitWidth
    }
    return done
  }

  let jamStart = 0
  for (let index = 1; index < list.length; index += 1) {
    const bitWidth = list[index]!.bitWidth
    if (list[index] === jam) {
      return walk(wide, jamStart + start, Math.min(bitWidth - start, count))
    }
    jamStart += bitWidth
  }
  return false
}

// ── Ayudas ─────────────────────────────────────────────────────────────────────────────

/**
 * La punta del símbolo de arriba que le corresponde a un pin de hoja (original:
 * `CircuitSymbol.Jam(pin)`).
 *
 * Es lo que permite, desde dentro de un subcircuito, salir a la hoja de arriba: se busca la
 * punta del símbolo que coloca este circuito cuya dueña es este pin.
 */
function outerJam(decorated: CircuitSymbol, pinJam: Jam): Jam | null {
  const pin = pinJam.symbol.depicted
  if (pin.kind !== 'pin') {
    return null
  }
  for (const jam of decorated.jams) {
    if (jam.sheetPin !== null && jam.sheetPin.id === pin.element.id) {
      return jam
    }
  }
  return null
}

/** El orden estable de los hijos: de arriba abajo y de izquierda a derecha. */
function childSortKey(map: CircuitMap): number {
  const symbol = map.circuitSymbol
  if (symbol === null) {
    return 0
  }
  return symbol.position.y * LOGICAL_CIRCUIT_GRID_WIDTH + symbol.position.x
}

/** Reexporta el tipo de la compuerta por comodidad de quien lea este módulo. */
export type { GateType }

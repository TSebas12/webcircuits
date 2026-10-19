<script lang="ts">
  /**
   * Editor de temas (M6-13).
   *
   * Se edita **en vivo**: cada cambio se vuelca al documento al instante, así que el lienzo y
   * el cromo se ven como quedarían. Al guardar, el tema pasa a ser el «personalizado»; al
   * cancelar, se vuelve al que había.
   *
   * El modelo y los presets son puros (`src/core/theme/`); aquí solo hay formulario.
   */
  import {
    applyTheme,
    readCustomTheme,
    readThemeSelection,
    storeCustomTheme,
    storeThemeSelection,
    resolveTheme,
    type ThemeSelection,
  } from './theme'
  import { SETTINGS_EVENT } from './settings'
  import { contrastHex, AA_TEXT } from '../core/theme/contrast'
  import { TOKEN_GROUPS, TOKENS, type TokenId, type TokenValues } from '../core/theme/tokens'
  import { parseTheme, serializeTheme, type Theme, type ThemeBase } from '../core/theme/theme'
  import { LIGHT_THEME } from '../core/theme/presets'
  import { createFileProvider } from './files/provider-factory'

  let { onClose }: { onClose: () => void } = $props()

  const previous: ThemeSelection = readThemeSelection()
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  /** Lo que se está editando. Al abrir, se parte de lo que el usuario tenga puesto. */
  const start: Theme = (() => {
    const custom = readCustomTheme()
    if (custom !== null && previous === 'custom') {
      return custom
    }
    // Si estaba en un preset, se parte de él pero con nombre nuevo: editar «Oscuro» no debe
    // pisar el tema propio que hubiera antes.
    const base = resolveTheme(previous, systemPrefersDark)
    return { ...base, id: 'custom', name: 'Mi tema', author: '', version: 1 }
  })()

  let name = $state(start.name)
  let author = $state(start.author)
  let base = $state<ThemeBase>(start.base)
  let tokens = $state<Record<string, string>>({ ...start.tokens })
  let message = $state<string | null>(null)

  /** La puerta a ficheros del sistema, la misma que usa el resto de la aplicación. */
  const files = createFileProvider()

  const groups = TOKEN_GROUPS.map((group) => ({
    ...group,
    tokens: TOKENS.filter((token) => token.group === group.id),
  }))

  /** El tema tal y como está ahora mismo. */
  function draft(): Theme {
    return {
      id: 'custom',
      name: name.trim() === '' ? 'Mi tema' : name.trim(),
      author: author.trim(),
      version: 1,
      base,
      tokens: { ...tokens } as TokenValues,
    }
  }

  /** Vuelca el borrador al documento para verlo al instante. */
  function preview(): void {
    applyTheme('custom', { custom: draft(), systemPrefersDark })
  }

  function setToken(id: TokenId, value: string): void {
    tokens[id] = value
    preview()
  }

  function save(): void {
    const theme = draft()
    storeCustomTheme(theme)
    storeThemeSelection('custom')
    window.dispatchEvent(new Event(SETTINGS_EVENT))
    onClose()
  }

  function cancel(): void {
    // Deshacer la vista previa: se vuelve a aplicar lo que había antes de abrir.
    applyTheme(previous, {
      custom: readCustomTheme(),
      systemPrefersDark,
    })
    onClose()
  }

  function reset(): void {
    tokens = { ...start.tokens }
    base = start.base
    preview()
  }

  /** Lee un `.theme.json` del disco y lo pone en el formulario (M6-17). */
  async function importTheme(): Promise<void> {
    const picked = await files.open()
    if (picked === null) {
      return
    }
    try {
      const theme = parseTheme(picked.content, start.tokens)
      name = theme.name
      author = theme.author
      base = theme.base
      tokens = { ...theme.tokens }
      message = null
      preview()
    } catch (error) {
      message = error instanceof Error ? error.message : 'El fichero no es un tema válido'
    }
  }

  /** Guarda el borrador como `.theme.json` (M6-17). */
  async function exportTheme(): Promise<void> {
    const theme = draft()
    const slug = theme.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    message = null
    await files.save(serializeTheme(theme), `${slug || 'tema'}.theme.json`)
  }

  /** Contraste del texto principal: es el que la WCAG exige de verdad (M6-19). */
  const textContrast = $derived(
    contrastHex(
      tokens['ui.fg'] ?? LIGHT_THEME.tokens['ui.fg'],
      tokens['ui.bg'] ?? LIGHT_THEME.tokens['ui.bg'],
    ),
  )
</script>

<div class="backdrop" onclick={cancel} role="presentation">
  <div
    class="panel"
    role="dialog"
    aria-modal="true"
    aria-label="Editor de temas"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === 'Escape') cancel()
      e.stopPropagation()
    }}
  >
    <header>
      <h2>Editor de temas</h2>
      <button type="button" class="close" aria-label="Cerrar" onclick={cancel}>✕</button>
    </header>

    <p class="help">
      Los cambios se ven al momento. Guarda para conservarlos como tu tema; si cancelas, se
      vuelve al que tenías.
    </p>

    <div class="meta">
      <label>Nombre
        <input type="text" bind:value={name} maxlength="40" />
      </label>
      <label>Autor
        <input type="text" bind:value={author} maxlength="40" placeholder="Opcional" />
      </label>
      <label>Base
        <select
          value={base}
          onchange={(event) => {
            base = (event.currentTarget as HTMLSelectElement).value as ThemeBase
            preview()
          }}
        >
          <option value="light">Clara</option>
          <option value="dark">Oscura</option>
        </select>
        <span class="hint">Decide el color-scheme y el anti-destello.</span>
      </label>
    </div>

    <div class="groups">
      {#each groups as group (group.id)}
        <section>
          <h3>{group.label}</h3>
          {#each group.tokens as token (token.id)}
            <label class="token" title={token.hint ?? token.id}>
              <span class="token-label">{token.label}</span>
              {#if token.kind === 'color'}
                <input
                  type="color"
                  value={tokens[token.id] ?? LIGHT_THEME.tokens[token.id as TokenId]}
                  oninput={(event) => setToken(token.id as TokenId, (event.currentTarget as HTMLInputElement).value)}
                />
                <code>{tokens[token.id]}</code>
              {:else}
                <input
                  type="text"
                  value={tokens[token.id] ?? ''}
                  oninput={(event) => setToken(token.id as TokenId, (event.currentTarget as HTMLInputElement).value)}
                />
              {/if}
            </label>
          {/each}
        </section>
      {/each}
    </div>

    <p class="contrast" class:warn={textContrast < AA_TEXT}>
      Contraste del texto: {textContrast.toFixed(1)}:1
      {#if textContrast < AA_TEXT}
        · por debajo de AA ({AA_TEXT}:1)
      {:else}
        · cumple AA
      {/if}
    </p>

    {#if message !== null}
      <p class="error" role="alert">{message}</p>
    {/if}

    <footer>
      <button type="button" onclick={() => void importTheme()}>Importar…</button>
      <button type="button" onclick={() => void exportTheme()}>Exportar…</button>
      <button type="button" onclick={reset}>Restablecer</button>
      <span class="grow"></span>
      <button type="button" onclick={cancel}>Cancelar</button>
      <button type="button" class="primary" onclick={save}>Guardar tema</button>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: RGB(0 0 0 / 45%);
    z-index: 40;
  }
  .panel {
    width: min(46rem, 94vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 1rem 1.1rem;
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    background: var(--panel-bg);
    box-shadow: 0 1rem 3rem RGB(0 0 0 / 35%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .close {
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font-size: 1rem;
    cursor: pointer;
  }
  .help {
    margin: 0;
    color: var(--fg-muted);
    font-size: 0.8rem;
  }
  .meta {
    display: grid;
    grid-template-columns: 1.2fr 1.2fr 0.8fr;
    gap: 0.6rem;
  }
  .meta label {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    font-size: 0.78rem;
    color: var(--fg-muted);
  }
  .hint {
    font-size: 0.68rem;
  }
  input,
  select {
    padding: 0.3rem 0.4rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    font-size: 0.8rem;
  }
  input[type='color'] {
    width: 2.4rem;
    height: 1.5rem;
    padding: 0;
    cursor: pointer;
  }
  .groups {
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.8rem;
    padding-right: 0.3rem;
  }
  section h3 {
    margin: 0 0 0.3rem;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-muted);
  }
  .token {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.4rem;
    margin: 0.15rem 0;
    font-size: 0.8rem;
  }
  .token code {
    min-width: 4.4rem;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--fg-muted);
  }
  .token input[type='text'] {
    grid-column: 2 / 4;
    width: 100%;
  }
  .contrast {
    margin: 0;
    font-size: 0.8rem;
    color: var(--fg-muted);
  }
  .contrast.warn {
    color: var(--wc-error);
  }
  .error {
    margin: 0;
    color: var(--wc-error);
    font-size: 0.8rem;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .grow {
    flex: 1;
  }
  footer button {
    padding: 0.35rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 0.3rem;
    background: var(--panel-bg);
    color: var(--fg);
    cursor: pointer;
  }
  footer button.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-fg);
  }
</style>

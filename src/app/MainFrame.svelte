<script lang="ts">
  import Diagram from './Diagram.svelte'

  let { title = 'WebCircuits' }: { title?: string } = $props()
</script>

<div class="mainframe">
  <header class="titlebar">
    <span class="appname">{title}</span>
    <span class="subtitle">Editor de circuitos lógicos</span>
  </header>
  <div class="workspace">
    <Diagram />
  </div>
  <footer class="statusbar">
    <span>Listo</span>
  </footer>
</div>

<style>
  .mainframe {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--bg);
    color: var(--fg);
  }
  .titlebar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.4rem 0.8rem;
    border-bottom: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel-bg) 95%, transparent);
    font-size: 0.85rem;
  }
  .appname {
    font-weight: 600;
  }
  .subtitle {
    color: var(--fg-muted);
    font-size: 0.75rem;
  }
  .workspace {
    flex: 1 1 auto;
    min-height: 0;
    position: relative;
  }
  .statusbar {
    padding: 0.25rem 0.8rem;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel-bg) 95%, transparent);
    font: 0.72rem/1.4 var(--font-mono);
    color: var(--fg-muted);
  }
</style>
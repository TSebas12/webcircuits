<script lang="ts">
  import Diagram from './app/Diagram.svelte'

  const version = '0.0.0'
</script>

<div class="shell">
  <header>
    <span class="brand">WebCircuits</span>
    <span class="hint">arrastra para mover · rueda para acercar</span>
    <span class="spacer"></span>
    <span class="version">v{version} · M1</span>
  </header>

  <Diagram />
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg);
    color: var(--fg);
  }

  header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 0 0 auto;
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid var(--border);
    background: var(--panel-bg);
  }

  .brand {
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .hint,
  .version {
    font-size: 0.78rem;
    color: var(--fg-muted);
  }

  .spacer {
    flex: 1 1 auto;
  }
</style>

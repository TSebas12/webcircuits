<script lang="ts">
  const version = '0.0.0'
</script>

<main>
  <h1>WebCircuits</h1>
  <p class="subtitle">Simulador de circuitos lógicos digitales en el navegador.</p>
  <p class="status">v{version} · en construcción (hito M0 — preparación)</p>
</main>

<style>
  main {
    max-width: 42rem;
    margin: 14vh auto 0;
    padding: 0 1.5rem;
  }

  h1 {
    font-size: clamp(2rem, 6vw, 3rem);
    margin: 0 0 0.5rem;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 1.125rem;
    opacity: 0.8;
    margin: 0 0 2.5rem;
  }

  .status {
    font-size: 0.875rem;
    opacity: 0.55;
    border-top: 1px solid currentColor;
    padding-top: 0.75rem;
  }
</style>

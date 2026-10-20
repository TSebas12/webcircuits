<script lang="ts">
  let { kind }: { kind: 'and' | 'or' | 'not' | 'xor' | 'clock' } = $props()
</script>

<svg class="example-preview" viewBox="0 0 140 54" role="img" aria-label="Vista previa del ejemplo">
  <g class="wire">
    {#if kind === 'clock'}
      <line x1="84" y1="27" x2="110" y2="27" />
    {:else if kind === 'not'}
      <line x1="26" y1="27" x2="52" y2="27" />
      <line x1="86" y1="27" x2="110" y2="27" />
    {:else}
      <line x1="26" y1="18" x2="52" y2="18" />
      <line x1="26" y1="36" x2="52" y2="36" />
      <line x1="84" y1="27" x2="110" y2="27" />
    {/if}
  </g>

  {#if kind === 'clock'}
    <rect class="body" x="52" y="12" width="30" height="30" rx="4" />
    <path class="stroke" d="M58 27 h4 v-8 h8 v16 h8 v-8 h4" />
  {:else if kind === 'not'}
    <rect class="body" x="8" y="22" width="16" height="10" rx="2" />
    <path class="body" d="M52 12 L78 27 L52 42 Z" />
    <circle class="body" cx="82" cy="27" r="4" />
  {:else}
    <rect class="body" x="8" y="11" width="16" height="10" rx="2" />
    <rect class="body" x="8" y="30" width="16" height="10" rx="2" />
    {#if kind === 'and'}
      <path class="body" d="M52 9 H65 A18 18 0 0 1 65 45 H52 Z" />
    {:else}
      <path class="body" d="M52 9 Q63 27 52 45 Q73 40 82 27 Q73 14 52 9 Z" />
      {#if kind === 'xor'}
        <path class="stroke" d="M48 9 Q59 27 48 45" />
      {/if}
    {/if}
  {/if}

  <circle class="led" cx="116" cy="27" r="6" />
</svg>

<style>
  .example-preview {
    display: block;
    width: 100%;
    height: 3.2rem;
    margin-bottom: 0.35rem;
  }
  .wire {
    fill: none;
    stroke: var(--wc-wire);
    stroke-width: 1.5;
    stroke-linecap: round;
  }
  .body {
    fill: var(--wc-symbol-fill);
    stroke: var(--wc-symbol-stroke);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .stroke {
    fill: none;
    stroke: var(--wc-symbol-stroke);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .led {
    fill: var(--wc-state-one);
    stroke: var(--wc-symbol-stroke);
    stroke-width: 1.5;
    opacity: 0.85;
  }
</style>

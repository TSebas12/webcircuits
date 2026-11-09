<script lang="ts">
  let { visible = false, text = '' }: { visible?: boolean; text?: string } = $props()
</script>

{#if visible}
  <div class="tooltip" role="tooltip">{text}</div>
{/if}

<style>
  .tooltip {
    position: absolute;
    z-index: 10;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    padding: 0.4rem 0.6rem;
    border-radius: 0.35rem;
    font-size: 0.8rem;
    max-width: 16rem;
  }
</style>

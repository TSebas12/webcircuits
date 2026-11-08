<script lang="ts">
  import Modal from './common/Modal.svelte'

  let { open = false, onClose }: { open?: boolean; onClose?: () => void } = $props()
</script>

<Modal open={open} title="Pines del circuito" onClose={() => onClose?.()}>
  <p>Ajusta nombre, lado y ancho de bit de los pines seleccionados.</p>
  {#snippet footer()}
    <div class="actions">
      <button onclick={() => onClose?.()}>Cerrar</button>
    </div>
  {/snippet}
</Modal>

<style>
  .actions { display: flex; justify-content: flex-end; }
  button { padding: 0.35rem 0.7rem; }
</style>
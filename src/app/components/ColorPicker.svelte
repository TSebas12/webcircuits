<script lang="ts">
  let {
    value = '#000000',
    onChange,
  }: { value?: string; onChange?: (hex: string) => void } = $props()

  function handleChange(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    onChange?.(input.value)
  }
</script>

<input type="color" value={value} onchange={handleChange} />
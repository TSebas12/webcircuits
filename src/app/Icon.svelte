<script lang="ts">
  let { name, size = 18 }: { name: string; size?: number } = $props()

  const paths: Record<string, string> = {
    open: 'M3 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3V6zm0 4h18l-2 7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z',
    save: 'M5 3h11l3 3v15H5V3zm3 0v6h6V3H8zm0 10v6h8v-6H8z',
    export: 'M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3',
    fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    share: 'M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm12-6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12l8-5M8 12l8 5',
    version: 'M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1-.6a7 7 0 0 0-.7-1.7l1.1-1.9-1.4-1.4-1.9 1.1a7 7 0 0 0-1.7-.7L13.6 4h-3.2l-.6 2.1a7 7 0 0 0-1.7.7L6.2 5.7 4.8 7.1l1.1 1.9a7 7 0 0 0-.7 1.7L3 12l2.1.6a7 7 0 0 0 .7 1.7l-1.1 1.9 1.4 1.4 1.9-1.1a7 7 0 0 0 1.7.7l.6 2.1h3.2l.6-2.1a7 7 0 0 0 1.7-.7l1.9 1.1 1.4-1.4-1.1-1.9a7 7 0 0 0 .7-1.7L21 12z',
    layers: 'M12 3 3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  }
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
  <path d={paths[name] ?? ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
</svg>
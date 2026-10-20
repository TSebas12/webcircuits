<script lang="ts">
  let { name, size = 18 }: { name: string; size?: number } = $props()

  /**
   * Iconos de línea, en el mismo estilo que el resto del cromo (trazo de 1,7 px).
   *
   * Se guardan aquí como datos y no como ficheros sueltos: son pocos, se usan en varios
   * paneles y así cambian de color con `currentColor` sin peticiones extra.
   */
  const paths: Record<string, string> = {
    open: 'M3 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3V6zm0 4h18l-2 7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7z',
    save: 'M5 3h11l3 3v15H5V3zm3 0v6h6V3H8zm0 10v6h8v-6H8z',
    export: 'M12 3v12m0 0 4-4m-4 4-4-4M5 17v3h14v-3',
    fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
    share: 'M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm12-6a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm0 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM8 12l8-5M8 12l8 5',
    version: 'M12 3v18M5 8l7-5 7 5M5 16l7 5 7-5',
    settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm9 4-2.1-.6a7 7 0 0 0-.7-1.7l1.1-1.9-1.4-1.4-1.9 1.1a7 7 0 0 0-1.7-.7L13.6 4h-3.2l-.6 2.1a7 7 0 0 0-1.7.7L6.2 5.7 4.8 7.1l1.1 1.9a7 7 0 0 0-.7 1.7L3 12l2.1.6a7 7 0 0 0 .7 1.7l-1.1 1.9 1.4 1.4 1.9-1.1a7 7 0 0 0 1.7.7l.6 2.1h3.2l.6-2.1a7 7 0 0 0 1.7-.7l1.9 1.1 1.4-1.4-1.1-1.9a7 7 0 0 0 .7-1.7L21 12z',
    layers: 'M12 3 3 8l9 5 9-5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
    table: 'M3 5h18v14H3V5zm0 4h18M3 13h18M9 5v14M15 5v14',
    plus: 'M12 5v14M5 12h14',
    close: 'M18 6 6 18M6 6l12 12',
    eye: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    eyeOff: 'M10.73 5.08a10.74 10.74 0 0 1 11.21 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49M14.08 14.16a3 3 0 0 1-4.24-4.24M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14M2 2l20 20',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0',
    target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
    arrowRight: 'M5 12h14M13 6l6 6-6 6',
    trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5',
    copy: 'M8 8h12v12H8zM4 16V4h12',
    merge: 'M8 3v4a4 4 0 0 0 4 4h8M16 7l4 4-4 4M8 21v-4a4 4 0 0 1 4-4h8',
    isolate: 'M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    up: 'M12 19V5M5 12l7-7 7 7',
    down: 'M12 5v14M19 12l-7 7-7-7',
    undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
    redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
    pause: 'M9 5v14M15 5v14',
    play: 'M7 4v16l13-8z',
    step: 'M5 4l10 8-10 8V4zM19 5v14',
    note: 'M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h6',
    marker: 'M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11zM12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    socket: 'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
    scope: 'M2 12h4l2-8 4 16 2-8h8',
    cursor: 'M4 4l7.07 17 2.51-7.39L21 11.07z',
    eraser: 'm7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 21H7zM22 21H7',
    wire: 'M4 8a4 4 0 0 1 8 0v8a4 4 0 0 0 8 0V8',
    power: 'M12 2v10M18.36 5.64a9 9 0 1 1-12.73 0',
  }
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
  <path d={paths[name] ?? ''} fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
</svg>

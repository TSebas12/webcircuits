/**
 * Ayudante para construir rectángulos redondeados.
 *
 * `Path2D.roundRect()` existe ya en los navegadores modernos, pero `arcTo` funciona en
 * todos y no cuesta nada, así que no hay motivo para depender del más nuevo.
 */

/** Añade un rectángulo redondeado al `Path2D` indicado. */
export function roundedRect(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  // Un radio mayor que medio lado convertiría las esquinas en un ocho.
  const r = Math.max(0, Math.min(radius, width / 2, height / 2))

  if (r === 0) {
    path.rect(x, y, width, height)
    return
  }

  path.moveTo(x + r, y)
  path.lineTo(x + width - r, y)
  path.arcTo(x + width, y, x + width, y + r, r)
  path.lineTo(x + width, y + height - r)
  path.arcTo(x + width, y + height, x + width - r, y + height, r)
  path.lineTo(x + r, y + height)
  path.arcTo(x, y + height, x, y + height - r, r)
  path.lineTo(x, y + r)
  path.arcTo(x, y, x + r, y, r)
  path.closePath()
}

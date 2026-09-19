/** Categorías de bebidas de la carta actual; el resto son comida.
 * Se usa el nombre español estable, independiente del idioma de presentación.
 */
const BEBIDAS = new Set([
  'cafes e infusiones', 'cervezas', 'combinados',
  'licores y conac', 'refrescos y aguas', 'vinos y espumosos',
])
export function seccionCategoria(categoria) {
  const nombre = (categoria?.nombre || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  return BEBIDAS.has(nombre) ? 'bebidas' : 'comida'
}

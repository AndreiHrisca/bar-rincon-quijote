/**
 * Precios
 * ---------------------------------------------------------------------------
 * En Espana un precio se escribe con coma: "14,00". Se teclea con coma y se
 * guarda como numero, y hay que aceptar tambien el punto porque el teclado
 * numerico de muchos moviles solo ofrece punto.
 *
 * Mismo criterio que web/js/formato.js, duplicado por el mismo motivo que
 * dom.js (DECISIONES.md, D-28).
 */

/** 14 -> "14,00" */
export function precio(n) {
  if (n === null || n === undefined || n === '') return ''
  return Number(n).toFixed(2).replace('.', ',')
}

/**
 * Igual que precio(), pero el CERO se escribe como vacio.
 *
 * PocketBase guarda el vacio de un campo numerico como 0: no hay forma de
 * distinguir "sin poner" de "cero". En `precio_terraza` eso no es ambiguo —un
 * plato no vale cero euros en la terraza— asi que 0 significa "sin precio de
 * terraza", y es exactamente como lo lee la carta publica
 * (web/js/vistas/carta.js comprueba `plato.precio_terraza` por su veracidad).
 *
 * Sin esto, el panel ensena "0,00" donde la carta no ensena nada, y quien lo
 * mira cree que se le ha colado un precio a cero.
 */
export function precioOpcional(n) {
  return n ? precio(n) : ''
}

/** 14 -> "14,00 €" */
export function precioConSimbolo(n) {
  const p = precio(n)
  return p ? `${p} €` : ''
}

/**
 * "14,50" o "14.50" o "14,50 €" -> 14.5. Devuelve null si no hay numero.
 *
 * El vacio devuelve null y no 0 a proposito: `precio_terraza` es opcional, y un
 * plato sin precio de terraza no es un plato que valga cero euros.
 */
export function aNumero(texto) {
  const limpio = String(texto ?? '').replace(/[€\s]/g, '').replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  return Number.isFinite(n) ? n : null
}

/**
 * Formato de precios y horarios
 * ---------------------------------------------------------------------------
 * En la carta el precio se escribe "14,00" a secas, sin el simbolo, porque va en
 * columna bajo un rotulo que ya dice "Barra" y "Terraza / Salón". En la ficha
 * de plato si lleva el simbolo, porque va suelto y grande.
 */

/** 14 -> "14,00". Coma decimal, que es como se escribe un precio en Espana. */
export function precio(n) {
  if (n === null || n === undefined || n === '') return ''
  return Number(n).toFixed(2).replace('.', ',')
}

/** 14 -> "14,00 €" */
export function precioConSimbolo(n) {
  const p = precio(n)
  return p ? `${p} €` : ''
}

/**
 * Lee el horario de cocina guardado como "13:00-23:30" y devuelve los minutos
 * desde medianoche de apertura y cierre.
 */
export function franjaCocina(texto) {
  const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec(texto || '')
  if (!m) return null
  return {
    abre: Number(m[1]) * 60 + Number(m[2]),
    cierra: Number(m[3]) * 60 + Number(m[4]),
    abreTexto: `${m[1]}:${m[2]}`,
    cierraTexto: `${m[3]}:${m[4]}`,
  }
}

/*
 * AQUI VIVIAN horarioDelTexto() y estaAbierto(). Las dos leian el horario de un
 * campo de TEXTO LIBRE con una expresion regular, y por eso la portada estuvo
 * diciendo que el bar cerraba a las 02:00 cuando cierra a las 00:00: una frase
 * no se puede comprobar, y nadie se dio cuenta.
 *
 * Ahora el horario es un dato con siete entradas en la configuracion y todo
 * —la pastilla de Abierto/Cerrado, el bloque de horario y la validacion de las
 * franjas de reserva— sale de compartido/js/horario.js, que ademas calcula en
 * hora de Madrid y no en la del navegador de quien mira.
 */

/** Quita acentos y pasa a minusculas, para buscar sin que importen las tildes. */
export function normalizar(texto) {
  return (texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

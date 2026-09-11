/**
 * Retencion de reservas — logica pura
 * ===========================================================================
 * Aqui NO se toca la base de datos. Solo el calculo de la fecha a partir de la
 * cual una reserva ya no se guarda, para poder probarlo suelto
 * (pruebas/unitarias/retencion.test.js).
 *
 * Se escribe en CommonJS porque tiene que poder cargarse desde dos sitios: el
 * require() del motor JS de PocketBase y el node de las pruebas.
 */

/** Lo que dice el encargo si nadie ha configurado otra cosa (seccion 12). */
const MESES_POR_DEFECTO = 12

/**
 * La frontera: todo lo ANTERIOR a esta fecha se borra.
 *
 * Se devuelve en el formato de los campos de fecha sin hora del proyecto,
 * medianoche UTC del dia natural (D-19), que es como estan guardadas las
 * reservas y por tanto lo unico con lo que se pueden comparar.
 *
 * DOS TRAMPAS QUE ESTO ESQUIVA:
 *
 *  1. Restar meses a mano. El 31 de marzo menos un mes no es el 31 de febrero:
 *     setMonth() de JavaScript lo resuelve (da el 2 o el 3 de marzo, segun el
 *     ano), y aqui se usa a proposito en vez de calcular dias.
 *
 *  2. Usar toISOString() sobre una fecha local. La medianoche del 1 de
 *     septiembre en Madrid es el 31 de agosto a las 22:00 en UTC, asi que la
 *     frontera se correria un dia y se borraria un dia de mas. Por eso la
 *     cadena se compone con los numeros del calendario local, sin pasar por
 *     UTC en ningun momento.
 */
function fronteraDeRetencion(meses, ahora = new Date()) {
  const m = Number.isInteger(meses) && meses > 0 ? meses : MESES_POR_DEFECTO
  const limite = new Date(ahora.getFullYear(), ahora.getMonth() - m, ahora.getDate())
  const a = limite.getFullYear()
  const mm = String(limite.getMonth() + 1).padStart(2, '0')
  const dd = String(limite.getDate()).padStart(2, '0')
  return `${a}-${mm}-${dd} 00:00:00.000Z`
}

module.exports = { MESES_POR_DEFECTO, fronteraDeRetencion }

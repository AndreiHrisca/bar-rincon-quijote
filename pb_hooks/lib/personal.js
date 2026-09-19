/**
 * Personal — logica pura
 * ===========================================================================
 * Lo que el servidor decide sobre fichajes y turnos, sin tocar la base de
 * datos: funciones que reciben datos y devuelven datos, para poder probarlas
 * sueltas (pruebas/unitarias/personal.test.js) y para que el hook quede en lo
 * suyo: leer, aplicar esto y guardar.
 *
 * Se escribe en CommonJS porque tiene que poder cargarse desde dos sitios: el
 * require() del motor JS de PocketBase y el node de las pruebas. Igual que
 * lib/almacen.js.
 *
 * AQUI NO HAY CUENTAS DE HORAS. Sumar jornadas es cosa del panel
 * (panel/js/horas.js) porque solo se usa para pintar e imprimir; el servidor no
 * necesita saber cuanto ha trabajado nadie para decidir nada, y la seccion 12
 * del encargo pide no construir mediciones de personas mas alla del informe
 * mensual que se pide expresamente.
 */

// Quien puede fichar por otro y corregir lo fichado (seccion 7).
const MANDO = ['admin']

function esMando(rol) {
  return MANDO.indexOf(String(rol || '')) !== -1
}

/**
 * De quien es este fichaje.
 *
 * La regla de la coleccion solo puede exigir sesion: no sabe comparar el
 * empleado que viene en el cuerpo con el de quien lo manda. Sin esto, cualquiera
 * del equipo podria fichar la entrada de un companero que todavia no ha
 * llegado, que es exactamente el fraude que un control horario tiene que
 * impedir.
 *
 *   pedido  el id de empleado que trae la peticion ('' si no trae ninguno)
 *   propio  el id de la ficha de empleado ligada a la sesion ('' si no tiene)
 *
 * Devuelve { empleado } o { error } con el motivo ya escrito para la persona.
 */
function empleadoQueFicha({ pedido, propio, rol }) {
  const quiere = String(pedido || '').trim()
  const mio = String(propio || '').trim()

  // El administrador ficha por quien sea: es quien arregla el olvido de ayer y
  // quien apunta al que se dejo el movil en casa.
  if (esMando(rol)) {
    const elegido = quiere || mio
    if (!elegido) {
      return { error: 'Di de quién es el fichaje: no hay ninguna ficha de empleado ligada a tu cuenta.' }
    }
    return { empleado: elegido }
  }

  if (!mio) {
    return { error: 'Tu cuenta no está ligada a ninguna ficha del equipo, así que no puede fichar. Que te enlacen desde Personal.' }
  }
  if (quiere && quiere !== mio) {
    return { error: 'Solo puedes fichar por ti.' }
  }
  return { empleado: mio }
}

/**
 * ¿Este cambio es una CORRECCION o el gesto normal de cerrar el turno?
 *
 * Cerrar un fichaje abierto —ponerle la salida a lo que estaba sin salida— lo
 * hace cada cual al irse a casa y no es corregir nada. Todo lo demas si lo es:
 * mover la hora de entrada, cambiar una salida que ya estaba puesta o volver a
 * abrir un fichaje cerrado. Eso solo lo hace el administrador, y queda
 * firmado en `corregido_por` (seccion 7).
 */
function esCorreccion({ entradaAntes, salidaAntes, entradaAhora, salidaAhora }) {
  const iguales = (a, b) => String(a || '') === String(b || '')
  if (!iguales(entradaAntes, entradaAhora)) return true
  // La salida solo se puede PONER libremente cuando no habia ninguna.
  if (String(salidaAntes || '') === '') return false
  return !iguales(salidaAntes, salidaAhora)
}

/**
 * La salida no puede ser anterior a la entrada.
 *
 * Un fichaje sin salida es valido: es justamente el de quien sigue dentro. Y la
 * comparacion es estricta: una jornada de cero minutos es un error de tecleo,
 * no una jornada.
 */
function ordenValido(entrada, salida) {
  if (!salida) return true
  const a = Date.parse(String(entrada || '').replace(' ', 'T'))
  const b = Date.parse(String(salida).replace(' ', 'T'))
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return b > a
}

/**
 * Minutos que dura un turno del cuadrante.
 *
 * Las horas del turno son texto HH:MM y no fecha-hora (convenio del proyecto):
 * un turno es de un dia, no un instante. Por eso un turno que termina antes de
 * empezar no es un error: es el de noche, que cruza la medianoche.
 * "19:00"-"02:30" son 450 minutos.
 *
 * Devuelve 0 si alguna hora no encaja o si empieza y acaba a la misma hora, que
 * es lo que hay que rechazar.
 */
function minutosDeTurno(inicio, fin) {
  const aMin = (hhmm) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(hhmm || '').trim())
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const a = aMin(inicio)
  const b = aMin(fin)
  if (a === null || b === null) return 0
  const dura = b - a
  return dura > 0 ? dura : (dura === 0 ? 0 : dura + 1440)
}

module.exports = {
  MANDO,
  esMando,
  empleadoQueFicha,
  esCorreccion,
  ordenValido,
  minutosDeTurno,
}

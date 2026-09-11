/**
 * El horario del bar y el estado de apertura
 * ---------------------------------------------------------------------------
 * UN SOLO SITIO. De aquí beben la pastilla de «Abierto / Cerrado» de la
 * portada, el bloque de horario que se lee debajo, y el panel donde Santi lo
 * cambia. Antes eran una frase de texto libre y una expresión regular, y por
 * eso la web estuvo diciendo durante meses que el bar cerraba a las 02:00
 * cuando cierra a las 00:00: una frase no se puede comprobar.
 *
 * LA HORA ES LA DE MADRID, SIEMPRE. Este cálculo corre en el navegador del
 * cliente, y el cliente puede tener el móvil en otro huso —un turista, alguien
 * con la zona mal puesta, un navegador en UTC—. Se saca con `Intl` y el huso
 * `Europe/Madrid`; NO se suman offsets a mano, porque el cambio de hora lo
 * rompería dos veces al año y siempre de noche.
 *
 * CERRAR A LAS 00:00 ES MEDIANOCHE DEL DÍA SIGUIENTE. Si la hora de cierre no
 * es mayor que la de apertura, el tramo cruza la medianoche: 08:00–00:00 son
 * dieciséis horas, no cero. Es la misma convención que usan los turnos del
 * cuadrante, y es justo el caso de este bar.
 *
 * NO HAY DOM NI RED AQUÍ. Todo son funciones puras sobre `ajustes`, y por eso
 * se pueden probar (pruebas/unitarias/horario.test.js).
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** "08:00" -> 480. null si no encaja. */
export function aMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 480 -> "08:00". 1440 -> "00:00", que es medianoche y no las veinticuatro. */
export function aHora(minutos) {
  const m = ((Math.round(minutos) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Qué hora es en Madrid, pase lo que pase en el móvil de quien mira.
 *
 * Devuelve `{ dia, minutos, iso }`: el día de la semana como `Date.getDay()`
 * (0 domingo), los minutos desde medianoche, y el día natural "AAAA-MM-DD".
 *
 * `hourCycle: 'h23'` y no `hour12: false`: con el segundo, algunas versiones de
 * ICU devuelven «24» para la medianoche y la cuenta se va un día entero.
 */
export function enMadrid(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora)

  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  const iso = `${p.year}-${p.month}-${p.day}`
  // El día de la semana se calcula del año-mes-día ya en hora de Madrid, no se
  // le pide a Intl: el nombre traducido habría que volver a interpretarlo.
  const dia = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day))).getUTCDay()

  return { dia, minutos: Number(p.hour) * 60 + Number(p.minute), iso }
}

/**
 * El tramo de un día de la semana, en minutos.
 *   { abre: 480, cierra: 1440 }   ->  de 08:00 a medianoche
 * `cierra` puede pasar de 1440: ahí es donde se dice que cruza.
 * null el día que el bar no abre.
 */
export function tramoDelDia(semanal, dia) {
  const t = normalizar(semanal)[((dia % 7) + 7) % 7]
  if (!t) return null
  const abre = aMinutos(t.abre)
  let cierra = aMinutos(t.cierra)
  if (abre === null || cierra === null) return null
  if (cierra <= abre) cierra += 1440
  return { abre, cierra }
}

/** Siete entradas siempre, aunque venga a medias o como cadena JSON. */
function normalizar(semanal) {
  let s = semanal
  if (typeof s === 'string') { try { s = JSON.parse(s) } catch { s = null } }
  const lista = Array.isArray(s) ? s : []
  return Array.from({ length: 7 }, (_, i) => lista[i] || null)
}

/** ¿Cae este día dentro de un cierre puntual? */
export function enCierrePuntual(ajustes, iso) {
  const desde = diaDe(ajustes?.cierre_desde)
  const hasta = diaDe(ajustes?.cierre_hasta) || desde
  if (!desde) return null
  if (iso < desde || iso > hasta) return null
  return { motivo: (ajustes?.cierre_motivo || '').trim(), desde, hasta }
}

/** Una fecha de PocketBase ("2026-12-24 00:00:00.000Z") -> "2026-12-24". */
function diaDe(valor) {
  const s = String(valor || '')
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

/**
 * El estado de apertura ahora mismo.
 *
 *   { abierto, cierraA, abreA, cuando, motivo }
 *
 * `abierto` es `null` cuando no hay horario configurado: entonces la portada no
 * enseña nada. Vale más callar que decir «cerrado» con el bar lleno.
 *
 * `cuando` dice si la próxima apertura es 'hoy' o 'mañana', para no afirmar que
 * abre hoy a las 08:00 cuando son las 00:10 y «hoy» ya es otro día.
 */
export function estadoDeApertura(ajustes, ahora = new Date()) {
  const semanal = ajustes?.horario_semanal
  if (!normalizar(semanal).some(Boolean)) return { abierto: null }

  const { dia, minutos, iso } = enMadrid(ahora)

  // 1. Lo que quedó abierto de AYER. Un cierre a las 02:00 alcanza a hoy; uno a
  //    las 00:00, no: acaba justo en el borde.
  const ayer = tramoDelDia(semanal, dia - 1)
  const restoDeAyer = ayer && ayer.cierra > 1440 ? ayer.cierra - 1440 : 0
  const vieneDeAyer = minutos < restoDeAyer && !enCierrePuntual(ajustes, diaAnterior(iso))

  // 2. El cierre puntual pisa el horario semanal, pero no una noche que ya
  //    estaba en marcha antes de que empezara.
  const cierre = enCierrePuntual(ajustes, iso)
  if (cierre && !vieneDeAyer) {
    const vuelve = proximaApertura(ajustes, semanal, iso, dia, 0, true)
    return { abierto: false, motivo: cierre.motivo, ...vuelve }
  }

  const hoy = tramoDelDia(semanal, dia)

  if (vieneDeAyer) return { abierto: true, cierraA: aHora(restoDeAyer) }
  if (hoy && minutos >= hoy.abre && minutos < hoy.cierra) {
    return { abierto: true, cierraA: aHora(hoy.cierra) }
  }

  return { abierto: false, ...proximaApertura(ajustes, semanal, iso, dia, minutos, false) }
}

/**
 * Cuándo vuelve a abrir. Mira hoy —si todavía no ha abierto— y después los
 * siete días siguientes, saltándose los cerrados y el cierre puntual.
 */
function proximaApertura(ajustes, semanal, iso, dia, minutos, saltarHoy) {
  for (let salto = 0; salto <= 7; salto++) {
    const fecha = masDias(iso, salto)
    if (enCierrePuntual(ajustes, fecha)) continue
    const tramo = tramoDelDia(semanal, dia + salto)
    if (!tramo) continue
    if (salto === 0 && (saltarHoy || minutos >= tramo.abre)) continue
    return {
      abreA: aHora(tramo.abre),
      cuando: salto === 0 ? 'hoy' : (salto === 1 ? 'mañana' : DIAS[(dia + salto) % 7]),
    }
  }
  return {}
}

function diaAnterior(iso) { return masDias(iso, -1) }

function masDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d + n))
  return f.toISOString().slice(0, 10)
}

/**
 * El horario dicho en una frase, para el bloque de la portada.
 *
 * Se AGRUPAN los días seguidos que coinciden: siete líneas iguales no las lee
 * nadie, y «Todos los días de 08:00 a 00:00» es lo que este bar necesita hoy.
 * El día que el horario deje de ser el mismo, esto lo dirá solo.
 */
export function textoDelHorario(semanal) {
  const dias = normalizar(semanal)
  if (!dias.some(Boolean)) return ''

  // Se recorre de lunes a domingo, que es como se lee una semana.
  const orden = [1, 2, 3, 4, 5, 6, 0]
  const clave = (i) => (dias[i] ? `${dias[i].abre}–${dias[i].cierra}` : 'cerrado')

  if (orden.every((i) => clave(i) === clave(1))) {
    return dias[1] ? `Todos los días de ${dias[1].abre} a ${dias[1].cierra}` : 'Cerrado toda la semana'
  }

  const grupos = []
  for (const i of orden) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.clave === clave(i)) ultimo.dias.push(i)
    else grupos.push({ clave: clave(i), dias: [i] })
  }

  return grupos.map((g) => {
    const cuales = g.dias.length === 1
      ? conMayuscula(DIAS[g.dias[0]])
      : `${conMayuscula(DIAS[g.dias[0]])} a ${DIAS[g.dias[g.dias.length - 1]]}`
    const t = dias[g.dias[0]]
    return t ? `${cuales}, de ${t.abre} a ${t.cierra}` : `${cuales}, cerrado`
  }).join('\n')
}

function conMayuscula(texto) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : ''
}

/**
 * ¿Está el bar abierto a una hora concreta de un día concreto? Lo usa la
 * validación de franjas de reserva: no se puede apuntar una mesa a una hora a
 * la que el bar no abre, por mucho que la cocina diga otra cosa.
 */
export function abiertoEse(ajustes, iso, hhmm) {
  const minutos = aMinutos(hhmm)
  if (minutos === null) return false
  if (enCierrePuntual(ajustes, iso)) return false

  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay()
  const hoy = tramoDelDia(ajustes?.horario_semanal, dia)
  return !!hoy && minutos >= hoy.abre && minutos < hoy.cierra
}

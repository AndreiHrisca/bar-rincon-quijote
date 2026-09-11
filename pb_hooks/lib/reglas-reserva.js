/**
 * Reglas de reserva — logica pura
 * ===========================================================================
 * Aqui NO se toca la base de datos ni PocketBase. Solo funciones que reciben
 * datos y devuelven datos, para que se puedan probar sueltas
 * (pruebas/unitarias/) y para que el hook quede en lo suyo: leer, aplicar esto
 * y guardar.
 *
 * DECIDE EL SERVIDOR. El cliente puede pintar las franjas llenas en gris, pero
 * la comprobacion de verdad se hace aqui, del lado del servidor (seccion 8).
 *
 * Se escribe en CommonJS porque tiene que poder cargarse desde dos sitios: el
 * require() del motor JS de PocketBase y Node, para las pruebas.
 */

// Minutos de una franja. El encargo fija 30 (seccion 8).
const PASO_MIN = 30

// Maximo de comensales por reserva hecha desde la web. Por encima de esto no se
// envia: se ensena el telefono, porque un grupo de 14 hay que hablarlo.
const MAX_COMENSALES_WEB = 10

// Antelacion minima. Nada de reservar para dentro de cinco minutos.
const MIN_ANTELACION_MIN = 30

// Alfabeto del codigo de reserva: sin caracteres ambiguos. Fuera O y 0, I y 1 y
// L, U y V. Se lee en voz alta por telefono y se apunta a mano en la libreta.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTWXYZ23456789'

const ZONAS = ['barra', 'terraza', 'salon', 'indiferente']

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

/** "21:30" -> 1290 minutos desde medianoche. Devuelve null si no encaja. */
function aMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 1290 -> "21:30" */
function aHora(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Lee el horario de cocina y devuelve los tramos.
 *   "12:30-16:30,20:00-23:30" -> [{abre:750, cierra:990}, {abre:1200, cierra:1410}]
 *
 * Un tramo que cruza medianoche (por ejemplo "20:00-01:00") se entiende como
 * que el cierre es del dia siguiente, y se le suman 24 h. Hace falta: la cocina
 * de un bar que cierra a las dos de la manana existe.
 */
function tramosCocina(texto) {
  return String(texto || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const [a, c] = t.split('-')
      const abre = aMinutos(a); let cierra = aMinutos(c)
      if (abre === null || cierra === null) return null
      if (cierra <= abre) cierra += 1440
      return { abre, cierra }
    })
    .filter(Boolean)
}

/**
 * Franjas de reserva de un dia: cada 30 minutos dentro del horario de cocina.
 *
 * El limite es ABIERTO por arriba: si la cocina cierra a las 23:30, la ultima
 * franja es la de las 23:00. A las 23:30 ya no se sienta a nadie, pero a las
 * 23:00 si: te sientas y pides antes de que cierren.
 */
function franjasDelDia(horarioCocina) {
  const franjas = []
  for (const tramo of tramosCocina(horarioCocina)) {
    for (let m = tramo.abre; m < tramo.cierra; m += PASO_MIN) {
      const hora = aHora(m)
      if (!franjas.includes(hora)) franjas.push(hora)
    }
  }
  return franjas
}

// ---------------------------------------------------------------------------
// Aforo
// ---------------------------------------------------------------------------

/**
 * Aforo de cada zona, leido de los ajustes. Una zona con aforo 0 esta SIN
 * CONFIGURAR y no se ofrece: no se ensena como "siempre llena", que le diria al
 * cliente algo falso.
 */
function aforos(ajustes) {
  return {
    barra: Number(ajustes.aforo_barra) || 0,
    terraza: Number(ajustes.aforo_terraza) || 0,
    salon: Number(ajustes.aforo_salon) || 0,
  }
}

function zonasDisponibles(ajustes) {
  const a = aforos(ajustes)
  return ZONAS.filter((z) => z === 'indiferente' ? aforoTotal(ajustes) > 0 : a[z] > 0)
}

function aforoTotal(ajustes) {
  const a = aforos(ajustes)
  return a.barra + a.terraza + a.salon
}

/** Dos reservas se pisan si sus intervalos [inicio, inicio+duracion) se solapan. */
function seSolapan(inicioA, inicioB, duracion) {
  return inicioA < inicioB + duracion && inicioB < inicioA + duracion
}

/**
 * Comensales ya sentados que se pisan con una franja.
 *
 * Devuelve el total y el desglose por zona. Una reserva con zona "indiferente"
 * NO cuenta en ninguna zona concreta —todavia no se sabe donde se sentara— pero
 * SI cuenta en el total, que es lo que evita aceptar mas gente de la que cabe en
 * el bar entero.
 *
 * Solo ocupan mesa los estados vivos: una cancelada o un "no vino" no ocupan.
 */
const ESTADOS_QUE_OCUPAN = ['pendiente', 'confirmada', 'sentada']

function ocupacion(reservas, minutoFranja, duracionMin) {
  const porZona = { barra: 0, terraza: 0, salon: 0 }
  let total = 0

  for (const r of reservas) {
    if (!ESTADOS_QUE_OCUPAN.includes(r.estado)) continue
    const inicio = aMinutos(r.hora)
    if (inicio === null) continue
    if (!seSolapan(inicio, minutoFranja, duracionMin)) continue

    const comensales = Number(r.comensales) || 0
    total += comensales
    if (porZona[r.zona] !== undefined) porZona[r.zona] += comensales
  }
  return { total, porZona }
}

/**
 * ¿Cabe este grupo en esta franja y en esta zona?
 *
 * Dos condiciones, y tienen que cumplirse LAS DOS:
 *   1. Cabe en el bar entero (suma de los tres aforos).
 *   2. Si pide una zona concreta, cabe ademas en esa zona.
 *
 * "Indiferente" solo pasa por la primera: se sienta donde haya sitio.
 */
function cabe({ reservasDelDia, hora, zona, comensales, ajustes }) {
  const minuto = aMinutos(hora)
  if (minuto === null) return { cabe: false, motivo: 'hora_invalida' }

  const duracion = Number(ajustes.duracion_mesa_min) || 90
  const { total, porZona } = ocupacion(reservasDelDia, minuto, duracion)
  const a = aforos(ajustes)
  const totalAforo = a.barra + a.terraza + a.salon

  if (totalAforo <= 0) return { cabe: false, motivo: 'sin_aforo_configurado' }
  if (total + comensales > totalAforo) return { cabe: false, motivo: 'bar_lleno' }

  if (zona !== 'indiferente') {
    if (!a[zona]) return { cabe: false, motivo: 'zona_no_disponible' }
    if (porZona[zona] + comensales > a[zona]) return { cabe: false, motivo: 'zona_llena' }
  }

  return { cabe: true }
}

/**
 * Estado de todas las franjas de un dia, para pintar la rejilla.
 *
 * Las franjas sin sitio se devuelven igualmente, marcadas con libre:false: la
 * maqueta las TACHA, no las esconde (seccion 6). Ver un hueco tachado dice
 * "aqui no cabeis"; que desaparezca no dice nada.
 */
function franjasConEstado({ reservasDelDia, zona, comensales, ajustes, ahora, fecha }) {
  const duracion = Number(ajustes.duracion_mesa_min) || 90

  return franjasDelDia(ajustes.horario_cocina).map((hora) => {
    const pasada = esDemasiadoTarde({ fecha, hora, ahora })
    if (pasada) return { hora, libre: false, motivo: 'pasada' }
    // El horario de COCINA dice cuando se sirve; el del BAR, cuando se abre. Una
    // franja fuera de la apertura no se ofrece por mucho que la cocina la
    // permita, y un dia de cierre puntual no se ofrece ninguna.
    if (!barAbierto(ajustes, fecha, hora)) return { hora, libre: false, motivo: 'cerrado' }
    const r = cabe({ reservasDelDia, hora, zona, comensales, ajustes })
    return { hora, libre: r.cabe, motivo: r.cabe ? null : r.motivo }
  })
}

/**
 * ¿Abre el bar ese dia a esa hora?
 *
 * ES UNA COPIA CORTA de compartido/js/horario.js, y esta duplicada A PROPOSITO,
 * por lo mismo que panel/js/dom.js es copia de web/js/dom.js (D-28): aquel es
 * un modulo ES que carga el navegador y esto corre en el motor JS de
 * PocketBase, que solo entiende require(). Son veinte lineas; el puente sale
 * mas caro que la copia. Si se toca una, hay que tocar la otra, y las dos estan
 * probadas.
 *
 * CERRAR A LAS 00:00 ES MEDIANOCHE, no cero horas: si la hora de cierre no es
 * mayor que la de apertura, el tramo cruza.
 */
function barAbierto(ajustes, fecha, hora) {
  let semanal = ajustes.horario_semanal
  if (typeof semanal === 'string') { try { semanal = JSON.parse(semanal) } catch (e) { semanal = null } }
  if (!Array.isArray(semanal) || !semanal.some(Boolean)) return true   // sin configurar, no se estorba

  // Cierre puntual: un rango de dias naturales que pisa el horario semanal.
  const desde = String(ajustes.cierre_desde || '').slice(0, 10)
  const hasta = String(ajustes.cierre_hasta || '').slice(0, 10) || desde
  if (desde && fecha >= desde && fecha <= hasta) return false

  const dia = new Date(fecha + 'T00:00:00Z').getUTCDay()
  const t = semanal[dia]
  if (!t) return false

  const min = (hhmm) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''))
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const abre = min(t.abre)
  let cierra = min(t.cierra)
  if (abre === null || cierra === null) return false
  if (cierra <= abre) cierra += 1440

  const cuando = min(hora)
  return cuando !== null && cuando >= abre && cuando < cierra
}

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

/** "2026-09-01" + "21:00" -> Date en hora local. */
function instante(fecha, hora) {
  const f = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha || ''))
  const m = aMinutos(hora)
  if (!f || m === null) return null
  return new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3]), Math.floor(m / 60), m % 60, 0, 0)
}

/** Fecha de hoy en formato AAAA-MM-DD, en hora local. */
function diaDe(fecha) {
  const a = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** Menos de 30 minutos de antelacion, o ya pasada. */
function esDemasiadoTarde({ fecha, hora, ahora = new Date() }) {
  const cuando = instante(fecha, hora)
  if (!cuando) return true
  return cuando.getTime() - ahora.getTime() < MIN_ANTELACION_MIN * 60 * 1000
}

/** Mas alla de antelacion_maxima_dias. */
function esDemasiadoPronto({ fecha, ajustes, ahora = new Date() }) {
  const dias = Number(ajustes.antelacion_maxima_dias) || 30
  const limite = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dias, 23, 59, 59)
  const cuando = instante(fecha, '00:00')
  return !cuando || cuando.getTime() > limite.getTime()
}

/** Los dias que se pueden elegir en el selector, desde hoy. */
function diasReservables(ajustes, ahora = new Date()) {
  const dias = []
  const maximo = Number(ajustes.antelacion_maxima_dias) || 30
  for (let i = 0; i < maximo; i++) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + i)
    dias.push(diaDe(d))
  }
  return dias
}

// ---------------------------------------------------------------------------
// Telefono
// ---------------------------------------------------------------------------

/**
 * Telefono espanol: 9 digitos que empiezan por 6, 7 (moviles), 8 o 9 (fijos).
 * Se admite el prefijo +34 y los espacios, puntos y guiones que la gente pone.
 * Devuelve el numero limpio, o null si no vale.
 */
function normalizarTelefono(texto) {
  let d = String(texto || '').replace(/[\s.\-()]/g, '')
  if (d.startsWith('+34')) d = d.slice(3)
  else if (d.startsWith('0034')) d = d.slice(4)
  else if (d.startsWith('34') && d.length === 11) d = d.slice(2)
  return /^[6789]\d{8}$/.test(d) ? d : null
}

// ---------------------------------------------------------------------------
// Antibot: limite de intentos
// ---------------------------------------------------------------------------

const VENTANA_LIMITE_MS = 60 * 60 * 1000   // una hora

// Reservas por hora y por IP. Es el freno antibot, NO una regla de negocio.
//
// El limite se cuenta por IP, y una IP no es una persona: en una oficina, un
// hotel o un wifi publico, veinte personas comparten la misma. Por eso el
// numero es holgado —un robot hace cientos, no doce— y ademas se puede ajustar
// con la variable de entorno QUIJOTE_MAX_RESERVAS_IP sin tocar el codigo.
const MAX_RESERVAS_POR_IP = 12

/**
 * Decide si una IP se ha pasado de intentos.
 *
 * Recibe las marcas de tiempo de sus intentos anteriores y devuelve la lista ya
 * podada mas el veredicto. Es una funcion pura a proposito: quien la llama
 * decide DONDE guarda las marcas, y asi se puede probar sin nada montado.
 *
 * Nunca se guarda la IP en disco: quien llama a esto la tiene en memoria y se
 * pierde al reiniciar (seccion 13, nada de guardar IPs).
 */
function contarIntento(marcasPrevias, ahora = Date.now(), maximo = MAX_RESERVAS_POR_IP) {
  const vigentes = (marcasPrevias || []).filter((t) => ahora - t < VENTANA_LIMITE_MS)
  vigentes.push(ahora)
  return { marcas: vigentes, demasiados: vigentes.length > maximo }
}

// ---------------------------------------------------------------------------
// Codigo de reserva
// ---------------------------------------------------------------------------

/**
 * Codigo tipo RQ-A7K3. Sin caracteres ambiguos: se dice por telefono y se apunta
 * a mano. El azar se inyecta para poder probar la funcion sin depender de Math.
 */
function generarCodigo(azar = Math.random) {
  let s = ''
  for (let i = 0; i < 4; i++) {
    s += ALFABETO_CODIGO[Math.floor(azar() * ALFABETO_CODIGO.length)]
  }
  return `RQ-${s}`
}

/** Token largo para el enlace de cancelacion. */
function generarToken(azar = Math.random) {
  const letras = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 32; i++) s += letras[Math.floor(azar() * letras.length)]
  return s
}

// ---------------------------------------------------------------------------

module.exports = {
  barAbierto,
  PASO_MIN,
  VENTANA_LIMITE_MS,
  MAX_RESERVAS_POR_IP,
  contarIntento,
  MAX_COMENSALES_WEB,
  MIN_ANTELACION_MIN,
  ALFABETO_CODIGO,
  ZONAS,
  ESTADOS_QUE_OCUPAN,
  aMinutos,
  aHora,
  tramosCocina,
  franjasDelDia,
  aforos,
  aforoTotal,
  zonasDisponibles,
  seSolapan,
  ocupacion,
  cabe,
  franjasConEstado,
  instante,
  diaDe,
  esDemasiadoTarde,
  esDemasiadoPronto,
  diasReservables,
  normalizarTelefono,
  generarCodigo,
  generarToken,
}

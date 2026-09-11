/**
 * Fechas y horas del panel
 * ---------------------------------------------------------------------------
 * Los nombres de dia y de mes salen de Intl con el idioma "es-ES": no hay una
 * tabla de nombres en el codigo porque el navegador ya la trae y no pesa nada.
 *
 * LA REGLA QUE HAY QUE TENER PRESENTE (y que ya costo un fallo en la fase 4):
 * un campo de fecha SIN hora —el dia de una reserva, el de un turno— es un DIA
 * DEL CALENDARIO, no un instante, y se guarda como medianoche UTC de ese dia.
 * Por eso aqui se trabaja con la cadena "AAAA-MM-DD" y no con objetos Date:
 * new Date('2026-09-01T00:00:00Z') en Madrid es el 1 de septiembre a las 02:00,
 * pero .getDate() de la medianoche LOCAL del 1 pasada por toISOString() cae en
 * el 31 de agosto. Cortar la cadena no se equivoca nunca.
 */

const ES = 'es-ES'

/** Hoy, en dia natural de aqui: "2026-09-01". */
export function hoyISO(ahora = new Date()) {
  return diaLocal(ahora)
}

/** Un Date -> "AAAA-MM-DD" del dia natural local. */
export function diaLocal(fecha) {
  const a = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** "2026-09-01" + n dias -> "AAAA-MM-DD". */
export function masDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number)
  return diaLocal(new Date(a, m - 1, d + n))
}

/**
 * Lo que PocketBase devuelve en un campo de fecha ("2026-09-01 00:00:00.000Z")
 * -> "2026-09-01". Se corta la cadena, no se construye un Date.
 */
export function diaDe(valorPB) {
  return String(valorPB || '').slice(0, 10)
}

/**
 * Lo que PocketBase devuelve en un campo que es un INSTANTE de verdad (cuando
 * se creo un aviso, cuando se cerro un recuento) -> "AAAA-MM-DD" del dia
 * natural DE AQUI.
 *
 * No vale diaDe() para esto. diaDe corta la cadena, que es lo correcto para un
 * dia del calendario guardado como medianoche UTC; pero un aviso apuntado a las
 * 00:30 de Madrid es de ayer en UTC, y diria "apuntado ayer" de algo que se
 * acaba de escribir.
 */
export function diaDeInstante(valorPB) {
  if (!valorPB) return ''
  const d = new Date(String(valorPB).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? '' : diaLocal(d)
}

/** "2026-09-01" -> "2026-09-01 00:00:00.000Z", que es lo que espera PocketBase. */
export function aFechaPB(iso) {
  return `${iso} 00:00:00.000Z`
}

/** Un dia del calendario como Date local, para preguntarle el dia de la semana. */
function comoFecha(iso) {
  const [a, m, d] = String(iso).split('-').map(Number)
  return new Date(a, m - 1, d, 12, 0, 0)   // mediodia: inmune al cambio de hora
}

/** "2026-09-01" -> "martes 1 de septiembre" */
export function diaLargo(iso) {
  return comoFecha(iso).toLocaleDateString(ES, {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

/** "2026-09-01" -> "MAR" (para las pastillas del selector de dia) */
export function diaCorto(iso) {
  return comoFecha(iso)
    .toLocaleDateString(ES, { weekday: 'short' })
    .replace('.', '')
    .slice(0, 3)
    .toUpperCase()
}

/**
 * "2026-09-01" -> "martes 1", que es como titula los dias la maqueta.
 *
 * Se pide el nombre del dia suelto y no se recorta diaLargo(): el formato
 * largo del castellano lleva coma ("martes, 1 de septiembre") y cortando por
 * el primer espacio sale "martes,".
 */
export function diaYNumero(iso) {
  const nombre = comoFecha(iso).toLocaleDateString(ES, { weekday: 'long' })
  return `${nombre} ${numeroDeDia(iso)}`
}

/** "2026-09-01" -> "1" */
export function numeroDeDia(iso) {
  return String(Number(iso.slice(8, 10)))
}

/** "2026-09-01" -> "1 sept" */
export function diaYMes(iso) {
  return comoFecha(iso).toLocaleDateString(ES, { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/** Con mayuscula inicial: "Martes 1 de septiembre". */
export function conMayuscula(texto) {
  return texto ? texto[0].toUpperCase() + texto.slice(1) : ''
}

/**
 * Nombre del dia relativo, que es como se habla: "hoy", "ayer", "mañana", y si
 * no, el nombre del dia. Se usa en el aviso de platos agotados ("ocultos desde
 * el sábado") y en la cabecera de la lista de reservas.
 */
export function diaRelativo(iso, ahora = new Date()) {
  const hoy = hoyISO(ahora)
  if (iso === hoy) return 'hoy'
  if (iso === masDias(hoy, -1)) return 'ayer'
  if (iso === masDias(hoy, 1)) return 'mañana'

  // Dentro de la semana anterior se dice el nombre del dia, que es lo que
  // entiende cualquiera: "desde el sábado". Mas atras, la fecha.
  for (let i = 2; i <= 6; i++) {
    if (iso === masDias(hoy, -i)) {
      const nombre = comoFecha(iso).toLocaleDateString(ES, { weekday: 'long' })
      return `el ${nombre}`
    }
  }
  return `el ${diaYMes(iso)}`
}

/**
 * El dia relativo con su preposicion delante, contraida cuando toca:
 * "de hoy", "de ayer", "del sabado", "del 30 ago".
 *
 * Sin esto sale "del recuento de el sabado", que es la clase de detalle que
 * hace que un texto parezca escrito por una maquina.
 */
export function deDia(iso, ahora = new Date()) {
  const relativo = diaRelativo(iso, ahora)
  return relativo.startsWith('el ') ? `del ${relativo.slice(3)}` : `de ${relativo}`
}

/** "Buenos días" / "Buenas tardes" / "Buenas noches", segun la hora. */
export function saludo(ahora = new Date()) {
  const h = ahora.getHours()
  if (h < 13) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Un instante de PocketBase -> "08:15" en hora de aqui. */
export function horaLocal(valorPB) {
  if (!valorPB) return ''
  const d = new Date(String(valorPB).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(ES, { hour: '2-digit', minute: '2-digit' })
}

/** "21:30" -> 1290 minutos. null si no encaja. */
export function aMinutos(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** 1290 -> "21:30" */
export function aHora(minutos) {
  const m = ((minutos % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Tramos del horario de cocina: "12:30-16:30,20:00-23:30".
 * Misma lectura que pb_hooks/lib/reglas-reserva.js, que es quien manda; aqui
 * solo sirve para AGRUPAR en pantalla lo que ya esta guardado.
 */
export function tramosCocina(texto) {
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

/** Las franjas de media hora de un dia, para el desplegable de hora del panel. */
export function franjasDelDia(horarioCocina) {
  const franjas = []
  for (const tramo of tramosCocina(horarioCocina)) {
    for (let m = tramo.abre; m < tramo.cierra; m += 30) {
      const hora = aHora(m)
      if (!franjas.includes(hora)) franjas.push(hora)
    }
  }
  return franjas
}

// --- Semanas y meses (cuadrante e informe de horas) -------------------------

/**
 * El lunes de la semana de un dia. La semana del cuadrante empieza en lunes,
 * como la del bar y como la del calendario de aqui; getDay() cuenta el domingo
 * como 0, de ahi el ajuste.
 */
export function lunesDe(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  const fecha = new Date(a, m - 1, d, 12, 0, 0)
  const dia = fecha.getDay()
  return masDias(iso, dia === 0 ? -6 : 1 - dia)
}

/** Los siete dias de la semana que empieza ese lunes. */
export function semanaDesde(lunesISO) {
  return Array.from({ length: 7 }, (_, i) => masDias(lunesISO, i))
}

/** "Semana del 1 al 7 de septiembre", que es como lo titula la maqueta. */
export function tituloDeSemana(lunesISO) {
  const domingo = masDias(lunesISO, 6)
  const desde = Number(lunesISO.slice(8, 10))
  const hasta = Number(domingo.slice(8, 10))
  const mesL = comoFecha(lunesISO).toLocaleDateString(ES, { month: 'long' })
  const mesD = comoFecha(domingo).toLocaleDateString(ES, { month: 'long' })
  return mesL === mesD
    ? `Semana del ${desde} al ${hasta} de ${mesD}`
    : `Semana del ${desde} de ${mesL} al ${hasta} de ${mesD}`
}

/** "2026-09-04" -> "2026-09". */
export function mesDe(iso) {
  return String(iso).slice(0, 7)
}

/** "2026-09" + n meses -> "AAAA-MM". */
export function masMeses(mes, n) {
  const [a, m] = mes.split('-').map(Number)
  const fecha = new Date(a, m - 1 + n, 1)
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

/** Primer y ultimo dia natural de un mes: "2026-09" -> ["2026-09-01", "2026-09-30"]. */
export function diasDelMes(mes) {
  const [a, m] = mes.split('-').map(Number)
  return [`${mes}-01`, diaLocal(new Date(a, m, 0))]
}

/** "2026-09" -> "septiembre". Con el ano si no es el de ahora. */
export function nombreDeMes(mes, ahora = new Date()) {
  const [a, m] = mes.split('-').map(Number)
  const nombre = new Date(a, m - 1, 15).toLocaleDateString(ES, { month: 'long' })
  return a === ahora.getFullYear() ? nombre : `${nombre} de ${a}`
}

/**
 * El instante en que EMPIEZA aqui un dia natural, como lo espera PocketBase:
 * "2026-09-01" -> "2026-08-31 22:00:00.000Z" en horario de verano de Madrid.
 *
 * No vale aFechaPB() para esto. Aquella sirve para los campos de fecha SIN
 * hora, que son dias del calendario guardados como medianoche UTC; esto es
 * para filtrar campos que son INSTANTES de verdad —la entrada de un fichaje—
 * por el dia natural de aqui. Con medianoche UTC, un turno que entra a las
 * 00:30 de Madrid caeria en el dia anterior y el informe del mes no cuadraria.
 */
export function inicioDelDiaPB(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d, 0, 0, 0, 0).toISOString().replace('T', ' ')
}

/** El instante en que ACABA aqui un dia natural (el ultimo milisegundo). */
export function finDelDiaPB(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d, 23, 59, 59, 999).toISOString().replace('T', ' ')
}

/** Ahora mismo, como lo guarda PocketBase: "2026-09-04 18:20:05.123Z". */
export function ahoraPB() {
  return new Date().toISOString().replace('T', ' ')
}

/**
 * Un instante de PocketBase -> lo que espera un <input type="datetime-local">,
 * en hora de aqui: "2026-09-01 06:15:00.000Z" -> "2026-09-01T08:15".
 *
 * El input trabaja SIEMPRE en hora local y sin huso: si se le mete la cadena
 * UTC tal cual, el fichaje de las 08:15 aparece como las 06:15 y quien corrige
 * la hora acaba moviendola dos horas sin querer.
 */
export function aEntradaLocal(valorPB) {
  if (!valorPB) return ''
  const d = new Date(String(valorPB).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  const dosCifras = (n) => String(n).padStart(2, '0')
  return `${diaLocal(d)}T${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`
}

/** El camino de vuelta: "2026-09-01T08:15" -> "2026-09-01 06:15:00.000Z". */
export function deEntradaLocal(valor) {
  if (!valor) return ''
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ')
}

// --- Fechas de la ficha del equipo ------------------------------------------

/** "2024-03-03" -> "3 de marzo de 2024". Con el ano: una alta es de cuando es. */
export function fechaLarga(iso) {
  if (!iso) return ''
  return comoFecha(iso).toLocaleDateString(ES, {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Cuanto lleva alguien: "2 años y 6 meses", "5 meses", "12 días".
 *
 * Se cuenta por meses de calendario y no dividiendo dias entre 30,4: la
 * antiguedad de alguien que entro el 3 de marzo se dice en meses cumplidos, que
 * es como lo cuenta cualquiera y como lo cuenta un contrato.
 *
 * Devuelve '' si no hay fecha o si es futura, que no es antiguedad: es un alta
 * que todavia no ha pasado.
 */
export function antiguedad(desdeISO, ahora = new Date()) {
  if (!desdeISO) return ''
  const [a, m, d] = String(desdeISO).slice(0, 10).split('-').map(Number)
  if (!a || !m || !d) return ''

  const hoy = { a: ahora.getFullYear(), m: ahora.getMonth() + 1, d: ahora.getDate() }
  let meses = (hoy.a - a) * 12 + (hoy.m - m)
  if (hoy.d < d) meses--                       // el mes en curso no esta cumplido

  if (meses < 0) return ''
  if (meses === 0) {
    const dias = Math.max(0, Math.round(
      (new Date(hoy.a, hoy.m - 1, hoy.d) - new Date(a, m - 1, d)) / 86400000))
    if (dias === 0) return 'desde hoy'
    return dias === 1 ? '1 día' : `${dias} días`
  }
  if (meses < 12) return meses === 1 ? '1 mes' : `${meses} meses`

  const anos = Math.floor(meses / 12)
  const resto = meses % 12
  const enAnos = anos === 1 ? '1 año' : `${anos} años`
  if (!resto) return enAnos
  return `${enAnos} y ${resto === 1 ? '1 mes' : `${resto} meses`}`
}

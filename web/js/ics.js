/**
 * Generacion del fichero .ics (calendario)
 * ---------------------------------------------------------------------------
 * Se genera EN EL CLIENTE (seccion 6): no hace falta pedirselo al servidor, y
 * asi funciona aunque la red vaya mal justo despues de reservar.
 *
 * Formato iCalendar (RFC 5545). Los detalles que importan y que suelen fallar:
 *   - Las lineas se separan con CRLF, no con salto simple.
 *   - Los saltos dentro de un campo van como "\\n" escapado.
 *   - Las comas y los puntos y coma se escapan.
 *   - Las lineas de mas de 75 octetos hay que plegarlas.
 */

/** Escapa el texto de un campo de iCalendar. */
function escapar(texto) {
  return String(texto || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Pliega las lineas largas: el RFC limita a 75 octetos y las continuaciones
 * empiezan por un espacio. Sin esto, algunos calendarios rechazan el fichero.
 */
function plegar(linea) {
  if (linea.length <= 74) return linea
  const trozos = [linea.slice(0, 74)]
  let resto = linea.slice(74)
  while (resto.length > 73) {
    trozos.push(' ' + resto.slice(0, 73))
    resto = resto.slice(73)
  }
  if (resto) trozos.push(' ' + resto)
  return trozos.join('\r\n')
}

/** Date -> "20260901T210000" en hora local (sin Z: es hora del bar). */
function fechaLocal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
       + `T${p(d.getHours())}${p(d.getMinutes())}00`
}

function fechaUtc(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Construye el .ics de una reserva.
 *
 * La hora va SIN zona horaria (hora local flotante) a proposito: la reserva es
 * "a las 21:00 en el bar". Si el cliente cruza un huso, la cita sigue siendo a
 * las 21:00 hora de Madrid, que es cuando le esperan.
 */
export function icsDeReserva({ reserva, nombreBar, direccion, duracionMin = 90 }) {
  const [a, m, d] = String(reserva.fecha).slice(0, 10).split('-').map(Number)
  const [h, min] = reserva.hora.split(':').map(Number)
  const inicio = new Date(a, m - 1, d, h, min, 0)
  const fin = new Date(inicio.getTime() + duracionMin * 60000)

  const descripcion = [
    `Reserva a nombre de ${reserva.nombre}.`,
    `${reserva.comensales} personas.`,
    reserva.zona && reserva.zona !== 'indiferente' ? `Zona: ${reserva.zona}.` : '',
    `Código de reserva: ${reserva.codigo}.`,
    'La mesa se guarda 15 minutos.',
  ].filter(Boolean).join(' ')

  const lineas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//El Rincon del Quijote//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reserva.codigo}@barrinconquijote.es`,
    `DTSTAMP:${fechaUtc(new Date())}`,
    `DTSTART:${fechaLocal(inicio)}`,
    `DTEND:${fechaLocal(fin)}`,
    `SUMMARY:${escapar(`Mesa en ${nombreBar}`)}`,
    `DESCRIPTION:${escapar(descripcion)}`,
    direccion ? `LOCATION:${escapar(direccion)}` : null,
    'STATUS:CONFIRMED',
    // Aviso dos horas antes. Util de verdad: da tiempo a avisar si no se va.
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapar(`Mesa en ${nombreBar} dentro de 2 horas`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean)

  return lineas.map(plegar).join('\r\n') + '\r\n'
}

/** Lanza la descarga del .ics. */
export function descargarIcs(texto, nombreFichero) {
  const blob = new Blob([texto], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreFichero
  document.body.append(a)
  a.click()
  a.remove()
  // Se libera despues, no en el acto: en Safari la descarga se corta si se
  // revoca la URL demasiado pronto.
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

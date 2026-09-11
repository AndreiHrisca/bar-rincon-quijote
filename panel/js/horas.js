/**
 * Horas: turnos, jornadas y lo que queda sin cubrir
 * ---------------------------------------------------------------------------
 * Las cuentas del cuadrante y del control horario, en un sitio y sin tocar el
 * DOM ni la red.
 *
 * AQUI SE SUMAN HORAS Y EN EL SERVIDOR NO. No es un despiste: el servidor solo
 * necesita saber DE QUIEN es un fichaje y si un cambio es una correccion
 * (pb_hooks/lib/personal.js); cuanto ha trabajado cada cual solo hace falta
 * para pintarlo y para el informe del mes, que se genera aqui. Sumar jornadas
 * en dos sitios es la forma segura de que un dia no cuadren.
 *
 * Lo unico que se repite a los dos lados es la duracion de un turno, y esta
 * escrito en los dos con la misma regla: las horas del cuadrante son texto
 * HH:MM —un turno es de un dia, no un instante—, asi que un turno que acaba
 * "antes" de empezar es el de noche y cruza la medianoche.
 */

import { aMinutos, aHora, tramosCocina } from './fechas.js'

/** Minutos que dura un turno. 0 si las horas no encajan o si no dura nada. */
export function minutosDeTurno(inicio, fin) {
  const a = aMinutos(inicio)
  const b = aMinutos(fin)
  if (a === null || b === null) return 0
  const dura = b - a
  return dura > 0 ? dura : (dura === 0 ? 0 : dura + 1440)
}

/**
 * Minutos de un fichaje. null si sigue abierto, que NO es cero: cero seria una
 * jornada de nada y lo que hay es una jornada que no ha terminado.
 */
export function minutosFichados(entrada, salida) {
  if (!salida) return null
  const a = Date.parse(String(entrada || '').replace(' ', 'T'))
  const b = Date.parse(String(salida).replace(' ', 'T'))
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null
  return Math.round((b - a) / 60000)
}

/**
 * 312 -> "5 h 12". Las horas justas se escriben sin minutos: "8 h".
 *
 * Se escribe con la hache separada, como se dice y como lo pinta la maqueta, y
 * no en decimal: "5,2 h" no lo lee nadie a la primera.
 */
export function enHoras(minutos) {
  if (minutos === null || minutos === undefined) return '—'
  const m = Math.max(0, Math.round(minutos))
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto ? `${h} h ${String(resto).padStart(2, '0')}` : `${h} h`
}

/**
 * La franja que cubre el dia: de la primera entrada a la ultima salida.
 * "08:00 – 02:00". null si ese dia no hay nadie.
 *
 * Se calcula con los turnos que hay y no con un horario de apertura guardado,
 * porque el horario del bar no esta en el modelo: lo unico que se puede afirmar
 * es a que hora empieza y acaba lo que hay puesto.
 */
export function franjaCubierta(turnos) {
  if (!turnos.length) return null
  let desde = null
  let hasta = null
  for (const t of turnos) {
    const a = aMinutos(t.hora_inicio)
    if (a === null) continue
    const b = a + minutosDeTurno(t.hora_inicio, t.hora_fin)
    if (desde === null || a < desde) desde = a
    if (hasta === null || b > hasta) hasta = b
  }
  if (desde === null) return null
  return `${aHora(desde)} – ${aHora(hasta)}`
}

/**
 * Los servicios de cocina que ese dia no cubre nadie.
 *
 * Es el granate de la maqueta: «Noche sin cubrir». Se mide contra el horario de
 * cocina de los ajustes, que es el unico horario que el sistema conoce de
 * verdad, y se marca solo lo que no cubre NADIE: que alguien se vaya a las
 * 23:00 con la cocina abierta hasta las 23:30 no es un hueco, es el final del
 * servicio, y avisar de eso todos los dias seria ruido.
 *
 * Devuelve una lista de textos ya escritos: ['Noche sin cubrir'].
 */
export function serviciosSinCubrir(turnos, horarioCocina) {
  const tramos = tramosCocina(horarioCocina)
  if (!tramos.length) return []

  const puestos = turnos
    .map((t) => {
      const a = aMinutos(t.hora_inicio)
      if (a === null) return null
      return { a, b: a + minutosDeTurno(t.hora_inicio, t.hora_fin) }
    })
    .filter(Boolean)

  return tramos
    .filter((tramo) => !puestos.some((t) => t.a < tramo.cierra && t.b > tramo.abre))
    .map((tramo) => `${nombreDeServicio(tramo.abre, tramos.length)} sin cubrir`)
}

/**
 * Como se llama cada servicio. Con los dos de siempre —comida y cena— se dicen
 * por su nombre; si algun dia hay tres tramos, se dice la hora, que es lo unico
 * que sigue siendo verdad.
 */
function nombreDeServicio(abre, cuantos) {
  if (cuantos > 2) return `El servicio de las ${aHora(abre)}`
  return abre < 16 * 60 ? 'La comida' : 'La noche'
}

/**
 * Suma las horas de cada empleado en una lista de fichajes.
 *
 * Los fichajes SIN CERRAR no suman y se cuentan aparte: un turno abierto no es
 * una jornada de cero horas, es una jornada que no sabemos cuanto duro, y
 * meterla como cero haria mentir al informe del mes. Por eso la pantalla saca
 * los abiertos arriba del todo: son lo que hay que arreglar antes de sacar el
 * informe.
 *
 * Devuelve un Map: id de empleado -> { minutos, jornadas, abiertos }.
 */
export function horasPorEmpleado(fichajes) {
  const suma = new Map()
  for (const f of fichajes) {
    const clave = f.empleado
    if (!suma.has(clave)) suma.set(clave, { minutos: 0, jornadas: 0, abiertos: 0 })
    const fila = suma.get(clave)
    const min = minutosFichados(f.entrada, f.salida)
    if (min === null) fila.abiertos++
    else { fila.minutos += min; fila.jornadas++ }
  }
  return suma
}

// ---------------------------------------------------------------------------
// TRAMOS: la aritmetica de la barra de un dia
// ---------------------------------------------------------------------------
// Un TRAMO es `{ inicio, fin }` en MINUTOS DESDE LA MEDIANOCHE del dia al que
// se imputa. Dos consecuencias que hay que tener presentes:
//
//   - `fin` PUEDE PASAR DE 1440. Un turno de 16:00 a 00:30 es
//     { inicio: 960, fin: 1470 }, no dos tramos en dos dias. Las 8 h 30 se
//     imputan enteras al dia de ENTRADA, que es como se cuenta una jornada.
//   - `fin` puede ser `null`: la persona sigue dentro. Eso NO es cero minutos,
//     es una jornada que todavia no sabemos cuanto duro.
//
// Una FILA es una lista de tramos: el turno partido —lo normal en este bar— son
// dos tramos de la misma persona el mismo dia, y se trata como el caso general,
// no como una excepcion. Agrupar los registros por empleado y dia es cosa de la
// pantalla; aqui llegan ya agrupados.
//
// Todo esto es puro: ni DOM, ni red, ni PocketBase. La pieza que lo pinta esta
// en panel/js/piezas/barra-dia.js y solo sabe poner porcentajes.

/** Un turno del cuadrante -> tramo. Nunca esta abierto: hora_fin es obligatoria. */
export function tramoDeTurno(turno) {
  const inicio = aMinutos(turno?.hora_inicio)
  if (inicio === null) return null
  return { inicio, fin: inicio + minutosDeTurno(turno.hora_inicio, turno.hora_fin) }
}

/**
 * Un fichaje -> tramo. `fin` sale de los instantes de verdad y no de recortar
 * la hora: asi un turno que cruza la medianoche da 1470 y no 30.
 */
export function tramoDeFichaje(fichaje) {
  const entrada = new Date(String(fichaje?.entrada || '').replace(' ', 'T'))
  if (Number.isNaN(entrada.getTime())) return null
  const inicio = entrada.getHours() * 60 + entrada.getMinutes()
  const dura = minutosFichados(fichaje.entrada, fichaje.salida)
  return { inicio, fin: dura === null ? null : inicio + dura }
}

/**
 * Lo que hay que saber de una fila para pintarla y para decirla en palabras.
 *
 * `minutos` suma SOLO los tramos cerrados: con un tramo abierto la cifra es
 * parcial y se marca como tal, nunca se inventa un final.
 */
export function resumenDeFila(tramos) {
  const limpios = (tramos || [])
    .filter((t) => t && Number.isFinite(t.inicio))
    .map((t) => ({
      inicio: t.inicio,
      fin: Number.isFinite(t.fin) ? t.fin : null,
      abierto: !Number.isFinite(t.fin),
      cruza: Number.isFinite(t.fin) && t.fin > 1440,
    }))
    .sort((a, b) => a.inicio - b.inicio)

  let minutos = 0
  let abierta = false
  for (const t of limpios) {
    if (t.abierto) abierta = true
    else minutos += Math.max(0, t.fin - t.inicio)
  }

  return {
    tramos: limpios,
    minutos: limpios.length ? minutos : null,
    abierta,
    parcial: abierta && minutos > 0,
    cruza: limpios.some((t) => t.cruza),
    solapa: haySolape(limpios),
  }
}

/**
 * ¿Se pisan dos tramos de la misma fila? En fichajes eso es un error de datos
 * (nadie entra dos veces sin salir) y conviene poder cantarlo; en el cuadrante
 * es legal y solo informa. Un tramo abierto se pisa con todo lo que venga
 * detras, que es justamente el sintoma de no haber cerrado.
 */
export function haySolape(tramos) {
  const orden = [...(tramos || [])].sort((a, b) => a.inicio - b.inicio)
  for (let i = 1; i < orden.length; i++) {
    const fin = orden[i - 1].fin === null ? Infinity : orden[i - 1].fin
    if (orden[i].inicio < fin) return true
  }
  return false
}

/** "08:00–13:00 · 17:00–20:00". El tramo abierto se dice, no se calla. */
export function rangoDeTramos(tramos) {
  return (tramos || [])
    .map((t) => (t.fin === null || t.abierto
      ? `${aHora(t.inicio)} – sin salida`
      : `${aHora(t.inicio)}–${aHora(t.fin)}`))
    .join(' · ')
}

/**
 * Donde cae un tramo sobre el eje, en porcentaje de la ventana.
 *
 * LA VENTANA ES UN PARAMETRO, en horas: por defecto el dia entero (0 a 24). El
 * dia que se decida recortar el eje a la franja de apertura del bar, esto no
 * cambia; cambia quien lo llama.
 *
 * Devuelve null si el tramo cae entero fuera de la ventana. `cortaDerecha`
 * marca lo que se sale por el borde: ahi la barra se pinta sin esquina, que es
 * como se lee "esto sigue".
 */
export function colocarTramo(tramo, { inicioEje = 0, finEje = 24 } = {}) {
  const a = inicioEje * 60
  const b = finEje * 60
  if (!(b > a) || !tramo || !Number.isFinite(tramo.inicio)) return null

  const fin = (tramo.fin === null || tramo.abierto) ? b : tramo.fin
  const desde = Math.max(a, tramo.inicio)
  const hasta = Math.min(b, fin)
  if (hasta <= a || desde >= b) return null

  // Se corta lo que LLEGA al borde, no solo lo que se pasa: un turno que acaba
  // a las 00:00 clavadas termina en el filo del eje, y ahi una esquina redonda
  // se lee como "aqui se acaba de verdad" cuando lo que hay es el limite del
  // dibujo. El tramo abierto es la excepcion: ya se distingue por el rayado y
  // pierde su forma si ademas se le cuadra el lado.
  const abierto = tramo.fin === null || tramo.abierto
  return {
    izquierda: ((desde - a) / (b - a)) * 100,
    ancho: Math.max(0, ((hasta - desde) / (b - a)) * 100),
    cortaIzquierda: !abierto && tramo.inicio <= a,
    cortaDerecha: !abierto && fin >= b,
  }
}

/**
 * Lo que NO cubre nadie entre dos horas. Se usa en el cuadrante para la fila
 * «Sin cubrir». Recibe los tramos de TODO el dia (los de todo el mundo juntos)
 * y devuelve los huecos como tramos, listos para pintarlos igual que los demas.
 *
 * Un tramo abierto tapa hasta el final de la ventana: mientras alguien siga
 * dentro no hay hueco que reclamar.
 */
export function huecosDeTramos(tramos, { desde = 0, hasta = 1440 } = {}) {
  const puestos = (tramos || [])
    .filter((t) => t && Number.isFinite(t.inicio))
    .map((t) => ({ a: t.inicio, b: (t.fin === null || t.abierto) ? hasta : t.fin }))
    .filter((t) => t.b > desde && t.a < hasta)
    .sort((x, y) => x.a - y.a)

  const huecos = []
  let borde = desde
  for (const t of puestos) {
    if (t.a > borde) huecos.push({ inicio: borde, fin: Math.min(t.a, hasta) })
    borde = Math.max(borde, t.b)
    if (borde >= hasta) break
  }
  if (borde < hasta) huecos.push({ inicio: borde, fin: hasta })
  return huecos
}

/**
 * La fila dicha en palabras, para el lector de pantalla:
 *   "Kevin, de 16:00 a 00:30 del día siguiente, 8 horas y 30 minutos"
 * La barra es decorativa; esto es lo que se anuncia.
 */
export function etiquetaDeFila(nombre, resumen) {
  const cuando = resumen.tramos.map((t) => (t.abierto
    ? `de ${aHora(t.inicio)}, sin salida todavía`
    : `de ${aHora(t.inicio)} a ${aHora(t.fin)}${t.cruza ? ' del día siguiente' : ''}`))

  const partes = [nombre]
  if (cuando.length) partes.push(cuando.join(' y '))
  else partes.push('sin turno')
  if (resumen.minutos) partes.push(`${enPalabras(resumen.minutos)}${resumen.parcial ? ' hasta ahora' : ''}`)
  return partes.join(', ')
}

/** 510 -> "8 horas y 30 minutos". Para leerlo en voz alta, no para la pantalla. */
export function enPalabras(minutos) {
  const m = Math.max(0, Math.round(minutos || 0))
  const h = Math.floor(m / 60)
  const resto = m % 60
  const horas = h ? `${h} ${h === 1 ? 'hora' : 'horas'}` : ''
  const mins = resto ? `${resto} ${resto === 1 ? 'minuto' : 'minutos'}` : ''
  return [horas, mins].filter(Boolean).join(' y ') || '0 minutos'
}

/**
 * Los huecos de un dia medidos contra el horario de COCINA, que hoy es el unico
 * horario que el sistema conoce de verdad (los ajustes guardan
 * "12:30-16:30,20:00-23:30"). Devuelve tramos, listos para pintarlos con la
 * misma barra que todo lo demas.
 *
 * EL MINIMO NO ES UN CAPRICHO. Que alguien se vaya a las 23:00 con la cocina
 * abierta hasta las 23:30 no es un hueco, es el final del servicio, y cantarlo
 * todos los dias seria ruido —el mismo criterio con el que se escribio
 * serviciosSinCubrir—. Media hora o menos no cuenta como hueco; por eso la
 * comparacion es estricta y ese caso de 30 minutos clavados queda fuera.
 *
 * Las dos funciones conviven a proposito y dicen cosas distintas:
 *   serviciosSinCubrir  ->  «La noche sin cubrir», para el mensaje al equipo.
 *   huecosDelDia        ->  16:00–17:00 exacto, para pintarlo en la barra.
 */
export function huecosDelDia(tramos, horarioCocina, minimo = 30) {
  return tramosCocina(horarioCocina)
    .flatMap((servicio) => huecosDeTramos(tramos, { desde: servicio.abre, hasta: servicio.cierra }))
    .filter((h) => h.fin - h.inicio > minimo)
}

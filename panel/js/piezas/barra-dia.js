/**
 * Barra de un día — un tramo horario sobre un eje de horas
 * ---------------------------------------------------------------------------
 * LA MISMA PIEZA para fichajes y para el cuadrante. Es el mismo problema —quién
 * está y cuándo— y se resuelve una sola vez: quien aprende a leer los fichajes
 * sabe leer el cuadrante sin volver a aprender nada. Si algún día aparece una
 * segunda barra parecida en otra pantalla, está mal: se consume esta.
 *
 * POR QUÉ UNA BARRA Y NO TEXTO. «16:00 – 00:30 · 8 h 30» obliga a restar de
 * cabeza. Sobre un eje se ven de un vistazo los solapes, los huecos y lo que no
 * ha terminado, sin leer un solo número.
 *
 * ESTA PIEZA NO HACE CUENTAS. Recibe tramos ya calculados —en minutos desde la
 * medianoche del día al que se imputan— y solo los convierte en porcentajes de
 * la ventana del eje. Toda la aritmética (duración, cruce de medianoche,
 * solapes, huecos) vive en panel/js/horas.js y está probada en
 * pruebas/unitarias/barra-dia.test.js. Aquí no se habla con PocketBase.
 *
 * EL EJE ES UN PARÁMETRO. `inicioEje` y `finEje` van en horas y por defecto
 * cubren el día entero, 0 a 24. Toda posición se calcula contra esa ventana y
 * la regleta saca sus marcas de ella, así que recortar el eje a la franja de
 * apertura del bar es cambiar dos números en quien llama, no tocar esto.
 *
 * EL TURNO PARTIDO ES EL CASO NORMAL en este bar, no una excepción: una fila es
 * SIEMPRE una lista de tramos. Dos tramos van en la misma fila y sobre el mismo
 * eje, separados, sin unirlos con línea ni relleno: el hueco entre ellos es
 * información —se lee que libra por la tarde— y taparlo sería borrarla.
 * Agrupar los registros por empleado y día es cosa de la pantalla que llama.
 *
 * CÓMO SE USA
 *
 *   barraDia({
 *     filas: [
 *       { nombre: 'Santi', tramos: [{ inicio: 480, fin: 780 },
 *                                   { inicio: 1020, fin: 1200 }] },
 *       { nombre: 'Marisa', tramos: [{ inicio: 540, fin: null }],
 *         accion: { texto: 'corregir', alPulsar } },
 *       { nombre: 'Sin cubrir', hueco: true, tramos: [...],
 *         accion: { texto: 'asignar', alPulsar } },
 *       { nombre: 'Juan', tramos: [{ inicio: 480, fin: null }], enCurso: true,
 *         accion: { texto: '3 h 20' } },   // dentro ahora: no es un error
 *       { nombre: 'Trini', tramos: [...],
 *         marca: { icono: 'editar', titulo: 'Corregido a mano' } },
 *     ],
 *     franjas: ['16:00'],          // líneas de cambio de franja
 *   })
 */

import { el } from '../dom.js'
import { icono } from '/compartido/js/iconos.js'
import { aMinutos, aHora } from '../fechas.js'
import { resumenDeFila, colocarTramo, rangoDeTramos, enHoras, etiquetaDeFila } from '../horas.js'

const EJE_POR_DEFECTO = { inicioEje: 0, finEje: 24 }

/**
 * El grupo entero de un día: una regleta arriba y debajo las filas.
 *
 * La regleta va UNA VEZ por día y no por fila: repetirla convierte la tarjeta
 * en una hoja de cálculo y el ojo deja de ver las barras.
 */
export function barraDia({ filas = [], inicioEje = 0, finEje = 24, franjas = [], regleta = true } = {}) {
  const ventana = ventanaValida(inicioEje, finEje)
  const marcasFranja = franjas.map((f) => enMinutos(f)).filter((m) => m !== null)

  return el('div', { class: 'barra-dia' }, [
    regleta ? regletaDeHoras(ventana) : null,
    filas.map((fila) => filaDeBarra(fila, ventana, marcasFranja)),
  ])
}

/**
 * Una fila suelta. Existe aparte por si alguna pantalla necesita intercalarla
 * con otra cosa; lo normal es pasar por barraDia().
 */
export function filaDeBarra(fila, ventana = EJE_POR_DEFECTO, marcasFranja = []) {
  const resumen = resumenDeFila(fila.tramos)
  const abierta = resumen.abierta
  const hueco = !!fila.hueco

  // Toda la fila puede llevar a algun sitio (corregir un fichaje, abrir un
  // turno del cuadrante). Si ADEMAS lleva enlace propio dentro, la fila no
  // puede ser un boton: un boton dentro de otro no es HTML valido y en el movil
  // se pisan las dos areas. En ese caso manda el enlace, que es mas concreto.
  const conEnlace = !!fila.accion?.alPulsar
  const pulsable = !!fila.alPulsar && !conEnlace

  // Abierto NO siempre es un error. Un fichaje sin cerrar de hoy es alguien que
  // esta dentro trabajando; uno de anteayer es un olvido que rompe el informe.
  // La barra se raya en los dos casos —la jornada no ha terminado, y eso es
  // verdad—, pero el granate de "arregla esto" solo va en el segundo.
  const clases = ['barra-fila']
  if (abierta && !fila.enCurso) clases.push('barra-fila--abierta')
  if (hueco) clases.push('barra-fila--vacia')
  if (conEnlace) clases.push('barra-fila--con-accion')
  if (pulsable) clases.push('barra-fila--pulsable')

  const cuerpo = [
    ejeDeFila(resumen, ventana, marcasFranja, hueco),
    pieDeFila(resumen, fila, hueco),
  ]

  // ACCESIBILIDAD. La fila entera es una sola imagen con su descripcion en
  // palabras: la barra no dice nada que el texto no diga mejor, y leerle a
  // alguien «sesenta y seis por ciento» no le sirve de nada.
  //
  // Tres formas segun lo que lleve dentro:
  //   pulsable   -> <button>, con esa misma descripcion como nombre accesible.
  //   con enlace -> <div> normal. role="img" se traga lo que lleve dentro y
  //                 dejaria el «corregir» fuera del alcance del lector de
  //                 pantalla; asi se oculta solo la barra, que es lo
  //                 decorativo, y el nombre, el rango y el boton se anuncian
  //                 por separado. Llega la misma informacion.
  //   ninguna    -> <div role="img"> con la descripcion.
  const etiqueta = etiquetaDeFila(fila.nombre, resumen)

  return el(pulsable ? 'button' : 'div', {
    class: clases.join(' '),
    type: pulsable ? 'button' : null,
    onclick: pulsable ? fila.alPulsar : null,
    role: (!pulsable && !conEnlace) ? 'img' : null,
    'aria-label': conEnlace ? null : etiqueta,
  }, [
    // <span> y no <div>: dentro de un <button> un <div> no es contenido valido.
    el('span', { class: 'barra-fila__nombre', title: fila.nombre }, [
      fila.nombre,
      // Marca opcional junto al nombre. Hoy solo la usa el «corregido a mano»
      // de fichajes, que es traza de quien toco las horas y no puede perderse.
      fila.marca ? icono(fila.marca.icono, { titulo: fila.marca.titulo, clase: 'ic barra-fila__marca' }) : null,
    ]),
    el('span', { class: 'barra-fila__cuerpo' }, cuerpo),
  ])
}

// ---------------------------------------------------------------------------

/** La pista de fondo con los tramos encima. Decorativa: no se anuncia. */
function ejeDeFila(resumen, ventana, marcasFranja, hueco) {
  const franjas = marcasFranja
    .map((min) => colocarFranja(min, ventana))
    .filter((p) => p !== null)
    .map((izq) => el('i', { class: 'barra-fila__franja', style: `left:${redondo(izq)}%` }))

  const tramos = resumen.tramos.map((tramo) => {
    const p = colocarTramo(tramo, ventana)
    if (!p) return null

    const clases = ['barra-fila__tramo']
    if (hueco) clases.push('barra-fila__tramo--hueco')
    else if (tramo.abierto) clases.push('barra-fila__tramo--abierto')
    if (p.cortaDerecha) clases.push('barra-fila__tramo--corta-derecha')
    if (p.cortaIzquierda) clases.push('barra-fila__tramo--corta-izquierda')

    return el('i', {
      class: clases.join(' '),
      style: `left:${redondo(p.izquierda)}%;width:${redondo(p.ancho)}%`,
    })
  })

  return el('span', { class: 'barra-fila__eje', 'aria-hidden': 'true' }, [franjas, tramos])
}

/**
 * La línea de debajo: el rango a la izquierda y la duración a la derecha.
 *
 * ES LA FUENTE DE VERDAD, no la barra. Por eso la jerarquía va al revés de como
 * estaba: lo que se consulta es el rango horario, no el total.
 */
function pieDeFila(resumen, fila, hueco) {
  const rango = rangoDeTramos(resumen.tramos)

  const derecha = fila.accion
    ? (fila.accion.alPulsar
      ? el('button', {
        type: 'button',
        class: 'barra-fila__total barra-fila__accion',
        onclick: fila.accion.alPulsar,
        'aria-label': `${fila.accion.texto}: ${etiquetaDeFila(fila.nombre, resumen)}`,
        text: fila.accion.texto,
      })
      : el('span', { class: 'barra-fila__total num', text: fila.accion.texto }))
    : el('span', { class: 'barra-fila__total num', text: enHoras(resumen.minutos) })

  return el('span', { class: 'barra-fila__pie' }, [
    el('span', { class: 'barra-fila__horas num' }, [
      rango || '—',
      // El «+1 día» va detrás de la hora de salida y en gris pequeño: la
      // duración ya cuenta las horas enteras, esto solo dice de qué día es esa
      // hora para que «16:00–00:30» no se lea como un turno de media hora.
      resumen.cruza && !hueco
        ? el('span', { class: 'barra-fila__dia-mas', text: ' +1 día' })
        : null,
    ]),
    derecha,
  ])
}

/**
 * Las marcas de hora, repartidas por la ventana. Cinco: los dos extremos y tres
 * dentro. Con la ventana por defecto salen 0, 6, 12, 18 y 24, que es lo que
 * dibuja la maqueta; con cualquier otra salen las equivalentes.
 */
function regletaDeHoras({ inicioEje, finEje }) {
  const marcas = []
  for (let i = 0; i <= 4; i++) {
    const hora = inicioEje + ((finEje - inicioEje) * i) / 4
    marcas.push(el('span', { text: textoDeMarca(hora) }))
  }
  return el('div', { class: 'barra-dia__regleta', 'aria-hidden': 'true' }, [
    el('div', { class: 'barra-dia__hueco-nombre' }),
    el('div', { class: 'barra-dia__marcas num' }, marcas),
  ])
}

/** 6 -> "6"; 24 -> "24"; 8,5 -> "08:30". Las horas justas se dicen en corto. */
function textoDeMarca(hora) {
  if (Number.isInteger(hora)) return String(hora)
  return aHora(Math.round(hora * 60))
}

/** Dónde cae una línea de cambio de franja. null si queda fuera de la ventana. */
function colocarFranja(minutos, { inicioEje, finEje }) {
  const a = inicioEje * 60
  const b = finEje * 60
  if (minutos <= a || minutos >= b) return null
  return ((minutos - a) / (b - a)) * 100
}

/** Acepta 960 o '16:00'. Lo demás no es una franja. */
function enMinutos(valor) {
  if (Number.isFinite(valor)) return valor
  return aMinutos(valor)
}

/** Una ventana al revés o de ancho cero no se pinta: se vuelve al día entero. */
function ventanaValida(inicioEje, finEje) {
  return finEje > inicioEje ? { inicioEje, finEje } : EJE_POR_DEFECTO
}

/** Dos decimales bastan y evitan estilos de cuarenta caracteres. */
function redondo(n) {
  return Math.round(n * 100) / 100
}

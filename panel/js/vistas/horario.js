/**
 * Horario del bar y cierres puntuales
 * ---------------------------------------------------------------------------
 * DE AQUÍ SALE TODO LO QUE LA WEB DICE SOBRE CUÁNDO ABRE EL BAR: la pastilla de
 * «Abierto / Cerrado» de la portada, el bloque de horario de debajo y la
 * comprobación de que una reserva cae dentro de las horas de apertura.
 *
 * POR QUÉ ESTA PANTALLA EXISTE. El horario vivía en un campo de texto libre que
 * decía «Todos los días de 08:00 a 02:00», y era falso: el bar cierra a las
 * 00:00. Con el horario en una frase nadie podía darse cuenta. Ahora son siete
 * tramos con hora de apertura y de cierre, y la frase de la portada se genera
 * sola desde ellos.
 *
 * CERRAR A LAS 00:00 ES MEDIANOCHE, no «no abre». Si la hora de cierre no es
 * mayor que la de apertura, el tramo cruza la medianoche —08:00 a 00:00 son
 * dieciséis horas—. El día que el bar no abra se apaga con el interruptor.
 *
 * EL CIERRE PUNTUAL es para un festivo o unas vacaciones: pisa el horario
 * semanal en ese rango de días y la portada enseña el motivo. Se pone y se
 * quita desde el móvil, que es donde está Santi cuando decide cerrar.
 *
 * Solo el dueño: lo impone la regla de la colección `ajustes`.
 */

import { el, pintar } from '../dom.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { guardarAjustes } from '../datos.js'
import { aFechaPB, diaDe } from '../fechas.js'
import { textoDelHorario, estadoDeApertura } from '/compartido/js/horario.js'

// Lunes primero, que es como se lee una semana. El número es el de
// Date.getDay(), que es como se guarda: 0 domingo.
const SEMANA = [
  [1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'],
  [5, 'Viernes'], [6, 'Sábado'], [0, 'Domingo'],
]

const POR_DEFECTO = { abre: '08:00', cierra: '00:00' }

export function hojaHorario(estado, alGuardar) {
  const a = estado.ajustes
  if (!a) return

  // Copia de trabajo: nada se guarda hasta que se pulsa el botón.
  const local = normalizar(a.horario_semanal)
  const cierre = {
    desde: diaDe(a.cierre_desde) || '',
    hasta: diaDe(a.cierre_hasta) || '',
    motivo: a.cierre_motivo || '',
  }

  const filas = el('div', { class: 'filas' })
  const resumen = el('p', { class: 'parrafo parrafo--apagado' })

  function pintarDias() {
    pintar(filas, SEMANA.map(([dia, nombre]) => filaDia(dia, nombre, local, pintarDias, refrescarResumen)))
    refrescarResumen()
  }

  function refrescarResumen() {
    resumen.textContent = textoDelHorario(local).replace(/\n/g, ' · ') || 'El bar no abre ningún día.'
  }

  const desde = fecha('ho-desde', cierre.desde)
  const hasta = fecha('ho-hasta', cierre.hasta)
  const motivo = el('input', {
    class: 'entrada', id: 'ho-motivo', type: 'text', maxlength: '120',
    autocapitalize: 'sentences', enterkeyhint: 'done',
    placeholder: 'Cerrado por vacaciones',
  })
  motivo.value = cierre.motivo

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Guardar' })

  boton.addEventListener('click', async () => {
    // Un cierre puntual sin motivo deja a la portada diciendo «Cerrado» y nada
    // más, y quien lo lee se queda sin saber si es un festivo o una avería.
    if (desde.value && !motivo.value.trim()) {
      return falla('Pon el motivo del cierre. Es lo que se lee en la web.', motivo)
    }
    if (desde.value && hasta.value && hasta.value < desde.value) {
      return falla('El último día del cierre va después del primero.', hasta)
    }

    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      estado.ajustes = await guardarAjustes(a.id, {
        horario_semanal: local,
        cierre_desde: desde.value ? aFechaPB(desde.value) : '',
        // Sin último día, el cierre dura solo el primero.
        cierre_hasta: desde.value ? aFechaPB(hasta.value || desde.value) : '',
        cierre_motivo: desde.value ? motivo.value.trim() : '',
      })
      cerrarHoja()
      if (alGuardar) alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Guardar'
      falla(err?.status === 403
        ? 'Solo el dueño puede cambiar el horario.'
        : 'No se ha podido guardar el horario.')
      console.warn('[quijote] horario:', err)
    }
  })

  function falla(texto, donde) {
    error.textContent = texto
    error.hidden = false
    if (donde) donde.focus()
  }

  pintarDias()

  abrirHoja({
    titulo: 'Horario del bar',
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'De aquí sale lo que la web dice sobre cuándo abre el bar.' }),
      filas,
      resumen,
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Cerrar a las 00:00 es a medianoche. Para que un día no abra, apágalo.' }),

      el('h3', { class: 'rotulo-seccion', text: 'Cierre puntual' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Un festivo o unas vacaciones. Pisa el horario de arriba esos días y la '
        + 'web enseña el motivo. Déjalo en blanco si no hay ninguno.' }),
      el('div', { class: 'campos-dos' }, [
        campo('Desde', 'ho-desde', desde),
        campo('Hasta', 'ho-hasta', hasta),
      ]),
      campo('Motivo', 'ho-motivo', motivo),

      error,
    ],
    acciones: [boton],
  })
}

// ---------------------------------------------------------------------------

/** Una fila de la semana: el interruptor de abrir, y las dos horas. */
function filaDia(dia, nombre, local, repintar, alCambiar) {
  const abierto = !!local[dia]

  const casilla = el('input', {
    type: 'checkbox', class: 'interruptor__casilla', id: `ho-abre-${dia}`, checked: abierto,
  })
  casilla.addEventListener('change', () => {
    local[dia] = casilla.checked ? { ...POR_DEFECTO } : null
    repintar()
  })

  const hora = (cual) => {
    const n = el('input', {
      class: 'entrada', type: 'time', step: '900',
      'aria-label': `${nombre}, ${cual === 'abre' ? 'abre' : 'cierra'} a las`,
    })
    n.value = local[dia]?.[cual] || ''
    n.addEventListener('change', () => {
      if (local[dia] && n.value) { local[dia][cual] = n.value; alCambiar() }
    })
    return n
  }

  return el('div', { class: 'dia-horario' }, [
    el('label', { class: 'interruptor interruptor--suelto', for: `ho-abre-${dia}` }, [
      casilla,
      el('span', { class: 'interruptor__palanca', 'aria-hidden': 'true' }),
      el('span', { class: 'interruptor__nombre', text: nombre }),
    ]),
    abierto
      ? el('div', { class: 'dia-horario__horas' }, [hora('abre'), el('span', { text: 'a' }), hora('cierra')])
      : el('span', { class: 'dia-horario__cerrado', text: 'No abre' }),
  ])
}

function fecha(id, valor) {
  const n = el('input', { class: 'entrada', id, type: 'date' })
  n.value = valor
  return n
}

function campo(rotulo, para, control) {
  return el('label', { class: 'campo', for: para }, [
    el('span', { class: 'campo__rotulo', text: rotulo }),
    control,
  ])
}

/** Siete entradas siempre, vengan como vengan de la base. */
function normalizar(semanal) {
  let s = semanal
  if (typeof s === 'string') { try { s = JSON.parse(s) } catch { s = null } }
  const lista = Array.isArray(s) ? s : []
  return Array.from({ length: 7 }, (_, i) => (lista[i] ? { ...lista[i] } : null))
}

/**
 * El resumen de una línea para «Más»: dice el horario y, si hay un cierre
 * puntual en marcha o por llegar, lo canta.
 */
export function resumenDeHorario(ajustes) {
  const texto = textoDelHorario(ajustes?.horario_semanal).replace(/\n/g, ' · ')
  if (!texto) return 'Sin configurar. La web no dice si el bar está abierto.'
  const estado = estadoDeApertura(ajustes)
  return estado.motivo ? `${texto}. Ahora: ${estado.motivo}.` : texto
}

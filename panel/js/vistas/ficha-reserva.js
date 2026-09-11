/**
 * Ficha de una reserva
 * ---------------------------------------------------------------------------
 * Se abre tocando una linea, en "Hoy" o en "Reservas". Contiene lo que hace
 * falta cuando esa gente esta en la puerta: quienes son, cuantos, donde querian
 * sentarse, que pidieron y un boton para llamarles.
 *
 * El estado se cambia con las pastillas de arriba y se guarda al momento, sin
 * boton de "guardar": es un gesto que se hace de pie, con una mano y con gente
 * esperando. Cancelar SI pide confirmacion, porque es lo unico que no se
 * deshace de un toque.
 */

import { el, pintar } from '../dom.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { ESTADOS, textoZona, textoMotivo } from '../piezas/reserva.js'
import { diaDe, diaLargo, conMayuscula, diaRelativo } from '../fechas.js'
import { cambiarEstado } from '../datos.js'

// El orden de la vida real de una mesa. "Cancelada" no esta aqui: se hace con
// el boton de abajo, que pide confirmacion.
const CAMBIABLES = ['pendiente', 'confirmada', 'sentada', 'no_vino']

/**
 * fichaReserva(reserva, recargar)
 *   recargar  se llama despues de cada cambio guardado, para que la lista de
 *             detras se entere.
 */
export function fichaReserva(reserva, recargar) {
  let actual = reserva.estado

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const eleccion = el('div', { class: 'eleccion' })

  function pintarEleccion() {
    pintar(eleccion, CAMBIABLES.map((clave) => el('button', {
      type: 'button',
      class: `eleccion__opcion${actual === clave ? ' eleccion__opcion--puesta' : ''}`,
      'aria-pressed': String(actual === clave),
      text: ESTADOS[clave].texto,
      onclick: () => guardar(clave),
    })))
  }

  async function guardar(nuevo) {
    if (nuevo === actual) return
    const previo = actual
    actual = nuevo
    pintarEleccion()
    error.hidden = true
    try {
      await cambiarEstado(reserva.id, nuevo)
      reserva.estado = nuevo
      if (recargar) recargar()
    } catch (err) {
      // Se vuelve a lo que habia: la pantalla no puede decir "sentada" si el
      // servidor no lo ha guardado.
      actual = previo
      pintarEleccion()
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede cambiar reservas.'
        : 'No hemos podido guardar el cambio. Inténtalo otra vez.'
      error.hidden = false
    }
  }

  pintarEleccion()

  const dia = diaDe(reserva.fecha)
  const telefono = reserva.telefono || ''

  abrirHoja({
    titulo: reserva.nombre,
    cuerpo: [
      el('p', { class: 'ficha__cuando', text:
        `${reserva.hora} · ${conMayuscula(diaLargo(dia))}` }),

      el('dl', { class: 'ficha__datos' }, [
        dato('Mesa', [reserva.comensales === 1 ? '1 persona' : `${reserva.comensales} personas`,
          textoZona(reserva.zona) || 'sin zona asignada'].join(' · ')),
        textoMotivo(reserva.motivo) ? dato('Motivo', textoMotivo(reserva.motivo)) : null,
        (reserva.notas || '').trim() ? dato('Nota', reserva.notas.trim()) : null,
        dato('Teléfono', telefono
          ? el('a', { class: 'ficha__telefono', href: `tel:${telefono}`, text: conEspacios(telefono) })
          : '—'),
        dato('Código', reserva.codigo || '—'),
        dato('Entró', reserva.origen === 'telefono' ? 'por teléfono' : 'por la web'),
      ].filter(Boolean)),

      el('h3', { class: 'ficha__rotulo', text: 'Estado' }),
      eleccion,
      reserva.estado === 'cancelada'
        ? el('p', { class: 'parrafo parrafo--apagado', text:
          'Esta reserva está cancelada. Si la eligen otra vez, ponle el estado que toque.' })
        : null,
      error,
    ],
    acciones: [
      telefono
        ? el('a', { class: 'btn btn--linea', href: `tel:${telefono}`, text: 'Llamar' })
        : null,
      reserva.estado === 'cancelada'
        ? null
        : el('button', { type: 'button', class: 'btn btn--discreto',
          text: 'Cancelar la reserva', onclick: () => confirmarCancelacion(reserva, recargar) }),
    ].filter(Boolean),
  })
}

function dato(clave, valor) {
  return el('div', { class: 'ficha__dato' }, [
    el('dt', { text: clave }),
    el('dd', {}, typeof valor === 'string' ? [valor] : [valor]),
  ])
}

/** 600111222 -> "600 11 12 22" */
function conEspacios(telefono) {
  const d = String(telefono).replace(/\D/g, '')
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : telefono
}

/**
 * Cancelar es lo unico que no se deshace de un toque, asi que se pregunta.
 * Y se dice lo que va a pasar de verdad: la mesa se libera para otros.
 */
function confirmarCancelacion(reserva, recargar) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, cancelar' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Cancelando…'
    try {
      await cambiarEstado(reserva.id, 'cancelada')
      reserva.estado = 'cancelada'
      if (recargar) recargar()
      cerrarHoja()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, cancelar'
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede cancelar reservas.'
        : 'No hemos podido cancelar. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: '¿Cancelar la reserva?',
    cuerpo: [
      el('p', { class: 'parrafo', text:
        `${reserva.nombre}, ${reserva.comensales === 1 ? '1 persona' : `${reserva.comensales} personas`}, `
        + `${diaRelativo(diaDe(reserva.fecha))} a las ${reserva.hora}.` }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'La mesa queda libre para otra reserva. Al cliente no se le avisa: '
        + 'si no lo sabe, hay que llamarle.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarla', onclick: cerrarHoja }),
    ],
  })
}

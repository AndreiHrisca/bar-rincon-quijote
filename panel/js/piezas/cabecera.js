/**
 * Cabecera granate con titulo y botones
 * ---------------------------------------------------------------------------
 * La banda de la maqueta: titulo a la izquierda y hasta dos botones cuadrados a
 * la derecha. Los botones son <button>, no <div> con un simbolo dentro: tienen
 * que poder pulsarse con el teclado y anunciarse con lector de pantalla, y por
 * eso cada uno lleva su texto accesible aunque en pantalla solo se vea el
 * simbolo.
 */

import { el } from '../dom.js'
import { icono } from '/compartido/js/iconos.js'

/**
 *   cabecera('Reservas', [
 *     { icono: 'buscar', titulo: 'Buscar una reserva', alPulsar: ..., activo: false },
 *   ])
 *
 * El tercer argumento pone un boton de volver a la IZQUIERDA del titulo, como
 * en la pantalla de editar plato de la maqueta:
 *   cabecera('Editar plato', [], { volver: { titulo: '...', alPulsar: ... } })
 */
export function cabecera(titulo, botones = [], { volver = null } = {}) {
  return el('header', { class: 'cabecera' }, [
    volver ? el('button', {
      type: 'button',
      class: 'cabecera__boton toque-min',
      'aria-label': volver.titulo,
      onclick: volver.alPulsar,
      // El chevron mira a la izquierda: es el mismo dibujo girado, no otro icono.
    }, [icono('chevron', { clase: 'ic ic--atras' })]) : null,
    el('h1', { class: 'cabecera__titulo', text: titulo }),
    ...botones.filter(Boolean).map((b) => el('button', {
      type: 'button',
      class: `cabecera__boton${b.activo ? ' cabecera__boton--claro' : ''} toque-min`,
      'aria-label': b.titulo,
      'aria-pressed': b.activo === undefined ? null : String(!!b.activo),
      onclick: b.alPulsar,
    }, [icono(b.icono, { clase: b.clase || 'ic' })])),
  ])
}

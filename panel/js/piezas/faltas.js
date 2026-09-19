/**
 * Faltas apuntadas
 * ---------------------------------------------------------------------------
 * La tarjeta de avisos de stock sin resolver. Sale en dos sitios y por eso vive
 * aqui: en «Hoy», que es lo primero que se mira por la manana, y en «Almacen»,
 * que es donde se va cuando toca reponer.
 *
 * DOS COSAS QUE NO SON DECORACION:
 *
 *   - CADA LINEA DICE DESDE CUANDO. Igual que con los platos apagados: lo que
 *     preocupa no es que hoy falte harina, es que lleve cuatro dias apuntada y
 *     nadie la haya traido. Un aviso se arrastra de un dia a otro hasta que
 *     alguien lo resuelve; ese es justo el problema del papel que esto viene a
 *     arreglar.
 *
 *   - RESOLVER ES UN TOQUE, y lo puede dar cualquiera del equipo. Si alguien
 *     baja al sotano y sube la harina, la marca quien pasa por ahi, no hay que
 *     buscar a un administrador.
 *
 * Quien apunto el aviso se ensena, pero NO se cuenta ni se ordena por persona
 * (seccion 12: nada de rankings). Esta para poder preguntar «oye, esto que
 * apuntaste, ¿era de la camara o del sotano?».
 */

import { el } from '../dom.js'
import { icono } from '/compartido/js/iconos.js'
import { diaDeInstante, diaRelativo } from '../fechas.js'

export const NIVEL = {
  agotado:    { texto: 'Agotado',    pastilla: 'pastilla--no-vino' },
  queda_poco: { texto: 'Queda poco', pastilla: 'pastilla--pendiente' },
}

/**
 * tarjetaFaltas(avisos, { alResolver, alApuntar, vacio })
 *   alResolver(aviso)  promesa. Si falla, la linea vuelve a su sitio.
 *   alApuntar          si se pasa, sale el boton de apuntar una falta nueva.
 *   vacio              texto cuando no hay ninguna.
 */
export function tarjetaFaltas(avisos, { alResolver = null, alApuntar = null, vacio = null } = {}) {
  return el('section', { class: 'tarjeta' }, [
    el('div', { class: 'tarjeta__cabeza' }, [
      el('h2', { class: 'tarjeta__titulo', text: 'Faltas apuntadas' }),
      avisos.length
        ? el('span', { class: 'tarjeta__cuenta', text: String(avisos.length) })
        : null,
    ]),

    avisos.length
      ? el('div', { class: 'filas' }, avisos.map((a) => filaFalta(a, alResolver)))
      : el('p', { class: 'vacio', text: vacio || 'No hay nada apuntado. El almacén está al día.' }),

    alApuntar
      ? el('div', { class: 'tarjeta__pie' }, [
        el('button', {
          type: 'button', class: 'btn btn--linea', text: 'Apuntar una falta',
          onclick: alApuntar,
        }),
      ])
      : null,
  ])
}

function filaFalta(aviso, alResolver) {
  const nivel = NIVEL[aviso.nivel] || NIVEL.queda_poco
  const nombre = aviso.expand?.producto?.nombre || 'Producto borrado'
  const dia = diaDeInstante(aviso.creado)
  const quien = aviso.expand?.creado_por?.nombre

  const fila = el('div', { class: 'falta' }, [
    el('div', { class: 'falta__cuerpo' }, [
      el('div', { class: 'falta__nombre', text: nombre }),
      el('div', { class: 'falta__pie', text:
        [dia ? `Apuntado ${diaRelativo(dia)}` : null, quien, aviso.nota || null]
          .filter(Boolean).join(' · ') }),
    ]),
    el('span', { class: `pastilla ${nivel.pastilla}`, text: nivel.texto }),
    alResolver ? botonRepuesto(aviso, nombre, alResolver) : null,
  ])

  return fila
}

function botonRepuesto(aviso, nombre, alResolver) {
  const boton = el('button', {
    type: 'button',
    class: 'falta__hecho toque-min',
    'aria-label': `Marcar ${nombre} como repuesto`,
    title: 'Repuesto',
  }, [icono('comprobado', { clase: 'ic' })])

  boton.addEventListener('click', async () => {
    boton.disabled = true
    try {
      await alResolver(aviso)
    } catch (err) {
      boton.disabled = false
    }
  })
  return boton
}

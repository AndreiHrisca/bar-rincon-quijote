/**
 * Barra inferior
 * ---------------------------------------------------------------------------
 * Las cinco entradas de la maqueta, siempre las cinco. Las pantallas que
 * todavia no existen llevan a un aviso que dice en que fase llegan, en vez de
 * desaparecer: quien prueba el panel tiene que ver la forma final desde el
 * primer dia, y un hueco que aparece de una fase a otra desorienta mas que un
 * "esto llega en la fase 7".
 *
 * Los iconos salen del sprite propio (compartido/js/iconos.js) y aqui van a
 * 24 px, que es el unico sitio donde se ven a ese tamano. Antes eran glifos
 * Unicode sueltos —◉ ▤ ◷ ◱ ≡— de pesos distintos entre si, y en iOS algunos se
 * pintaban con presentacion de emoji por su cuenta.
 */

import { el } from '../dom.js'
import { esAdmin } from '../sesion.js'
import { BASE } from '../enrutador.js'
import { icono } from '/compartido/js/iconos.js'

export const ENTRADAS = [
  { ruta: '/',          icono: 'hoy',       texto: 'Hoy' },
  { ruta: '/carta',     icono: 'carta',     texto: 'Carta' },
  { ruta: '/reservas',  icono: 'reservas',  texto: 'Reservas' },
  { ruta: '/personal',  icono: 'personal',  texto: 'Personal' },
  { ruta: '/mas',       icono: 'mas',       texto: 'Más' },
]

export function nav(rutaActiva) {
  return el('nav', { class: 'nav', 'aria-label': 'Secciones del panel' },
    (esAdmin() ? ENTRADAS : [
      { ruta: '/almacen', icono: 'almacen', texto: 'Almacén' },
      { ruta: '/reservas', icono: 'reservas', texto: 'Reservas' },
      { ruta: '/personal/fichajes', icono: 'personal', texto: 'Fichaje' },
      { ruta: '/carta', icono: 'carta', texto: 'Carta' },
      { ruta: '/mas', icono: 'mas', texto: 'Cuenta' },
    ]).map((entrada) => {
      const activa = entrada.ruta === rutaActiva
      return el('a', {
        class: `nav__ir${activa ? ' nav__ir--activa' : ''}`,
        href: entrada.ruta === '/' ? `${BASE}/` : BASE + entrada.ruta,
        'aria-current': activa ? 'page' : null,
      }, [
        // El icono acompana al rotulo, que ya dice lo mismo: decorativo.
        icono(entrada.icono, { clase: 'ic ic--nav' }),
        entrada.texto,
      ])
    }))
}

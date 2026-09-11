/**
 * Hoja: el panel que sube desde abajo
 * ---------------------------------------------------------------------------
 * Es donde se abre una reserva, se apunta una nueva y se tocan los ajustes de
 * reservas. Sube desde el borde inferior porque el panel se usa de pie y con
 * una mano: lo que hay que tocar tiene que quedar donde llega el pulgar, no
 * arriba del todo.
 *
 * Lo que hace falta para que esto no sea una trampa de accesibilidad:
 *   - se cierra con Escape y tocando el velo;
 *   - el foco entra dentro al abrir y NO se escapa mientras esta abierta;
 *   - al cerrar, el foco vuelve a lo que estaba pulsado antes;
 *   - el fondo no se puede desplazar por debajo.
 *
 * Solo hay una hoja abierta a la vez, a proposito: dos hojas apiladas en una
 * pantalla de 390 px no se entienden.
 */

import { el, pintar } from '../dom.js'

let abierta = null

const FOCALIZABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * abrirHoja({ titulo, cuerpo, acciones })
 *   cuerpo   nodo o lista de nodos
 *   acciones lista de nodos (botones) que van pegados abajo
 * Devuelve un objeto con cerrar().
 */
export function abrirHoja({ titulo, cuerpo, acciones = [], alCerrar = null, foco = null }) {
  cerrarHoja()

  const devolverFocoA = document.activeElement

  const caja = el('div', {
    class: 'hoja',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': titulo,
  }, [
    el('div', { class: 'hoja__asa', 'aria-hidden': 'true' }),
    el('h2', { class: 'hoja__titulo', text: titulo }),
    el('div', { class: 'hoja__cuerpo' }, cuerpo),
    acciones.length ? el('div', { class: 'hoja__acciones' }, acciones) : null,
  ])

  const velo = el('div', { class: 'velo', onclick: (e) => { if (e.target === velo) cerrarHoja() } }, [caja])

  function alTeclado(e) {
    if (e.key === 'Escape') { e.preventDefault(); cerrarHoja(); return }
    if (e.key !== 'Tab') return
    const focos = [...caja.querySelectorAll(FOCALIZABLES)].filter((n) => n.offsetParent !== null)
    if (!focos.length) return
    const primero = focos[0]
    const ultimo = focos[focos.length - 1]
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
  }

  document.addEventListener('keydown', alTeclado)
  document.body.classList.add('sin-scroll')
  document.body.append(velo)

  // EL FOCO ENTRA EN LA HOJA, NO EN EL PRIMER CAMPO. Antes se iba al primer
  // input que hubiera, y en el movil eso levanta el teclado nada mas abrir:
  // media pantalla tapada por un teclado que nadie ha pedido, justo encima de
  // lo que se venia a leer. Ahora se enfoca la hoja: el lector de pantalla la
  // anuncia igual, la trampa de tabulacion sigue funcionando y no sale ningun
  // teclado.
  //
  // Quien de verdad quiera el foco en un campo —un alta, donde lo primero es
  // teclear— lo pide con `foco`, y decide con panel/js/foco.js si procede.
  caja.setAttribute('tabindex', '-1')
  caja.focus()
  if (foco) foco.focus()

  abierta = {
    velo,
    caja,
    alTeclado,
    alCerrar,
    devolverFocoA,
    /** Cambia el contenido sin cerrar (por ejemplo, al pasar de ficha a confirmacion). */
    reemplazar(nuevoCuerpo) { pintar(caja.querySelector('.hoja__cuerpo'), nuevoCuerpo) },
    cerrar: cerrarHoja,
  }
  return abierta
}

export function cerrarHoja() {
  if (!abierta) return
  const { velo, alTeclado, alCerrar, devolverFocoA } = abierta
  document.removeEventListener('keydown', alTeclado)
  document.body.classList.remove('sin-scroll')
  velo.remove()
  abierta = null
  // El foco vuelve a lo que se pulso para abrir la hoja. Sin esto, quien navega
  // con teclado se queda al principio del documento cada vez que cierra.
  if (devolverFocoA && document.contains(devolverFocoA)) devolverFocoA.focus()
  if (alCerrar) alCerrar()
}

export function hayHoja() {
  return !!abierta
}

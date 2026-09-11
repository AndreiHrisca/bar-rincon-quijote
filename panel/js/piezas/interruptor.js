/**
 * Interruptor
 * ---------------------------------------------------------------------------
 * El de la maqueta: una palanca que se desliza. Debajo hay una casilla de
 * verificacion de verdad, escondida pero presente, que es la que responde al
 * teclado y la que anuncia el lector de pantalla. Un `div` con clase `on` se ve
 * igual y no se puede usar sin ratón.
 *
 * Es el gesto de cada dia en la carta —quitar un plato que se ha acabado— asi
 * que guarda al momento, sin boton de confirmar, y se pinta el cambio ANTES de
 * que conteste el servidor: si falla, se vuelve atras y se dice por que. En la
 * barra de un bar, esperar dos segundos a que un interruptor reaccione es lo
 * que hace que alguien lo pulse tres veces.
 */

import { el } from '../dom.js'

let siguienteId = 0

/**
 * interruptor({ nombre, pie, puesto, alCambiar, desactivado, soloPalanca })
 *   alCambiar(nuevoValor) -> promesa. Si lanza, el interruptor se vuelve solo.
 *   soloPalanca            en la carta la linea ya dice de que plato se trata,
 *                          asi que el rotulo estorba en pantalla. Se esconde
 *                          A LA VISTA pero NO al lector de pantalla: sin el,
 *                          la palanca se anunciaria como una casilla suelta sin
 *                          decir de que plato es.
 */
export function interruptor({
  nombre, pie = null, puesto = false, alCambiar, desactivado = false, soloPalanca = false,
}) {
  const id = `int-${++siguienteId}`

  const casilla = el('input', {
    type: 'checkbox',
    class: 'interruptor__casilla',
    id,
    checked: puesto,
    disabled: desactivado,
  })

  casilla.addEventListener('change', async () => {
    if (!alCambiar) return
    const valor = casilla.checked
    casilla.disabled = true
    try {
      await alCambiar(valor)
    } catch (err) {
      casilla.checked = !valor
    } finally {
      casilla.disabled = desactivado
    }
  })

  const clases = ['interruptor']
  if (desactivado) clases.push('interruptor--apagado')
  if (soloPalanca) clases.push('interruptor--suelto')

  return el('label', { class: clases.join(' '), for: id }, [
    el('span', { class: soloPalanca ? 'solo-lectura-pantalla' : 'interruptor__cuerpo' }, [
      el('span', { class: soloPalanca ? null : 'interruptor__nombre', text: nombre }),
      pie && !soloPalanca ? el('span', { class: 'interruptor__pie', text: pie }) : null,
    ]),
    casilla,
    el('span', { class: 'interruptor__palanca', 'aria-hidden': 'true' }),
  ])
}

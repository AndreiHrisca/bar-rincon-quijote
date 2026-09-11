/**
 * Reordenar una lista con el asidero ⠿
 * ---------------------------------------------------------------------------
 * El orden de los platos dentro de su categoria es el orden en que salen en la
 * carta publica (`orden` en la coleccion). La maqueta pone un asidero en cada
 * linea para poder cambiarlo.
 *
 * DOS FORMAS DE MOVER, y las dos hacen falta:
 *
 *   - Arrastrando. Con eventos de puntero (`pointerdown`), no con la API de
 *     arrastrar y soltar de HTML5: esa no existe en el movil, que es donde se
 *     va a usar esto. La fila se mueve en el DOM al cruzar la mitad de la
 *     siguiente, sin fantasmas flotando: menos codigo y no se despista.
 *
 *   - Con el teclado. El asidero es un <button>: se le llega tabulando y se
 *     mueve la fila con las flechas arriba y abajo. Sin esto, reordenar la
 *     carta seria imposible sin ratón, y una lista que solo se puede tocar con
 *     el dedo deja fuera a quien no puede hacer ese gesto.
 *
 * Se guarda al SOLTAR, no en cada paso: arrastrar de la primera posicion a la
 * ultima son doce movimientos y no son doce guardados.
 */

import { el } from '../dom.js'
import { icono } from '/compartido/js/iconos.js'

/**
 * hacerReordenable(contenedor, { alSoltar })
 *   contenedor  el elemento cuyos hijos directos son las filas
 *   alSoltar(idsEnOrden)  se llama al terminar el gesto, solo si cambio algo
 */
export function hacerReordenable(contenedor, { alSoltar }) {
  let arrastrando = null
  let ordenAlEmpezar = null

  function ids() {
    return [...contenedor.children].map((f) => f.dataset.id)
  }

  function terminar() {
    if (!arrastrando) return
    arrastrando.classList.remove('fila-plato--moviendo')
    contenedor.classList.remove('filas--reordenando')
    arrastrando = null

    const ahora = ids()
    if (ahora.join() !== ordenAlEmpezar.join()) alSoltar(ahora)
    ordenAlEmpezar = null
  }

  contenedor.addEventListener('pointerdown', (e) => {
    const asidero = e.target.closest('.asidero')
    if (!asidero) return
    const fila = asidero.closest('[data-id]')
    if (!fila || fila.parentElement !== contenedor) return

    e.preventDefault()
    arrastrando = fila
    ordenAlEmpezar = ids()
    fila.classList.add('fila-plato--moviendo')
    contenedor.classList.add('filas--reordenando')
    asidero.setPointerCapture(e.pointerId)
  })

  contenedor.addEventListener('pointermove', (e) => {
    if (!arrastrando) return
    e.preventDefault()

    // Se busca la fila cuya mitad ha cruzado el dedo y se mueve el nodo antes o
    // despues de ella. Nada de calcular desplazamientos: el propio DOM lleva la
    // cuenta del orden.
    for (const fila of contenedor.children) {
      if (fila === arrastrando) continue
      const caja = fila.getBoundingClientRect()
      const mitad = caja.top + caja.height / 2
      if (e.clientY > caja.top && e.clientY < mitad) {
        contenedor.insertBefore(arrastrando, fila)
        return
      }
      if (e.clientY >= mitad && e.clientY < caja.bottom) {
        contenedor.insertBefore(arrastrando, fila.nextSibling)
        return
      }
    }
  })

  contenedor.addEventListener('pointerup', terminar)
  contenedor.addEventListener('pointercancel', terminar)

  contenedor.addEventListener('keydown', (e) => {
    const asidero = e.target.closest('.asidero')
    if (!asidero) return
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return

    const fila = asidero.closest('[data-id]')
    if (!fila) return
    const antes = ids()

    e.preventDefault()
    if (e.key === 'ArrowUp' && fila.previousElementSibling) {
      contenedor.insertBefore(fila, fila.previousElementSibling)
    } else if (e.key === 'ArrowDown' && fila.nextElementSibling) {
      contenedor.insertBefore(fila.nextElementSibling, fila)
    }

    // Mover un nodo en el DOM le quita el foco: hay que devolverselo o cada
    // pulsacion de flecha te echa al principio de la lista.
    asidero.focus()

    const ahora = ids()
    if (ahora.join() !== antes.join()) alSoltar(ahora)
  })
}

/** El asidero, como boton para que se pueda usar con el teclado. */
export function asidero(nombre) {
  return el('button', {
    type: 'button',
    class: 'asidero',
    'aria-label': `Mover ${nombre}. Usa las flechas arriba y abajo para cambiarlo de sitio.`,
  }, [icono('asidero', { clase: 'ic' })])
}

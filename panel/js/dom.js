/**
 * Ayudas minimas de DOM — panel
 * ---------------------------------------------------------------------------
 * Las mismas dos funciones que usa la carta publica (web/js/dom.js). Estan
 * duplicadas A PROPOSITO y no compartidas en /compartido: ese directorio se
 * sirve con cache de 30 dias y nombres de fichero fijos, que esta bien para las
 * tipografias pero es una trampa para el codigo, porque un arreglo tardaria un
 * mes en llegar a los moviles. Son treinta lineas; la copia sale mas barata que
 * el enredo. Ver DECISIONES.md, D-28.
 *
 * Todo el texto que venga de la base pasa por textContent, nunca por innerHTML:
 * es lo que impide que el nombre de un cliente inyecte marcado en el panel.
 */

/**
 * Crea un elemento.
 *   el('div', { class: 'tarjeta' }, [hijo1, hijo2])
 *   el('span', { text: 'Familia Ortega' })
 *
 * Las cadenas dentro de "hijos" se insertan como TEXTO, nunca como HTML.
 */
export function el(etiqueta, atributos = {}, hijos = []) {
  const nodo = document.createElement(etiqueta)

  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue
    if (clave === 'text') nodo.textContent = valor
    else if (clave === 'class') nodo.className = valor
    else if (clave.startsWith('on') && typeof valor === 'function') {
      nodo.addEventListener(clave.slice(2).toLowerCase(), valor)
    } else nodo.setAttribute(clave, valor === true ? '' : valor)
  }

  // .flat() para poder pasar listas dentro de listas: una vista que devuelve
  // varios nodos se mete tal cual entre los hijos de otro elemento. Sin esto el
  // array anidado acaba en el DOM como "[object HTMLDivElement]".
  for (const hijo of [].concat(hijos).flat(Infinity)) {
    if (hijo === null || hijo === undefined || hijo === false) continue
    nodo.append(typeof hijo === 'string' ? document.createTextNode(hijo) : hijo)
  }
  return nodo
}

/** Vacia un contenedor y le mete lo nuevo. */
export function pintar(contenedor, ...contenido) {
  contenedor.replaceChildren(...contenido.flat().filter(Boolean))
}

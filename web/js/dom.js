/**
 * Ayudas minimas de DOM
 * ---------------------------------------------------------------------------
 * Cuatro funciones para no repetir createElement por todas partes, y para que
 * TODO el texto que venga de la base pase por textContent y no por innerHTML.
 * Es lo que garantiza que el nombre de un plato no pueda inyectar marcado.
 */

/**
 * Crea un elemento.
 *   el('div', { class: 'plato' }, [hijo1, hijo2])
 *   el('span', { text: 'Huevos rotos' })
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

/** El logo, como SVG en linea. Hereda el color del contenedor. */
export function logo(clase = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 200 150')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Don Quijote y Sancho')
  if (clase) svg.setAttribute('class', clase)
  // MARCADOR DE POSICION: redibujado a ojo desde una foto del menu impreso.
  // Hay que sustituirlo por el original vectorizado antes de publicar.
  svg.innerHTML = `
    <g fill="currentColor">
      <circle cx="36" cy="24" r="7"/>
      <circle cx="36" cy="8" r="1.8"/><circle cx="49" cy="13" r="1.8"/><circle cx="53" cy="26" r="1.8"/>
      <circle cx="47" cy="38" r="1.8"/><circle cx="24" cy="37" r="1.8"/><circle cx="19" cy="24" r="1.8"/><circle cx="23" cy="12" r="1.8"/>
      <ellipse cx="56" cy="112" rx="16" ry="8"/>
      <path d="M70 110 L78 98 L82 98 L84 92 L86.5 97 L83 102 L78 104 L74 110 Z"/>
      <path d="M42 108 L36 102 L39 111 L36 118 Z"/>
      <rect x="46" y="118" width="4" height="15" rx="1.6"/><rect x="54" y="118" width="4" height="15" rx="1.6"/>
      <rect x="62" y="118" width="4" height="15" rx="1.6"/>
      <ellipse cx="58" cy="98" rx="6" ry="8"/><circle cx="58" cy="87" r="4.4"/>
      <ellipse cx="112" cy="100" rx="25" ry="11"/>
      <path d="M133 96 L142 74 L147 73 L151 64 L155 69 L151 78 L146 81 L139 97 Z"/>
      <path d="M88 96 L76 84 L81 98 L76 112 Z"/>
      <rect x="92" y="108" width="5" height="26" rx="2"/><rect x="102" y="108" width="5" height="26" rx="2"/>
      <rect x="120" y="108" width="5" height="26" rx="2"/><rect x="129" y="108" width="5" height="26" rx="2"/>
      <ellipse cx="112" cy="80" rx="7.5" ry="11"/>
      <circle cx="112" cy="65" r="5.4"/>
      <path d="M105.5 62.5 h13 l-2.5 -4 h-8 z"/>
      <path d="M96 116 L152 38 L155 41 L99 118 Z"/>
    </g>
    <path d="M18 136 H182" stroke="currentColor" stroke-width="1.4" opacity=".55"/>
    <g stroke="currentColor" stroke-width="1.3" opacity=".55" fill="none">
      <path d="M30 136 v-6 M34 136 v-8 M38 136 v-5"/>
      <path d="M164 136 v-6 M168 136 v-9 M172 136 v-5"/>
    </g>`
  return svg
}

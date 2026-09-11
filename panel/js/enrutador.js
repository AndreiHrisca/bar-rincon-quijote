/**
 * Enrutador del panel
 * ---------------------------------------------------------------------------
 * El mismo enrutador de la carta publica, con una diferencia: el panel NO
 * cuelga de la raiz del dominio, sino de /panel. Caddy sirve /panel/* desde
 * panel/ y devuelve index.html para cualquier ruta que no sea un fichero
 * (deploy/Caddyfile), asi que aqui hay que quitar y volver a poner ese prefijo.
 *
 * Sin esto pasan las dos cosas de siempre: los enlaces internos apuntan a
 * /reservas y se van a la carta publica, o la ruta que se compara incluye
 * "/panel" y no casa con ningun patron.
 */

export const BASE = '/panel'

const rutas = new Map()
let alCambiar = null

export function registrar(patron, vista) {
  rutas.set(patron, vista)
}

/** "/panel/reservas" -> "/reservas". La raiz del panel es "/". */
export function rutaActual() {
  let ruta = location.pathname
  if (ruta === BASE || ruta === `${BASE}/`) return '/'
  if (ruta.startsWith(`${BASE}/`)) ruta = ruta.slice(BASE.length)
  return ruta.replace(/\/+$/, '') || '/'
}

/** Navega sin recargar. Se le pasa la ruta interna: ir('/reservas'). */
export function ir(ruta, { reemplazar = false } = {}) {
  const destino = ruta === '/' ? `${BASE}/` : BASE + ruta
  if (reemplazar) history.replaceState({}, '', destino)
  else history.pushState({}, '', destino)
  resolver({ arriba: true })
}

export function resolver({ arriba = false } = {}) {
  const ruta = rutaActual()
  const vista = rutas.get(ruta) || rutas.get('*')
  if (vista) vista(ruta)
  if (alCambiar) alCambiar(ruta)

  // Al cambiar de pantalla el scroll vuelve arriba; al volver con el boton de
  // atras, no, que ahi el navegador restaura la posicion y es lo que se espera.
  if (arriba) window.scrollTo(0, 0)
}

export function arrancar(alCambiarRuta) {
  alCambiar = alCambiarRuta
  window.addEventListener('popstate', () => resolver())

  // Delegacion en el documento para que valga tambien para lo que se pinte
  // despues. Los enlaces del panel se escriben con el prefijo puesto
  // (href="/panel/reservas"), que es lo que hay que poner para que funcionen
  // tambien con el boton derecho o al abrir en otra pestana.
  document.addEventListener('click', (e) => {
    const enlace = e.target.closest(`a[href^="${BASE}"]`)
    if (!enlace) return
    if (enlace.target === '_blank' || enlace.hasAttribute('download')) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    const destino = enlace.getAttribute('href')
    ir(destino === BASE ? '/' : destino.slice(BASE.length))
  })

  resolver()
}

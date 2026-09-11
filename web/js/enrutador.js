/**
 * Enrutador
 * ---------------------------------------------------------------------------
 * Una sola pagina, sin recargas. El QR de las mesas apunta a la raiz del
 * dominio, asi que "/" tiene que ser la portada siempre.
 *
 * Se usa la History API y no hashes: las URLs quedan limpias
 * (barrinconquijote.es/carta) y Caddy ya devuelve el index.html para cualquier
 * ruta que no sea un fichero.
 */

const rutas = new Map()
let alCambiar = null

export function registrar(patron, vista) {
  rutas.set(patron, vista)
}

/** Navega sin recargar. */
export function ir(ruta, { reemplazar = false } = {}) {
  if (reemplazar) history.replaceState({}, '', ruta)
  else history.pushState({}, '', ruta)
  resolver({ arriba: true })
}

export function rutaActual() {
  return location.pathname.replace(/\/+$/, '') || '/'
}

function resolver({ arriba = false } = {}) {
  const ruta = rutaActual()
  const vista = rutas.get(ruta) || rutas.get('*')
  if (vista) vista(ruta)
  if (alCambiar) alCambiar(ruta)

  // Al cambiar de pantalla, el scroll vuelve arriba.
  //
  // Sin esto pasa lo que parece un fallo de maquetacion y no lo es: se rellena
  // el formulario de reserva (que es largo), se envia, y la confirmacion se
  // pinta con la pagina desplazada donde estaba el formulario. El cliente ve la
  // pantalla por la mitad y el sello de "Mesa reservada" queda fuera.
  //
  // Solo al navegar, no al volver con el boton de atras del navegador: ahi el
  // navegador restaura la posicion por su cuenta, que es lo que se espera.
  if (arriba) window.scrollTo(0, 0)
}

export function arrancar(alCambiarRuta) {
  alCambiar = alCambiarRuta
  // Al volver con el boton de atras se deja que el navegador restaure la
  // posicion del scroll.
  window.addEventListener('popstate', () => resolver())

  // Cualquier enlace interno se resuelve sin recargar. Se hace con delegacion
  // en el documento para que valga tambien para lo que se pinte despues.
  document.addEventListener('click', (e) => {
    const enlace = e.target.closest('a[href^="/"]')
    if (!enlace) return
    if (enlace.target === '_blank' || enlace.hasAttribute('download')) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    ir(enlace.getAttribute('href'))
  })

  resolver()
}

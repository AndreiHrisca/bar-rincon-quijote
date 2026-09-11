/**
 * Acceso a la API — carta publica
 * ---------------------------------------------------------------------------
 * Cliente minimo contra PocketBase para las TRES colecciones publicas que
 * necesita la carta: categorias, platos y ajustes.
 *
 * Por que no se usa aqui el SDK de PocketBase: en esta aplicacion solo hacen
 * falta tres peticiones GET sin autenticacion. El SDK son ~35 KB para eso, y el
 * presupuesto de primera carga es de 150 KB con las tipografias dentro. En el
 * panel si se usa, porque alli aporta sesion, tiempo real y subida de ficheros.
 * Ver DECISIONES.md, D-16.
 *
 * La carta se guarda en el movil despues de cada carga buena. Si la red se cae
 * a mitad, se sigue pudiendo consultar (seccion 6 del encargo).
 */

const RAIZ = '/api/collections'
const CLAVE_CACHE = 'quijote.carta.v1'

/** Peticion GET con tiempo maximo. Sin timeout, en 3G lenta se queda colgada. */
async function traer(ruta, { segundos = 12 } = {}) {
  const aborta = new AbortController()
  const reloj = setTimeout(() => aborta.abort(), segundos * 1000)
  try {
    const r = await fetch(ruta, { signal: aborta.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`${r.status} en ${ruta}`)
    return await r.json()
  } finally {
    clearTimeout(reloj)
  }
}

/**
 * Descarga la carta entera: categorias visibles y platos visibles.
 *
 * Se piden en DOS peticiones y se cruzan en el cliente, no con un expand por
 * plato: son dos listas cortas y asi el filtrado por categoria, el buscador y
 * el idioma se resuelven sin volver al servidor (seccion 6).
 *
 * Los platos ocultos NO llegan siquiera: lo impide la regla de acceso de la
 * coleccion, no un filtro del cliente.
 */
// Los campos que de verdad pinta la carta, y ni uno mas.
//
// NO ES UNA MICRO-OPTIMIZACION. Con la carta real del bar —278 platos— pedir el
// registro entero son 123 KB de JSON; pidiendo solo esto son 57 KB, la mitad,
// y lo que sobraba (visible, oculto_desde, destacado, productos, created,
// updated) no lo lee nadie aqui: es del panel. Con un presupuesto de primera
// carga de 150 KB (D-20), 60 KB de mas no son un detalle.
const CAMPOS_PLATO = 'id,collectionId,categoria,nombre,nombre_en,descripcion,'
  + 'descripcion_en,precio_barra,precio_terraza,alergenos,foto,admite_extras'
const CAMPOS_CATEGORIA = 'id,nombre,nombre_en,slug,orden'

export async function cargarCarta() {
  const [categorias, platos] = await Promise.all([
    traer(`${RAIZ}/categorias/records?perPage=200&sort=orden,nombre&fields=${CAMPOS_CATEGORIA}`),
    traer(`${RAIZ}/platos/records?perPage=500&sort=orden,nombre&fields=${CAMPOS_PLATO}`),
  ])

  const carta = {
    categorias: categorias.items,
    platos: platos.items,
    momento: Date.now(),
  }
  guardarEnCache(carta)
  return carta
}

export async function cargarAjustes() {
  const r = await traer(`${RAIZ}/ajustes/records?perPage=1`)
  return r.items[0] || null
}

/** URL de una foto de plato, en la miniatura que toque. */
export function urlFoto(plato, miniatura = '400x0') {
  if (!plato.foto) return null
  return `/api/files/${plato.collectionId}/${plato.id}/${plato.foto}?thumb=${miniatura}`
}

// --- Eventos ---------------------------------------------------------------

/**
 * Lo que se cuece: celebraciones, el menu navideno y lo que el bar organice.
 *
 * NO va en la primera carga. Se pide solo cuando alguien entra en /eventos, que
 * es una pantalla a la que se llega a proposito. La portada y la carta no
 * gastan ni un byte en esto.
 *
 * Se piden tambien los de las ultimas seis semanas, no solo los futuros: la
 * maqueta ensena el ultimo evento pasado en gris ("Ya pasó"), y eso le dice a
 * quien llega nuevo que aqui pasan cosas.
 */
export async function cargarEventos() {
  const hace = new Date()
  hace.setDate(hace.getDate() - 42)
  const desde = hace.toISOString().slice(0, 10)

  const campos = 'id,collectionId,titulo,titulo_en,descripcion,descripcion_en,'
    + 'fecha_inicio,fecha_fin,hora,precio,imagen'
  const filtro = encodeURIComponent(`fecha_inicio >= "${desde}" || fecha_fin >= "${desde}"`)

  const r = await traer(`${RAIZ}/eventos/records?perPage=60&sort=fecha_inicio`
    + `&filter=${filtro}&fields=${campos}`)
  return r.items
}

/** URL de la foto de un evento. Misma forma que la de un plato. */
export function urlImagenEvento(evento, miniatura = '400x0') {
  if (!evento.imagen) return null
  return `/api/files/${evento.collectionId}/${evento.id}/${evento.imagen}?thumb=${miniatura}`
}

// --- Reservas --------------------------------------------------------------

/**
 * Lee el error de PocketBase y saca un mensaje en castellano.
 *
 * Los mensajes de las reglas de reserva los escribe el hook y ya vienen listos
 * para ensenar tal cual ("Esa zona ya esta completa a esa hora..."). Si el error
 * es de validacion de campo, se compone uno.
 */
function mensajeDeError(datos, estado) {
  if (datos?.message && !datos.message.startsWith('Failed to')
      && !datos.message.startsWith('Something went wrong')) {
    return datos.message
  }
  const campos = datos?.data ? Object.values(datos.data) : []
  if (campos.length && campos[0]?.message) return campos[0].message
  if (estado === 429) return 'Has hecho varias reservas seguidas. Espera un rato o llamanos.'
  return 'No hemos podido guardar la reserva. Intentalo otra vez.'
}

/**
 * Franjas de un dia con su estado. Las llenas vienen marcadas, NO omitidas: la
 * carta las tacha (seccion 6).
 */
export async function disponibilidad({ fecha, comensales, zona }) {
  const p = new URLSearchParams({ fecha, comensales: String(comensales), zona })
  return traer(`/api/quijote/disponibilidad?${p}`)
}

/**
 * Crea la reserva. Decide el servidor: aqui solo se manda y se traduce el
 * error que devuelva.
 */
export async function crearReserva(datos) {
  const r = await fetch(`${RAIZ}/reservas/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
  const cuerpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(mensajeDeError(cuerpo, r.status))
  return cuerpo
}

/** Cancela con codigo + token. Los dos hacen falta. */
export async function cancelarReserva({ codigo, token }) {
  const r = await fetch('/api/quijote/cancelar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo, token }),
  })
  const cuerpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(cuerpo.error || 'No hemos podido cancelar la reserva.')
  return cuerpo
}

// --- Copia local -----------------------------------------------------------

function guardarEnCache(carta) {
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify(carta))
  } catch (e) {
    // Sin espacio o en modo privado: no es motivo para romper nada.
  }
}

/** Devuelve la ultima carta descargada, o null si no hay ninguna guardada. */
export function cartaGuardada() {
  try {
    const bruto = localStorage.getItem(CLAVE_CACHE)
    return bruto ? JSON.parse(bruto) : null
  } catch (e) {
    return null
  }
}

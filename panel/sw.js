/**
 * Service worker del panel — El Rincón del Quijote
 * ===========================================================================
 * Lo que la sección 7 del encargo pide de la PWA: instalable, con icono propio,
 * y que **sin conexión enseñe al menos las reservas del día y el recuento en
 * curso**.
 *
 * TRES ESTRATEGIAS, Y CADA UNA DONDE TOCA:
 *
 *  1. LA APLICACIÓN (HTML, CSS, JavaScript) → primero la red, la copia como
 *     respaldo. NO al revés, y es deliberado: este proyecto se despliega
 *     editando ficheros —no hay compilación ni versiones en los nombres— así
 *     que servir primero la copia dejaría a Santi con el panel de la semana
 *     pasada sin que nadie se enterase. Con red, siempre lo último; sin red,
 *     lo que haya.
 *
 *  2. LAS TIPOGRAFÍAS → primero la copia. Sus ficheros no cambian nunca (si
 *     cambia el contenido, cambia el nombre) y son 95 KB: pedirlas a la red
 *     cada vez que se abre el panel es tiempo tirado.
 *
 *  3. LOS DATOS (peticiones GET a la API) → primero la red, y se guarda copia
 *     SOLO de lo que hace falta sin conexión: las reservas, el recuento abierto
 *     y el catálogo del almacén. Todo lo demás no se guarda.
 *
 * QUÉ NO HACE ESTE FICHERO, y es tan importante como lo que hace:
 *
 *  - No guarda ni una petición que no sea GET. Lo que se ESCRIBE sin conexión
 *    —el recuento del sótano— ya tiene su propia cola en js/cola.js, que sabe
 *    reintentar y resolver choques contra el índice único. Un service worker
 *    que reencolara peticiones por su cuenta pelearía con ella.
 *  - No toca `/api/quijote/*` (disponibilidad, cuentas, métricas): son cálculos
 *    del momento y una respuesta vieja engañaría.
 *  - La copia de datos lleva dentro nombres y teléfonos de reservas. Se borra
 *    al salir de la sesión: la aplicación manda `limpiar-datos` y aquí se tira
 *    la caché entera. El móvil del panel se queda en la barra del bar.
 *
 * Cada cambio de estrategia o de lista obliga a subir VERSION: es lo que hace
 * que el service worker viejo se vaya y se limpien sus cachés.
 */

const VERSION = 'v1'
const CACHE_APP = `quijote-panel-${VERSION}`
const CACHE_DATOS = `quijote-datos-${VERSION}`

/**
 * El esqueleto que se guarda al instalar.
 *
 * SI SE AÑADE UN MÓDULO Y SE OLVIDA AÑADIRLO AQUÍ NO SE ROMPE NADA: la primera
 * vez que se use, se guarda solo (estrategia 1). La única diferencia es una
 * instalación seguida de quedarse sin cobertura antes de haber abierto esa
 * pantalla ni una vez.
 */
const ESQUELETO = [
  '/panel/',
  '/panel/index.html',
  '/panel/css/panel.css',
  '/panel/manifest.webmanifest',
  '/panel/img/icono-192.png',
  '/panel/vendor/pocketbase.es.js',

  '/compartido/css/tokens.css',
  '/compartido/css/base.css',
  '/compartido/js/extras.js',
  '/compartido/fuentes/fuentes.css',
  // Las cuatro que el panel precarga en su <head>. Las demás se guardan solas
  // la primera vez que hagan falta.
  '/compartido/fuentes/alegreya-sans-400.woff2',
  '/compartido/fuentes/alegreya-sc-700.woff2',
  '/compartido/fuentes/cormorant-garamond.woff2',
  '/compartido/fuentes/cormorant-garamond-italica.woff2',

  '/panel/js/app.js',
  '/panel/js/cola.js',
  '/panel/js/datos.js',
  '/panel/js/dom.js',
  '/panel/js/enrutador.js',
  '/panel/js/fechas.js',
  '/panel/js/formato.js',
  '/panel/js/horas.js',
  '/panel/js/imagen.js',
  '/panel/js/pb.js',
  '/panel/js/sesion.js',
  '/panel/js/piezas/avatar.js',
  '/panel/js/piezas/cabecera.js',
  '/panel/js/piezas/faltas.js',
  '/panel/js/piezas/hoja.js',
  '/panel/js/piezas/interruptor.js',
  '/panel/js/piezas/nav.js',
  '/panel/js/piezas/reordenar.js',
  '/panel/js/piezas/reserva.js',
  '/panel/js/vistas/acceso.js',
  '/panel/js/vistas/ajustes-reservas.js',
  '/panel/js/vistas/almacen.js',
  '/panel/js/vistas/carta.js',
  '/panel/js/vistas/cuentas.js',
  '/panel/js/vistas/datos-legales.js',
  '/panel/js/vistas/equipo.js',
  '/panel/js/vistas/estadisticas.js',
  '/panel/js/vistas/eventos.js',
  '/panel/js/vistas/falta.js',
  '/panel/js/vistas/ficha-reserva.js',
  '/panel/js/vistas/fichajes.js',
  '/panel/js/vistas/formulario-reserva.js',
  '/panel/js/vistas/hoy.js',
  '/panel/js/vistas/mas.js',
  '/panel/js/vistas/pedido.js',
  '/panel/js/vistas/personal.js',
  '/panel/js/vistas/plato.js',
  '/panel/js/vistas/producto.js',
  '/panel/js/vistas/proveedores.js',
  '/panel/js/vistas/recuento.js',
  '/panel/js/vistas/reservas.js',
]

/**
 * Colecciones cuya lectura NO se guarda. Todo lo demás sí.
 *
 * Es una lista de excepciones y no de permitidas, y el motivo es «Hoy»: esa
 * pantalla hace seis consultas y con media docena guardada enseñaba «no hay
 * nada apuntado, el almacén está al día» con cinco faltas pendientes. Una
 * pantalla que miente sin conexión es peor que una pantalla que no carga.
 *
 *   metricas  son números de días enteros; sin conexión no le sirven a nadie y
 *             ocupan sitio.
 *   users     la lista de cuentas del equipo con sus correos. No hace falta
 *             para nada sin conexión, así que no se guarda en el móvil.
 */
const COLECCIONES_NO_GUARDADAS = ['metricas', 'users']

// ---------------------------------------------------------------------------
// Instalación y relevo
// ---------------------------------------------------------------------------

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP)
    // Uno a uno y sin cortar: si un fichero falla (una tipografía que se
    // renombró, por ejemplo), se instala igual con el resto. addAll() aborta
    // entero por un solo 404, y eso dejaría al panel sin service worker.
    await Promise.all(ESQUELETO.map((ruta) =>
      cache.add(new Request(ruta, { cache: 'reload' })).catch(() => {})))
    // Sin esperar a que se cierren las pestañas abiertas: es un panel de una
    // sola persona y lo que quiere es la versión nueva ya.
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const nombres = await caches.keys()
    await Promise.all(nombres
      .filter((n) => n.startsWith('quijote-') && n !== CACHE_APP && n !== CACHE_DATOS)
      .map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

// Al salir de la sesión, la aplicación pide que se tire la copia de datos: ahí
// dentro hay nombres y teléfonos de gente que ha reservado.
self.addEventListener('message', (e) => {
  if (e.data === 'limpiar-datos') {
    e.waitUntil(caches.delete(CACHE_DATOS))
  }
})

// ---------------------------------------------------------------------------
// Peticiones
// ---------------------------------------------------------------------------

self.addEventListener('fetch', (e) => {
  const pet = e.request
  if (pet.method !== 'GET') return

  const url = new URL(pet.url)
  if (url.origin !== self.location.origin) return

  // --- Navegación: siempre acaba en el index del panel ---------------------
  // Es una aplicación de una sola página: cualquier ruta (/panel/reservas,
  // /panel/almacen/recuento) la resuelve el mismo index.html.
  if (pet.mode === 'navigate') {
    return e.respondWith(navegacion(pet))
  }

  // --- API -----------------------------------------------------------------
  if (url.pathname.startsWith('/api/')) {
    if (guardable(url)) return e.respondWith(datos(pet))
    return   // lo demás, a la red tal cual
  }

  // --- Tipografías: la copia manda ----------------------------------------
  if (url.pathname.startsWith('/compartido/fuentes/') && url.pathname.endsWith('.woff2')) {
    return e.respondWith(copiaPrimero(pet))
  }

  // --- El resto de la aplicación: la red manda, la copia salva -------------
  if (url.pathname.startsWith('/panel/') || url.pathname.startsWith('/compartido/')) {
    return e.respondWith(redPrimero(pet, CACHE_APP))
  }
})

/** ¿Es una lectura de las que hacen falta sin conexión? */
function guardable(url) {
  const m = /^\/api\/collections\/([a-z_]+)\/records/.exec(url.pathname)
  return !!m && !COLECCIONES_NO_GUARDADAS.includes(m[1])
}

async function navegacion(pet) {
  try {
    const r = await fetch(pet)
    // El index se guarda con su ruta canónica, no con la que se pidió: si no,
    // cada pantalla visitada dejaría una copia idéntica del mismo HTML.
    if (r.ok) {
      const cache = await caches.open(CACHE_APP)
      cache.put('/panel/index.html', r.clone())
    }
    return r
  } catch (err) {
    const guardado = await caches.match('/panel/index.html')
    return guardado || Response.error()
  }
}

async function redPrimero(pet, nombreCache) {
  try {
    const r = await fetch(pet)
    if (r.ok) {
      const cache = await caches.open(nombreCache)
      cache.put(pet, r.clone())
    }
    return r
  } catch (err) {
    const guardado = await caches.match(pet)
    if (guardado) return guardado
    throw err
  }
}

async function copiaPrimero(pet) {
  const guardado = await caches.match(pet)
  if (guardado) return guardado
  const r = await fetch(pet)
  if (r.ok) {
    const cache = await caches.open(CACHE_APP)
    cache.put(pet, r.clone())
  }
  return r
}

/**
 * Lecturas de la API.
 *
 * Se guarda la respuesta con la URL entera como clave, filtros incluidos: las
 * reservas de hoy y las de mañana son dos peticiones distintas y dos copias
 * distintas. Sin conexión, la pantalla pide exactamente la misma URL que pidió
 * con red, así que la encuentra.
 *
 * La cabecera se marca para que la aplicación pueda saber que lo que está
 * enseñando es de antes: `X-Quijote-Copia`.
 */
async function datos(pet) {
  try {
    const r = await fetch(pet)
    if (r.ok) {
      const cache = await caches.open(CACHE_DATOS)
      cache.put(pet, r.clone())
    }
    return r
  } catch (err) {
    const guardado = await caches.match(pet, { cacheName: CACHE_DATOS })
    if (!guardado) throw err

    const cuerpo = await guardado.blob()
    const cabeceras = new Headers(guardado.headers)
    cabeceras.set('X-Quijote-Copia', '1')
    return new Response(cuerpo, { status: 200, statusText: 'OK (copia local)', headers: cabeceras })
  }
}

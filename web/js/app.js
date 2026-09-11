/**
 * Arranque de la carta publica
 * ---------------------------------------------------------------------------
 * Descarga la carta una vez, la guarda en el movil y pinta la vista que toque.
 *
 * Orden deliberado: si hay una carta guardada de una visita anterior se pinta
 * YA, sin esperar a la red, y despues se refresca si el servidor responde. En
 * 3G lenta eso es la diferencia entre ver la carta al instante o mirar una
 * pantalla en blanco (seccion 6).
 *
 * QUE SE CARGA Y CUANDO (D-87). El camino del QR —portada, carta, ficha de
 * plato— viene en el primer paquete, porque es lo que hace alguien de pie en la
 * puerta con el movil en la mano. Todo lo demas se pide al servidor cuando hace
 * falta:
 *
 *   reserva, confirmacion   se piden al ratito de arrancar, cuando el navegador
 *                           esta parado: asi no retrasan la carta, pero ya estan
 *                           en el movil antes de que nadie pulse «Reservar».
 *   eventos, textos legales solo se descargan si alguien entra ahi. Son
 *                           pantallas que se visitan una vez.
 *
 * Con el presupuesto de primera carga en 152,4 KB sobre un techo de 153,6
 * (D-20), esto no es afinar por gusto: es lo que ha dejado sitio para las
 * pantallas de la fase 10.
 */

import { cargarCarta, cargarAjustes, cartaGuardada } from './api.js'
import { registrar, arrancar, ir, rutaActual } from './enrutador.js'
import { portada } from './vistas/portada.js'
import { carta } from './vistas/carta.js'
import { cerrarFicha } from './vistas/ficha.js'
import { idioma, cambiarIdioma } from './idioma.js'
import { contarVisita } from './metricas.js'
import { sprite } from '/compartido/js/iconos.js'

const contenedor = document.getElementById('app')

const estado = {
  carta: { categorias: [], platos: [] },
  ajustes: null,
  sinConexion: false,
}

// --- Modulos que se cargan cuando se necesitan -----------------------------
// Se guarda la PROMESA, no el modulo: si alguien pulsa dos veces mientras baja,
// se pide una sola vez.
const perezosos = new Map()

function modulo(nombre) {
  if (!perezosos.has(nombre)) perezosos.set(nombre, import(`./vistas/${nombre}.js`))
  return perezosos.get(nombre)
}

const RUTAS_LEGALES = ['/aviso-legal', '/privacidad', '/cookies']

// --- Vistas ----------------------------------------------------------------

registrar('/', () => portada(contenedor, estado))
registrar('/carta', () => carta(contenedor, estado))
registrar('/reserva', () => modulo('reserva').then((m) => m.reserva(contenedor, estado)))
registrar('/eventos', () => modulo('eventos').then((m) => m.eventos(contenedor, estado)))

for (const ruta of RUTAS_LEGALES) {
  registrar(ruta, () => modulo('legal').then((m) => m.legal(contenedor, estado, ruta)))
}

// Cualquier otra ruta: si es /reserva/RQ-XXXX, la confirmacion; si no, a la
// portada. El QR apunta a la raiz, asi que es la unica pantalla que siempre
// tiene que existir.
registrar('*', (ruta) => {
  const codigo = codigoDeReserva(ruta)
  if (codigo) return modulo('confirmacion').then((m) => m.confirmacion(contenedor, estado, codigo))
  ir('/', { reemplazar: true })
})

function codigoDeReserva(ruta) {
  const m = /^\/reserva\/(RQ-[A-Z0-9]{4})$/i.exec(ruta)
  return m ? m[1].toUpperCase() : null
}

// --- Datos -----------------------------------------------------------------

async function cargar() {
  // 1. Lo que haya guardado, para pintar sin esperar.
  const guardada = cartaGuardada()
  if (guardada) {
    estado.carta = guardada
    estado.sinConexion = true   // se corrige en cuanto responda el servidor
  }

  // 2. Lo de verdad.
  try {
    const [nueva, ajustes] = await Promise.all([cargarCarta(), cargarAjustes()])
    estado.carta = nueva
    estado.ajustes = ajustes
    estado.sinConexion = false
    // La vista de reserva se repinta sola muchas veces (cada cambio de dia o de
    // zona) y necesita los ajustes sin arrastrarlos por cada llamada.
    window.__ajustesQuijote = ajustes
  } catch (e) {
    // Si no hay red y tampoco copia guardada, las vistas ya ensenan su estado
    // vacio con el telefono. No se rompe nada.
    estado.sinConexion = true
    console.warn('No se ha podido actualizar la carta:', e.message)
  }
}

function repintar() {
  const ruta = rutaActual()
  if (ruta === '/carta') return carta(contenedor, estado)
  if (ruta === '/reserva') return modulo('reserva').then((m) => m.reserva(contenedor, estado))
  if (ruta === '/eventos') return modulo('eventos').then((m) => m.eventos(contenedor, estado))
  if (RUTAS_LEGALES.includes(ruta)) {
    return modulo('legal').then((m) => m.legal(contenedor, estado, ruta))
  }
  const codigo = codigoDeReserva(ruta)
  if (codigo) return modulo('confirmacion').then((m) => m.confirmacion(contenedor, estado, codigo))
  portada(contenedor, estado)
}

// El conmutador de idioma lo lanza la barra superior de la carta.
document.addEventListener('quijote:idioma', () => {
  cambiarIdioma()
  cerrarFicha()
  repintar()
})

// Si vuelve la red, se reintenta.
window.addEventListener('online', () => cargar().then(repintar))

// --- En marcha -------------------------------------------------------------

// El sprite de iconos va una sola vez y lo primero: a partir de ahi cualquier
// <use href="#ic-..."> encuentra su simbolo. Ver compartido/js/iconos.js.
document.body.prepend(sprite())

document.documentElement.lang = idioma()

// Se cuenta la visita (una por sesion, al terminar). Solo esto: ni cookie, ni
// identificador, ni IP. Ver web/js/metricas.js y la politica de privacidad.
contarVisita(idioma)

// Se pinta lo que haya (aunque sea nada) para que la pantalla no quede en
// blanco, y se repinta cuando lleguen los datos.
arrancar((ruta) => {
  cerrarFicha()
  // Al salir del formulario se olvida lo tecleado: no se arrastra de una
  // reserva a la siguiente. Si el modulo no se ha cargado todavia no hay nada
  // que olvidar, y no se carga solo para preguntarselo.
  if (ruta !== '/reserva' && perezosos.has('reserva')) {
    perezosos.get('reserva').then((m) => m.olvidarFormulario())
  }
})

cargar().then(repintar)

// Las pantallas de reserva se traen DESPUES de que la pagina haya terminado de
// cargar del todo y con el navegador ya parado. Quien pulse «Reservar» las
// tendra ya en el movil, y quien solo mire la carta no las habra esperado.
//
// EL ORDEN IMPORTA Y SE COMPROBO MIDIENDO: pidiendolas nada mas resolverse la
// carta, requestIdleCallback se dispara ANTES del evento `load` y las tres
// (reserva, confirmacion e ics) acaban compitiendo por la red con la portada.
// Colgadas de `load`, salen de la primera carga: 27 KB menos que esperar.
window.addEventListener('load', () => {
  const luego = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200))
  luego(() => { modulo('reserva'); modulo('confirmacion') })
})

/**
 * Arranque del panel
 * ---------------------------------------------------------------------------
 * Una sola pagina, sin recargas, colgando de /panel.
 *
 * Orden de arranque, y cada paso esta donde esta por un motivo:
 *   1. Se pinta YA lo que corresponda a la sesion guardada. Sin esto, quien
 *      abre el panel ve una pantalla en blanco mientras el servidor contesta.
 *   2. Se refresca la sesion contra el servidor. Ahi se entera de que le han
 *      cambiado el rol o le han borrado la cuenta.
 *   3. Se cargan los ajustes del bar, que hacen falta en casi todas las
 *      pantallas (horario de cocina, aforos) y cambian una vez al ano.
 *
 * Si el token deja de valer en cualquier momento, la sesion se limpia sola y se
 * vuelve al acceso: eso lo escucha alCambiarSesion.
 */

import { registrar, arrancar, ir, resolver, rutaActual } from './enrutador.js'
import { puedeAcceder } from './permisos.js'
import { haySesion, refrescar, alCambiarSesion, rol } from './sesion.js'
import { cerrarHoja } from './piezas/hoja.js'
import { ajustes as cargarAjustes } from './datos.js'
import { acceso } from './vistas/acceso.js'
import { hoy } from './vistas/hoy.js'
import { reservas } from './vistas/reservas.js'
import { carta } from './vistas/carta.js'
import { plato } from './vistas/plato.js'
import { almacen } from './vistas/almacen.js'
import { producto } from './vistas/producto.js'
import { falta } from './vistas/falta.js'
import { proveedores } from './vistas/proveedores.js'
import { recuento } from './vistas/recuento.js'
import { pedido } from './vistas/pedido.js'
import { parar as pararCola } from './cola.js'
import { eventos } from './vistas/eventos.js'
import { estadisticas } from './vistas/estadisticas.js'
import { personal } from './vistas/personal.js'
import { fichajes } from './vistas/fichajes.js'
import { equipo } from './vistas/equipo.js'
import { cuentas } from './vistas/cuentas.js'
import { mas } from './vistas/mas.js'
import { actividad } from './vistas/actividad.js'
import { registrarPWA, olvidarDatosGuardados } from './pwa.js'
import { sprite } from '/compartido/js/iconos.js'

const contenedor = document.getElementById('app')

const estado = {
  ajustes: null,
  diaReservas: null,
  // La carta se descarga una vez y se reutiliza entre la lista y el editor: son
  // dos listas cortas y volver a pedirlas al abrir cada plato es una espera
  // gratis. Se refresca sola al guardar.
  carta: null,
  // Lo mismo con el almacen: productos y proveedores se comparten entre la
  // lista, el editor de producto y la pantalla de apuntar faltas.
  almacen: null,
  // Las faltas sin resolver, compartidas entre «Almacén» y «Apuntar una falta».
  // «Hoy» las pide aparte: es la primera pantalla y no puede depender de que
  // alguien haya pasado antes por el almacen.
  avisos: null,
  // Las fichas del equipo, compartidas entre el cuadrante, los fichajes y la
  // pantalla del equipo: son cuatro filas y hacen falta en las tres.
  equipo: null,
  // La semana que se esta mirando en el cuadrante. Se guarda aqui y no en la
  // URL porque se va y se vuelve a Fichajes constantemente.
  semana: null,
  // Los eventos, compartidos entre la lista y la hoja de edicion. Son unas
  // pocas filas al ano.
  eventos: null,
  // El periodo elegido en Estadisticas (7, 30 o 90 dias). Se recuerda mientras
  // dure la sesion: se entra y se sale de esa pantalla constantemente.
  diasEstadisticas: 7,
}

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------
// Todas pasan por "conSesion": el panel no ensena NADA sin sesion, ni siquiera
// una pantalla vacia. Y no es solo cosmetica: las reglas de acceso de las
// colecciones tampoco devolverian datos.

registrar('/', conSesion(() => hoy(contenedor, estado)))
registrar('/reservas', conSesion(() => reservas(contenedor, estado)))

registrar('/carta', conSesion(() => carta(contenedor, estado)))

// El almacen cuelga de «Más» (D-46): no tiene entrada propia en la barra
// inferior, pero si rutas propias, para poder enlazarlo y compartirlo.
registrar('/almacen', conSesion(() => almacen(contenedor, estado)))
registrar('/almacen/falta', conSesion(() => falta(contenedor, estado)))
registrar('/almacen/proveedores', conSesion(() => proveedores(contenedor, estado)))
registrar('/almacen/recuento', conSesion(() => recuento(contenedor, estado)))
registrar('/almacen/pedido', conSesion(() => pedido(contenedor, estado)))

// Personal: el cuadrante es la puerta, y de el cuelgan los fichajes y las
// fichas del equipo. Misma forma que el almacen: una entrada en la barra
// inferior, las demas pantallas dentro (D-33).
registrar('/personal', conSesion(() => personal(contenedor, estado)))
registrar('/personal/fichajes', conSesion(() => fichajes(contenedor, estado)))
registrar('/personal/equipo', conSesion(() => equipo(contenedor, estado)))
registrar('/personal/cuentas', conSesion(() => cuentas(contenedor, estado)))

// Eventos y estadisticas cuelgan tambien de «Más», por lo mismo que el almacen:
// la barra inferior tiene las cinco entradas de la maqueta y no se toca (D-33).
registrar('/eventos', conSesion(() => eventos(contenedor, estado)))
registrar('/estadisticas', conSesion(() => estadisticas(contenedor, estado)))

// El diario del panel cuelga de «Más», como el almacen y las estadisticas. La
// pantalla es solo del administrador, pero eso NO se decide aqui: lo decide la
// regla de la coleccion `actividad`. Una ruta escondida en el enrutador no es
// un permiso; lo unico que haria es que quien teclee la direccion vea una
// pantalla rara en vez del aviso de «esto no es para tu cuenta».
registrar('/actividad', conSesion(() => actividad(contenedor, estado)))

registrar('/mas', conSesion(() => mas(contenedor, estado, { alSalir: aAcceso })))

// /carta/<id>, /carta/nuevo, /almacen/<id> y /almacen/nuevo. El enrutador
// compara rutas exactas, asi que las que llevan un identificador dentro se
// resuelven aqui. Las de /almacen que NO son un identificador (falta,
// proveedores, recuento, pedido) estan registradas arriba y no llegan hasta aqui.
registrar('*', conSesion((ruta) => {
  const enCarta = /^\/carta\/([A-Za-z0-9]+)$/.exec(ruta)
  if (enCarta) return plato(contenedor, estado, enCarta[1])

  const enAlmacen = /^\/almacen\/([A-Za-z0-9]+)$/.exec(ruta)
  if (enAlmacen) return producto(contenedor, estado, enAlmacen[1])

  ir('/', { reemplazar: true })
}))

function conSesion(vista) {
  return (...args) => {
    if (!haySesion()) return aAcceso()
    if (!puedeAcceder(rol(), rutaActual())) return ir('/almacen', { reemplazar: true })
    return vista(...args)
  }
}

function aAcceso() {
  cerrarHoja()
  acceso(contenedor, {
    alEntrar: async () => {
      await cargarAjustesSiHace()
      // Se vuelve a donde se queria ir; si no habia sitio, a Hoy.
      resolver({ arriba: true })
    },
  })
}

async function cargarAjustesSiHace() {
  if (estado.ajustes || !haySesion()) return
  try {
    estado.ajustes = await cargarAjustes()
  } catch (err) {
    // Sin ajustes el panel sigue en pie: las reservas se agrupan por defecto y
    // el engranaje no encuentra nada que editar. Peor seria no entrar.
    console.warn('No se han podido cargar los ajustes:', err?.message)
  }
}

// ---------------------------------------------------------------------------
// Si la sesion se cae (token caducado, cuenta borrada), fuera
// ---------------------------------------------------------------------------
alCambiarSesion(() => {
  if (!haySesion()) {
    estado.carta = null
    estado.ajustes = null
    estado.almacen = null
    estado.avisos = null
    estado.equipo = null
    estado.semana = null
    estado.eventos = null
    // La copia sin conexion guarda reservas con nombre y telefono. Al salir de
    // la sesion, fuera: el movil del panel se queda en la barra.
    olvidarDatosGuardados()
    cerrarHoja()
    aAcceso()
  }
})

// Al cambiar de pantalla se cierra la hoja que hubiera abierta: si no, se queda
// flotando encima de la pantalla nueva.
//
// Y se apagan los reintentos de la cola del recuento al salir de su pantalla.
// Lo pendiente NO se pierde: sigue guardado en el navegador y se manda al
// volver a entrar. Se decide por la ruta y no dentro de la vista porque el
// enrutador avisa DESPUES de pintar, y hacerlo alli apagaria la cola justo al
// encenderla.
arrancar((ruta) => {
  cerrarHoja()
  if (ruta !== '/almacen/recuento') pararCola()
})

// Se instala el service worker: es lo que deja el panel en la pantalla de
// inicio y lo que hace que siga abriendose en el sotano, sin cobertura.
// El sprite de iconos va una sola vez y lo primero: a partir de ahi cualquier
// <use href="#ic-..."> encuentra su simbolo. Ver compartido/js/iconos.js.
document.body.prepend(sprite())

registrarPWA()

// ---------------------------------------------------------------------------
// En marcha
// ---------------------------------------------------------------------------
;(async () => {
  if (!haySesion()) return
  const sigueValiendo = await refrescar()
  if (!sigueValiendo) return          // alCambiarSesion ya ha llevado al acceso
  await cargarAjustesSiHace()
  // Se repinta con el rol ya confirmado y los ajustes puestos: la pantalla que
  // se pinto al instante no los tenia.
  if (rutaActual()) resolver()
})()

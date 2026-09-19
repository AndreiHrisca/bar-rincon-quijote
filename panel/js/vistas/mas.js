/**
 * Más
 * ---------------------------------------------------------------------------
 * El cajón de lo que no cabe en las otras cuatro entradas: la cuenta con la que
 * se ha entrado, el botón de salir y las pantallas que se usan de vez en
 * cuando —almacén, eventos, estadísticas y la actividad del panel—.
 *
 * Salir importa más de lo que parece en un bar: el móvil del panel se deja en
 * la barra y lo coge cualquiera. Que el botón esté escondido tres pantallas
 * dentro es lo que hace que nadie cierre nunca la sesión.
 *
 * Todo esto está aquí porque la barra inferior tiene las cinco entradas de la
 * maqueta y no se toca (D-33). Para que eso no entierre el gesto de cada día,
 * «Apuntar una falta» está además en «Hoy», que es donde se está cuando se
 * descubre que no queda harina (D-46).
 *
 * TODAS LAS FILAS SE CONSTRUYEN CON filaIr(), vayan a una ruta o abran una
 * hoja. Antes no: las que abrían una hoja —«Horario del bar» y «Datos
 * legales»— se escribían a mano con un <button> y las demás con filaIr(), y
 * eso salía en pantalla. Un <button> no es un bloque: se encoge hasta el ancho
 * de su contenido, así que las dos se apretaban una al lado de la otra en la
 * misma línea mientras el resto ocupaba la fila entera. Con una sola función,
 * el mismo marcado y el mismo CSS para las dos cosas, no puede volver a
 * descuadrarse. (El arreglo de fondo está además en .fila-ir, que ahora dice
 * `width: 100%` para que un <button> con esa clase se comporte como bloque
 * venga de donde venga.)
 *
 * LO QUE SE HA QUITADO: había una sección «Próximamente» con dos líneas de
 * texto muerto —el QR de las mesas y el aviso de platos con algo agotado— que
 * no llevaban a ninguna parte. Una lista de promesas dentro de una herramienta
 * de trabajo ocupa sitio y no hace nada; lo que falta por construir va en
 * docs/README.md, que es donde se mira para saberlo.
 */

import { el, pintar } from '../dom.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { BASE } from '../enrutador.js'
import { usuario, rol, NOMBRE_ROL, salir, esAdmin } from '../sesion.js'
import { hojaDatosLegales, faltanDatosLegales } from './datos-legales.js'
import { hojaHorario, resumenDeHorario } from './horario.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { icono } from '/compartido/js/iconos.js'

const ALMACEN = [
  { ruta: '/almacen/falta', nombre: 'Apuntar una falta', pie: 'Se ha acabado algo. Dos toques y queda apuntado para todos.' },
  { ruta: '/almacen',       nombre: 'Almacén',           pie: 'Lo que hay, lo que falta y quién lo trae.' },
]

export function mas(contenedor, estado, { alSalir }) {
  const u = usuario()

  function repintar() {
    pintar(contenedor, pantalla(estado, u, { alSalir, repintar }))
  }

  repintar()
}

function pantalla(estado, u, { alSalir, repintar }) {
  return el('div', { class: 'pantalla' }, [
    cabecera(esAdmin() ? 'Más' : 'Cuenta'),
    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [

        // Mientras falten los datos del titular, el aviso legal de la web sale
        // incompleto. Solo lo ve el administrador, que es quien los tiene.
        esAdmin() && faltanDatosLegales(estado.ajustes)
          ? avisoDatosLegales(estado, repintar)
          : null,

        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, [
            el('div', { class: 'cuenta' }, [
              el('div', { class: 'cuenta__cuerpo' }, [
                el('div', { class: 'cuenta__nombre', text: u?.nombre || u?.email || 'Sin nombre' }),
                el('div', { class: 'cuenta__rol', text: NOMBRE_ROL[rol()] || rol() }),
              ]),
              botonSalir(alSalir),
            ]),
          ]),
        ]),

        // El almacen sube aqui, al sitio que ocupaba el boton de salir a ancho
        // completo. Es lo que se usa a diario; salir, una vez al dia como mucho.
        seccion('Almacén', ALMACEN),

        // La cara pública del bar: lo que se anuncia y lo que se mide. Es
        // administrar el negocio, no trabajo del turno.
        esAdmin()
          ? seccion('La carta y la web', [
            { ruta: '/eventos', nombre: 'Eventos', pie: 'El menú navideño, los vermús y las celebraciones que se anuncian en la web.' },
            { ruta: '/estadisticas', nombre: 'La carta en números', pie: 'Escaneos del QR, platos más mirados y lo que se busca y no está.' },
          ])
          : null,

        esAdmin()
          ? seccion('Del negocio', [
            // El horario primero: es lo que la web enseña a todo el que
            // entra, y lo que hay que cambiar el dia que el bar cierre.
            {
              nombre: 'Horario del bar',
              pie: resumenDeHorario(estado.ajustes),
              alPulsar: () => hojaHorario(estado, repintar),
            },
            {
              nombre: 'Datos legales',
              pie: 'Quién figura como titular de la web y cuánto se guardan las reservas.',
              alPulsar: () => hojaDatosLegales(estado, repintar),
            },
          ])
          : null,

        // Quién ha hecho cada cambio. Va en su propia sección y no dentro de
        // «Del negocio» porque no se configura nada: se consulta.
        esAdmin()
          ? seccion('Gestión', [
            {
              ruta: '/actividad',
              nombre: 'Actividad',
              pie: 'Consulta quién ha hecho cada cambio en el panel.',
            },
          ])
          : null,

        el('p', { class: 'pie-nota', text: 'nndrei.dev · soporte 24/48 h' }),
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),
    nav('/mas'),
  ])
}

/** Un rótulo y su tarjeta de filas. Todas las secciones de «Más» son esto. */
function seccion(rotulo, entradas) {
  return [
    el('h2', { class: 'rotulo-seccion', text: rotulo }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, entradas.map(filaIr)),
    ]),
  ]
}

/**
 * Una fila que lleva a otro sitio.
 *
 * Con `ruta` sale un enlace de verdad —se puede copiar, abrir en otra pestaña y
 * compartir—; con `alPulsar`, un botón, que es lo que toca cuando lo que se
 * abre es una hoja y no una pantalla con URL propia. Por dentro son el mismo
 * marcado y la misma clase, que es justo lo que hace que se vean iguales.
 */
function filaIr(entrada) {
  const dentro = [
    el('span', { class: 'fila-ir__cuerpo' }, [
      el('span', { class: 'fila-ir__nombre', text: entrada.nombre }),
      el('span', { class: 'fila-ir__pie', text: entrada.pie }),
    ]),
    icono('chevron', { clase: 'ic fila-ir__flecha' }),
  ]

  return entrada.ruta
    ? el('a', { class: 'fila-ir', href: BASE + entrada.ruta }, dentro)
    : el('button', { type: 'button', class: 'fila-ir', onclick: entrada.alPulsar }, dentro)
}

/**
 * Salir: un icono a la derecha del nombre, en la misma tarjeta.
 *
 * Era un boton a ancho completo que se comia media pantalla de «Más» para algo
 * que se hace una vez al dia. Como icono ocupa lo que tiene que ocupar, y el
 * sitio que deja libre lo ocupa el almacen, que se usa a diario.
 *
 * COMO AHORA QUEDA PEGADO A CONTENIDO, PREGUNTA ANTES. Un boton a ancho
 * completo se pulsa a proposito; un icono al lado del nombre se puede rozar sin
 * querer, y cerrar la sesion por accidente en mitad de un servicio es un
 * fastidio de verdad: hay que volver a escribir usuario y clave con las manos
 * mojadas.
 */
function botonSalir(alSalir) {
  return el('button', {
    type: 'button',
    class: 'cuenta__salir',
    onclick: () => confirmarSalida(alSalir),
  }, [icono('salir', { titulo: 'Salir de la sesión' })])
}

function confirmarSalida(alSalir) {
  abrirHoja({
    titulo: '¿Salir de la sesión?',
    cuerpo: el('p', { class: 'parrafo', text:
      'Habrá que volver a escribir el usuario y la contraseña para entrar.' }),
    acciones: [
      el('button', {
        type: 'button', class: 'btn btn--linea', text: 'Cancelar', onclick: cerrarHoja,
      }),
      el('button', {
        type: 'button', class: 'btn btn--primario', text: 'Salir',
        onclick: () => { cerrarHoja(); salir(); alSalir() },
      }),
    ],
  })
}

function avisoDatosLegales(estado, repintar) {
  return el('button', {
    type: 'button',
    class: 'aviso aviso--pulsable',
    onclick: () => hojaDatosLegales(estado, repintar),
  }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: 'Falta el titular del aviso legal' }),
      // Sin «toca aquí»: el aviso entero es un boton y ya se anuncia como tal.
      el('span', { text:
        'Pon el NIF y el correo de contacto. Sin ellos, el aviso legal de la web '
        + 'sale incompleto.' }),
    ]),
  ])
}

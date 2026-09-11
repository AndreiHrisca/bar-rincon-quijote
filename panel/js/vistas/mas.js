/**
 * Más
 * ---------------------------------------------------------------------------
 * El cajón de lo que no cabe en las otras cuatro entradas: la cuenta con la que
 * se ha entrado, el botón de salir y las pantallas que se usan de vez en
 * cuando —eventos, estadísticas y almacén—.
 *
 * Salir importa más de lo que parece en un bar: el móvil del panel se deja en
 * la barra y lo coge cualquiera. Que el botón esté escondido tres pantallas
 * dentro es lo que hace que nadie cierre nunca la sesión.
 *
 * Todo esto está aquí porque la barra inferior tiene las cinco entradas de la
 * maqueta y no se toca (D-33). Para que eso no entierre el gesto de cada día,
 * «Apuntar una falta» está además en «Hoy», que es donde se está cuando se
 * descubre que no queda harina (D-46).
 */

import { el, pintar } from '../dom.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { BASE } from '../enrutador.js'
import { usuario, rol, NOMBRE_ROL, salir, esDueno, gestionaReservas } from '../sesion.js'
import { hojaDatosLegales, faltanDatosLegales } from './datos-legales.js'
import { hojaHorario, resumenDeHorario } from './horario.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { icono } from '/compartido/js/iconos.js'

const ALMACEN = [
  { ruta: '/almacen/falta', nombre: 'Apuntar una falta', pie: 'Se ha acabado algo. Dos toques y queda apuntado para todos.' },
  { ruta: '/almacen',       nombre: 'Almacén',           pie: 'Lo que hay, lo que falta y quién lo trae.' },
]

/**
 * Lo que aun no esta. En el idioma del bar, no en el mio.
 *
 * Decia «Lo que falta por construir» con «Fase 10» y «Fase 11» al lado. Las
 * fases son de mi plan de trabajo y no significan nada para quien abre esto:
 * lo unico que quiere saber es que va a poder hacer y que todavia no.
 */
const PROXIMAMENTE = [
  'QR de las mesas y manuales',
  'Avisar de los platos que llevan algo agotado',
]

export function mas(contenedor, estado, { alSalir }) {
  const u = usuario()

  function repintar() {
    pintar(contenedor, pantalla(estado, u, { alSalir, repintar }))
  }

  repintar()
}

function pantalla(estado, u, { alSalir, repintar }) {
  // La cara pública del bar: la ve el dueño y el encargado, igual que la carta.
  const laCaraPublica = [
    gestionaReservas()
      ? { ruta: '/eventos', nombre: 'Eventos', pie: 'El menú navideño, los vermús y las celebraciones que se anuncian en la web.' }
      : null,
    gestionaReservas()
      ? { ruta: '/estadisticas', nombre: 'La carta en números', pie: 'Escaneos del QR, platos más mirados y lo que se busca y no está.' }
      : null,
  ].filter(Boolean)

  return el('div', { class: 'pantalla' }, [
    cabecera('Más'),
    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [

        // Mientras falten los datos del titular, el aviso legal de la web sale
        // incompleto. Solo lo ve el dueño, que es quien los tiene.
        esDueno() && faltanDatosLegales(estado.ajustes)
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
        el('h2', { class: 'rotulo-seccion', text: 'Almacén' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, ALMACEN.map(filaIr)),
        ]),

        laCaraPublica.length
          ? [
            el('h2', { class: 'rotulo-seccion', text: 'La carta y la web' }),
            el('section', { class: 'tarjeta' }, [
              el('div', { class: 'filas' }, laCaraPublica.map(filaIr)),
            ]),
          ]
          : null,

        esDueno()
          ? [
            el('h2', { class: 'rotulo-seccion', text: 'Del negocio' }),
            el('section', { class: 'tarjeta' }, [
              el('div', { class: 'filas' }, [
                // El horario primero: es lo que la web enseña a todo el que
                // entra, y lo que hay que cambiar el dia que el bar cierre.
                el('button', {
                  type: 'button', class: 'fila-ir',
                  onclick: () => hojaHorario(estado, repintar),
                }, [
                  el('span', { class: 'fila-ir__cuerpo' }, [
                    el('span', { class: 'fila-ir__nombre', text: 'Horario del bar' }),
                    el('span', { class: 'fila-ir__pie', text: resumenDeHorario(estado.ajustes) }),
                  ]),
                  icono('chevron', { clase: 'ic fila-ir__flecha' }),
                ]),
                el('button', {
                  type: 'button', class: 'fila-ir',
                  onclick: () => hojaDatosLegales(estado, repintar),
                }, [
                  el('span', { class: 'fila-ir__cuerpo' }, [
                    el('span', { class: 'fila-ir__nombre', text: 'Datos legales' }),
                    el('span', { class: 'fila-ir__pie', text:
                      'Quién figura como titular de la web y cuánto se guardan las reservas.' }),
                  ]),
                  icono('chevron', { clase: 'ic fila-ir__flecha' }),
                ]),
              ]),
            ]),
          ]
          : null,

        el('h2', { class: 'rotulo-seccion', text: 'Próximamente' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, PROXIMAMENTE.map((texto) =>
            el('div', { class: 'futuro' }, [
              el('span', { class: 'futuro__texto', text: texto }),
            ]))),
        ]),

        el('p', { class: 'pie-nota', text: 'nndrei.dev · soporte 24/48 h' }),
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),
    nav('/mas'),
  ])
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

function filaIr(e) {
  return el('a', { class: 'fila-ir', href: BASE + e.ruta }, [
    el('span', { class: 'fila-ir__cuerpo' }, [
      el('span', { class: 'fila-ir__nombre', text: e.nombre }),
      el('span', { class: 'fila-ir__pie', text: e.pie }),
    ]),
    icono('chevron', { clase: 'ic fila-ir__flecha' }),
  ])
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

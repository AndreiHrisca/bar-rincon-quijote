/**
 * Confirmación de reserva
 * ---------------------------------------------------------------------------
 * La banda granate con el código cierra la tarjeta: es lo que se enseña en la
 * puerta.
 *
 * De dónde salen los datos: la reserva llega entera UNA sola vez, en la
 * respuesta a la creación, y se guarda en el móvil. Las reglas de la colección
 * impiden volver a leerla sin sesión —una reserva lleva nombre y teléfono de
 * una persona— así que esta pantalla NO la pide otra vez al servidor.
 */

import { el, pintar } from '../dom.js'
import { ir } from '../enrutador.js'
import { icsDeReserva, descargarIcs } from '../ics.js'
import { cancelarReserva } from '../api.js'
import { ultimaReserva, olvidarUltima, guardarUltima } from './reserva.js'
import { icono } from '/compartido/js/iconos.js'

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const NOMBRE_ZONA = {
  barra: 'Barra', terraza: 'Terraza', salon: 'Salón', indiferente: 'Donde haya sitio',
}

let cancelando = false

export function confirmacion(contenedor, { ajustes }, codigo) {
  const reserva = ultimaReserva()

  // Sin datos guardados (otro móvil, o se ha borrado) no se puede enseñar nada:
  // la reserva no se puede volver a pedir al servidor, y así tiene que ser.
  if (!reserva || (codigo && reserva.codigo !== codigo)) {
    pintar(contenedor, cabecera(), sinDatos(codigo, ajustes))
    return
  }

  const cancelada = reserva.estado === 'cancelada'

  pintar(contenedor,
    cabecera(),
    el('div', { class: 'reserva' }, [
      el('div', { class: 'exito' }, [
        el('div', { class: 'sello', 'aria-hidden': 'true' }, [icono(cancelada ? 'cerrar' : 'comprobado', { clase: 'ic sello__ic' })]),
        el('h1', { text: cancelada ? 'Reserva cancelada' : 'Mesa reservada' }),
        el('p', { class: 'exito__texto' }, [
          cancelada
            ? 'Ya está. Si quieres volver a reservar, aquí estamos.'
            : `Te esperamos el ${enPalabras(reserva.fecha)} a las ${reserva.hora}.`,
          // La maqueta decía "Te hemos mandado un SMS". NO se dice: en la v1 no
          // hay SMS (sección 10) y prometerlo sería mentirle al cliente, que se
          // quedaría esperando un mensaje que no llega. Ver DECISIONES.md D-23.
          cancelada ? null : el('br'),
          cancelada ? null : 'Guarda el código: es lo que te pedimos en la puerta.',
        ]),
      ]),

      resumen(reserva),
      cancelada ? null : acciones(reserva, ajustes),
      cancelada
        ? el('div', { class: 'acciones-confirmacion' }, [
            el('a', { class: 'btn btn--primario', href: '/reserva', text: 'Reservar otra mesa' }),
          ])
        : null,
    ]),
  )
}

function cabecera() {
  return el('header', { class: 'topbar' }, [
    el('a', { class: 'topbar__boton', href: '/', 'aria-label': 'Volver' }, [icono('chevron', { clase: 'ic ic--atras' })]),
    el('h1', { class: 'topbar__titulo', text: 'Tu reserva' }),
  ])
}

function sinDatos(codigo, ajustes) {
  return el('div', { class: 'vacio' }, [
    el('p', { class: 'vacio__titulo', text: 'No tenemos esa reserva en este móvil' }),
    el('p', { class: 'vacio__texto' }, [
      codigo ? `El código ${codigo} existe, pero los datos de una reserva solo se guardan en el móvil desde el que se hizo. ` : '',
      'Llámanos y te la buscamos.',
    ]),
    ajustes?.telefono
      ? el('p', { style: 'margin-top:22px' }, [
          el('a', { class: 'btn btn--primario', href: `tel:${ajustes.telefono}`, text: 'Llamar al bar' }),
        ])
      : null,
    el('p', { style: 'margin-top:11px' }, [
      el('a', { class: 'btn btn--linea', href: '/reserva', text: 'Hacer una reserva nueva' }),
    ]),
  ])
}

function resumen(r) {
  return el('div', { class: 'resumen' }, [
    fila('A nombre de', r.nombre),
    fila('Día y hora', [enPalabras(r.fecha, true), el('br'), r.hora]),
    fila('Comensales', `${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}`),
    fila('Dónde', NOMBRE_ZONA[r.zona] || r.zona),
    r.notas ? fila('Notas', r.notas) : null,
    el('div', { class: 'codigo' }, [
      el('span', { class: 'codigo__rotulo', text: 'CÓDIGO DE RESERVA' }),
      el('span', { class: 'codigo__valor', text: r.codigo }),
    ]),
  ])
}

function fila(clave, valor) {
  return el('div', { class: 'resumen__fila' }, [
    el('span', { class: 'resumen__clave', text: clave }),
    el('span', { class: 'resumen__valor' }, [].concat(valor)),
  ])
}

function acciones(r, ajustes) {
  const nombreBar = ajustes?.nombre_bar || 'El Rincón del Quijote'
  const direccion = ajustes?.direccion || 'Ciudad de los Ángeles, Madrid'

  return el('div', { class: 'acciones-confirmacion' }, [
    el('button', {
      class: 'btn btn--linea', type: 'button', text: 'Guardar en el calendario',
      onclick: () => {
        // El .ics se genera aquí, en el móvil: no hace falta pedirlo al
        // servidor y funciona aunque la red vaya mal justo después de reservar.
        const ics = icsDeReserva({
          reserva: r, nombreBar, direccion,
          duracionMin: ajustes?.duracion_mesa_min || 90,
        })
        descargarIcs(ics, `reserva-${r.codigo}.ics`)
      },
    }),

    // Enlace saliente que se abre AL TOCARLO. No carga nada de terceros en esta
    // página: no hay cookies ni píxeles, solo un enlace (sección 12).
    el('a', {
      class: 'btn btn--linea',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nombreBar}, ${direccion}`)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      text: 'Cómo llegar',
    }),

    el('button', {
      class: 'enlace-suave', type: 'button',
      text: cancelando ? 'Cancelando…' : 'Cancelar la reserva',
      disabled: cancelando,
      onclick: () => pedirCancelacion(r, ajustes),
    }),
  ])
}

async function pedirCancelacion(r, ajustes) {
  if (cancelando) return
  if (!confirm(`¿Cancelamos la mesa del ${enPalabras(r.fecha)} a las ${r.hora}?`)) return

  cancelando = true
  try {
    await cancelarReserva({ codigo: r.codigo, token: r.token_cancelacion })
    guardarUltima({ ...r, estado: 'cancelada' })
    ir(`/reserva/${r.codigo}`)
  } catch (e) {
    alert(e.message || 'No hemos podido cancelarla. Llámanos y lo vemos.')
  } finally {
    cancelando = false
  }
}

/** "2026-09-01" -> "martes" o "martes 1 de septiembre" */
function enPalabras(fecha, conMes = false) {
  const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number)
  const dia = new Date(a, m - 1, d)
  const nombre = DIAS[dia.getDay()]
  if (!conMes) return nombre
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${d} de ${MESES[m - 1]}`
}

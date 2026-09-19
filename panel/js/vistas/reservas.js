/**
 * Reservas
 * ---------------------------------------------------------------------------
 * El dia partido en comida y cena, que es como se trabaja: son dos montajes de
 * sala distintos y nadie mira los dos a la vez.
 *
 * La zona sale en cada linea porque es lo que decide quien monta las mesas, y
 * el boton grande de abajo es para la reserva que entra por telefono, que en
 * este bar sigue siendo la mayoria.
 *
 * Se pide el rango entero de dias de una vez y se reparte aqui: asi el selector
 * de arriba puede pintar el punto de "este dia tiene reservas" sin una peticion
 * por dia, y cambiar de dia es instantaneo.
 */

import { el, pintar } from '../dom.js'
import { vacio, fallo, esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { filaReserva, ESTADOS_VIVOS } from '../piezas/reserva.js'
import { fichaReserva } from './ficha-reserva.js'
import { formularioReserva } from './formulario-reserva.js'
import { ajustesReservas } from './ajustes-reservas.js'
import { gestionaReservas, esAdmin } from '../sesion.js'
import { reservasEntre, buscarReservas } from '../datos.js'
import {
  hoyISO, masDias, diaDe, diaCorto, numeroDeDia, diaLargo, conMayuscula,
  diaRelativo, aMinutos, tramosCocina, diaYMes,
} from '../fechas.js'
import { icono } from '/compartido/js/iconos.js'

// Cuantos dias se ofrecen en la tira de arriba. Ayer entra porque a la manana
// siguiente todavia se cierran cosas del dia anterior ("¿vino la mesa de las
// diez?"), y dos semanas por delante es de sobra para un bar de barrio.
const DIAS_ATRAS = 1
const DIAS_ADELANTE = 13

export async function reservas(contenedor, estado) {
  const vista = {
    dia: estado.diaReservas || hoyISO(),
    buscando: false,
    texto: '',
    resultados: [],
    filas: [],
    error: null,
    cargando: true,
  }

  const desde = masDias(hoyISO(), -DIAS_ATRAS)
  const hasta = masDias(hoyISO(), DIAS_ADELANTE)

  function repintar() {
    estado.diaReservas = vista.dia
    pintar(contenedor, pantalla(vista, {
      recargar: () => cargar().then(repintar),
      irADia: (d) => { vista.dia = d; repintar() },
      alternarBusqueda: () => {
        vista.buscando = !vista.buscando
        if (!vista.buscando) { vista.texto = ''; vista.resultados = [] }
        repintar()
      },
      buscar: async (texto) => {
        vista.texto = texto
        vista.resultados = texto.trim().length < 2 ? [] : await buscarReservas(texto).catch(() => [])
        repintar()
      },
      nueva: () => formularioReserva({
        dia: vista.dia,
        horarioCocina: estado.ajustes?.horario_cocina,
        alGuardar: () => cargar().then(repintar),
      }),
      ajustes: () => ajustesReservas(estado, () => cargar().then(repintar)),
      horarioCocina: estado.ajustes?.horario_cocina,
      desde,
      hasta,
    }))
  }

  async function cargar() {
    vista.cargando = true
    try {
      vista.filas = await reservasEntre(desde, hasta)
      vista.error = null
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
  }

  repintar()
  await cargar()
  repintar()
}

// ---------------------------------------------------------------------------

function pantalla(vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Reservas', [
      { icono: 'buscar', titulo: 'Buscar una reserva', activo: vista.buscando, alPulsar: acc.alternarBusqueda },
      esAdmin() ? { icono: 'ajustes', titulo: 'Ajustes de reservas', alPulsar: acc.ajustes } : null,
    ]),

    el('div', { class: 'pantalla__scroll' },
      vista.buscando ? busqueda(vista, acc) : diaCompleto(vista, acc)),

    gestionaReservas()
      ? el('button', { type: 'button', class: 'flotante', onclick: acc.nueva, text: '+ Reserva a mano' })
      : null,

    nav('/reservas'),
  ])
}

function busqueda(vista, acc) {
  const campo = el('input', {
    class: 'entrada', type: 'search', value: vista.texto,
    placeholder: 'Nombre, teléfono o código', 'aria-label': 'Buscar una reserva',
    autocomplete: 'off',
  })
  // Se busca al soltar la tecla, no en cada pulsacion: el buscador va contra el
  // servidor y no hace falta una peticion por letra.
  let reloj = null
  campo.addEventListener('input', () => {
    clearTimeout(reloj)
    reloj = setTimeout(() => acc.buscar(campo.value), 300)
  })
  queueMicrotask(() => campo.focus())

  return [
    el('div', { class: 'margen margen--alto' }, [campo]),
    el('div', { class: 'margen' }, [
      vista.texto.trim().length < 2
        ? el('p', { class: 'vacio', text: 'Escribe al menos dos letras.' })
        : vista.resultados.length
          ? el('section', { class: 'tarjeta' }, [
            el('div', { class: 'filas' }, vista.resultados.map((r) => filaBuscada(r, acc)))])
          : el('p', { class: 'vacio', text: 'No hay ninguna reserva que encaje.' }),
      el('div', { style: 'height: calc(var(--alto-nav) + var(--sp-5) * 2)' }),
    ]),
  ]
}

/** En los resultados el dia importa tanto como la hora, asi que se dice. */
function filaBuscada(r, acc) {
  const dia = diaDe(r.fecha)
  return el('div', { class: 'resultado' }, [
    el('div', { class: 'resultado__dia', text: conMayuscula(diaRelativo(dia)) }),
    filaReserva(r, { alPulsar: gestionaReservas() ? (x) => fichaReserva(x, acc.recargar) : null }),
  ])
}

function diaCompleto(vista, acc) {
  const delDia = vista.filas.filter((r) => diaDe(r.fecha) === vista.dia)

  return [
    tiraDeDias(vista, acc),
    el('div', { class: 'margen' }, [
      el('p', { class: 'dia-elegido', text: conMayuscula(diaLargo(vista.dia)) }),

      vista.error
        ? fallo({
          texto: 'No se han podido cargar las reservas.',
          alReintentar: acc.recargar, err: vista.error, donde: 'reservas',
        })
        : vista.cargando && !vista.filas.length
          ? esqueletoFilas(4)
          : delDia.length
            ? grupos(delDia, acc)
            : vacio({
              texto: vista.dia === hoyISO()
                ? 'Aún no hay reservas para hoy'
                : `Aún no hay reservas para el ${diaYMes(vista.dia)}`,
              accion: gestionaReservas()
                ? el('button', { type: 'button', class: 'btn btn--linea', text: 'Apuntar una reserva', onclick: acc.nueva })
                : null,
            }),

      // Hueco para que el boton flotante y la barra no tapen la ultima linea.
      el('div', { style: 'height: calc(var(--alto-nav) + var(--sp-5) * 2)' }),
    ]),
  ]
}

function tiraDeDias(vista, acc) {
  const dias = []
  for (let i = -DIAS_ATRAS; i <= DIAS_ADELANTE; i++) dias.push(masDias(hoyISO(), i))

  // Un punto en los dias que tienen algo apuntado: se ve de un vistazo donde
  // esta el lio de la semana sin ir dia por dia.
  const conReservas = new Set(vista.filas
    .filter((r) => ESTADOS_VIVOS.includes(r.estado))
    .map((r) => diaDe(r.fecha)))

  return el('div', { class: 'tira', role: 'tablist', 'aria-label': 'Día' },
    dias.map((d) => {
      const puesto = d === vista.dia
      return el('button', {
        type: 'button', role: 'tab',
        class: `tira__dia${puesto ? ' tira__dia--puesto' : ''}`,
        'aria-selected': String(puesto),
        onclick: () => acc.irADia(d),
      }, [
        el('span', { class: 'tira__nombre', text: diaCorto(d) }),
        el('span', { class: 'tira__numero', text: numeroDeDia(d) }),
        conReservas.has(d)
          ? el('i', { class: 'tira__punto', 'aria-hidden': 'true' })
          : el('i', { class: 'tira__punto tira__punto--vacio', 'aria-hidden': 'true' }),
      ])
    }))
}

/**
 * Reparte el dia en servicios segun el horario de cocina.
 *
 * Con los dos tramos de este bar salen "Comida" y "Cena", que es lo que dice la
 * maqueta. Si algun dia hubiera tres, se numeran. Lo que cae fuera de la cocina
 * —una merienda, unas copas apuntadas por telefono— va a "Otras horas" en vez
 * de desaparecer: una reserva que no se ve es una mesa que no se monta.
 */
function grupos(delDia, acc) {
  const tramos = tramosCocina(acc.horarioCocina)
  const nombres = tramos.length === 2
    ? ['Comida', 'Cena']
    : tramos.map((_, i) => `Servicio ${i + 1}`)

  const cajones = tramos.map((t, i) => ({ nombre: nombres[i], tramo: t, lista: [] }))
  const otras = { nombre: 'Otras horas', tramo: null, lista: [] }

  for (const r of delDia) {
    const m = aMinutos(r.hora)
    // El tramo puede cruzar medianoche (cierra a las 01:00), y entonces sus
    // minutos pasan de 1440: se prueba tambien la hora sumandole un dia.
    const cajon = cajones.find(({ tramo }) =>
      (m >= tramo.abre && m < tramo.cierra) || (m + 1440 >= tramo.abre && m + 1440 < tramo.cierra))
    ;(cajon || otras).lista.push(r)
  }

  return [...cajones, otras]
    .filter((c) => c.lista.length)
    .map((c) => grupo(c, acc))
}

function grupo(cajon, acc) {
  const vivas = cajon.lista.filter((r) => ESTADOS_VIVOS.includes(r.estado))
  const personas = vivas.reduce((s, r) => s + (r.comensales || 0), 0)
  const resumen = vivas.length
    ? `${vivas.length} ${vivas.length === 1 ? 'mesa' : 'mesas'}, ${personas} ${personas === 1 ? 'persona' : 'personas'}`
    : 'sin mesas'

  return el('section', {}, [
    el('h2', { class: 'rotulo-seccion', text: `${cajon.nombre} · ${resumen}` }),
    el('div', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, cajon.lista.map((r) => filaReserva(r, {
        alPulsar: gestionaReservas() ? (x) => fichaReserva(x, acc.recargar) : null,
      }))),
    ]),
  ])
}

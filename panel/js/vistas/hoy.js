/**
 * Hoy
 * ---------------------------------------------------------------------------
 * Lo que Santi mira nada mas levantarse, en el orden en que le importa: cuanta
 * gente viene, que esta agotado y quien ha fichado.
 *
 * No hay ni un grafico. Es una pantalla que se lee de un vistazo con el movil
 * en una mano y el cafe en la otra; lo que se estudia con calma esta en
 * «La carta en numeros», que cuelga de «Más».
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoHoy } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { filaReserva, ESTADOS_VIVOS } from '../piezas/reserva.js'
import { tarjetaFaltas } from '../piezas/faltas.js'
import { fichaReserva } from './ficha-reserva.js'
import { BASE, ir } from '../enrutador.js'
import { nombreCorto, gestionaReservas } from '../sesion.js'
import {
  hoyISO, diaLargo, conMayuscula, saludo, horaLocal, diaDe, diaRelativo, aMinutos,
} from '../fechas.js'
import {
  reservasEntre, escaneosDe, platosOcultos, enTurnoAhora, avisosPendientes, resolverAviso,
  miFichaDeEmpleado, ficharEntrada, cerrarFichaje,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

export async function hoy(contenedor, estado) {
  const dia = hoyISO()

  pintar(contenedor, envoltorio(cabeceraSaludo(dia), esqueletoHoy()))

  let datos
  try {
    datos = await cargar(dia)
  } catch (err) {
    return pintar(contenedor, envoltorio(cabeceraSaludo(dia), fallo({
      texto: 'No se han podido cargar los datos de hoy.',
      alReintentar: () => hoy(contenedor, estado),
      err, donde: 'hoy',
    })))
  }

  estado.reservasDeHoy = datos.reservas
  pintar(contenedor, envoltorio(cabeceraSaludo(dia), cuerpo(datos, dia, () => hoy(contenedor, estado))))
}

async function cargar(dia) {
  // Las seis consultas van a la vez: son independientes y encadenarlas
  // multiplicaria por seis la espera en la conexion del bar.
  //
  // Cada una se resuelve por separado con un catch propio: si a alguien del
  // equipo la regla de acceso le tapa los fichajes, esa tarjeta se queda vacia
  // pero el resto de la pantalla se pinta igual. Una pantalla incompleta sirve;
  // una pantalla en blanco, no.
  const [reservas, escaneos, ocultos, turnos, avisos, ficha] = await Promise.all([
    reservasEntre(dia, dia),
    escaneosDe(dia).catch(() => null),
    platosOcultos().catch(() => []),
    enTurnoAhora().catch(() => []),
    avisosPendientes().catch(() => []),
    // Sin ficha de empleado no sale el boton de fichar; no es un error, es una
    // cuenta que no esta en el cuadrante.
    miFichaDeEmpleado().catch(() => null),
  ])
  return { reservas, escaneos, ocultos, turnos, avisos, ficha }
}

function envoltorio(...contenido) {
  return el('div', { class: 'pantalla' }, [
    el('div', { class: 'pantalla__scroll' }, contenido),
    nav('/'),
  ])
}

function cabeceraSaludo(dia) {
  return el('header', { class: 'saludo' }, [
    el('h1', { class: 'saludo__texto', text: `${saludo()}, ${nombreCorto()}` }),
    el('p', { class: 'saludo__fecha', text: conMayuscula(diaLargo(dia)) }),
  ])
}

function cuerpo(datos, dia, recargar) {
  const vivas = datos.reservas.filter((r) => ESTADOS_VIVOS.includes(r.estado))
  const comensales = vivas.reduce((suma, r) => suma + (r.comensales || 0), 0)

  return [
    contadores(vivas.length, comensales, datos.escaneos),
    avisoAgotados(datos.ocultos),
    el('div', { class: 'margen margen--alto' }, [
      proximas(vivas, recargar),
      faltas(datos, recargar),
      turnoAhora(datos, recargar),
      el('div', { style: 'height: var(--sp-5)' }),
    ]),
  ]
}

function contadores(reservas, comensales, escaneos) {
  return el('div', { class: 'casillas' }, [
    casilla(String(reservas), reservas === 1 ? 'reserva hoy' : 'reservas hoy', true),
    casilla(String(comensales), comensales === 1 ? 'comensal' : 'comensales'),
    // Sin contador todavia: el guion dice "no hay dato", no "cero".
    casilla(escaneos === null ? '—' : String(escaneos), 'escaneos QR'),
  ])
}

function casilla(numero, rotulo, acento = false) {
  return el('div', { class: `casilla${acento ? ' casilla--acento' : ''}` }, [
    el('div', { class: 'casilla__numero', text: numero }),
    el('div', { class: 'casilla__rotulo', text: rotulo }),
  ])
}

/**
 * Aviso de platos apagados.
 *
 * Solo sale si hay alguno, y dice DESDE CUANDO. Lo que preocupa no es que hoy
 * falten las croquetas: es que lleven una semana apagadas y nadie se haya
 * acordado de volver a encenderlas.
 */
function avisoAgotados(ocultos) {
  if (!ocultos.length) return null

  // Se nombran tres como mucho. Con veintidos agotados, la lista entera era un
  // parrafo de siete lineas que nadie lee: el dato es CUANTOS y DESDE CUANDO, y
  // los nombres estan en la carta, a un toque de aqui.
  const nombres = ocultos.map((p) => p.nombre)
  const lista = nombres.length <= 3
    ? (nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`)
    : `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más`

  // La fecha mas antigua de las que haya: es la que de verdad avisa.
  const desde = ocultos.map((p) => diaDe(p.oculto_desde)).filter(Boolean).sort()[0]

  return el('div', { class: 'aviso' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: ocultos.length === 1 ? 'Un plato sigue agotado' : `${ocultos.length} platos siguen agotados` }),
      el('span', { text: `${lista}. ${ocultos.length === 1 ? 'Lleva' : 'Llevan'} fuera de la carta`
        + (desde ? ` desde ${diaRelativo(desde)}.` : '.') }),
    ]),
  ])
}

/**
 * Las que quedan por llegar. Si ya han pasado todas —a las once de la noche,
 * por ejemplo— se ensenan las ultimas del dia en vez de una tarjeta vacia: a
 * esa hora lo que se quiere ver es quien ha venido.
 */
function proximas(vivas, recargar) {
  const ahora = new Date().getHours() * 60 + new Date().getMinutes()
  const porLlegar = vivas.filter((r) => (aMinutos(r.hora) ?? 0) >= ahora)
  const lista = (porLlegar.length ? porLlegar : vivas).slice(0, 4)

  return el('section', { class: 'tarjeta' }, [
    el('div', { class: 'tarjeta__cabeza' }, [
      el('h2', { class: 'tarjeta__titulo', text: porLlegar.length ? 'Próximas reservas' : 'Reservas de hoy' }),
      el('a', { class: 'tarjeta__enlace', href: `${BASE}/reservas`, text: 'Ver todas' }),
    ]),
    lista.length
      ? el('div', { class: 'filas' }, lista.map((r) => filaReserva(r, {
        alPulsar: gestionaReservas() ? (reserva) => fichaReserva(reserva, recargar) : null,
      })))
      : el('p', { class: 'vacio', text: 'Aún no hay reservas para hoy.' }),
  ])
}

/**
 * Lo que falta en el almacen.
 *
 * Sale SIEMPRE, tambien cuando no hay nada apuntado, por dos motivos: «el
 * almacen esta al dia» es una respuesta, no un hueco; y con la tarjeta viene el
 * boton de apuntar, que es el gesto principal de cocina en el sistema y tiene
 * que estar en la pantalla de entrada, no tres toques dentro.
 *
 * Va DESPUES de las reservas —que son el titular del dia— y antes de los
 * fichajes, siguiendo el orden de la maqueta: cuanta gente viene, que esta
 * agotado y quien ha fichado.
 */
function faltas(datos, recargar) {
  return tarjetaFaltas(datos.avisos, {
    alApuntar: () => ir('/almacen/falta'),
    // Se recarga la pantalla entera y no solo la tarjeta: resolver una falta
    // es raro, y asi lo que se ve despues es lo que hay en el servidor, no una
    // lista recortada aqui. Si falla, el boton se vuelve a habilitar solo.
    async alResolver(aviso) {
      await resolverAviso(aviso.id, true)
      recargar()
    },
  })
}

/**
 * Quien esta dentro, y el boton de fichar.
 *
 * EL BOTON ESTA AQUI Y NO EN PERSONAL a proposito, por el mismo motivo que
 * «Apuntar una falta» esta en esta pantalla y no solo en el almacen (D-46):
 * fichar es el primer gesto del dia y el ultimo de la noche, y se hace con el
 * movil en una mano mientras se levanta la persiana. Tres toques dentro de
 * Personal es donde van las cosas que se hacen una vez al mes.
 *
 * Solo sale si la cuenta tiene ficha de empleado enlazada: sin ella el servidor
 * rechazaria el fichaje, y un boton que da error al pulsarlo es peor que no
 * tenerlo. Y solo se ficha la entrada o la salida —nunca las dos a la vez—,
 * porque un fichaje abierto por persona es todo lo que admite el servidor.
 */
function turnoAhora(datos, recargar) {
  const mio = datos.ficha ? datos.turnos.find((f) => f.empleado === datos.ficha.id) : null

  return [
    el('h2', { class: 'rotulo-seccion', text: 'En turno ahora' }),
    el('section', { class: 'tarjeta' }, [
      datos.turnos.length
        ? el('div', { class: 'filas' }, datos.turnos.map((f) => el('div', { class: 'fichaje' }, [
          el('i', { class: 'fichaje__punto', 'aria-hidden': 'true' }),
          el('div', { class: 'fichaje__nombre', text: f.expand?.empleado?.nombre || 'Sin nombre' }),
          el('div', { class: 'fichaje__hora' }, [
            'desde ',
            el('b', { text: horaLocal(f.entrada) }),
          ]),
        ])))
        : el('p', { class: 'vacio', text: 'Ahora mismo no hay nadie fichado.' }),
      el('div', { class: 'tarjeta__pie fichar' }, [
        datos.ficha ? botonFichar(mio, recargar) : null,
        el('a', { class: 'tarjeta__enlace', href: `${BASE}/personal/fichajes`, text: 'Ver los fichajes' }),
      ]),
    ]),
  ]
}

function botonFichar(mio, recargar) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', {
    type: 'button',
    class: `btn ${mio ? 'btn--linea' : 'btn--primario'} btn--fila`,
    text: mio ? `Fichar la salida · entraste a las ${horaLocal(mio.entrada)}` : 'Fichar la entrada',
  })

  boton.addEventListener('click', async () => {
    // Apagado mientras tanto: dos toques seguidos serian dos fichajes, y el
    // segundo lo rechazaria el servidor con un error que no dice nada.
    boton.disabled = true
    boton.textContent = 'Un momento…'
    error.hidden = true
    try {
      if (mio) await cerrarFichaje(mio.id)
      else await ficharEntrada()
      recargar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = mio ? 'Fichar la salida' : 'Fichar la entrada'
      error.textContent = err?.response?.message || 'No hemos podido fichar. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  return [boton, error]
}

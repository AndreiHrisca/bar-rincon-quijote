/**
 * La linea de una reserva
 * ---------------------------------------------------------------------------
 * Se repite en "Hoy" y en "Reservas", asi que vive aqui una sola vez.
 *
 * El orden de la maqueta no es casual y se respeta: HORA grande a la izquierda
 * (es por lo que se busca cuando suena el telefono), nombre, cuantos son y en
 * que zona —que es lo que decide quien monta las mesas—, la nota si la hay, y
 * el estado en una pastilla a la derecha.
 */

import { el } from '../dom.js'

export const ESTADOS = {
  pendiente:  { texto: 'Sin confirmar', clase: 'pendiente' },
  confirmada: { texto: 'Confirmada',    clase: 'confirmada' },
  sentada:    { texto: 'Sentada',       clase: 'sentada' },
  no_vino:    { texto: 'No vino',       clase: 'no-vino' },
  cancelada:  { texto: 'Cancelada',     clase: 'cancelada' },
}

// Los que ocupan mesa. Mismo criterio que el servidor
// (pb_hooks/lib/reglas-reserva.js): una cancelada y un "no vino" no cuentan
// para el aforo ni para el recuento de comensales del dia.
export const ESTADOS_VIVOS = ['pendiente', 'confirmada', 'sentada']

const ZONAS = {
  barra: 'barra',
  terraza: 'terraza',
  salon: 'salón',
  indiferente: '',   // sin zona asignada: no se escribe nada
}

const MOTIVOS = {
  normal: '',
  cumpleanos: 'Cumpleaños',
  bautizo: 'Bautizo',
  comunion: 'Comunión',
  empresa: 'Comida de empresa',
}

export function textoZona(zona) {
  return ZONAS[zona] ?? zona ?? ''
}

export function textoMotivo(motivo) {
  return MOTIVOS[motivo] ?? ''
}

export function textoEstado(estado) {
  return ESTADOS[estado]?.texto || estado || ''
}

export function pastilla(estado) {
  const e = ESTADOS[estado] || { texto: estado, clase: 'pendiente' }
  return el('span', { class: `pastilla pastilla--${e.clase}`, text: e.texto })
}

/** "6 personas · terraza" — sin la zona cuando da igual dónde. */
export function resumenMesa(r) {
  const personas = `${r.comensales} ${r.comensales === 1 ? 'persona' : 'personas'}`
  const zona = textoZona(r.zona)
  return zona ? `${personas} · ${zona}` : personas
}

/** La nota que se pinta en granate: el motivo si lo hay, y lo que pidieran. */
export function notaDe(r) {
  return [textoMotivo(r.motivo), (r.notas || '').trim()].filter(Boolean).join(' · ')
}

/**
 * filaReserva(reserva, { alPulsar })
 *
 * Si se pasa alPulsar la fila es un boton (se abre la ficha); si no, es texto
 * corrido. Cocina y empleado no pueden tocar reservas, asi que a ellos se les
 * pinta sin boton: mejor eso que un boton que devuelve un 403.
 */
export function filaReserva(r, { alPulsar = null } = {}) {
  const nota = notaDe(r)
  const cuerpo = [
    el('div', { class: 'reserva__hora', text: r.hora }),
    el('div', { class: 'reserva__cuerpo' }, [
      el('div', { class: 'reserva__nombre', text: r.nombre }),
      el('div', { class: 'reserva__mesa', text: resumenMesa(r) }),
      nota ? el('div', { class: 'reserva__nota', text: nota }) : null,
    ]),
    pastilla(r.estado),
  ]

  const clase = `reserva${r.estado === 'cancelada' ? ' reserva--anulada' : ''}`

  return alPulsar
    ? el('button', { type: 'button', class: `${clase} reserva--pulsable`, onclick: () => alPulsar(r) }, cuerpo)
    : el('div', { class: clase }, cuerpo)
}

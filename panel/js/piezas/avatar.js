/**
 * El circulo con las iniciales
 * ---------------------------------------------------------------------------
 * El avatar del cuadrante de la maqueta: un circulo de color con dos o tres
 * letras dentro. Vive aqui porque sale en dos sitios —el cuadrante y la lista
 * del equipo— y porque el color no es decoracion: en una pantalla de 390 px con
 * cuatro turnos seguidos, el color es lo que deja ver de un vistazo que el
 * sabado de noche esta Lucia sola.
 *
 * El color lo trae la ficha (`empleados.color`, hexadecimal validado en la
 * migracion). Si no lo tiene, se cae al granate de la casa: mejor un circulo
 * granate de mas que un hueco.
 *
 * Es un adorno para el ojo, no informacion: las iniciales van con aria-hidden
 * porque el nombre entero esta escrito al lado, y un lector de pantalla que
 * lea "G, Genesis" no ayuda a nadie.
 */

import { el } from '../dom.js'

/**
 * El color se vuelve a comprobar aqui aunque la migracion ya le ponga un
 * patron: esto acaba dentro de un atributo `style`, y lo unico que garantiza
 * que ahi no entre nada raro es mirarlo en el sitio donde se escribe.
 */
const HEXADECIMAL = /^#[0-9A-Fa-f]{6}$/

export function avatar(empleado) {
  const letras = (empleado?.alias || empleado?.nombre || '?').slice(0, 3).toUpperCase()
  const color = HEXADECIMAL.test(empleado?.color || '') ? empleado.color : null
  return el('span', {
    class: 'avatar',
    'aria-hidden': 'true',
    style: color ? `background: ${color}` : null,
    text: letras,
  })
}

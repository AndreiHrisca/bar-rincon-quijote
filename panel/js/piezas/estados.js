/**
 * Vacío, cargando y error
 * ---------------------------------------------------------------------------
 * Las tres pantallas que tiene toda lista y que casi nunca se escriben. Están
 * aquí, juntas, porque diez vistas las repetían con diez redacciones distintas
 * y ninguna de las tres hacía bien su trabajo.
 *
 * VACÍO ES UNA INVITACIÓN, NO UNA DISCULPA. «No hay datos» le echa la culpa a
 * la pantalla. Lo que hay que decir es qué falta y cómo se pone, con el botón
 * al lado: quien abre reservas un martes por la mañana no ha encontrado un
 * error, ha encontrado un día sin reservas todavía.
 *
 * CARGANDO ES LA FORMA DE LO QUE VIENE. Un «Cargando…» centrado no dice nada y
 * mueve la página entera cuando llegan los datos. Un esqueleto con la silueta
 * del contenido dice cuánto va a venir y deja el sitio hecho, así que al llegar
 * no salta nada. Tampoco hay ruedas girando: si la silueta es la correcta, el
 * giro sobra.
 *
 * ERROR DICE QUÉ HA PASADO Y QUÉ HACER. Una frase y un botón de reintentar. El
 * error de PocketBase NO se pinta: viene en inglés, dice «Failed to fetch» y no
 * le sirve de nada a quien está detrás de la barra. Ese va a la consola, que es
 * donde lo busco yo.
 */

import { el } from '../dom.js'

/**
 * Vacío.
 *   vacio({ texto: 'Aún no hay reservas para hoy', accion: botonQueYaExiste })
 * `accion` es el botón que la pantalla ya tiene para crear: no se fabrica uno
 * nuevo, se trae el de arriba a donde está mirando la persona.
 */
export function vacio({ texto, pie = null, accion = null }) {
  return el('div', { class: 'estado' }, [
    el('p', { class: 'estado__texto', text: texto }),
    pie ? el('p', { class: 'estado__pie', text: pie }) : null,
    accion ? el('div', { class: 'estado__accion' }, [accion]) : null,
  ])
}

/**
 * Error.
 *   fallo({ alReintentar: cargar })
 *   fallo({ texto: 'No se han podido cargar las reservas.', alReintentar: cargar })
 *
 * `err` no se pinta nunca; se registra. Se pasa para que quede en la consola
 * con el nombre de la pantalla al lado.
 */
export function fallo({ texto = 'No se ha podido cargar.', alReintentar = null, err = null, donde = '' } = {}) {
  if (err) console.warn(`[quijote] ${donde || 'carga'}:`, err)

  return el('div', { class: 'estado estado--fallo', role: 'alert' }, [
    el('p', { class: 'estado__texto', text: texto }),
    alReintentar
      ? el('div', { class: 'estado__accion' }, [
        el('button', {
          type: 'button', class: 'btn btn--linea', text: 'Reintentar', onclick: alReintentar,
        }),
      ])
      : null,
  ])
}

// ---------------------------------------------------------------------------
// Esqueletos: la silueta de lo que va a aparecer
// ---------------------------------------------------------------------------

/**
 * Una tarjeta con `n` filas corrientes: un renglón ancho y otro corto debajo.
 * Sirve para reservas, cuentas, equipo, proveedores y almacén, que se pintan
 * todas con la misma fila.
 */
export function esqueletoFilas(n = 4) {
  return el('section', { class: 'tarjeta', 'aria-hidden': 'true' }, [
    el('div', { class: 'filas' }, repetir(n, () => el('div', { class: 'hueso-fila' }, [
      el('span', { class: 'hueso hueso--titulo' }),
      el('span', { class: 'hueso hueso--pie' }),
    ]))),
  ])
}

/**
 * `n` bloques de día con su cabecera y sus barras. Es la silueta de fichajes y
 * del cuadrante: lo que se ve mientras cargan es exactamente donde van a caer
 * la regleta y las filas.
 */
export function esqueletoDias(n = 3, filasPorDia = 3) {
  return repetir(n, () => el('div', { class: 'dia-barras', 'aria-hidden': 'true' }, [
    el('div', { class: 'dia-cab' }, [
      el('span', { class: 'hueso hueso--dia' }),
      el('span', { class: 'hueso hueso--resumen' }),
    ]),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'barra-dia' }, repetir(filasPorDia, () => el('div', { class: 'barra-fila' }, [
        el('span', { class: 'hueso hueso--nombre' }),
        el('span', { class: 'barra-fila__cuerpo' }, [
          el('span', { class: 'hueso hueso--eje' }),
          el('span', { class: 'hueso hueso--pie' }),
        ]),
      ]))),
    ]),
  ]))
}

/**
 * La carta: rótulo de categoría y platos con su columna de precio a la derecha.
 */
export function esqueletoCarta(grupos = 2, platos = 4) {
  return repetir(grupos, () => [
    el('span', { class: 'hueso hueso--rotulo', 'aria-hidden': 'true' }),
    el('section', { class: 'tarjeta', 'aria-hidden': 'true' }, [
      el('div', { class: 'filas' }, repetir(platos, () => el('div', { class: 'hueso-fila hueso-fila--precio' }, [
        el('span', { class: 'hueso-fila__cuerpo' }, [
          el('span', { class: 'hueso hueso--titulo' }),
          el('span', { class: 'hueso hueso--pie' }),
        ]),
        el('span', { class: 'hueso hueso--precio' }),
      ]))),
    ]),
  ])
}

/**
 * Lo que se pinta mientras carga «Hoy»: los tres contadores y una tarjeta.
 */
export function esqueletoHoy() {
  return [
    el('div', { class: 'casillas', 'aria-hidden': 'true' },
      repetir(3, () => el('div', { class: 'casilla' }, [
        el('span', { class: 'hueso hueso--numero' }),
        el('span', { class: 'hueso hueso--pie' }),
      ]))),
    esqueletoFilas(3),
  ]
}

function repetir(n, hacer) {
  return Array.from({ length: Math.max(0, n) }, (_, i) => hacer(i))
}

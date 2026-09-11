/**
 * Juego de iconos — El Rincón del Quijote
 * ---------------------------------------------------------------------------
 * UN SOLO ESTILO PARA TODO EL PROYECTO, web pública y panel. Antes eran una
 * mezcla: unos glifos Unicode de trazo fino (◷ ⌖ ⌕) y otros que iOS decide
 * pintar como emoji por su cuenta —el ☎ de la portada sale rojo y brillante,
 * que es lo primero que ve un cliente al escanear el QR—. Se veían de tamaños
 * distintos, de pesos distintos y de siglos distintos.
 *
 * LAS REGLAS, y no hay excepciones:
 *   viewBox 0 0 24 24 · fill="none" · stroke="currentColor" · grosor 1,5
 *   extremos y uniones redondos · ni un relleno sólido · un solo grosor por
 *   icono · nada tan fino que se pierda por debajo de 20 px.
 *
 * MARGEN ÓPTICO. Las formas cuadradas ocupan de 3 a 21; las redondas llegan a
 * r=9,5 (de 2,5 a 21,5). Un círculo del mismo tamaño que un cuadrado se ve más
 * pequeño, así que se le deja crecer medio píxel: es lo que hace que en la
 * rejilla todos parezcan iguales.
 *
 * EL COLOR SE HEREDA (`currentColor`). El mismo icono sirve en granate sobre
 * crema y en crema sobre granate, sin una segunda versión.
 *
 * SE MONTAN COMO SPRITE: un <svg> oculto con un <symbol> por icono, y se usan
 *   <svg class="ic"><use href="#ic-reloj"></use></svg>
 * La clase .ic gobierna el tamaño: 20 px por defecto, 24 en la barra inferior.
 *
 * NO SE USA innerHTML en ningún sitio de este fichero. El proyecto tiene esa
 * regla y no se rompe ni para marcado propio: todo se construye con
 * createElementNS, que además deja el sprite tipado y sin sorpresas.
 */

const SVG = 'http://www.w3.org/2000/svg'

/**
 * Cada icono es una lista de trazos. Un trazo es una `d` de <path>, o
 * ['circle', cx, cy, r]. Nada más: ni rectángulos con rx distintos, ni grupos,
 * ni transformaciones. Si un dibujo no cabe aquí, es que se está complicando.
 */
export const ICONOS = {

  // --- Portada y web pública ------------------------------------------------

  // Esfera y dos agujas. Las 10:10 no: las 4 en punto largas, que se leen mejor.
  reloj: [['circle', 12, 12, 9.5], 'M12 6.5V12l4 2.5'],

  // Auricular clásico. Es el único icono con curvas largas, y va así a
  // propósito: un móvil rectangular no dice «llámanos», dice «teléfono».
  telefono: [
    'M7.2 3.5H4.6A1.6 1.6 0 0 0 3 5.1 15.9 15.9 0 0 0 18.9 21a1.6 1.6 0 0 0 1.6-1.6v-2.6l-4.3-1.4-1.9 1.9a12.4 12.4 0 0 1-5.6-5.6l1.9-1.9z',
  ],

  // Gota y punto. La gota es un arco de circunferencia cerrado en punta.
  ubicacion: [
    'M12 21.5s7.3-6.6 7.3-11.4a7.3 7.3 0 1 0-14.6 0C4.7 14.9 12 21.5 12 21.5z',
    ['circle', 12, 10.1, 2.6],
  ],

  // Hoja con dos anillas y la línea de la cabecera.
  calendario: ['M3.5 6.5h17v14h-17z', 'M8 3.5v5', 'M16 3.5v5', 'M3.5 11.5h17'],

  // Espiga de trigo: el simbolo de la carta impresa para «contiene alergenos».
  //
  // SEGUNDO INTENTO, y esta anotado por si hace falta un tercero. El primero
  // dibujaba cinco granos como hojas cerradas y a 16 px se convertia en una
  // mancha. Este los hace con arcos abiertos, dos pares y la punta: cuatro
  // trazos menos, cada uno mas grande, y la silueta aguanta al reducir.
  alergeno: [
    'M12 21V5.5',
    'M12 12.5A5.5 5.5 0 0 0 6.5 7 5.5 5.5 0 0 0 12 12.5z',
    'M12 12.5A5.5 5.5 0 0 1 17.5 7 5.5 5.5 0 0 1 12 12.5z',
    'M12 17.5A4.5 4.5 0 0 0 7.5 13 4.5 4.5 0 0 0 12 17.5z',
    'M12 17.5A4.5 4.5 0 0 1 16.5 13 4.5 4.5 0 0 1 12 17.5z',
  ],

  // Globo: meridiano y ecuador. Nada de banderas.
  idioma: [
    ['circle', 12, 12, 9.5],
    'M2.5 12h19',
    'M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19z',
  ],

  // Tres esquinas y un módulo suelto: lo justo para que se lea «código QR».
  qr: [
    'M3.5 3.5h6v6h-6z', 'M14.5 3.5h6v6h-6z', 'M3.5 14.5h6v6h-6z',
    'M14.5 14.5h2.5v2.5h-2.5z', 'M20.5 14.5v2.5', 'M14.5 20.5h6',
  ],

  // --- Barra inferior del panel --------------------------------------------

  // Sol: el día de hoy. Se separa del calendario a propósito, que si no la
  // barra tendría dos calendarios seguidos.
  hoy: [
    ['circle', 12, 12, 4.5],
    'M12 2.5v2', 'M12 19.5v2', 'M2.5 12h2', 'M19.5 12h2',
    'M5.3 5.3l1.4 1.4', 'M17.3 17.3l1.4 1.4', 'M18.7 5.3l-1.4 1.4', 'M6.7 17.3l-1.4 1.4',
  ],

  // La carta: hoja con tres renglones.
  carta: ['M4.5 3.5h15v17h-15z', 'M8 8.5h8', 'M8 12h8', 'M8 15.5h5'],

  // Reservas: la misma esfera del reloj. Es la misma idea —una hora apuntada—
  // y darle otro dibujo sería enseñar dos cosas donde hay una.
  reservas: [['circle', 12, 12, 9.5], 'M12 6.5V12l4 2.5'],

  // Dos personas: el equipo.
  personal: [
    ['circle', 9.5, 8, 3.5],
    'M3.5 20.5a6 6 0 0 1 12 0',
    'M16 4.8a3.5 3.5 0 0 1 0 6.4',
    'M17.6 14.4a6 6 0 0 1 2.9 6.1',
  ],

  // Más: tres renglones.
  mas: ['M4 7h16', 'M4 12h16', 'M4 17h16'],

  // --- Resto del panel ------------------------------------------------------

  // Triángulo y admiración. El punto es un trazo de longitud cero: con el
  // extremo redondo sale un punto perfecto y sin relleno.
  aviso: ['M12 3.8 21.2 20H2.8z', 'M12 10v4', 'M12 17.2h.01'],

  // Puerta abierta y flecha que sale.
  salir: ['M14 3.5H3.5v17H14', 'M17 8.5l3.5 3.5-3.5 3.5', 'M20.5 12H9.5'],

  anadir: ['M12 4.5v15', 'M4.5 12h15'],

  // Lápiz. La punta y el cuerpo van en el mismo trazo; la virola, aparte.
  editar: ['M4 20l.9-3.7L16.7 4.5a2.1 2.1 0 0 1 2.9 2.9L7.7 19.1z', 'M14.8 6.4l2.9 2.9'],

  borrar: ['M3.5 6.5h17', 'M9.5 6.5V3.5h5v3', 'M6 6.5l1 14h10l1-14', 'M10 10.5v6', 'M14 10.5v6'],

  camara: ['M3.5 7.5h4L9 5h6l1.5 2.5h4v13h-17z', ['circle', 12, 13.5, 3.8]],

  descargar: ['M12 3.5v11', 'M7.5 10.5 12 15l4.5-4.5', 'M3.5 20.5h17'],

  buscar: [['circle', 10.5, 10.5, 6.5], 'M15.3 15.3 20.5 20.5'],

  chevron: ['M9 4.5 16.5 12 9 19.5'],

  // Caja de almacén, en isométrica: la tapa dice que hay algo dentro.
  almacen: ['M3.5 7.5 12 3.5l8.5 4v9L12 20.5l-8.5-4z', 'M3.5 7.5 12 11.5l8.5-4', 'M12 11.5v9'],

  // Falta de género: se acabó. Círculo tachado, que es como se dice «no queda»
  // en cualquier sitio sin escribirlo.
  falta: [['circle', 12, 12, 9.5], 'M5.3 5.3 18.7 18.7'],

  comprobado: ['M4.5 12.5 9.5 17.5 19.5 6.5'],

  // --- Tres que el encargo no listaba y hacian falta -----------------------
  // Sin ellos quedaban glifos sueltos por el codigo, que era justo lo que
  // veniamos a quitar.

  // Cerrar: la aspa del buscador de la carta y el sello de reserva anulada.
  cerrar: ['M5.5 5.5 18.5 18.5', 'M18.5 5.5 5.5 18.5'],

  // Ajustes de reservas. Rueda de seis dientes: con ocho, a 20 px se empasta.
  ajustes: [
    ['circle', 12, 12, 3.2],
    'M12 2.5v2.6', 'M12 18.9v2.6', 'M4.3 7.5l2.3 1.3', 'M17.4 15.2l2.3 1.3',
    'M4.3 16.5l2.3-1.3', 'M17.4 8.8l2.3-1.3',
  ],

  // Asidero de reordenar: seis puntos. Son trazos de longitud cero con el
  // extremo redondo, no circulos: asi el grosor manda y quedan del mismo peso
  // que el resto del juego.
  asidero: [
    'M9.5 6.5h.01', 'M14.5 6.5h.01', 'M9.5 12h.01',
    'M14.5 12h.01', 'M9.5 17.5h.01', 'M14.5 17.5h.01',
  ],
}

/** Los nombres, en el orden en que se dibujaron. Lo usa la rejilla de repaso. */
export const NOMBRES = Object.keys(ICONOS)

const COMUNES = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.5',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

/**
 * El sprite: un <svg> oculto con un <symbol> por icono. Se mete UNA VEZ al
 * principio del <body> y a partir de ahí los iconos se traen con <use>.
 */
export function sprite() {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden')

  for (const [nombre, trazos] of Object.entries(ICONOS)) {
    const sym = document.createElementNS(SVG, 'symbol')
    sym.setAttribute('id', `ic-${nombre}`)
    sym.setAttribute('viewBox', '0 0 24 24')
    for (const [k, v] of Object.entries(COMUNES)) sym.setAttribute(k, v)
    for (const trazo of trazos) sym.append(figura(trazo))
    svg.append(sym)
  }
  return svg
}

/**
 * Un icono suelto.
 *   icono('reloj')                        acompaña a un texto que ya lo dice
 *   icono('salir', { titulo: 'Salir' })   va solo: se anuncia
 *
 * ACCESIBILIDAD. Sin `titulo` el icono es decorativo y se oculta al lector de
 * pantalla: repetir «reloj» delante de la palabra «Horario» es ruido. Con
 * `titulo` se anuncia como imagen con nombre, que es lo que hace falta cuando
 * el icono es lo único que hay —el botón de cerrar sesión, por ejemplo—.
 */
export function icono(nombre, { titulo = null, clase = 'ic' } = {}) {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', clase)
  if (titulo) {
    svg.setAttribute('role', 'img')
    const t = document.createElementNS(SVG, 'title')
    t.textContent = titulo
    svg.append(t)
  } else {
    svg.setAttribute('aria-hidden', 'true')
  }
  const uso = document.createElementNS(SVG, 'use')
  uso.setAttribute('href', `#ic-${nombre}`)
  svg.append(uso)
  return svg
}

function figura(trazo) {
  if (Array.isArray(trazo)) {
    const [, cx, cy, r] = trazo
    const c = document.createElementNS(SVG, 'circle')
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r)
    return c
  }
  const p = document.createElementNS(SVG, 'path')
  p.setAttribute('d', trazo)
  return p
}

/**
 * Cliente de PocketBase — panel
 * ---------------------------------------------------------------------------
 * Aqui SI se usa el SDK oficial, al reves que en la carta publica. Alli eran
 * 35 KB para tres GET sin sesion y no salia a cuenta (DECISIONES.md, D-16);
 * aqui aporta lo que habria que reescribir a mano: sesion persistida, refresco
 * del token, escapado de filtros, subida de ficheros y el canal de tiempo real.
 * Ademas el panel se abre una vez por turno y se queda abierto, no se carga en
 * 3G en la puerta del bar.
 *
 * La copia esta en panel/vendor/ y no se pide a un CDN: la seccion 4 del
 * encargo prohibe recursos de terceros, y de paso el panel sigue funcionando si
 * cdn.jsdelivr.net se cae.
 */

import PocketBase from '../vendor/pocketbase.es.js'

export const pb = new PocketBase(window.location.origin)

// El SDK cancela sola la peticion anterior cuando se repite la misma llamada.
// Esta bien en un formulario que busca mientras se teclea, pero aqui las
// pantallas se repintan enteras (al cambiar de dia, al confirmar una reserva) y
// esa cancelacion aparece como un error que no lo es. Se apaga y cada vista se
// ocupa de no pedir dos veces lo mismo.
pb.autoCancellation(false)

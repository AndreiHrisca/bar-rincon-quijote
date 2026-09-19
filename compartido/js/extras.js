/**
 * Ingredientes extra — el importe, en un solo sitio
 * ---------------------------------------------------------------------------
 * FICHERO UNICO del precio del ingrediente extra, compartido por web/ (carta
 * publica) y panel/ (gestion), igual que compartido/css/tokens.css lo es de los
 * colores. Si este numero cambia, se cambia AQUI y en ningun otro sitio.
 *
 * Por que una constante y no un campo de la base:
 *
 *   - Es el mismo importe para todo el bar. No varia por plato ni por
 *     categoria, asi que como campo serian 278 copias del mismo 0,50 y subirlo
 *     a 0,60 seria tocar 278 filas.
 *
 *   - El sistema no cobra nada. No hay comandas ni caja: este numero solo se
 *     PINTA, en la carta y en el panel. Es un texto, no una operacion.
 *
 * Que hacer si algun dia tiene que poder cambiarlo Santi sin tocar codigo:
 * anadir `precio_ingrediente_extra` a la coleccion `ajustes` (que ya es de
 * lectura publica y de escritura solo del administrador) y dejar este valor como
 * respaldo para cuando la carta se ve sin conexion. Hoy no hace falta.
 *
 * Ver DECISIONES.md, D-79.
 */

/** Euros que se suman por CADA ingrediente extra. Lineal: 2 extras = 1,00 €. */
export const PRECIO_INGREDIENTE_EXTRA = 0.5

/**
 * El importe ya escrito: "0,50 €".
 *
 * Con coma decimal y el simbolo detras en los dos idiomas, igual que el resto
 * de precios de la carta: los numeros no se traducen (web/js/formato.js).
 */
export function importeExtra() {
  return `${PRECIO_INGREDIENTE_EXTRA.toFixed(2).replace('.', ',')} €`
}

/**
 * Cuándo se enfoca un campo solo
 * ---------------------------------------------------------------------------
 * UNA SOLA REGLA, en un solo sitio, porque estaba escrita a mano en tres
 * pantallas y en las tres se equivocaba igual.
 *
 * EL PROBLEMA. Abrir la ficha de alguien que YA existe enfocaba el campo de
 * nombre. En el móvil eso levanta el teclado, se come media pantalla, tapa
 * justo lo que se venía a mirar, y hay que cerrarlo a mano antes de poder leer
 * nada. Quien abre una ficha existente viene a CONSULTARLA, no a reescribir el
 * nombre.
 *
 * LA REGLA. Se enfoca solo si se dan las dos cosas:
 *
 *   1. Es un ALTA: el formulario está vacío y la persona viene de pulsar «+».
 *      Ahí sí, lo primero que va a hacer es teclear.
 *   2. El puntero es FINO: ratón o lápiz. Con un puntero fino no hay teclado
 *      que levantar y el foco solo ahorra un clic.
 *
 * En un móvil, `(pointer: fine)` es falso y no se enfoca nunca. Es
 * deliberado: en una pantalla táctil el foco automático nunca compensa.
 */

/** ¿Hay ratón o lápiz? En un móvil, no. */
export function punteroFino() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches
}

/**
 * Enfoca el campo solo si toca.
 *   enfocarAlta(nombre, esAlta)
 * Devuelve si ha enfocado, por si quien llama quiere hacer algo distinto.
 */
export function enfocarAlta(campo, esAlta) {
  if (!campo || !esAlta || !punteroFino()) return false
  campo.focus()
  return true
}

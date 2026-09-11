/**
 * Textos de las etiquetas informativas del plato
 * ---------------------------------------------------------------------------
 * Vive aparte de las vistas porque lo pintan DOS: la linea de la carta lo enseña
 * como una etiqueta pequeña, al lado de los alergenos, y la ficha del plato como
 * una nota bajo los precios grandes. La presentacion es distinta a proposito
 * —en la ficha hay sitio y la letra es grande— pero el TEXTO tiene que ser el
 * mismo, y componerlo dos veces es la forma segura de que un dia deje de serlo.
 *
 * El importe no se escribe aqui: sale de compartido/js/extras.js, que es el
 * unico sitio del proyecto donde vive el 0,50.
 */

import { t } from './idioma.js'
import { importeExtra } from '/compartido/js/extras.js'

/** "+0,50 € por ingrediente extra". La forma larga: ficha de plato y panel. */
export function textoExtra() {
  return `+${importeExtra()} ${t('porIngredienteExtra')}`
}

/**
 * "+0,50 € por ingrediente". La forma breve, para la linea de la carta.
 *
 * Se quita la palabra «extra» y solo ahi: en la columna de texto de una linea,
 * con la miniatura a la izquierda y los dos precios a la derecha, la forma larga
 * se parte en dos renglones y la etiqueta acaba abultando mas que las de
 * alergeno. Lo que hay que entender —que se suma medio euro por cada uno— se
 * entiende igual, y la frase entera esta a un toque, en la ficha.
 */
export function textoExtraBreve() {
  return `+${importeExtra()} ${t('porIngrediente')}`
}

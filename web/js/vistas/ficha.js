/**
 * Ficha de plato
 * ---------------------------------------------------------------------------
 * Se abre como hoja inferior SOBRE la carta, sin cambiar de pantalla: quien
 * mira la carta no pierde el sitio donde iba (seccion 6).
 *
 * Los dos precios se ven enteros y grandes, sin letra pequena. Es lo que evita
 * la discusion con la camarera cuando el cliente se sienta fuera.
 *
 * Sin foto, cae al bloque granate con la inicial, como en la maqueta.
 */

import { el, pintar } from '../dom.js'
import { t, campo, nombreAlergeno } from '../idioma.js'
import { precioConSimbolo } from '../formato.js'
import { urlFoto } from '../api.js'
import { textoExtra } from '../etiquetas.js'
import { contarPlato } from '../metricas.js'

let abierta = null
let devolverFocoA = null

export function abrirFicha(plato) {
  cerrarFicha()
  devolverFocoA = document.activeElement

  // Se cuenta que ESTE plato se ha mirado. Va el nombre y nada mas: ni quien,
  // ni cuando, ni desde donde (seccion 13). De aqui sale la lista de «platos
  // mas mirados» del panel.
  contarPlato(plato.nombre)

  const velo = el('div', { class: 'velo', onclick: cerrarFicha })
  const hoja = el('div', {
    class: 'hoja',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': campo(plato, 'nombre'),
    tabindex: '-1',
  }, [
    el('div', { class: 'hoja__asa', 'aria-hidden': 'true' }),
    ilustracion(plato),
    el('h2', { class: 'hoja__titulo', text: campo(plato, 'nombre') }),
    precios(plato),
    notaExtra(plato),
    descripcion(plato),
    alergenos(plato),
    el('button', { class: 'hoja__cerrar', type: 'button', text: t('cerrar'), onclick: cerrarFicha }),
  ])

  document.body.append(velo, hoja)
  // La pagina de detras no debe moverse mientras la hoja esta abierta.
  document.body.style.overflow = 'hidden'
  hoja.focus()

  abierta = { velo, hoja }
  document.addEventListener('keydown', alPulsarTecla)
}

export function cerrarFicha() {
  if (!abierta) return
  abierta.velo.remove()
  abierta.hoja.remove()
  abierta = null
  document.body.style.overflow = ''
  document.removeEventListener('keydown', alPulsarTecla)
  // El foco vuelve al plato desde el que se abrio: sin esto, quien navega con
  // teclado acaba al principio de la carta cada vez que cierra una ficha.
  if (devolverFocoA && devolverFocoA.isConnected) devolverFocoA.focus()
  devolverFocoA = null
}

function alPulsarTecla(e) {
  if (e.key === 'Escape') cerrarFicha()
}

/**
 * La foto del plato, entera y a su proporcion.
 *
 * NO SE RECORTA. Antes el hueco era una franja fija de 180 px con `cover`, o
 * sea que a una foto de plato hecha desde arriba —que es como se fotografia un
 * plato— se le comia la mitad. Ahora la imagen manda: se pide la miniatura de
 * 800 px de ancho (que PocketBase genera respetando la proporcion), se pinta al
 * ancho de la hoja y crece hasta 52 dvh de alto. Lo que pase de ahi —una foto
 * vertical de movil— se ajusta con `contain` sobre el degradado granate, que
 * enmarca en vez de dejar un hueco blanco.
 *
 * El minimo de 190 px es SOLO para el bloque de la inicial: una foto apaisada
 * no tiene por que estirarse a un alto que no le corresponde.
 */
function ilustracion(plato) {
  const foto = urlFoto(plato, '800x0')
  return el('div', { class: `hoja__foto${foto ? ' hoja__foto--con-imagen' : ''}` }, [
    foto
      ? el('img', {
          src: foto,
          alt: campo(plato, 'nombre'),
          loading: 'lazy',
          decoding: 'async',
        })
      // Sin foto: bloque granate con la inicial, como en la maqueta.
      : el('span', {
          class: 'hoja__inicial',
          'aria-hidden': 'true',
          text: (campo(plato, 'nombre')[0] || '·').toUpperCase(),
        }),
  ])
}

function precios(plato) {
  const columnas = [
    columnaPrecio(plato.precio_terraza ? t('barra') : t('precio'), plato.precio_barra),
  ]
  // Solo se ensena la segunda columna si de verdad hay precio de terraza. Nunca
  // se calcula: son dos numeros independientes.
  if (plato.precio_terraza) {
    columnas.push(columnaPrecio(t('terraza'), plato.precio_terraza))
  }
  return el('div', { class: 'precios-grandes' }, columnas)
}

function columnaPrecio(rotulo, valor) {
  return el('div', {}, [
    el('div', { class: 'precios-grandes__rotulo', text: rotulo.toUpperCase() }),
    el('div', { class: 'precios-grandes__valor', text: precioConSimbolo(valor) }),
  ])
}

/**
 * "+0,50 € por ingrediente extra", justo debajo de los precios grandes.
 *
 * Aqui no es una etiqueta pequeña como en la lista: en la ficha hay sitio y el
 * cliente esta decidiendo, asi que se lee de corrido y en el color del cobre,
 * que es el que la carta usa para lo que acompana a un precio sin ser un precio.
 */
function notaExtra(plato) {
  if (!plato.admite_extras) return null
  return el('p', { class: 'hoja__extra', text: textoExtra() })
}

function descripcion(plato) {
  const texto = campo(plato, 'descripcion')
  return texto ? el('p', { class: 'hoja__desc', text: texto }) : null
}

function alergenos(plato) {
  const lista = plato.alergenos || []
  if (!lista.length) return null

  return el('div', { class: 'hoja__alergenos' }, [
    el('h3', { class: 'hoja__alergenos-rotulo', text: t('contiene') }),
    el('div', { class: 'tags' }, lista.map((a) =>
      el('span', { class: 'tag', text: nombreAlergeno(a) }))),
  ])
}

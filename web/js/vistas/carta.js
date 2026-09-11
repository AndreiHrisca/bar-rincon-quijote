/**
 * Carta
 * ---------------------------------------------------------------------------
 * Toda la carta se descarga de una vez y se filtra EN EL CLIENTE (seccion 6):
 * el buscador y las categorias no vuelven al servidor. En 3G lenta eso es la
 * diferencia entre una carta que responde y una que se pelea con la red en cada
 * toque.
 *
 * Los dos precios van en columnas alineadas con la cabecera en versalita, como
 * en la carta impresa. Si un plato no tiene precio de terraza se muestra uno
 * solo: NO se calcula ningun recargo.
 */

import { el, pintar } from '../dom.js'
import { t, campo, nombreAlergeno } from '../idioma.js'
import { precio, normalizar } from '../formato.js'
import { abrirFicha } from './ficha.js'
import { urlFoto } from '../api.js'
import { ir } from '../enrutador.js'
// El texto del ingrediente extra se compone en un solo sitio: la ficha del plato
// lo enseña tambien, con otra pinta pero con las mismas palabras.
import { textoExtraBreve } from '../etiquetas.js'
import { contarBusquedaSinResultado, cancelarBusqueda } from '../metricas.js'
import { icono } from '/compartido/js/iconos.js'

// Estado de los filtros. Vive aqui y no en un global suelto.
const filtros = { categoria: null, busqueda: '' }

let datos = null
let nodoLista = null
let nodoChips = null

export function carta(contenedor, { carta: cartaDatos, sinConexion }) {
  datos = cartaDatos

  nodoChips = el('div', { class: 'chips', role: 'tablist', 'aria-label': t('carta') })
  nodoLista = el('div', { class: 'carta__lista' })

  pintar(contenedor,
    barraSuperior(),
    sinConexion ? el('p', { class: 'sin-conexion', text: t('sinConexion') }) : null,
    el('div', { class: 'carta' }, [
      el('div', { class: 'carta__filtros' }, [buscador(), nodoChips]),
      nodoLista,
    ]),
    el('div', { class: 'barra-baja' }, [
      el('a', { class: 'btn btn--primario', href: '/reserva', text: t('reservar') }),
    ]),
  )

  pintarChips()
  pintarPlatos()
}

function barraSuperior() {
  return el('header', { class: 'topbar' }, [
    el('a', {
      class: 'topbar__boton', href: '/', 'aria-label': t('volver'),
    }, [icono('chevron', { clase: 'ic ic--atras' })]),
    el('h1', { class: 'topbar__titulo', text: t('carta') }),
    el('button', {
      class: 'topbar__boton',
      'aria-label': t('cambiarIdioma'),
      text: t('carta') === 'Carta' ? 'ES' : 'EN',
      onclick: () => document.dispatchEvent(new CustomEvent('quijote:idioma')),
    }),
  ])
}

function buscador() {
  const campoTexto = el('input', {
    class: 'buscador__campo',
    type: 'search',
    id: 'buscador',
    placeholder: t('buscarPlato'),
    'aria-label': t('buscarPlato'),
    value: filtros.busqueda,
    oninput: (e) => {
      filtros.busqueda = e.target.value
      pintarPlatos()
      botonLimpiar.hidden = !filtros.busqueda
    },
  })

  const botonLimpiar = el('button', {
    class: 'buscador__limpiar',
    type: 'button',
    'aria-label': t('limpiar'),
    hidden: !filtros.busqueda,
    onclick: () => {
      filtros.busqueda = ''
      campoTexto.value = ''
      botonLimpiar.hidden = true
      campoTexto.focus()
      pintarPlatos()
    },
  })

  return el('div', { class: 'buscador' }, [
    icono('buscar', { clase: 'ic buscador__icono' }),
    campoTexto,
    botonLimpiar,
  ])
}

function pintarChips() {
  // Solo salen las categorias que de verdad tienen algun plato visible: una
  // pestana que lleva a una lista vacia es peor que no tenerla.
  const conPlatos = datos.categorias.filter(
    (c) => datos.platos.some((p) => p.categoria === c.id))

  pintar(nodoChips,
    chip(null, t('todas')),
    ...conPlatos.map((c) => chip(c.id, campo(c, 'nombre'))),
  )
}

function chip(id, texto) {
  const activa = filtros.categoria === id
  return el('button', {
    class: 'chip',
    type: 'button',
    role: 'tab',
    'aria-selected': String(activa),
    text: texto,
    onclick: (e) => {
      filtros.categoria = id
      pintarChips()
      pintarPlatos()
      // Se deja la pestana elegida a la vista: en 390 px el carrusel se sale.
      e.target.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    },
  })
}

/** Un plato encaja si coincide el nombre, la descripcion O un alergeno. */
function coincide(plato, aguja) {
  if (!aguja) return true
  const enAlergenos = (plato.alergenos || [])
    .some((a) => normalizar(nombreAlergeno(a)).includes(aguja))
  return normalizar(campo(plato, 'nombre')).includes(aguja)
      || normalizar(campo(plato, 'descripcion')).includes(aguja)
      || enAlergenos
}

function pintarPlatos() {
  const aguja = normalizar(filtros.busqueda.trim())

  const visibles = datos.platos.filter((p) =>
    (!filtros.categoria || p.categoria === filtros.categoria) && coincide(p, aguja))

  if (!visibles.length) {
    // «Buscado y no encontrado»: la metrica que de verdad le sirve a Santi, que
    // le dice que le piden y no tiene. Solo cuenta si habia algo escrito —una
    // carta vacia por un fallo de red no es una busqueda sin resultado— y el
    // envio espera a que la persona termine de teclear (ver metricas.js).
    if (filtros.busqueda.trim() && datos.platos.length) {
      contarBusquedaSinResultado(filtros.busqueda)
    }
    pintar(nodoLista, el('div', { class: 'vacio' }, [
      el('p', { class: 'vacio__titulo', text: datos.platos.length ? t('sinResultadosTitulo') : t('cartaVaciaTitulo') }),
      el('p', { class: 'vacio__texto', text: datos.platos.length ? t('sinResultadosTexto') : t('cartaVaciaTexto') }),
    ]))
    return
  }

  // Habia resultados: se cancela el envio que estuviera esperando. Quien busca
  // "cro" y sigue hasta "croquetas" no ha buscado nada que no exista.
  cancelarBusqueda()

  // Se agrupa por categoria respetando el orden de las categorias.
  const secciones = datos.categorias
    .map((c) => ({ categoria: c, platos: visibles.filter((p) => p.categoria === c.id) }))
    .filter((s) => s.platos.length)

  // Platos cuya categoria ya no esta visible: no se pierden, van al final.
  const sueltos = visibles.filter((p) => !datos.categorias.some((c) => c.id === p.categoria))
  if (sueltos.length) secciones.push({ categoria: null, platos: sueltos })

  pintar(nodoLista, ...secciones.map(seccion))
}

function seccion({ categoria, platos }) {
  // La cabecera "Barra / Terraza / Salón" solo tiene sentido si en esta seccion hay al
  // menos un plato con los dos precios.
  const hayDoblePrecio = platos.some((p) => p.precio_terraza)

  return el('section', {}, [
    categoria
      ? el('div', { class: 'seccion__banda' }, [
          el('h2', { class: 'seccion__cartel', text: campo(categoria, 'nombre') }),
        ])
      : null,

    hayDoblePrecio
      ? el('div', { class: 'cab-precios', 'aria-hidden': 'true' }, [
          el('span', { text: t('barra') }),
          el('span', { text: enDosLineas(t('terraza')) }),
        ])
      : null,

    el('div', { class: 'lista' }, platos.map((p) => filaPlato(p, hayDoblePrecio))),
  ])
}

/**
 * La miniatura de la linea: se ve de que va el plato sin abrirlo.
 *
 * TRES COSAS QUE NO SON ADORNO:
 *
 *  1. `loading="lazy"`. La carta del bar son 278 platos en una sola pagina. Sin
 *     esto, abrirla pediria 278 imagenes de golpe por la red del movil, que es
 *     exactamente el escenario que el proyecto lleva evitando desde el primer
 *     dia (3G, QR en la mesa). Con lazy solo se descargan las que entran en
 *     pantalla. `decoding="async"` va con ello: descodificar no bloquea el
 *     desplazamiento.
 *
 *  2. Se pide la miniatura de 400 px, no el original. La foto original ronda el
 *     megabyte; para un hueco de 48 px eso es tirar la conexion del cliente. Es
 *     el mismo recorte que ya usaba el panel, no hay nada nuevo que generar.
 *
 *  3. El hueco SE OCUPA SIEMPRE, con foto o sin ella. Hoy casi ningun plato
 *     tiene foto: si el hueco solo apareciera en los que la tienen, la lista
 *     quedaria con los nombres bailando de linea en linea. El sustituto es un
 *     bloque discreto con la inicial —el mismo gesto que la ficha, pero en
 *     neutro y no en granate: noventa cuadrados granates seguidos serian un
 *     grito, y ademas dirian «mira aqui» de algo que no hay que mirar.
 */
function miniatura(plato) {
  const foto = urlFoto(plato, '400x0')
  const nombre = campo(plato, 'nombre')

  return el('span', { class: 'plato__foto', 'aria-hidden': 'true' }, [
    foto
      ? el('img', {
          src: foto,
          // La linea entera ya se anuncia con el nombre del plato: repetirlo en
          // el alt haria que el lector de pantalla lo dijese dos veces. Por eso
          // el envoltorio es aria-hidden y el alt va vacio.
          alt: '',
          loading: 'lazy',
          decoding: 'async',
        })
      : el('span', { class: 'plato__inicial', text: (nombre[0] || '·').toUpperCase() }),
  ])
}

/**
 * «Terraza / Salón» no cabe de una linea en una columna de 54 px, asi que se
 * parte. Se pega la barra a la palabra de abajo —«Terraza» / «/ Salón»— y no al
 * reves: una linea que termina en una barra suelta se lee como un error de
 * maquetacion. El unico espacio que queda partible es el de despues de
 * «Terraza», asi que el salto cae siempre en el mismo sitio.
 */
function enDosLineas(rotulo) {
  return rotulo.replace('/ ', '/\u00A0')
}

function filaPlato(plato, hayDoblePrecio) {
  const descripcion = campo(plato, 'descripcion')

  return el('button', {
    class: 'plato',
    type: 'button',
    onclick: () => abrirFicha(plato),
  }, [
    miniatura(plato),
    el('span', { class: 'plato__txt' }, [
      el('span', { class: 'plato__nombre', text: campo(plato, 'nombre') }),
      descripcion ? el('span', { class: 'plato__desc', text: descripcion }) : null,
      etiquetas(plato),
    ]),
    ...columnasPrecio(plato, hayDoblePrecio),
  ])
}

/**
 * La fila de etiquetas informativas del plato: primero los alergenos y despues,
 * si lo admite, el aviso del ingrediente extra.
 *
 * El aviso va AQUI y no dentro de la descripcion a proposito. La descripcion la
 * escribe quien da de alta el plato y dice lo que lleva; esto es una condicion
 * de venta y la pone el sistema. Metido en el texto se perderia entre los
 * ingredientes, y ademas habria que reescribirlo en 40 platos el dia que el
 * importe cambie.
 *
 * Los alergenos van primero: son obligatorios por ley y no se les quita el
 * sitio que ya tenian.
 */
function etiquetas(plato) {
  const alergenos = plato.alergenos || []
  if (!alergenos.length && !plato.admite_extras) return null

  return el('span', { class: 'tags' }, [
    ...alergenos.map((a) => el('span', { class: 'tag', text: nombreAlergeno(a) })),
    plato.admite_extras ? etiquetaExtra() : null,
  ])
}

/** "+0,50 € por ingrediente", con la misma pinta que las de alergeno. */
function etiquetaExtra() {
  return el('span', { class: 'tag tag--extra', text: textoExtraBreve() })
}

/**
 * Las dos columnas de precio. Se usa aria-label para que un lector de pantalla
 * diga "barra 14 euros" en vez de leer un numero suelto sin contexto.
 */
function columnasPrecio(plato, hayDoblePrecio) {
  const barra = el('span', {
    class: 'plato__precio' + (plato.precio_terraza || !hayDoblePrecio ? '' : ' plato__precio--unico'),
    text: precio(plato.precio_barra),
    'aria-label': `${hayDoblePrecio ? t('barra') : t('precio')} ${precio(plato.precio_barra)} euros`,
  })

  if (!plato.precio_terraza) {
    // Un solo precio: ocupa el ancho de las dos columnas para no dejar un hueco
    // que se lea como "falta un dato".
    if (hayDoblePrecio) barra.className = 'plato__precio plato__precio--unico'
    return [barra]
  }

  return [barra, el('span', {
    class: 'plato__precio plato__precio--terraza',
    text: precio(plato.precio_terraza),
    'aria-label': `${t('terraza')} ${precio(plato.precio_terraza)} euros`,
  })]
}

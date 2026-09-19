/**
 * Carta
 * ---------------------------------------------------------------------------
 * La lista de platos por categorias, con los dos precios a la vista y el
 * interruptor a la derecha.
 *
 * EL GESTO DE CADA DIA ES EL INTERRUPTOR: se acaban las croquetas y se apagan
 * desde la barra, en un toque, sin abrir el plato y sin borrar nada. Por eso
 * guarda al momento y por eso la linea dice desde cuando lleva apagado un
 * plato: lo que preocupa no es que hoy falten, es que lleven una semana
 * apagadas y nadie se acuerde de encenderlas.
 *
 * Cocina y empleado ven la carta pero no la tocan (seccion 7): a ellos se les
 * pinta sin asidero, sin interruptor y sin el boton de plato nuevo, que es
 * exactamente lo que dicen las reglas de la coleccion.
 */

import { el, pintar } from '../dom.js'
import { vacio, fallo, esqueletoCarta } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { interruptor } from '../piezas/interruptor.js'
import { hacerReordenable, asidero } from '../piezas/reordenar.js'
import { gestionaCarta } from '../sesion.js'
import { ir } from '../enrutador.js'
import { cargarCarta, guardarPlato, guardarOrden } from '../datos.js'
import { diaDe, diaRelativo } from '../fechas.js'
import { precio, precioOpcional } from '../formato.js'
import { icono } from '/compartido/js/iconos.js'

export function puedeEditarCarta() {
  return gestionaCarta()
}

/**
 * Que categorias estan plegadas. Guarda IDS, no indices.
 *
 * Vive en el modulo y no dentro de la vista A PROPOSITO: al tocar un plato se
 * sale de esta pantalla, y al volver la vista se construye de cero. Con el
 * estado dentro, quien pliega catorce categorias para llegar a «Postres» se las
 * encuentra desplegadas otra vez en cuanto edita un postre. Al recargar la
 * pagina se olvida, que es lo que se espera de un pliegue.
 *
 * Es solo pintado: ni los datos ni la descarga de la carta dependen de esto.
 */
const colapsadas = new Set()

export async function carta(contenedor, estado) {
  const vista = {
    buscando: false,
    texto: '',
    error: null,
    aviso: null,
    cargando: !estado.carta,
  }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    alternarBusqueda() {
      vista.buscando = !vista.buscando
      if (!vista.buscando) vista.texto = ''
      repintar()
    },
    buscar(texto) {
      vista.texto = texto
      repintar()
    },
    nuevo() { ir('/carta/nuevo') },
    abrir(plato) { ir(`/carta/${plato.id}`) },
    recargar() { cargar() },

    /** Pliega o despliega una categoria. No toca la base ni vuelve a descargar. */
    alternarCategoria(id) {
      if (colapsadas.has(id)) colapsadas.delete(id)
      else colapsadas.add(id)
      repintar()
    },

    /**
     * Todas de golpe. Un solo boton y no dos: con quince categorias, lo que se
     * quiere es lo contrario de lo que hay. Si queda alguna abierta, cierra
     * todas; si no queda ninguna, las abre.
     */
    alternarTodas(ids) {
      if (ids.every((id) => colapsadas.has(id))) colapsadas.clear()
      else ids.forEach((id) => colapsadas.add(id))
      repintar()
    },

    /** El interruptor de la linea. Devuelve promesa: si falla, se vuelve solo. */
    async cambiarVisible(plato, visible) {
      try {
        const guardado = await guardarPlato(plato.id, { visible })
        Object.assign(plato, guardado)
        vista.aviso = null
        // Se repinta para que la linea se apague y aparezca el "oculto desde",
        // que lo escribe el servidor y aqui no se sabria calcular.
        repintar()
      } catch (err) {
        vista.aviso = err?.status === 403
          ? 'Tu cuenta no puede cambiar la carta.'
          : 'No hemos podido guardar el cambio.'
        repintar()
        throw err
      }
    },

    async reordenar(categoriaId, idsEnOrden) {
      const porId = new Map(estado.carta.platos.map((p) => [p.id, p]))
      const ordenados = idsEnOrden.map((id) => porId.get(id)).filter(Boolean)
      try {
        await guardarOrden(ordenados)
        vista.aviso = null
      } catch (err) {
        vista.aviso = 'No hemos podido guardar el orden. Vuelve a intentarlo.'
        repintar()
      }
    },
  }

  // En una funcion con nombre para que «Reintentar» pueda volver a llamarla.
  async function cargar() {
    vista.cargando = true
    repintar()
    try {
      estado.carta = await cargarCarta()
      vista.error = null
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  repintar()
  cargar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  // El boton de plegar todas solo tiene sentido en el listado y con mas de una
  // categoria. Buscando no hay categorias que plegar.
  const grupos = vista.buscando ? [] : gruposDe(estado)
  const ids = grupos.map((g) => g.categoria.id)
  const todasPlegadas = ids.length > 0 && ids.every((id) => colapsadas.has(id))

  return el('div', { class: 'pantalla' }, [
    cabecera('Carta', [
      grupos.length > 1
        ? {
          icono: 'chevron',
        // Mismo chevron, girado: hacia abajo cuando esta plegado, hacia arriba
        // cuando esta abierto. Un solo dibujo para los dos estados.
        clase: todasPlegadas ? 'ic ic--abajo' : 'ic ic--arriba',
          titulo: todasPlegadas ? 'Abrir todas las categorías' : 'Cerrar todas las categorías',
          alPulsar: () => acc.alternarTodas(ids),
        }
        : null,
      { icono: 'buscar', titulo: 'Buscar un plato', activo: vista.buscando, alPulsar: acc.alternarBusqueda },
      puedeEditarCarta() ? { icono: 'anadir', titulo: 'Plato nuevo', activo: true, alPulsar: acc.nuevo } : null,
    ]),

    el('div', { class: 'pantalla__scroll' }, [
      vista.aviso ? el('p', { class: 'hoja__error', role: 'alert', text: vista.aviso }) : null,
      vista.buscando ? busqueda(estado, vista, acc) : listado(estado, vista, acc),
    ]),

    nav('/carta'),
  ])
}

function busqueda(estado, vista, acc) {
  const campo = el('input', {
    class: 'entrada', type: 'search', value: vista.texto,
    placeholder: 'Nombre del plato', 'aria-label': 'Buscar un plato',
    autocomplete: 'off',
  })
  // La carta entera ya esta descargada, asi que se filtra aqui mismo: sin
  // esperas y sin una peticion por letra.
  campo.addEventListener('input', () => acc.buscar(campo.value))
  queueMicrotask(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length) })

  const texto = normalizar(vista.texto)
  const encontrados = texto.length < 2
    ? []
    : (estado.carta?.platos || []).filter((p) => normalizar(p.nombre).includes(texto))

  return [
    el('div', { class: 'margen margen--alto' }, [campo]),
    el('div', { class: 'margen' }, [
      texto.length < 2
        ? el('p', { class: 'vacio', text: 'Escribe al menos dos letras.' })
        : encontrados.length
          ? el('section', { class: 'tarjeta' }, [
            cabeceraPrecios(),
            el('div', { class: 'filas' }, encontrados.map((p) => filaPlato(p, acc, { conAsidero: false }))),
          ])
          : el('p', { class: 'vacio', text: 'Ningún plato se llama así.' }),
      el('div', { style: 'height: var(--sp-5)' }),
    ]),
  ]
}

/**
 * Los grupos de la pantalla: cada categoria con sus platos.
 *
 * Lo arma la cabecera (para saber cuantas categorias hay que plegar) y lo arma
 * el listado (para pintarlas). Se calcula en un solo sitio para que las dos
 * cuenten lo mismo, incluido el grupo de los huerfanos.
 */
function gruposDe(estado) {
  const { categorias = [], platos = [] } = estado.carta || {}

  const grupos = categorias
    .map((c) => ({ categoria: c, lista: platos.filter((p) => p.categoria === c.id) }))
    .filter((g) => g.lista.length)

  // Un plato cuya categoria ya no existe no puede desaparecer de la pantalla:
  // seguiria en la base y nadie sabria por que no sale en la carta.
  const conCategoria = new Set(categorias.map((c) => c.id))
  const huerfanos = platos.filter((p) => !conCategoria.has(p.categoria))
  if (huerfanos.length) {
    grupos.push({ categoria: { id: '', nombre: 'Sin categoría', visible: true }, lista: huerfanos })
  }

  return grupos
}

function listado(estado, vista, acc) {
  if (vista.error) {
    return fallo({
      texto: 'No se ha podido cargar la carta.',
      alReintentar: acc.recargar, err: vista.error, donde: 'carta',
    })
  }
  if (vista.cargando) return el('div', { class: 'margen margen--alto' }, esqueletoCarta())

  const grupos = gruposDe(estado)

  if (!grupos.length) {
    return vacio({
      texto: 'Aún no hay ningún plato en la carta',
      pie: 'Se puede importar entera desde un CSV.',
      accion: puedeEditarCarta() ? el('button', { type: 'button', class: 'btn btn--linea', text: 'Añadir el primer plato', onclick: acc.nuevo }) : null,
    })
  }

  return el('div', { class: 'margen margen--alto' }, [
    avisoSinPrecio(estado),
    ...grupos.map((g) => grupo(g, acc)),
    el('div', { style: 'height: var(--sp-5)' }),
  ])
}

/**
 * El aviso de los platos sin precio, arriba y una sola vez.
 *
 * La carta del bar se cargo entera sin precios, asi que la explicacion no puede
 * ir repetida en cada una de las 278 lineas: ahi solo cabe «Sin precio». Lo que
 * hay que entender —que sin precio no salen a la calle, y que por eso hay que
 * ponerlos— se dice aqui, contando cuantos faltan.
 */
function avisoSinPrecio(estado) {
  const sin = (estado.carta?.platos || []).filter((p) => !(p.precio_barra > 0)).length
  if (!sin) return null

  return el('div', { class: 'aviso' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: sin === 1 ? 'Un plato sin precio' : `${sin} platos sin precio` }),
      el('span', { text: sin === 1
        ? 'No sale en la carta pública hasta que le pongas precio.'
        : 'No salen en la carta pública hasta que tengan precio. Ponlos plato a plato '
          + 'o de una vez importando el CSV.' }),
    ]),
  ])
}

function grupo({ categoria, lista }, acc) {
  const filas = el('div', { class: 'filas' },
    lista.map((p) => filaPlato(p, acc, { conAsidero: puedeEditarCarta() })))

  if (puedeEditarCarta() && categoria.id) {
    hacerReordenable(filas, { alSoltar: (ids) => acc.reordenar(categoria.id, ids) })
  }

  const plegada = colapsadas.has(categoria.id)
  const idCuerpo = `platos-de-${categoria.id || 'sin-categoria'}`

  // El cuerpo se PINTA siempre y se esconde con [hidden], en vez de no pintarlo:
  // asi `aria-controls` apunta a algo que existe de verdad, que es lo que hace
  // que un lector de pantalla anuncie «contraido» y sepa a que se refiere.
  const cuerpo = el('div', { id: idCuerpo, hidden: plegada || undefined }, [
    cabeceraPrecios(),
    filas,
  ])

  return el('section', { class: 'tarjeta tarjeta--suelta' }, [
    // El boton va DENTRO del encabezado y no al reves: un <h2> dentro de un
    // <button> no es marcado valido, y sin el <h2> se pierde el indice de la
    // pantalla para quien navega por encabezados.
    el('h2', { class: 'grupo-titulo' }, [
      el('button', {
        type: 'button',
        class: 'grupo',
        'aria-expanded': String(!plegada),
        'aria-controls': idCuerpo,
        onclick: () => acc.alternarCategoria(categoria.id),
      }, [
        icono('chevron', { clase: `ic grupo__glifo ${plegada ? '' : 'ic--abajo'}` }),
        el('span', { class: 'grupo__nombre', text: categoria.nombre }),
        el('span', { class: 'grupo__cuenta', text:
          `${lista.length} ${lista.length === 1 ? 'plato' : 'platos'}${categoria.visible === false ? ' · categoría oculta' : ''}` }),
      ]),
    ]),
    cuerpo,
  ])
}

/**
 * Los rotulos de las dos columnas de precio.
 *
 * «Terraza / Salón» es el mismo precio de siempre dicho entero: las dos zonas
 * comparten tarifa y el rotulo solo decia una. No cambia ningun campo (el de la
 * base sigue siendo `precio_terraza`) ni ningun importe. D-80.
 *
 * Va partido en dos lineas con un espacio duro entre la barra y «Salón», para
 * que el salto no deje una barra suelta al final de la primera.
 */
function cabeceraPrecios() {
  // Cocina y empleado ven la carta sin interruptor, y entonces los rotulos no
  // tienen que apartarse nada.
  const clase = puedeEditarCarta()
    ? 'columnas-precio columnas-precio--con-interruptor'
    : 'columnas-precio'

  return el('div', { class: clase, 'aria-hidden': 'true' }, [
    el('span', { text: 'Barra' }),
    el('span', { text: 'Terraza /\u00A0Salón' }),
  ])
}

function filaPlato(plato, acc, { conAsidero }) {
  const oculto = !plato.visible
  const desde = diaDe(plato.oculto_desde)
  // Cero es «todavia sin precio», no «gratis»: PocketBase guarda como 0 un
  // campo numerico vacio (D-53, y ahora tambien D-76).
  const sinPrecio = !(plato.precio_barra > 0)

  return el('div', {
    class: `fila-plato${oculto ? ' fila-plato--apagada' : ''}`,
    'data-id': plato.id,
  }, [
    conAsidero ? asidero(plato.nombre) : null,

    // Abrir el plato es un boton aparte del interruptor y del asidero: tres
    // controles hermanos, ninguno dentro de otro. Un boton dentro de otro no es
    // marcado valido y con teclado se vuelve un enredo.
    el(puedeEditarCarta() ? 'button' : 'div', {
      class: 'fila-plato__abrir',
      onclick: puedeEditarCarta() ? () => acc.abrir(plato) : null,
    }, [
      el('span', { class: 'fila-plato__cuerpo' }, [
        el('span', { class: 'fila-plato__nombre', text: plato.nombre }),
        // Un plato sin precio no sale en la carta publica aunque este
        // encendido: lo tapa la regla de la coleccion (D-76). Se dice aqui, en
        // la linea, porque es lo que hay que arreglar; el interruptor de al
        // lado no lo puede arreglar.
        sinPrecio
          ? el('span', { class: 'fila-plato__pie fila-plato__pie--falta', text: 'Sin precio' })
          : oculto
            ? el('span', { class: 'fila-plato__pie', text: desde ? `Oculto desde ${diaRelativo(desde)}` : 'Oculto' })
            : null,
      ]),
      el('span', { class: 'fila-plato__precios' }, [
        el('span', { text: sinPrecio ? '—' : precio(plato.precio_barra) }),
        el('span', { class: 'fila-plato__terraza', text: precioOpcional(plato.precio_terraza) || '—' }),
      ]),
    ]),

    puedeEditarCarta()
      ? interruptor({
        nombre: `${plato.nombre}: visible en la carta`,
        puesto: !!plato.visible,
        soloPalanca: true,
        alCambiar: (v) => acc.cambiarVisible(plato, v),
      })
      : null,
  ])
}

/** Sin tildes y en minusculas, para buscar como se teclea. */
function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

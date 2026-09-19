/**
 * Almacén
 * ---------------------------------------------------------------------------
 * La libreta de lo que hay, bien hecha. NO es contabilidad: aqui no hay precios
 * de coste, ni valoracion en euros, ni escandallos, ni caducidades (seccion 2
 * del encargo, y asi lo dice tambien la migracion 1756700300_productos.js).
 *
 * La pantalla esta ordenada por lo que se hace de verdad, y no por lo que hay
 * en la base:
 *
 *   1. LAS FALTAS APUNTADAS, arriba del todo. Es lo unico que se mira con prisa
 *      y lo unico que toca todo el equipo.
 *   2. El catalogo, agrupado POR UBICACION —camara, congelador, sotano...— que
 *      es como se camina el almacen, no por categoria. El recuento de la fase 8
 *      recorre exactamente este orden.
 *   3. Los proveedores, al final: se tocan una vez cada varios meses.
 *
 * Cocina y empleado ven el almacen y apuntan faltas, pero no cambian el
 * catalogo (seccion 7): a ellos se les pinta sin el «+» y sin filas que se
 * abran, que es justo lo que dicen las reglas de la coleccion.
 *
 * La barra inferior marca «Más» porque el almacen cuelga de ahi (D-46).
 */

import { el, pintar } from '../dom.js'
import { vacio, fallo, esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { tarjetaFaltas, NIVEL } from '../piezas/faltas.js'
import { mantieneAlmacen } from '../sesion.js'
import { ir, BASE } from '../enrutador.js'
import { diaDe, diaRelativo, deDia } from '../fechas.js'
import {
  cargarAlmacen, avisosPendientes, resolverAviso, recuentoEnCurso, ultimoRecuentoCerrado,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// Los valores de los dos `select` de la migracion 1756700300_productos.js, con
// su nombre en pantalla. El orden de UBICACIONES es el del recorrido fisico:
// se empieza por la camara y se acaba en el sotano.
export const UBICACIONES = [
  ['camara', 'Cámara'], ['congelador', 'Congelador'], ['cocina', 'Cocina'],
  ['barra', 'Barra'], ['sotano', 'Sótano'], ['otros', 'Otros'],
]

export const CATEGORIAS_ALMACEN = [
  ['carne', 'Carne'], ['pescado', 'Pescado'], ['verdura', 'Verdura'],
  ['lacteos', 'Lácteos'], ['bebidas', 'Bebidas'], ['congelados', 'Congelados'],
  ['seco', 'Seco'], ['limpieza', 'Limpieza'], ['desechables', 'Desechables'],
  ['otros', 'Otros'],
]

export async function almacen(contenedor, estado) {
  const vista = {
    buscando: false,
    texto: '',
    error: null,
    aviso: null,
    cargando: !estado.almacen,
    abierto: null,
    ultimo: null,
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
    nuevo() { ir('/almacen/nuevo') },
    recargar() { cargar() },
    abrir(producto) { ir(`/almacen/${producto.id}`) },
    apuntar() { ir('/almacen/falta') },
    proveedores() { ir('/almacen/proveedores') },

    /** El «comprobado» de una falta. Se quita de la lista al momento; si falla, vuelve. */
    async resolver(aviso) {
      try {
        await resolverAviso(aviso.id, true)
        estado.avisos = (estado.avisos || []).filter((a) => a.id !== aviso.id)
        vista.aviso = null
        repintar()
      } catch (err) {
        vista.aviso = 'No hemos podido marcarlo como repuesto. Inténtalo otra vez.'
        repintar()
        throw err
      }
    },
  }

  // En una funcion con nombre para que «Reintentar» pueda volver a llamarla.
  async function cargar() {
    vista.cargando = true
    repintar()
    try {
      // Todas a la vez: son independientes y en la conexion del bar encadenarlas
      // se nota. Las dos del recuento se resuelven con catch propio: si fallan, la
      // pantalla sigue en pie y solo esas dos lineas salen sin detalle.
      const [datos, avisos, abierto, ultimo] = await Promise.all([
        cargarAlmacen(),
        avisosPendientes(),
        recuentoEnCurso().catch(() => null),
        ultimoRecuentoCerrado().catch(() => null),
      ])
      estado.almacen = datos
      estado.avisos = avisos
      vista.abierto = abierto
      vista.ultimo = ultimo
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
  return el('div', { class: 'pantalla' }, [
    cabecera('Almacén', [
      { icono: 'buscar', titulo: 'Buscar un producto', activo: vista.buscando, alPulsar: acc.alternarBusqueda },
      mantieneAlmacen() ? { icono: 'anadir', titulo: 'Producto nuevo', activo: true, alPulsar: acc.nuevo } : null,
    ], {
      volver: { titulo: 'Volver a Más', alPulsar: () => ir('/mas') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      vista.aviso ? el('p', { class: 'hoja__error', role: 'alert', text: vista.aviso }) : null,
      vista.buscando ? busqueda(estado, vista, acc) : listado(estado, vista, acc),
    ]),

    nav(mantieneAlmacen() ? '/mas' : '/almacen'),
  ])
}

function busqueda(estado, vista, acc) {
  const campo = el('input', {
    class: 'entrada', type: 'search', value: vista.texto,
    placeholder: 'Nombre del producto', 'aria-label': 'Buscar un producto',
    autocomplete: 'off',
  })
  // El almacen entero ya esta descargado: se filtra aqui, sin esperas y sin una
  // peticion por letra.
  campo.addEventListener('input', () => acc.buscar(campo.value))
  queueMicrotask(() => { campo.focus(); campo.setSelectionRange(campo.value.length, campo.value.length) })

  const texto = normalizar(vista.texto)
  const encontrados = texto.length < 2
    ? []
    : (estado.almacen?.productos || []).filter((p) => normalizar(p.nombre).includes(texto))

  return [
    el('div', { class: 'margen margen--alto' }, [campo]),
    el('div', { class: 'margen' }, [
      texto.length < 2
        ? el('p', { class: 'vacio', text: 'Escribe al menos dos letras.' })
        : encontrados.length
          ? el('section', { class: 'tarjeta' }, [
            el('div', { class: 'filas' }, encontrados.map((p) => filaProducto(p, estado, acc))),
          ])
          : el('p', { class: 'vacio', text: 'Ningún producto se llama así.' }),
      el('div', { style: 'height: var(--sp-5)' }),
    ]),
  ]
}

function listado(estado, vista, acc) {
  if (vista.error) {
    return fallo({
      texto: 'No se ha podido cargar el almacén.',
      alReintentar: acc.recargar, err: vista.error, donde: 'almacen',
    })
  }
  if (vista.cargando) return el('div', { class: 'margen margen--alto' }, esqueletoFilas(6))

  const { productos = [], proveedores = [] } = estado.almacen || {}
  const activos = productos.filter((p) => p.activo !== false)
  const retirados = productos.filter((p) => p.activo === false)

  return el('div', { class: 'margen margen--alto' }, [
    tarjetaFaltas(estado.avisos || [], { alResolver: acc.resolver, alApuntar: acc.apuntar }),

    seccionRecuento(vista),

    el('h2', { class: 'rotulo-seccion', text: 'Productos' }),

    productos.length
      ? [
        ...gruposPorUbicacion(activos).map((g) => grupo(g.titulo, g.lista, estado, acc)),
        retirados.length
          ? grupo('Fuera de uso', retirados, estado, acc, 'No se piden ni salen en el recuento.')
          : null,
      ]
      : vacio({
        texto: 'Aún no hay ningún producto',
        pie: 'Se puede importar entero desde un CSV.',
        accion: el('button', { type: 'button', class: 'btn btn--linea', text: 'Añadir el primero', onclick: acc.nuevo }),
      }),

    seccionProveedores(proveedores, productos, acc),
    el('div', { style: 'height: var(--sp-5)' }),
  ])
}

/**
 * Agrupa por ubicacion EN EL ORDEN DEL RECORRIDO, no por orden alfabetico ni
 * por cuantos hay. Lo que no tiene ubicacion se queda al final, junto: es lo
 * que suele estar recien dado de alta y sin terminar de configurar.
 */
function gruposPorUbicacion(productos) {
  const grupos = UBICACIONES
    .map(([clave, titulo]) => ({ titulo, lista: productos.filter((p) => p.ubicacion === clave) }))
    .filter((g) => g.lista.length)

  const conocidas = new Set(UBICACIONES.map(([clave]) => clave))
  const sueltos = productos.filter((p) => !conocidas.has(p.ubicacion))
  if (sueltos.length) grupos.push({ titulo: 'Sin ubicación', lista: sueltos })

  return grupos
}

function grupo(titulo, lista, estado, acc, pie = null) {
  return el('section', { class: 'tarjeta tarjeta--suelta' }, [
    el('div', { class: 'grupo' }, [
      el('h3', { class: 'grupo__nombre', text: titulo }),
      el('span', { class: 'grupo__cuenta', text:
        `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}` }),
    ]),
    pie ? el('p', { class: 'grupo__nota', text: pie }) : null,
    el('div', { class: 'filas' }, lista.map((p) => filaProducto(p, estado, acc))),
  ])
}

/**
 * Una linea de producto.
 *
 * El pie dice lo que hace falta para pedirlo: unidad, minimo y proveedor. Si
 * falta algo de eso, en su lugar se dice QUE falta, con todas las letras: un
 * producto dado de alta al vuelo en mitad del servicio no sirve para la lista
 * de pedido hasta que alguien lo termine (seccion 9.3).
 */
function filaProducto(producto, estado, acc) {
  const puede = mantieneAlmacen()
  const aviso = (estado.avisos || []).find((a) => a.producto === producto.id)
  const nivel = aviso ? NIVEL[aviso.nivel] : null

  const cuerpo = [
    el('span', { class: 'fila-prod__cuerpo' }, [
      el('span', { class: 'fila-prod__nombre', text: producto.nombre }),
      producto.sin_configurar
        ? el('span', { class: 'fila-prod__pendiente', text: `Sin configurar: falta ${faltaEnPalabras(producto)}` })
        : el('span', { class: 'fila-prod__pie', text: descripcion(producto, estado) }),
    ]),
    nivel ? el('span', { class: `pastilla ${nivel.pastilla}`, text: nivel.texto }) : null,
  ]

  return el('div', {
    class: `fila-prod${producto.activo === false ? ' fila-prod--apagada' : ''}`,
    'data-id': producto.id,
  }, [
    puede
      ? el('button', {
        type: 'button', class: 'fila-prod__abrir',
        onclick: () => acc.abrir(producto),
      }, cuerpo)
      : el('div', { class: 'fila-prod__abrir fila-prod__abrir--quieta' }, cuerpo),
  ])
}

/** "kg · mínimo 4 · Carnicería Ramos" */
function descripcion(producto, estado) {
  const proveedor = (estado.almacen?.proveedores || []).find((p) => p.id === producto.proveedor)
  return [
    producto.unidad || null,
    producto.stock_minimo ? `mínimo ${numero(producto.stock_minimo)}` : null,
    proveedor ? proveedor.nombre : null,
  ].filter(Boolean).join(' · ') || 'Sin datos'
}

/**
 * Que le falta a un producto, con todas las letras.
 *
 * QUIEN DECIDE si un producto esta sin configurar es el SERVIDOR: la marca sale
 * de `producto.sin_configurar`, que escribe pb_hooks/almacen.pb.js. Aqui solo se
 * enumera QUE falta, para poder decirlo en pantalla, y se mira a los mismos tres
 * campos. La regla esta escrita dos veces porque aquel fichero es CommonJS —lo
 * carga PocketBase y lo cargan las pruebas de node— y el panel son modulos de
 * navegador; si se cambian los campos, hay que cambiarlos en los dos sitios.
 */
function faltaEnPalabras(producto) {
  const faltan = [
    !String(producto.unidad || '').trim() ? 'la unidad' : null,
    !producto.stock_minimo ? 'el mínimo' : null,
    !producto.proveedor ? 'el proveedor' : null,
  ].filter(Boolean)
  if (!faltan.length) return 'algo'
  if (faltan.length === 1) return faltan[0]
  return `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`
}

/**
 * El recuento y lo que sale de el.
 *
 * Va antes del catalogo porque se hace todas las semanas, y el catalogo se toca
 * cuando cambia algo. Cada linea dice EN QUE ESTADO esta, que es lo que se viene
 * a mirar: si quedo uno a medias el domingo, aqui se ve sin abrirlo.
 */
function seccionRecuento(vista) {
  const dia = vista.ultimo ? diaDe(vista.ultimo.fecha) : null

  return [
    el('h2', { class: 'rotulo-seccion', text: 'Recuento y pedido' }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, [
        filaIr('/almacen/recuento', 'Recuento', vista.abierto
          ? 'Hay uno empezado. Ábrelo y sigue por donde ibas.'
          : dia ? `El último se cerró ${diaRelativo(dia)}.`
            : 'Todavía no se ha hecho ninguno.'),
        filaIr('/almacen/pedido', 'Lista de pedido', dia
          ? `Del recuento ${deDia(dia)}, agrupada por proveedor.`
          : 'Sale sola al cerrar un recuento.'),
      ]),
    ]),
  ]
}

function filaIr(ruta, nombre, pie) {
  return el('a', { class: 'fila-ir', href: BASE + ruta }, [
    el('span', { class: 'fila-ir__cuerpo' }, [
      el('span', { class: 'fila-ir__nombre', text: nombre }),
      el('span', { class: 'fila-ir__pie', text: pie }),
    ]),
    icono('chevron', { clase: 'ic fila-ir__flecha' }),
  ])
}

function seccionProveedores(proveedores, productos, acc) {
  const activos = proveedores.filter((p) => p.activo !== false)
  const sinProveedor = productos.filter((p) => p.activo !== false && !p.proveedor).length

  return [
    el('h2', { class: 'rotulo-seccion', text: 'Proveedores' }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, [
        filaIr('/almacen/proveedores', 'Quién trae cada cosa',
          `${activos.length} ${activos.length === 1 ? 'proveedor' : 'proveedores'}`
          + (sinProveedor ? ` · ${sinProveedor} sin asignar` : '')),
      ]),
    ]),
  ]
}

/** 4 -> "4"; 1,5 -> "1,5". Las cantidades del almacen no llevan dos decimales. */
export function numero(n) {
  if (n === null || n === undefined || n === '') return ''
  return String(Number(n)).replace('.', ',')
}

/** Sin tildes y en minusculas, para buscar como se teclea. */
function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

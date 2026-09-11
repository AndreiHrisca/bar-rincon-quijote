/**
 * Lista de pedido
 * ---------------------------------------------------------------------------
 * Lo que sale del recuento del domingo: qué hay que pedir, a quién y cuánto.
 * Se usa con el teléfono en la otra mano, llamando a los proveedores, así que
 * está ordenada como se hace la ronda de llamadas:
 *
 *   - AGRUPADA POR PROVEEDOR, porque cada llamada es un proveedor.
 *   - Y LOS PROVEEDORES, POR QUIÉN REPARTE ANTES. Saber que el del pescado
 *     reparte el martes cambia lo que se le pide el domingo; el que reparte
 *     dentro de cinco días puede esperar.
 *
 * Las cantidades son **sugerencias que se corrigen**: `pedido_habitual` si está
 * puesto, y si no, lo justo para volver al mínimo. Quien pide sabe cosas que el
 * mínimo no recoge —que el sábado hay bautizo—, así que cada línea se edita y se
 * puede quitar y añadir a mano.
 *
 * AQUÍ NO HAY PRECIOS. Ni de coste, ni total del pedido, ni valoración del
 * almacén: es la sección 2 del encargo y es una decisión legal antes que
 * técnica. Si el diseño empuja hacia ahí, se para y se avisa.
 *
 * De lo contado, por defecto solo se enseña **lo que hay que pedir**. Lo demás
 * está a un toque: sirve para añadir a mano algo que el mínimo no ha marcado.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { interruptor } from '../piezas/interruptor.js'
import { ir } from '../enrutador.js'
import { diaDe, diaLargo, conMayuscula, deDia } from '../fechas.js'
import { numero } from './almacen.js'
import { DIAS, NOMBRE_DIA } from './proveedores.js'
import {
  cargarAlmacen, ultimoRecuentoCerrado, lineasDeRecuento, guardarLinea, avisosPendientes,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

export async function pedido(contenedor, estado) {
  const vista = {
    cargando: true,
    error: null,
    aviso: null,
    recuento: null,
    lineas: [],
    avisos: [],
    verTodo: false,
  }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    // Reintentar vuelve a montar la pantalla entera: es una sola peticion.
    recargar() { pedido(contenedor, estado) },
    alternarTodo() { vista.verTodo = !vista.verTodo; repintar() },

    /** El interruptor de la línea: entra o no entra en el pedido. */
    async cambiarPedir(linea, entra) {
      try {
        const guardada = await guardarLinea(linea.id, { hay_que_pedir: entra })
        Object.assign(linea, guardada)
        vista.aviso = null
        // Se repinta porque al encender una línea el servidor le pone la
        // cantidad sugerida, que aquí no se sabría calcular igual.
        repintar()
      } catch (err) {
        vista.aviso = mensaje(err)
        repintar()
        throw err
      }
    },

    async cambiarCantidad(linea, texto) {
      const valor = aCantidad(texto)
      if (valor === false || valor === null) return
      try {
        const guardada = await guardarLinea(linea.id, { cantidad_pedir: valor })
        Object.assign(linea, guardada)
        vista.aviso = null
      } catch (err) {
        vista.aviso = mensaje(err)
        repintar()
      }
    },

    copiar(proveedor, lineas) { hojaCopiar(vista, proveedor, lineas, estado) },
  }

  repintar()

  try {
    const [datos, recuento] = await Promise.all([
      estado.almacen ? Promise.resolve(estado.almacen) : cargarAlmacen(),
      ultimoRecuentoCerrado(),
    ])
    estado.almacen = datos
    vista.recuento = recuento
    if (recuento) {
      const [lineas, avisos] = await Promise.all([
        lineasDeRecuento(recuento.id),
        avisosPendientes().catch(() => []),
      ])
      vista.lineas = lineas
      vista.avisos = avisos
    }
  } catch (err) {
    vista.error = err
  }
  vista.cargando = false
  repintar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Lista de pedido', [
      vista.recuento
        ? { icono: 'almacen', titulo: 'Ver también lo que no hace falta pedir',
          activo: vista.verTodo, alPulsar: acc.alternarTodo }
        : null,
    ], {
      volver: { titulo: 'Volver al almacén', alPulsar: () => ir('/almacen') },
    }),
    el('div', { class: 'pantalla__scroll' }, [
      vista.aviso ? el('p', { class: 'hoja__error', role: 'alert', text: vista.aviso }) : null,
      cuerpo(estado, vista, acc),
    ]),
  ])
}

function cuerpo(estado, vista, acc) {
  if (vista.error) {
    return fallo({
      texto: 'No se ha podido cargar la lista.',
      alReintentar: acc.recargar, err: vista.error, donde: 'pedido',
    })
  }
  if (vista.cargando) return esqueletoFilas(5)
  if (!vista.recuento) return sinRecuento()

  const productos = new Map((estado.almacen?.productos || []).map((p) => [p.id, p]))
  const grupos = agrupar(vista, productos, estado.almacen?.proveedores || [])
  const quePedir = vista.lineas.filter((l) => l.hay_que_pedir).length

  return el('div', { class: 'margen margen--alto' }, [
    encabezado(vista, quePedir),

    grupos.length
      ? grupos.map((g) => grupo(g, acc, vista))
      : el('section', { class: 'tarjeta' }, [
        el('p', { class: 'vacio', text: vista.verTodo
          ? 'Ese recuento no tiene ninguna línea contada.'
          : 'No hay nada por debajo del mínimo. Toca «⊞» para ver todo lo contado y añadir algo a mano.' }),
      ]),

    faltasQueFaltan(vista, productos),
    el('div', { style: 'height: var(--sp-5)' }),
  ])
}

function sinRecuento() {
  return el('div', { class: 'margen margen--alto' }, [
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'margen', style: 'padding-block: var(--sp-4)' }, [
        el('p', { class: 'parrafo', text: 'Todavía no hay ninguna lista de pedido.' }),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'Sale sola al cerrar un recuento: lo que esté por debajo del mínimo entra en la lista.' }),
        el('button', {
          type: 'button', class: 'btn btn--primario btn--suelto', text: 'Ir al recuento',
          onclick: () => ir('/almacen/recuento'),
        }),
      ]),
    ]),
  ])
}

function encabezado(vista, quePedir) {
  const dia = diaDe(vista.recuento.fecha)
  const quien = vista.recuento.expand?.hecho_por?.nombre

  return el('header', { class: 'pedido-cabeza' }, [
    el('h2', { class: 'pedido-cabeza__titulo', text:
      `${quePedir} ${quePedir === 1 ? 'producto que pedir' : 'productos que pedir'}` }),
    el('p', { class: 'pedido-cabeza__pie', text:
      `Del recuento ${deDia(dia)}${quien ? `, contado por ${quien}` : ''}.` }),
    vista.recuento.notas
      ? el('p', { class: 'pedido-cabeza__nota', text: vista.recuento.notas })
      : null,
  ])
}

/**
 * Agrupa por proveedor y ordena por quién reparte antes.
 *
 * Un proveedor sin día de reparto no se pone el último por castigo: es que no
 * sabemos cuándo viene, así que no puede competir con quien sí lo dice.
 */
function agrupar(vista, productos, proveedores) {
  const visibles = vista.lineas.filter((l) => (vista.verTodo ? l.contada : l.hay_que_pedir))
  const porProveedor = new Map()

  for (const linea of visibles) {
    const producto = productos.get(linea.producto)
    if (!producto) continue        // borrado desde que se contó
    const clave = producto.proveedor || ''
    if (!porProveedor.has(clave)) porProveedor.set(clave, [])
    porProveedor.get(clave).push({ linea, producto })
  }

  const hoy = new Date().getDay()   // 0 = domingo
  const grupos = []
  for (const [clave, lista] of porProveedor) {
    const proveedor = proveedores.find((p) => p.id === clave) || null
    lista.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre, 'es'))
    grupos.push({ proveedor, lista, espera: diasHastaReparto(proveedor?.dia_reparto, hoy) })
  }

  return grupos.sort((a, b) => a.espera - b.espera
    || (a.proveedor?.nombre || 'zzz').localeCompare(b.proveedor?.nombre || 'zzz', 'es'))
}

/**
 * Días que faltan para el próximo reparto. Hoy cuenta como 0.
 * Sin días puestos devuelve 99: va después de todos los que sí los tienen.
 */
export function diasHastaReparto(dias, diaSemanaHoy) {
  const puestos = (dias || []).map((d) => DIAS.findIndex(([clave]) => clave === d))
    .filter((i) => i >= 0)
  if (!puestos.length) return 99

  // getDay() cuenta desde el domingo y DIAS empieza en lunes: 0 (domingo) es el
  // índice 6 de la semana.
  const hoy = (diaSemanaHoy + 6) % 7
  return Math.min(...puestos.map((i) => (i - hoy + 7) % 7))
}

function grupo({ proveedor, lista, espera }, acc, vista) {
  const dias = (proveedor?.dia_reparto || []).map((d) => NOMBRE_DIA[d] || d)

  return el('section', { class: 'tarjeta tarjeta--suelta' }, [
    el('div', { class: 'grupo' }, [
      el('h2', { class: 'grupo__nombre', text: proveedor ? proveedor.nombre : 'Sin proveedor' }),
      el('span', { class: 'grupo__cuenta', text: dias.length
        ? (espera === 0 ? 'reparte hoy' : espera === 1 ? 'reparte mañana' : `reparte ${enLista(dias)}`)
        : (proveedor ? 'sin día fijo' : 'hay que asignarlos') }),
    ]),

    proveedor?.telefono
      ? el('a', { class: 'grupo__telefono', href: `tel:${proveedor.telefono.replace(/\s/g, '')}` },
        [`Llamar · ${proveedor.telefono}`])
      : null,

    el('div', { class: 'filas' }, lista.map(({ linea, producto }) => filaPedido(linea, producto, acc))),

    el('div', { class: 'tarjeta__pie' }, [
      el('button', {
        type: 'button', class: 'btn btn--linea', text: 'Copiar la lista',
        onclick: () => acc.copiar(proveedor, lista),
      }),
    ]),
  ])
}

function filaPedido(linea, producto, acc) {
  const entra = !!linea.hay_que_pedir
  const id = `pedir-${linea.id}`

  const campo = el('input', {
    class: 'entrada entrada--cuenta', id, type: 'text', inputmode: 'decimal',
    'aria-label': `Cuánto pedir de ${producto.nombre}`,
    disabled: !entra || null,
  })
  campo.value = entra ? numero(linea.cantidad_pedir) : ''
  campo.addEventListener('change', () => acc.cambiarCantidad(linea, campo.value))

  return el('div', { class: `fila-pedido${entra ? '' : ' fila-pedido--fuera'}` }, [
    el('div', { class: 'fila-pedido__cuerpo' }, [
      el('span', { class: 'fila-pedido__nombre', text: producto.nombre }),
      el('span', { class: 'fila-pedido__pie', text: [
        `quedan ${numero(linea.cantidad)}${producto.unidad ? ` ${producto.unidad}` : ''}`,
        producto.stock_minimo ? `mínimo ${numero(producto.stock_minimo)}` : null,
      ].filter(Boolean).join(' · ') }),
    ]),
    campo,
    interruptor({
      nombre: `${producto.nombre}: entra en el pedido`,
      puesto: entra,
      soloPalanca: true,
      alCambiar: (v) => acc.cambiarPedir(linea, v),
    }),
  ])
}

/**
 * Las faltas que cocina apuntó y que NO están en la lista.
 *
 * Es lo que se olvida siempre: el recuento dice lo que hay en la estantería,
 * pero alguien apuntó el martes que se acabó la harina y eso no lo sabe el
 * recuento del domingo si ya se repuso a medias. Se enseñan aquí, al final,
 * antes de coger el teléfono.
 */
function faltasQueFaltan(vista, productos) {
  const enLaLista = new Set(vista.lineas.filter((l) => l.hay_que_pedir).map((l) => l.producto))
  const sueltas = vista.avisos.filter((a) => !enLaLista.has(a.producto))
  if (!sueltas.length) return null

  return [
    el('h2', { class: 'rotulo-seccion', text: 'Además, apuntado por el equipo' }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, sueltas.map((a) => el('div', { class: 'falta' }, [
        el('div', { class: 'falta__cuerpo' }, [
          el('div', { class: 'falta__nombre', text:
            a.expand?.producto?.nombre || productos.get(a.producto)?.nombre || 'Producto borrado' }),
          el('div', { class: 'falta__pie', text: a.nota || '' }),
        ]),
        el('span', { class: `pastilla ${a.nivel === 'agotado' ? 'pastilla--no-vino' : 'pastilla--pendiente'}`,
          text: a.nivel === 'agotado' ? 'Agotado' : 'Queda poco' }),
      ]))),
    ]),
    el('p', { class: 'parrafo parrafo--apagado', style: 'margin-top: var(--sp-2)', text:
      'No están en la lista de arriba porque el recuento no los marcó por debajo del mínimo. '
      + 'Míralos antes de llamar.' }),
  ]
}

// ---------------------------------------------------------------------------

/**
 * Copiar la lista de un proveedor.
 *
 * Se copia como TEXTO, para pegarlo en WhatsApp o en un SMS, que es como se
 * pide de verdad en un bar de barrio. No se manda nada desde aquí: no hay
 * pasarela de correo ni de SMS en la v1, y prometer un envío que no existe
 * sería mentir (mismo criterio que D-23).
 */
function hojaCopiar(vista, proveedor, lista, estado) {
  const texto = comoTexto(vista, proveedor, lista)

  const caja = el('textarea', {
    class: 'entrada entrada--area', id: 'ped-texto', rows: '8', readonly: true,
  })
  caja.value = texto

  const acuse = el('p', { class: 'parrafo parrafo--apagado', role: 'status', text:
    'Se copia al portapapeles y se pega en WhatsApp.' })

  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Copiar' })
  boton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(texto)
      acuse.textContent = 'Copiado. Ya se puede pegar.'
    } catch (err) {
      // Sin permiso de portapapeles: se selecciona y que lo copie a mano. Es
      // preferible a decir que se ha copiado algo que no se ha copiado.
      caja.focus()
      caja.select()
      acuse.textContent = 'Tu navegador no nos deja copiar: está seleccionado, cópialo tú.'
    }
  })

  abrirHoja({
    titulo: proveedor ? proveedor.nombre : 'Sin proveedor',
    cuerpo: [caja, acuse],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Cerrar', onclick: cerrarHoja }),
    ],
  })
}

function comoTexto(vista, proveedor, lista) {
  const dia = conMayuscula(diaLargo(diaDe(vista.recuento.fecha)))
  const cabeza = [
    'Pedido · El Rincón del Quijote',
    proveedor ? proveedor.nombre : 'Sin proveedor asignado',
    `Recuento del ${dia.toLowerCase()}`,
    '',
  ]
  const filas = lista
    .filter(({ linea }) => linea.hay_que_pedir)
    .map(({ linea, producto }) =>
      `- ${producto.nombre}: ${numero(linea.cantidad_pedir)}${producto.unidad ? ` ${producto.unidad}` : ''}`)

  return [...cabeza, ...(filas.length ? filas : ['(nada que pedir)'])].join('\n')
}

// ---------------------------------------------------------------------------

/** ["Martes", "Viernes"] -> "martes y viernes" */
function enLista(nombres) {
  const n = nombres.map((d) => d.toLowerCase())
  if (n.length === 1) return n[0]
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

function aCantidad(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return false
  return n
}

function mensaje(err) {
  if (err?.status === 403) return err?.response?.message || 'Tu cuenta no puede cambiar esa línea.'
  return err?.response?.message || 'No hemos podido guardar el cambio.'
}

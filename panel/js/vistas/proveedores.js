/**
 * Proveedores
 * ---------------------------------------------------------------------------
 * Quién trae cada cosa y qué día. Se toca cuatro veces al año, así que va
 * detrás del almacén y no en la barra inferior.
 *
 * EL DÍA DE REPARTO NO ES UN ADORNO. La lista de pedido que sale del recuento
 * del domingo (fase 8) se agrupa por proveedor, y saber que el del pescado
 * reparte los martes cambia lo que se pide el domingo. Por eso es de selección
 * múltiple: hay proveedores que reparten dos o tres días.
 *
 * Se edita en una hoja y no en pantalla completa —al revés que el producto—
 * porque son cinco campos cortos y caben de sobra.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { esDueno, mantieneAlmacen } from '../sesion.js'
import { ir } from '../enrutador.js'
import { cargarAlmacen, guardarProveedor, borrarProveedor } from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// Los siete valores del campo `dia_reparto` de la migración
// 1756700200_proveedores.js. Se guardan sin tilde y sin eñe, como los roles.
// Se exportan porque la lista de pedido los usa para ordenar por quién reparte
// antes (vistas/pedido.js). El orden del array es el de la semana, empezando en
// lunes, y de ahí depende ese cálculo: no se toca.
export const DIAS = [
  ['lunes', 'Lunes'], ['martes', 'Martes'], ['miercoles', 'Miércoles'],
  ['jueves', 'Jueves'], ['viernes', 'Viernes'], ['sabado', 'Sábado'],
  ['domingo', 'Domingo'],
]

export const NOMBRE_DIA = Object.fromEntries(DIAS)

export async function proveedores(contenedor, estado) {
  const vista = { cargando: !estado.almacen, error: null, aviso: null }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    nuevo() { editar(null) },
    abrir(proveedor) { editar(proveedor) },
  }

  function editar(proveedor) {
    if (!mantieneAlmacen()) return
    hojaProveedor(proveedor, estado, {
      alGuardar(guardado) {
        const lista = estado.almacen.proveedores
        const i = lista.findIndex((p) => p.id === guardado.id)
        if (i === -1) lista.push(guardado)
        else lista[i] = guardado
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        repintar()
      },
      alBorrar(id) {
        estado.almacen.proveedores = estado.almacen.proveedores.filter((p) => p.id !== id)
        // Los productos que lo tenían se quedan sin proveedor: la relación no
        // arrastra el borrado. Se refleja aquí para que la cuenta no mienta.
        for (const prod of estado.almacen.productos) {
          if (prod.proveedor === id) prod.proveedor = ''
        }
        repintar()
      },
    })
  }

  // Con nombre para que «Reintentar» pueda volver a llamarla.
  async function cargar() {
    vista.cargando = true
    vista.error = null
    repintar()
    try {
      estado.almacen = await cargarAlmacen()
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }
  acciones.recargar = cargar

  repintar()
  if (!estado.almacen) await cargar()
  else { vista.cargando = false; repintar() }
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Proveedores', [
      mantieneAlmacen() ? { icono: 'anadir', titulo: 'Proveedor nuevo', activo: true, alPulsar: acc.nuevo } : null,
    ], {
      volver: { titulo: 'Volver al almacén', alPulsar: () => ir('/almacen') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        vista.error
          ? fallo({
            texto: 'No se han podido cargar los proveedores.',
            alReintentar: acc.recargar, err: vista.error, donde: 'proveedores',
          })
          : vista.cargando
            ? esqueletoFilas(4)
            : listado(estado, acc),
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),

    nav('/mas'),
  ])
}

function listado(estado, acc) {
  const { proveedores: lista = [], productos = [] } = estado.almacen || {}
  if (!lista.length) {
    return el('section', { class: 'tarjeta' }, [
      el('p', { class: 'vacio', text:
        'Todavía no hay proveedores. Se crean solos al importar el CSV del almacén, o uno a uno con el «+».' }),
    ])
  }

  const activos = lista.filter((p) => p.activo !== false)
  const retirados = lista.filter((p) => p.activo === false)

  return [
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, activos.map((p) => fila(p, productos, acc))),
    ]),
    retirados.length
      ? [
        el('h2', { class: 'rotulo-seccion', text: 'Fuera de uso' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, retirados.map((p) => fila(p, productos, acc))),
        ]),
      ]
      : null,
  ]
}

function fila(proveedor, productos, acc) {
  const cuantos = productos.filter((p) => p.proveedor === proveedor.id).length
  const dias = (proveedor.dia_reparto || []).map((d) => NOMBRE_DIA[d] || d)

  const cuerpo = [
    el('span', { class: 'fila-prod__cuerpo' }, [
      el('span', { class: 'fila-prod__nombre', text: proveedor.nombre }),
      el('span', { class: 'fila-prod__pie', text: [
        dias.length ? `Reparte ${enLista(dias)}` : 'Sin día de reparto',
        `${cuantos} ${cuantos === 1 ? 'producto' : 'productos'}`,
        proveedor.telefono || null,
      ].filter(Boolean).join(' · ') }),
    ]),
  ]

  return el('div', { class: `fila-prod${proveedor.activo === false ? ' fila-prod--apagada' : ''}` }, [
    mantieneAlmacen()
      ? el('button', {
        type: 'button', class: 'fila-prod__abrir',
        onclick: () => acc.abrir(proveedor),
      }, cuerpo)
      : el('div', { class: 'fila-prod__abrir fila-prod__abrir--quieta' }, cuerpo),
  ])
}

/** ["Martes", "Viernes"] -> "martes y viernes" */
function enLista(nombres) {
  const n = nombres.map((d) => d.toLowerCase())
  if (n.length === 1) return n[0]
  return `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`
}

// ---------------------------------------------------------------------------

function hojaProveedor(proveedor, estado, { alGuardar, alBorrar }) {
  const esNuevo = !proveedor
  // Solo puede haber una hoja abierta a la vez (piezas/hoja.js), asi que la
  // confirmacion de borrado SUSTITUYE a esta. Si se echa atras, se vuelve a
  // abrir esta misma con lo que hay guardado.
  const reabrir = () => hojaProveedor(proveedor, estado, { alGuardar, alBorrar })
  const elegidos = new Set(proveedor?.dia_reparto || [])
  const local = { activo: proveedor ? proveedor.activo !== false : true }

  const nombre = texto('pv-nombre', proveedor?.nombre || '', { maxlength: '120', placeholder: 'Carnicería Ramos' })
  const contacto = texto('pv-contacto', proveedor?.contacto || '', { maxlength: '120', placeholder: 'Julián' })
  const telefono = texto('pv-telefono', proveedor?.telefono || '', {
    maxlength: '20', type: 'tel', inputmode: 'tel', placeholder: '600 000 000',
  })
  const notas = el('textarea', {
    class: 'entrada entrada--area', id: 'pv-notas', rows: '2', maxlength: '500',
    placeholder: 'Hay que pedirle antes de las 10:00',
  })
  notas.value = proveedor?.notas || ''

  const dias = el('div', { class: 'eleccion' })
  function pintarDias() {
    pintar(dias, DIAS.map(([clave, rotulo]) => {
      const puesto = elegidos.has(clave)
      return el('button', {
        type: 'button',
        class: `eleccion__opcion${puesto ? ' eleccion__opcion--puesta' : ''}`,
        'aria-pressed': String(puesto),
        text: rotulo,
        onclick: () => {
          if (puesto) elegidos.delete(clave)
          else elegidos.add(clave)
          pintarDias()
        },
      })
    }))
  }
  pintarDias()

  const activo = el('input', {
    type: 'checkbox', class: 'interruptor__casilla', id: 'pv-activo', checked: local.activo,
  })
  activo.addEventListener('change', () => { local.activo = activo.checked })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', {
    type: 'button', class: 'btn btn--primario', text: esNuevo ? 'Crear' : 'Guardar',
  })

  boton.addEventListener('click', async () => {
    const n = nombre.value.trim()
    if (n.length < 2) {
      error.textContent = 'Falta el nombre del proveedor.'
      error.hidden = false
      nombre.focus()
      return
    }
    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      const guardado = await guardarProveedor(proveedor?.id, {
        nombre: n,
        contacto: contacto.value.trim(),
        telefono: telefono.value.trim(),
        // El campo es de selección múltiple: se manda la lista en el orden de
        // la semana, no en el orden en que se hayan ido tocando.
        dia_reparto: DIAS.map(([c]) => c).filter((c) => elegidos.has(c)),
        notas: notas.value.trim(),
        activo: local.activo,
      })
      cerrarHoja()
      alGuardar(guardado)
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNuevo ? 'Crear' : 'Guardar'
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede cambiar los proveedores.'
        : err?.response?.data?.nombre
          ? 'Ya hay un proveedor con ese nombre.'
          : (err?.response?.message || 'No hemos podido guardarlo.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: esNuevo ? 'Proveedor nuevo' : proveedor.nombre,
    cuerpo: [
      campo('Nombre', 'pv-nombre', nombre),
      el('div', { class: 'campos-dos' }, [
        campo('Contacto', 'pv-contacto', contacto),
        campo('Teléfono', 'pv-telefono', telefono),
      ]),

      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Días de reparto' }),
        dias,
        el('p', { class: 'parrafo parrafo--apagado', text:
          'De aquí sale el orden de la lista de pedido: primero lo de quien reparte antes.' }),
      ]),

      campo('Notas', 'pv-notas', notas),

      el('label', { class: 'interruptor', for: 'pv-activo' }, [
        el('span', { class: 'interruptor__cuerpo' }, [
          el('span', { class: 'interruptor__nombre', text: 'En uso' }),
          el('span', { class: 'interruptor__pie', text:
            'Apagado, no se ofrece al asignar proveedor a un producto.' }),
        ]),
        activo,
        el('span', { class: 'interruptor__palanca', 'aria-hidden': 'true' }),
      ]),

      esDueno() && proveedor
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Eliminar proveedor',
          onclick: () => confirmarBorrado(proveedor, estado, alBorrar, reabrir),
        })
        : null,

      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Dejarlo', onclick: cerrarHoja }),
    ],
  })
}

function confirmarBorrado(proveedor, estado, alBorrar, alEcharseAtras) {
  const cuantos = (estado.almacen?.productos || []).filter((p) => p.proveedor === proveedor.id).length
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarProveedor(proveedor.id)
      cerrarHoja()
      alBorrar(proveedor.id)
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarlo'
      error.textContent = err?.status === 403
        ? 'Solo el dueño puede eliminar proveedores.'
        : 'No hemos podido eliminarlo. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar ${proveedor.nombre}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text: cuantos
        ? `${cuantos} ${cuantos === 1 ? 'producto se queda' : 'productos se quedan'} sin proveedor. `
          + 'Los productos no se borran, pero habrá que volver a asignárselos a alguien.'
        : 'No hay ningún producto asignado a él.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Si es que ya no se le compra, no lo elimines: apágalo con «En uso». Así deja de '
        + 'ofrecerse y los productos siguen sabiendo de dónde venían.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: alEcharseAtras }),
    ],
  })
}

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

function texto(id, valor, extra = {}) {
  const n = el('input', { class: 'entrada', id, type: 'text', ...extra })
  n.value = valor
  return n
}

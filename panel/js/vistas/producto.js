/**
 * Editar un producto (y crear uno nuevo)
 * ---------------------------------------------------------------------------
 * Pantalla completa, como la de plato: son ocho campos y no caben en una hoja
 * que sube desde abajo.
 *
 * TRES COSAS QUE NO SON DECORACION:
 *
 *   - UNIDAD, MINIMO Y PROVEEDOR VAN JUNTOS Y ARRIBA. Son los tres que hacen
 *     falta para que el producto llegue a la lista de pedido; sin ellos el
 *     producto existe pero no sirve para nada, y por eso la marca de «sin
 *     configurar» mira justo esos tres (pb_hooks/lib/almacen.js).
 *
 *   - LA UNIDAD ES TEXTO LIBRE. kg, litros, cajas, bandejas, barriles. Cerrarla
 *     a una lista obliga a mantener la lista y no aporta nada: quien cuenta
 *     sabe en que cuenta.
 *
 *   - AQUI NO HAY PRECIO. Ni de coste, ni de venta, ni valoracion del almacen
 *     (seccion 2 del encargo). Si alguien lo pide, es una decision legal antes
 *     que tecnica y se para.
 *
 * Cocina y empleado no llegan a esta pantalla: la regla de `productos` solo deja
 * actualizar a dueno y encargado. Crear si puede cualquiera, pero eso se hace
 * al vuelo desde «Apuntar una falta», con solo el nombre.
 */

import { el, pintar } from '../dom.js'
import { enfocarAlta } from '../foco.js'
import { cabecera } from '../piezas/cabecera.js'
import { interruptor } from '../piezas/interruptor.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { esDueno, mantieneAlmacen } from '../sesion.js'
import { ir } from '../enrutador.js'
import { cargarAlmacen, guardarProducto, borrarProducto } from '../datos.js'
import { UBICACIONES, CATEGORIAS_ALMACEN, numero } from './almacen.js'
import { icono } from '/compartido/js/iconos.js'

export async function producto(contenedor, estado, id) {
  const esNuevo = id === 'nuevo'

  pintar(contenedor, el('div', { class: 'pantalla' }, [
    cabecera(esNuevo ? 'Producto nuevo' : 'Editar producto', []),
    el('div', { class: 'pantalla__scroll' }, [el('p', { class: 'cargando', text: 'Cargando…' })]),
  ]))

  if (!estado.almacen) {
    try {
      estado.almacen = await cargarAlmacen()
    } catch (err) {
      return pintar(contenedor, fallo('No hemos podido cargar el almacén.'))
    }
  }

  if (!mantieneAlmacen()) {
    return pintar(contenedor, fallo('Tu cuenta no cambia el catálogo del almacén. Sí puedes apuntar lo que falte.'))
  }

  const original = esNuevo ? null : estado.almacen.productos.find((p) => p.id === id)
  if (!esNuevo && !original) {
    return pintar(contenedor, fallo('Ese producto ya no existe. Puede que lo haya borrado otra persona.'))
  }

  formulario(contenedor, estado, original)
}

function fallo(mensaje) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Producto', []),
    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        el('p', { class: 'vacio', text: mensaje }),
        el('button', { type: 'button', class: 'btn btn--linea', text: 'Volver al almacén', onclick: () => ir('/almacen') }),
      ]),
    ]),
  ])
}

// ---------------------------------------------------------------------------

function formulario(contenedor, estado, original) {
  const esNuevo = !original
  const proveedores = estado.almacen.proveedores

  const local = { activo: original ? original.activo !== false : true, guardando: false }

  const nombre = campoTexto('pr-nombre', original?.nombre || '', {
    maxlength: '120', placeholder: 'Harina de trigo',
  })

  const unidad = campoTexto('pr-unidad', original?.unidad || '', {
    maxlength: '20', placeholder: 'kg',
  })

  const minimo = campoNumero('pr-minimo', original?.stock_minimo)
  const habitual = campoNumero('pr-habitual', original?.pedido_habitual)

  const categoria = desplegable('pr-categoria', CATEGORIAS_ALMACEN, original?.categoria_almacen, 'Sin clasificar')
  const ubicacion = desplegable('pr-ubicacion', UBICACIONES, original?.ubicacion, 'Sin ubicación')

  const proveedor = el('select', { class: 'entrada', id: 'pr-proveedor' }, [
    el('option', { value: '', text: 'Sin proveedor', selected: !original?.proveedor }),
    ...proveedores.map((p) => el('option', {
      value: p.id,
      selected: original?.proveedor === p.id,
      text: p.activo === false ? `${p.nombre} (fuera de uso)` : p.nombre,
    })),
  ])

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const guardar = el('button', {
    type: 'button', class: 'btn btn--primario',
    text: esNuevo ? 'Crear el producto' : 'Guardar cambios',
  })
  guardar.addEventListener('click', enviar)

  function falla(mensaje, foco) {
    error.textContent = mensaje
    error.hidden = false
    if (foco) foco.focus()
    error.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  async function enviar() {
    if (local.guardando) return
    error.hidden = true

    const n = nombre.value.trim()
    if (n.length < 2) return falla('Falta el nombre del producto.', nombre)

    const min = aCantidad(minimo.value)
    const hab = aCantidad(habitual.value)
    if (min === false) return falla('El mínimo tiene que ser un número.', minimo)
    if (hab === false) return falla('El pedido habitual tiene que ser un número.', habitual)

    const campos = {
      nombre: n,
      unidad: unidad.value.trim(),
      categoria_almacen: categoria.value,
      ubicacion: ubicacion.value,
      stock_minimo: min ?? 0,
      pedido_habitual: hab ?? 0,
      proveedor: proveedor.value,
      activo: local.activo,
    }

    // Un producto nuevo va al final de su ubicacion, que es donde se espera
    // encontrarlo al recorrer el almacen. El orden solo se toca aqui: no hay
    // pantalla de reordenar el almacen, porque las estanterias no se mueven
    // como la carta.
    if (esNuevo) {
      const deLaUbicacion = estado.almacen.productos.filter((p) => p.ubicacion === ubicacion.value)
      campos.orden = Math.max(0, ...deLaUbicacion.map((p) => p.orden || 0)) + 10
    }

    local.guardando = true
    guardar.disabled = true
    guardar.textContent = 'Guardando…'

    try {
      const guardado = await guardarProducto(original?.id, campos)
      // Se refresca la copia en memoria para que la lista de detras no ensene
      // el nombre viejo al volver.
      if (original) Object.assign(original, guardado)
      else estado.almacen.productos.push(guardado)
      ir('/almacen')
    } catch (err) {
      local.guardando = false
      guardar.disabled = false
      guardar.textContent = esNuevo ? 'Crear el producto' : 'Guardar cambios'
      falla(mensajeDeError(err))
    }
  }

  pintar(contenedor, el('div', { class: 'pantalla' }, [
    cabecera(esNuevo ? 'Producto nuevo' : 'Editar producto', [], {
      volver: { titulo: 'Volver al almacén', alPulsar: () => ir('/almacen') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen formulario' }, [

        original?.sin_configurar
          ? el('div', { class: 'aviso' }, [
            icono('aviso', { clase: 'ic aviso__glifo' }),
            el('div', { class: 'aviso__texto' }, [
              el('b', { text: 'Este producto se dio de alta con prisa' }),
              el('span', { text:
                'Lo apuntó alguien en mitad del servicio con solo el nombre. En cuanto tenga '
                + 'unidad, mínimo y proveedor, la marca desaparece sola.' }),
            ]),
          ])
          : null,

        campo('Nombre', 'pr-nombre', nombre),

        el('div', { class: 'campos-dos' }, [
          campo('Unidad', 'pr-unidad', unidad),
          campo('Mínimo', 'pr-minimo', minimo),
        ]),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'La unidad es la que se usa al contar: kg, litros, cajas, bandejas, barriles. '
          + 'El mínimo es el punto a partir del cual hay que pedir.' }),

        campo('Proveedor', 'pr-proveedor', proveedor),
        campo('Pedido habitual', 'pr-habitual', habitual),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'Lo que se suele pedir cuando baja del mínimo. Es una sugerencia: en la lista de '
          + 'pedido se puede cambiar línea a línea.' }),

        el('div', { class: 'campos-dos' }, [
          campo('Categoría', 'pr-categoria', categoria),
          campo('Ubicación', 'pr-ubicacion', ubicacion),
        ]),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'La ubicación es dónde está de verdad: por ahí se agrupa el almacén y por ahí se '
          + 'camina el recuento.' }),

        el('div', { class: 'campo' }, [
          el('div', { class: 'tarjeta' }, [
            interruptor({
              nombre: 'En uso',
              pie: local.activo
                ? 'Sale en el recuento y en la lista de pedido'
                : 'Apartado: no se pide ni se cuenta',
              puesto: local.activo,
              alCambiar: (v) => { local.activo = v },
            }),
          ]),
        ]),

        esDueno() && original
          ? el('div', { class: 'campo' }, [
            el('button', {
              type: 'button', class: 'btn btn--discreto', text: 'Eliminar producto',
              onclick: () => confirmarBorrado(estado, original),
            }),
          ])
          : null,

        error,
        el('div', { style: 'height: var(--sp-3)' }),
      ]),
    ]),

    el('div', { class: 'acciones' }, [guardar]),
  ]))

  // Solo en un alta y solo con raton: abrir una ficha que ya existe para
  // consultarla no puede levantar el teclado del movil. Ver panel/js/foco.js.
  enfocarAlta(nombre, esNuevo)
}

// ---------------------------------------------------------------------------

function confirmarBorrado(estado, prod) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarProducto(prod.id)
      estado.almacen.productos = estado.almacen.productos.filter((p) => p.id !== prod.id)
      cerrarHoja()
      ir('/almacen')
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarlo'
      error.textContent = err?.status === 403
        ? 'Solo el dueño puede eliminar productos.'
        // Un producto que aparece en un recuento no se puede borrar: la
        // relacion de `recuento_lineas` no arrastra el borrado a proposito, y
        // asi un recuento cerrado sigue diciendo la verdad de lo que se conto.
        : 'No hemos podido eliminarlo. Si aparece en algún recuento no se puede borrar: apártalo con «En uso».'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar ${prod.nombre}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'Se borra de la base de datos, junto con las faltas que estén apuntadas de él.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Si es que ya no se compra, no lo elimines: apágalo con «En uso». Así deja de salir en '
        + 'el recuento y en la lista de pedido, pero los recuentos viejos siguen cuadrando.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: cerrarHoja }),
    ],
  })
}

function mensajeDeError(err) {
  if (err?.status === 403) return 'Tu cuenta no puede cambiar el catálogo del almacén.'
  const datos = err?.response?.data
  if (datos && typeof datos === 'object') {
    const primero = Object.entries(datos)[0]
    if (primero) return `Revisa el campo «${primero[0]}»: ${primero[1]?.message || 'no es válido'}.`
  }
  return err?.response?.message || 'No hemos podido guardar el producto.'
}

// ---------------------------------------------------------------------------

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

function campoTexto(id, valor, extra = {}) {
  const n = el('input', { class: 'entrada', id, type: 'text', ...extra })
  n.value = valor
  return n
}

/**
 * Cantidad del almacen. Es texto y no `type=number` a proposito: en Espana se
 * teclea "1,5" y un campo numerico del navegador rechaza la coma. Se admiten
 * las dos, igual que en los precios de la carta.
 */
function campoNumero(id, valor) {
  const n = el('input', {
    class: 'entrada', id, type: 'text', inputmode: 'decimal', placeholder: '0',
  })
  // Un cero guardado se ensena vacio: en `stock_minimo` no hay forma de
  // distinguir "cero" de "sin poner", y un minimo de cero no pide nunca.
  n.value = valor ? numero(valor) : ''
  return n
}

/** "1,5" -> 1.5; vacio -> null; lo que no es un numero -> false. */
function aCantidad(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return false
  return n
}

function desplegable(id, opciones, valor, vacio) {
  return el('select', { class: 'entrada', id }, [
    el('option', { value: '', text: vacio, selected: !valor }),
    ...opciones.map(([clave, texto]) => el('option', {
      value: clave, selected: valor === clave, text: texto,
    })),
  ])
}

/**
 * Recuento del almacén
 * ---------------------------------------------------------------------------
 * El domingo, en el sótano, con el móvil en una mano. Se recorre el almacén
 * estantería por estantería y se teclea lo que hay.
 *
 * LO QUE MANDA EN ESTA PANTALLA ES QUE NO HAY COBERTURA. Nada espera al
 * servidor: lo tecleado se guarda en el navegador al momento y se manda cuando
 * se puede (`panel/js/cola.js`). La banda de arriba dice cuántas quedan por
 * mandar, sin alarmismo, y no bloquea nada.
 *
 * Tres cosas que no son decoración:
 *
 *   - EL ORDEN ES EL DEL RECORRIDO FÍSICO: cámara, congelador, cocina, barra,
 *     sótano. No es alfabético ni por categoría, porque contar es andar.
 *
 *   - EL CERO SE PUEDE CONTAR. Un campo vacío es «no lo he mirado» y un cero es
 *     «no queda nada», que es la respuesta más importante del recuento.
 *     Confundirlas dejaría fuera de la lista de pedido justo lo que hay que
 *     pedir.
 *
 *   - SE PUEDE SALTAR Y VOLVER. La barra de progreso cuenta lo contado, no
 *     obliga a llevar un orden. Siempre falta una caja que está detrás de otra.
 *
 * Contar lo hace cualquiera del equipo: baja al almacén quien baja. CERRAR el
 * recuento —que es lo que congela la lista de pedido— solo el administrador, y
 * eso lo comprueba el servidor (pb_hooks/almacen.pb.js).
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { mantieneAlmacen } from '../sesion.js'
import { ir } from '../enrutador.js'
import { diaDe, diaRelativo } from '../fechas.js'
import { UBICACIONES, numero } from './almacen.js'
import {
  cargarAlmacen, recuentoEnCurso, ultimoRecuentoCerrado, lineasDeRecuento,
  empezarRecuento, cambiarEstadoRecuento,
} from '../datos.js'
import * as cola from '../cola.js'

// La suscripcion a la cola vive en el modulo y no en la llamada: al volver a
// entrar en la pantalla hay que soltar la anterior, o cada visita dejaria un
// oyente mas repintando una banda que ya no esta.
let dejarDeEscuchar = null

export async function recuento(contenedor, estado) {
  if (dejarDeEscuchar) { dejarDeEscuchar(); dejarDeEscuchar = null }

  const vista = {
    cargando: true,
    error: null,
    aviso: null,
    abierto: null,
    ultimo: null,
    empezando: false,
  }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  /** Solo la banda de progreso: se repinta a cada tecla y a cada envío. */
  function repintarBanda() {
    const hueco = contenedor.querySelector('#banda-recuento')
    if (hueco) pintar(hueco, banda(estado, vista))
    else repintar()
  }

  const acciones = {
    // Reintentar vuelve a montar la pantalla entera: es una sola peticion.
    recargar() { recuento(contenedor, estado) },
    async empezar() {
      vista.empezando = true
      vista.aviso = null
      repintar()
      try {
        vista.abierto = await empezarRecuento()
        cola.abrir(vista.abierto.id, [])
      } catch (err) {
        vista.aviso = err?.response?.message || 'No hemos podido empezar el recuento.'
      }
      vista.empezando = false
      repintar()
    },

    apuntar(producto, texto) {
      const valor = aCantidad(texto)
      if (valor === false) return   // no es un número: se deja como estaba
      cola.apuntar(producto.id, { cantidad: valor })
    },

    cerrar() { hojaCerrar(vista, acciones) },

    async confirmarCierre(notas) {
      // Antes de cerrar se manda lo que quede: cerrar con líneas sin enviar
      // dejaría la lista de pedido a medias sin decirlo.
      await cola.sincronizar()
      if (cola.pendientes()) {
        throw new Error(`Quedan ${cola.pendientes()} líneas por mandar. Espera a tener cobertura.`)
      }
      await cambiarEstadoRecuento(vista.abierto.id, 'cerrado', notas)
      cola.olvidar()
      cerrarHoja()
      ir('/almacen/pedido')
    },
  }

  repintar()

  try {
    const [datos, abierto, ultimo] = await Promise.all([
      estado.almacen ? Promise.resolve(estado.almacen) : cargarAlmacen(),
      recuentoEnCurso(),
      ultimoRecuentoCerrado().catch(() => null),
    ])
    estado.almacen = datos
    vista.abierto = abierto
    vista.ultimo = ultimo

    if (abierto) {
      // Las líneas ya guardadas se cruzan con lo que quedara pendiente en este
      // móvil: manda lo pendiente, que es lo que se acaba de teclear.
      const lineas = await lineasDeRecuento(abierto.id).catch(() => [])
      cola.abrir(abierto.id, lineas)
    }
  } catch (err) {
    vista.error = err
  }
  vista.cargando = false

  dejarDeEscuchar = cola.alCambiar(repintarBanda)
  repintar()

  // Quien apaga los reintentos al salir de la pantalla es el enrutador
  // (panel/js/app.js). Lo pendiente NO se borra: sigue en el navegador y se
  // manda al volver a entrar, o al recuperar la red si la pantalla sigue abierta.
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Recuento', [], {
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
      texto: 'No se ha podido cargar el almacén.',
      alReintentar: acc.recargar, err: vista.error, donde: 'recuento',
    })
  }
  if (vista.cargando) return esqueletoFilas(6)
  if (!vista.abierto) return sinEmpezar(vista, acc)

  const productos = (estado.almacen?.productos || []).filter((p) => p.activo !== false)

  return [
    el('div', { id: 'banda-recuento' }, banda(estado, vista)),
    el('div', { class: 'margen' }, [
      ...gruposPorUbicacion(productos).map((g) => grupo(g, acc)),
      pieCerrar(vista, acc),
      el('div', { style: 'height: var(--sp-5)' }),
    ]),
  ]
}

/**
 * Cuando no hay ninguno empezado.
 *
 * Dice cuándo fue el último, porque es la pregunta que se hace de verdad al
 * entrar aquí: «¿esto lo hicimos ya este domingo?».
 */
function sinEmpezar(vista, acc) {
  const dia = vista.ultimo ? diaDe(vista.ultimo.fecha) : null

  return el('div', { class: 'margen margen--alto' }, [
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'margen', style: 'padding-block: var(--sp-4)' }, [
        el('p', { class: 'parrafo', text: 'No hay ningún recuento empezado.' }),
        el('p', { class: 'parrafo parrafo--apagado', text: dia
          ? `El último fue ${diaRelativo(dia)}${vista.ultimo.expand?.hecho_por?.nombre ? `, lo hizo ${vista.ultimo.expand.hecho_por.nombre}` : ''}.`
          : 'Todavía no se ha hecho ninguno.' }),
        el('button', {
          type: 'button', class: 'btn btn--primario btn--suelto',
          text: vista.empezando ? 'Empezando…' : 'Empezar el recuento',
          disabled: vista.empezando || null,
          onclick: acc.empezar,
        }),
      ]),
    ]),
    el('p', { class: 'parrafo parrafo--apagado', style: 'margin-top: var(--sp-4)' , text:
      'Se puede contar sin cobertura: lo que teclees se guarda en el móvil y se manda solo '
      + 'cuando vuelva la señal. Puedes saltarte productos y volver luego.' }),
  ])
}

/**
 * La banda de arriba: cuánto llevas contado y cuánto queda por mandar.
 *
 * Lo pendiente NO se pinta como un error. No lo es: es lo normal en el sótano, y
 * asustar con ello haría que alguien subiera a la barra a media cuenta.
 */
function banda(estado, vista) {
  if (!vista.abierto) return []

  const total = (estado.almacen?.productos || []).filter((p) => p.activo !== false).length
  const hechas = cola.contadas()
  const quedan = cola.pendientes()
  const porcentaje = total ? Math.round((hechas / total) * 100) : 0

  return el('div', { class: 'recuento-banda' }, [
    el('div', { class: 'recuento-banda__cifras' }, [
      el('span', { class: 'recuento-banda__cuenta', text: `${hechas} de ${total} contados` }),
      quedan
        ? el('span', { class: 'recuento-banda__cola', text:
          `${quedan} ${quedan === 1 ? 'línea' : 'líneas'} por mandar` })
        : el('span', { class: 'recuento-banda__ok', text: 'Todo guardado' }),
    ]),
    el('div', { class: 'progreso', role: 'progressbar',
      'aria-valuenow': String(hechas), 'aria-valuemin': '0', 'aria-valuemax': String(total),
      'aria-label': 'Productos contados' }, [
      el('div', { class: 'progreso__barra', style: `width:${porcentaje}%` }),
    ]),
  ])
}

function gruposPorUbicacion(productos) {
  const grupos = UBICACIONES
    .map(([clave, titulo]) => ({ titulo, lista: productos.filter((p) => p.ubicacion === clave) }))
    .filter((g) => g.lista.length)

  const conocidas = new Set(UBICACIONES.map(([clave]) => clave))
  const sueltos = productos.filter((p) => !conocidas.has(p.ubicacion))
  if (sueltos.length) grupos.push({ titulo: 'Sin ubicación', lista: sueltos })

  return grupos
}

function grupo({ titulo, lista }, acc) {
  return el('section', { class: 'tarjeta tarjeta--suelta' }, [
    el('div', { class: 'grupo' }, [
      el('h2', { class: 'grupo__nombre', text: titulo }),
      el('span', { class: 'grupo__cuenta', text:
        `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}` }),
    ]),
    el('div', { class: 'filas' }, lista.map((p) => filaCuenta(p, acc))),
  ])
}

function filaCuenta(producto, acc) {
  const guardado = cola.apunte(producto.id)
  const id = `cuenta-${producto.id}`

  const campo = el('input', {
    class: 'entrada entrada--cuenta', id, type: 'text', inputmode: 'decimal',
    placeholder: '—', autocomplete: 'off',
  })
  campo.value = guardado?.contada ? numero(guardado.cantidad) : ''

  const fila = el('div', {
    class: `fila-cuenta${guardado?.contada ? ' fila-cuenta--contada' : ''}`,
  }, [
    el('label', { class: 'fila-cuenta__cuerpo', for: id }, [
      el('span', { class: 'fila-cuenta__nombre', text: producto.nombre }),
      el('span', { class: 'fila-cuenta__pie', text: [
        producto.unidad || null,
        producto.stock_minimo ? `mínimo ${numero(producto.stock_minimo)}` : null,
      ].filter(Boolean).join(' · ') || 'sin unidad ni mínimo' }),
    ]),
    campo,
  ])

  // Al salir del campo (o al pulsar Intro), no a cada tecla: escribir "12"
  // mandaría dos líneas, una con el 1 y otra con el 12.
  campo.addEventListener('change', () => {
    acc.apuntar(producto, campo.value)
    fila.classList.toggle('fila-cuenta--contada', campo.value.trim() !== '')
  })

  return fila
}

function pieCerrar(vista, acc) {
  if (!mantieneAlmacen()) {
    return el('p', { class: 'parrafo parrafo--apagado', style: 'margin-top: var(--sp-4)', text:
      'Cuando acabes, avisa: el recuento lo cierra un administrador, y al cerrarlo '
      + 'sale la lista de pedido.' })
  }

  return el('div', { style: 'margin-top: var(--sp-4)' }, [
    el('button', {
      type: 'button', class: 'btn btn--primario', text: 'Cerrar el recuento',
      onclick: acc.cerrar,
    }),
    el('p', { class: 'parrafo parrafo--apagado', style: 'margin-top: var(--sp-2)', text:
      'Al cerrarlo sale la lista de pedido y lo contado deja de poder cambiarse. '
      + 'Se puede volver a abrir si te has equivocado.' }),
  ])
}

// ---------------------------------------------------------------------------

function hojaCerrar(vista, acc) {
  const quedan = cola.pendientes()
  const notas = el('textarea', {
    class: 'entrada entrada--area', id: 'rec-notas', rows: '2', maxlength: '1000',
    placeholder: 'La cámara de abajo estaba a medio ordenar',
  })
  notas.value = vista.abierto?.notas || ''

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Cerrar y ver el pedido' })

  boton.addEventListener('click', async () => {
    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Cerrando…'
    try {
      await acc.confirmarCierre(notas.value.trim())
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Cerrar y ver el pedido'
      error.textContent = err?.status === 403
        ? 'El recuento lo cierra un administrador.'
        : (err?.message || err?.response?.message || 'No hemos podido cerrarlo.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: '¿Cerrar el recuento?',
    cuerpo: [
      el('p', { class: 'parrafo', text: `Has contado ${cola.contadas()} productos.` }),
      quedan
        ? el('p', { class: 'parrafo', text:
          `Quedan ${quedan} ${quedan === 1 ? 'línea' : 'líneas'} por mandar. Se intentará antes de cerrar.` })
        : null,
      el('div', { class: 'campo' }, [
        el('label', { class: 'campo__rotulo', for: 'rec-notas', text: 'Notas (opcional)' }),
        notas,
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Lo que no hayas contado no entra en la lista de pedido: de eso no sabemos cuánto hay.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Seguir contando', onclick: cerrarHoja }),
    ],
  })
}

/** "1,5" -> 1.5; vacío -> null (sin contar); lo que no es número -> false. */
function aCantidad(texto) {
  const limpio = String(texto ?? '').trim().replace(',', '.')
  if (limpio === '') return null
  const n = Number(limpio)
  if (!Number.isFinite(n) || n < 0) return false
  return n
}

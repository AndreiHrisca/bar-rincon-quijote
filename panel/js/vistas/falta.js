/**
 * Apuntar una falta
 * ---------------------------------------------------------------------------
 * La pantalla de dos toques (sección 9.1). Se usa CON PRISA, en mitad del
 * servicio, con una mano y con las manos sucias: se abre la lista, se toca el
 * producto y se dice si queda poco o si se ha acabado. Ya está.
 *
 * Por eso, y esto no es capricho:
 *
 *   - NO HAY CANTIDADES. Nadie pesa la harina que queda a las dos de la tarde.
 *     Las cantidades son del recuento del domingo, que es otro flujo y otra
 *     colección (fase 8). Mezclarlos convierte diez segundos en dos minutos y
 *     acaba con la gente volviendo al papel.
 *
 *   - LO QUE MÁS SE ACABA, ARRIBA. El orden lo pone cuántas veces se ha
 *     apuntado cada cosa: en un bar son siempre las mismas seis cosas.
 *
 *   - SE PUEDE DAR DE ALTA UN PRODUCTO CON SOLO EL NOMBRE. Si falta algo que no
 *     está en la lista, se escribe y se apunta; queda marcado como «sin
 *     configurar» para que alguien lo termine luego (pb_hooks/almacen.pb.js).
 *     Lo contrario —«ese producto no existe, avisa al encargado»— es la forma
 *     más segura de que la falta no se apunte en ninguna parte.
 *
 *   - APUNTAR NO CIERRA LA PANTALLA. Cuando se repasa la cámara se apuntan tres
 *     o cuatro cosas seguidas.
 *
 * Esta pantalla la usa TODO el equipo, cocina incluida: es su función principal
 * en el sistema, y las reglas de `avisos_stock` y `productos` lo permiten.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { NIVEL } from '../piezas/faltas.js'
import { ir } from '../enrutador.js'
import {
  cargarAlmacen, avisosPendientes, usoDeProductos,
  crearAviso, cambiarNivelAviso, resolverAviso, guardarProducto,
} from '../datos.js'

export async function falta(contenedor, estado) {
  const vista = {
    texto: '',
    cargando: true,
    error: null,
    aviso: null,
    hecho: null,      // "Apuntado: harina de trigo"
    uso: new Map(),
  }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    // Reintentar vuelve a montar la pantalla entera: es una sola peticion.
    recargar() { falta(contenedor, estado) },
    buscar(texto) { vista.texto = texto; repintarLista() },
    volver() { ir('/almacen') },

    /** El toque en un producto: abre la hoja de los dos niveles. */
    elegir(producto) {
      const vivo = (estado.avisos || []).find((a) => a.producto === producto.id)
      hojaNivel(producto, vivo, acciones)
    },

    async apuntar(producto, nivel, nota) {
      const vivo = (estado.avisos || []).find((a) => a.producto === producto.id)
      if (vivo) {
        const guardado = await cambiarNivelAviso(vivo.id, nivel)
        Object.assign(vivo, guardado)
      } else {
        const creado = await crearAviso({ producto: producto.id, nivel, nota })
        // Se le pone el expand a mano: la respuesta de crear no lo trae y la
        // tarjeta de faltas de «Hoy» y de «Almacén» pinta el nombre desde ahi.
        estado.avisos = [...(estado.avisos || []), { ...creado, expand: { producto } }]
      }
      vista.hecho = `${producto.nombre}: ${NIVEL[nivel]?.texto.toLowerCase() || nivel}`
      vista.aviso = null
      repintar()
    },

    async resolver(producto) {
      const vivo = (estado.avisos || []).find((a) => a.producto === producto.id)
      if (!vivo) return
      await resolverAviso(vivo.id, true)
      estado.avisos = (estado.avisos || []).filter((a) => a.id !== vivo.id)
      vista.hecho = `${producto.nombre}: repuesto`
      repintar()
    },

    /**
     * Alta al vuelo. Solo el nombre; el servidor la marca como sin configurar.
     * Nada mas crearla se abre la hoja de niveles, porque quien la crea es
     * porque le falta AHORA.
     */
    async darDeAlta(nombre) {
      try {
        const creado = await guardarProducto(null, { nombre, activo: true })
        estado.almacen.productos.push(creado)
        vista.texto = ''
        vista.aviso = null
        repintar()
        acciones.elegir(creado)
      } catch (err) {
        vista.aviso = err?.response?.data?.nombre
          ? 'Ya hay un producto con ese nombre. Búscalo en la lista.'
          : 'No hemos podido darlo de alta. Inténtalo otra vez.'
        repintar()
      }
    },
  }

  /** Repinta solo la lista, para que el campo de buscar no pierda el foco. */
  function repintarLista() {
    const hueco = contenedor.querySelector('#lista-falta')
    if (hueco) pintar(hueco, lista(estado, vista, acciones))
    else repintar()
  }

  repintar()

  try {
    const [datos, avisos, uso] = await Promise.all([
      estado.almacen ? Promise.resolve(estado.almacen) : cargarAlmacen(),
      avisosPendientes(),
      // Si esto falla, la pantalla sigue: sin el recuento de uso la lista sale
      // por orden alfabetico, que es peor pero no impide apuntar nada.
      usoDeProductos().catch(() => new Map()),
    ])
    estado.almacen = datos
    estado.avisos = avisos
    vista.uso = uso
  } catch (err) {
    vista.error = err
  }
  vista.cargando = false
  repintar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  const campo = el('input', {
    class: 'entrada', type: 'search', value: vista.texto,
    placeholder: 'Buscar un producto', 'aria-label': 'Buscar un producto',
    autocomplete: 'off',
  })
  campo.addEventListener('input', () => acc.buscar(campo.value))

  return el('div', { class: 'pantalla' }, [
    cabecera('Apuntar una falta', [], {
      volver: { titulo: 'Volver al almacén', alPulsar: acc.volver },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        campo,
        vista.hecho
          ? el('p', { class: 'apuntado', role: 'status', text: `Apuntado · ${vista.hecho}` })
          : el('p', { class: 'parrafo parrafo--apagado', text:
            'Toca lo que falte. Dos toques y queda apuntado para todos.' }),
        vista.aviso ? el('p', { class: 'hoja__error', role: 'alert', text: vista.aviso }) : null,
      ]),

      el('div', { class: 'margen', id: 'lista-falta' }, lista(estado, vista, acc)),
    ]),
  ])
}

function lista(estado, vista, acc) {
  if (vista.error) {
    return fallo({
      texto: 'No se ha podido cargar el almacén.',
      alReintentar: acc.recargar, err: vista.error, donde: 'falta',
    })
  }
  if (vista.cargando) return esqueletoFilas(6)

  const texto = normalizar(vista.texto)
  const todos = (estado.almacen?.productos || []).filter((p) => p.activo !== false)
  const encontrados = texto
    ? todos.filter((p) => normalizar(p.nombre).includes(texto))
    : todos

  const vivos = new Map((estado.avisos || []).map((a) => [a.producto, a]))

  // Primero lo que ya esta apuntado —para poder subirlo de nivel o darlo por
  // repuesto sin buscarlo— y despues lo demas, lo mas apuntado arriba.
  const apuntados = encontrados.filter((p) => vivos.has(p.id))
  const resto = encontrados
    .filter((p) => !vivos.has(p.id))
    .sort((a, b) => (vista.uso.get(b.id) || 0) - (vista.uso.get(a.id) || 0)
      || a.nombre.localeCompare(b.nombre, 'es'))

  return [
    apuntados.length
      ? el('section', { class: 'tarjeta tarjeta--suelta' }, [
        el('div', { class: 'grupo' }, [
          el('h2', { class: 'grupo__nombre', text: 'Ya apuntados' }),
        ]),
        el('div', { class: 'filas' }, apuntados.map((p) => botonProducto(p, vivos.get(p.id), acc))),
      ])
      : null,

    resto.length
      ? el('section', { class: 'tarjeta tarjeta--suelta' }, [
        el('div', { class: 'filas' }, resto.map((p) => botonProducto(p, null, acc))),
      ])
      : null,

    altaAlVuelo(vista, encontrados, acc),
    el('div', { style: 'height: var(--sp-5)' }),
  ]
}

function botonProducto(prod, avisoVivo, acc) {
  const nivel = avisoVivo ? NIVEL[avisoVivo.nivel] : null
  return el('button', {
    type: 'button', class: 'toca-prod toque-min',
    onclick: () => acc.elegir(prod),
  }, [
    el('span', { class: 'toca-prod__cuerpo' }, [
      el('span', { class: 'toca-prod__nombre', text: prod.nombre }),
      prod.unidad ? el('span', { class: 'toca-prod__pie', text: prod.unidad }) : null,
    ]),
    nivel ? el('span', { class: `pastilla ${nivel.pastilla}`, text: nivel.texto }) : null,
  ])
}

/**
 * «No está en la lista».
 *
 * Solo sale con algo escrito y sin coincidencia exacta: es la valvula de escape,
 * no la puerta principal. Si saliera siempre, se acabarian creando dos productos
 * «harina» y «Harina de trigo».
 */
function altaAlVuelo(vista, encontrados, acc) {
  const escrito = vista.texto.trim()
  if (escrito.length < 2) return null
  if (encontrados.some((p) => normalizar(p.nombre) === normalizar(escrito))) return null

  return el('div', { class: 'alta-vuelo' }, [
    el('p', { class: 'parrafo parrafo--apagado', text:
      encontrados.length ? '¿No es ninguno de esos?' : 'No hay ningún producto que se llame así.' }),
    el('button', {
      type: 'button', class: 'btn btn--linea',
      text: `Dar de alta «${escrito}» y apuntarlo`,
      onclick: () => acc.darDeAlta(escrito),
    }),
    el('p', { class: 'parrafo parrafo--apagado', text:
      'Se crea con el nombre y nada más. Queda marcado para que alguien le ponga luego la '
      + 'unidad, el mínimo y el proveedor.' }),
  ])
}

// ---------------------------------------------------------------------------

/**
 * El segundo toque: queda poco o se ha acabado.
 *
 * Los dos botones son igual de grandes y estan abajo, donde llega el pulgar. La
 * nota es opcional y va debajo: casi nunca se escribe, y obligar a escribirla
 * seria pedirle a alguien que teclee con las manos en harina.
 */
function hojaNivel(prod, avisoVivo, acc) {
  const nota = el('input', {
    class: 'entrada', id: 'falta-nota', type: 'text', maxlength: '300',
    placeholder: 'Queda media caja, para el jueves',
  })
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })

  function boton(nivel, clase) {
    const b = el('button', { type: 'button', class: clase, text: NIVEL[nivel].texto })
    b.addEventListener('click', async () => {
      b.disabled = true
      try {
        await acc.apuntar(prod, nivel, nota.value.trim())
        cerrarHoja()
      } catch (err) {
        b.disabled = false
        error.textContent = err?.status === 403
          ? 'Tu cuenta no puede apuntar faltas.'
          : 'No hemos podido apuntarlo. Inténtalo otra vez.'
        error.hidden = false
      }
    })
    return b
  }

  const repuesto = el('button', { type: 'button', class: 'btn btn--discreto', text: 'Ya está repuesto' })
  repuesto.addEventListener('click', async () => {
    repuesto.disabled = true
    try {
      await acc.resolver(prod)
      cerrarHoja()
    } catch (err) {
      repuesto.disabled = false
      error.textContent = 'No hemos podido marcarlo. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: prod.nombre,
    cuerpo: [
      el('p', { class: 'parrafo', text: avisoVivo
        ? `Ya está apuntado como «${NIVEL[avisoVivo.nivel]?.texto.toLowerCase() || avisoVivo.nivel}». Puedes cambiarlo.`
        : '¿Qué pasa con esto?' }),
      avisoVivo ? null : el('div', { class: 'campo' }, [
        el('label', { class: 'campo__rotulo', for: 'falta-nota', text: 'Nota (opcional)' }),
        nota,
      ]),
      error,
    ],
    acciones: [
      el('div', { class: 'campos-dos' }, [
        boton('queda_poco', 'btn btn--linea'),
        boton('agotado', 'btn btn--primario'),
      ]),
      avisoVivo ? repuesto : null,
    ].filter(Boolean),
  })
}

/** Sin tildes y en minusculas, para buscar como se teclea. */
function normalizar(texto) {
  return (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

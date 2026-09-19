/**
 * Editar un plato (y crear uno nuevo)
 * ---------------------------------------------------------------------------
 * Pantalla completa y no hoja, como la maqueta: son diez campos y una foto, y
 * eso no cabe en un panel que sube desde abajo.
 *
 * Dos cosas de la maqueta que no son decoracion:
 *
 *   - LOS DOS PRECIOS VAN JUNTOS, uno al lado del otro. Es para que no se suba
 *     uno y se olvide el otro, que es el error que se comete de verdad cuando
 *     sube el proveedor.
 *
 *   - LOS ALERGENOS SON ETIQUETAS QUE SE TOCAN, no un desplegable. Son los 14
 *     del Reglamento (UE) 1169/2011 y la lista es cerrada por ley. En un
 *     desplegable de seleccion multiple, en un movil, se marca uno sin querer y
 *     no se nota; aqui se ve de un vistazo lo que lleva el plato.
 *
 * La carta la mantiene todo el equipo, precios incluidos (migracion
 * 1757200000_rol_administrador.js). Quien cambia un precio queda apuntado en
 * «Actividad» con el antes y el despues. Al
 * editar se los encuentra bloqueados y con el motivo escrito. Quien lo impide
 * de verdad es pb_hooks/roles.pb.js; esto es para no ensenarle un campo que le
 * va a devolver un 403.
 */

import { el, pintar } from '../dom.js'
import { enfocarAlta } from '../foco.js'
import { cabecera } from '../piezas/cabecera.js'
import { interruptor } from '../piezas/interruptor.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { esAdmin } from '../sesion.js'
import { ir } from '../enrutador.js'
import { cargarCarta, guardarPlato, borrarPlato, urlFoto } from '../datos.js'
import { precioOpcional, aNumero } from '../formato.js'
import { encogerImagen, MAX_LADO } from '../imagen.js'
// El importe del ingrediente extra vive en un unico sitio, compartido con la
// carta publica. Aqui no se escribe ningun 0,50.
import { importeExtra } from '/compartido/js/extras.js'
import { icono } from '/compartido/js/iconos.js'

// Los 14 del anexo II del Reglamento (UE) 1169/2011, en el mismo orden y con
// las mismas claves que la migracion 1756700400_carta.js. No se anade ni se
// quita ninguno sin que cambie la normativa.
const ALERGENOS = [
  ['gluten', 'Gluten'], ['crustaceos', 'Crustáceos'], ['huevos', 'Huevo'],
  ['pescado', 'Pescado'], ['cacahuetes', 'Cacahuete'], ['soja', 'Soja'],
  ['lacteos', 'Lácteos'], ['frutos_cascara', 'Frutos de cáscara'], ['apio', 'Apio'],
  ['mostaza', 'Mostaza'], ['sesamo', 'Sésamo'], ['sulfitos', 'Sulfitos'],
  ['altramuces', 'Altramuces'], ['moluscos', 'Moluscos'],
]

export async function plato(contenedor, estado, id) {
  const esNuevo = id === 'nuevo'

  pintar(contenedor, el('div', { class: 'pantalla' }, [
    cabecera(esNuevo ? 'Plato nuevo' : 'Editar plato', []),
    el('div', { class: 'pantalla__scroll' }, [el('p', { class: 'cargando', text: 'Cargando…' })]),
  ]))

  if (!estado.carta) {
    try {
      estado.carta = await cargarCarta()
    } catch (err) {
      return pintar(contenedor, fallo('No hemos podido cargar la carta.'))
    }
  }

  const original = esNuevo ? null : estado.carta.platos.find((p) => p.id === id)
  if (!esNuevo && !original) {
    return pintar(contenedor, fallo('Ese plato ya no existe. Puede que lo haya borrado otra persona.'))
  }

  formulario(contenedor, estado, original)
}

function fallo(mensaje) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Editar plato', []),
    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        el('p', { class: 'vacio', text: mensaje }),
        el('button', { type: 'button', class: 'btn btn--linea', text: 'Volver a la carta', onclick: () => ir('/carta') }),
      ]),
    ]),
  ])
}

// ---------------------------------------------------------------------------

function formulario(contenedor, estado, original) {
  const esNuevo = !original
  const categorias = estado.carta.categorias

  const estadoLocal = {
    alergenos: new Set(original?.alergenos || []),
    visible: original ? !!original.visible : true,
    // Va con los precios, no con los alergenos: decide lo que paga el cliente.
    admiteExtras: original ? !!original.admite_extras : false,
    foto: undefined,   // undefined = sin tocar; null = quitarla; Blob = nueva
    guardando: false,
  }

  const nombre = campoTexto('p-nombre', original?.nombre || '', { maxlength: '120', placeholder: 'Huevos rotos con jamón' })
  const descripcion = el('textarea', {
    class: 'entrada entrada--area', id: 'p-descripcion', rows: '3', maxlength: '500',
    placeholder: 'Patatas panadera, huevo de corral y jamón',
  })
  descripcion.value = original?.descripcion || ''

  // --- En ingles (P-04) ---
  // La maqueta no dibuja estos dos campos, pero el modelo los tiene desde la
  // fase 2 y la carta publica YA los usa: sin una pantalla donde escribirlos,
  // el conmutador ES/EN de la carta solo podia ensenar la interfaz traducida y
  // los platos en castellano. Van juntos y al final del formulario porque se
  // rellenan una vez y no se vuelven a tocar. Ver DECISIONES.md, D-89.
  const nombreEn = campoTexto('p-nombre-en', original?.nombre_en || '', {
    maxlength: '120', placeholder: 'Fried eggs with ham', lang: 'en', spellcheck: 'false',
  })
  const descripcionEn = el('textarea', {
    class: 'entrada entrada--area', id: 'p-descripcion-en', rows: '3', maxlength: '500',
    placeholder: 'Potatoes, free-range egg and cured ham', lang: 'en', spellcheck: 'false',
  })
  descripcionEn.value = original?.descripcion_en || ''

  const precioBarra = campoPrecio('p-barra', original?.precio_barra)
  const precioTerraza = campoPrecio('p-terraza', original?.precio_terraza)

  const categoria = el('select', { class: 'entrada', id: 'p-categoria' },
    categorias.map((c) => el('option', {
      value: c.id,
      selected: original ? c.id === original.categoria : false,
      text: c.visible === false ? `${c.nombre} (oculta)` : c.nombre,
    })))

  // Decide cuanto se le cobra de mas al cliente por el huevo, asi que va con
  // los precios y no con los alergenos. Lo puede tocar todo el equipo, igual
  // que los precios, y el cambio queda apuntado en «Actividad».
  const controlExtras = interruptor({
    nombre: 'Admite ingredientes extra',
    pie: `En la carta sale «+${importeExtra()} por ingrediente extra»`,
    puesto: estadoLocal.admiteExtras,
    alCambiar: (v) => { estadoLocal.admiteExtras = v },
  })

  const etiquetas = el('div', { class: 'eleccion' })
  function pintarAlergenos() {
    pintar(etiquetas, ALERGENOS.map(([clave, texto]) => {
      const puesto = estadoLocal.alergenos.has(clave)
      return el('button', {
        type: 'button',
        class: `eleccion__opcion${puesto ? ' eleccion__opcion--puesta' : ''}`,
        'aria-pressed': String(puesto),
        text: texto,
        onclick: () => {
          if (puesto) estadoLocal.alergenos.delete(clave)
          else estadoLocal.alergenos.add(clave)
          pintarAlergenos()
        },
      })
    }))
  }
  pintarAlergenos()

  // --- Foto ----------------------------------------------------------------
  const archivo = el('input', {
    type: 'file', id: 'p-foto', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
    class: 'solo-lectura-pantalla',
  })
  const zonaFoto = el('div', { class: 'foto' })

  function pintarFoto() {
    const actual = estadoLocal.foto === undefined
      ? (original?.foto ? urlFoto(original, '400x0') : null)
      : (estadoLocal.foto ? URL.createObjectURL(estadoLocal.foto) : null)

    pintar(zonaFoto, actual
      ? [
        el('img', { class: 'foto__vista', src: actual, alt: `Foto de ${original?.nombre || 'el plato'}` }),
        el('div', { class: 'foto__botones' }, [
          el('button', { type: 'button', class: 'btn btn--linea', text: 'Cambiar la foto', onclick: () => archivo.click() }),
          el('button', {
            type: 'button', class: 'btn btn--discreto', text: 'Quitar la foto',
            onclick: () => { estadoLocal.foto = null; archivo.value = ''; pintarFoto() },
          }),
        ]),
      ]
      : [
        el('button', { type: 'button', class: 'foto__hueco', onclick: () => archivo.click() }, [
          icono('camara', { clase: 'ic foto__glifo' }),
          el('span', { text: 'Toca para hacer una foto o subirla' }),
        ]),
      ])
  }
  pintarFoto()

  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0]
    if (!f) return
    error.hidden = true
    try {
      // Se encoge en el navegador ANTES de subirla. Ver imagen.js: una foto de
      // movil son varios megas y el limite del campo son 8.
      estadoLocal.foto = await encogerImagen(f)
      pintarFoto()
    } catch (err) {
      falla('No hemos podido leer esa imagen. Prueba con una foto normal (JPG o PNG).')
      archivo.value = ''
    }
  })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const guardar = el('button', {
    type: 'button', class: 'btn btn--primario',
    text: esNuevo ? 'Crear el plato' : 'Guardar cambios',
  })
  guardar.addEventListener('click', enviar)

  function falla(mensaje, foco) {
    error.textContent = mensaje
    error.hidden = false
    if (foco) foco.focus()
    error.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  async function enviar() {
    if (estadoLocal.guardando) return
    error.hidden = true

    const n = nombre.value.trim()
    if (n.length < 2) return falla('Falta el nombre del plato.', nombre)
    if (!categoria.value) return falla('Elige una categoría.', categoria)

    const barra = aNumero(precioBarra.value)
    const terraza = aNumero(precioTerraza.value)
    // El precio de barra PUEDE quedarse en blanco: es un plato que todavia no
    // tiene precio, y hay 278 asi desde que se cargo la carta del bar. Se
    // guarda y se avisa en la lista, pero NO sale en la carta publica: eso lo
    // impide la regla de la coleccion, no esta pantalla (D-76).
    if (barra < 0 || (terraza !== null && terraza < 0)) return falla('Un precio no puede ser negativo.', precioBarra)
    if (barra === null && terraza !== null) {
      return falla('Si hay precio de terraza / salón, tiene que haber precio de barra.', precioBarra)
    }

    const campos = {
      nombre: n,
      descripcion: descripcion.value.trim(),
      nombre_en: nombreEn.value.trim(),
      descripcion_en: descripcionEn.value.trim(),
      categoria: categoria.value,
      alergenos: [...estadoLocal.alergenos],
      visible: estadoLocal.visible,
    }

    // Un cero es «todavia sin precio», igual que en el minimo de un producto
    // (D-53). PocketBase guarda como 0 un campo numerico vacio, asi que el
    // cero es el unico valor posible para decir «no lo se».
    campos.precio_barra = barra === null ? 0 : barra
    // Vacio de verdad, no cero: un plato sin precio de terraza no vale 0 €.
    campos.precio_terraza = terraza === null ? null : terraza
    campos.admite_extras = estadoLocal.admiteExtras

    // El orden solo se toca arrastrando en la lista. Un plato nuevo va al final
    // de su categoria, que es donde se espera encontrarlo.
    if (esNuevo) {
      const deLaCategoria = estado.carta.platos.filter((p) => p.categoria === categoria.value)
      campos.orden = (Math.max(0, ...deLaCategoria.map((p) => p.orden || 0)) + 10)
    }

    estadoLocal.guardando = true
    guardar.disabled = true
    guardar.textContent = 'Guardando…'

    try {
      let carga = campos
      if (estadoLocal.foto !== undefined) {
        // Con fichero hay que ir por multipart. Los campos de lista (alergenos)
        // se anaden uno a uno: un array metido de golpe en un FormData llega
        // como la cadena "a,b,c" y PocketBase lo rechaza.
        const fd = new FormData()
        for (const [clave, valor] of Object.entries(campos)) {
          if (Array.isArray(valor)) valor.forEach((v) => fd.append(clave, v))
          else fd.append(clave, valor === null ? '' : valor)
        }
        fd.append('foto', estadoLocal.foto || '')   // cadena vacia = quitar la foto
        carga = fd
      }

      const guardado = await guardarPlato(original?.id, carga)

      // Se refresca la copia en memoria para que la lista de detras no ensene
      // el nombre viejo al volver.
      if (original) Object.assign(original, guardado)
      else estado.carta.platos.push(guardado)

      ir('/carta')
    } catch (err) {
      estadoLocal.guardando = false
      guardar.disabled = false
      guardar.textContent = esNuevo ? 'Crear el plato' : 'Guardar cambios'
      falla(mensajeDeError(err))
    }
  }

  pintar(contenedor, el('div', { class: 'pantalla' }, [
    cabecera(esNuevo ? 'Plato nuevo' : 'Editar plato', [], {
      volver: { titulo: 'Volver a la carta', alPulsar: () => ir('/carta') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen formulario' }, [
        campo('Nombre', 'p-nombre', nombre),
        campo('Descripción', 'p-descripcion', descripcion),

        el('div', { class: 'campos-dos' }, [
          campo('Precio barra', 'p-barra', precioBarra),
          campo('Precio terraza / salón', 'p-terraza', precioTerraza),
        ]),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'El de terraza / salón puede quedarse vacío: entonces en la carta sale un solo precio. '
          + 'Las dos zonas tienen el mismo precio, por eso van en una sola columna.' }),
        // El aviso solo sale cuando de verdad falta el precio, y dice la
        // consecuencia, no la regla: lo que le importa a quien lo lee es
        // que ese plato no lo ve nadie desde la calle.
        el('p', { class: 'formulario__aviso', hidden: !!(original?.precio_barra > 0) || undefined, text:
          'Sin precio de barra, este plato no sale en la carta pública. Se guarda igual: '
          + 'está en el panel esperando a que le pongas el precio.' }),

        el('div', { class: 'campo' }, [
          el('div', { class: 'tarjeta' }, [controlExtras]),
          el('p', { class: 'parrafo parrafo--apagado', text:
            `Para bocadillos, hamburguesas y todo lo que admita «con huevo» o «con bacon». `
            + `Se cobran ${importeExtra()} por cada uno, igual en todo el bar: el importe no se `
            + 'pone aquí, es el mismo para toda la carta.' }),
        ]),

        campo('Categoría', 'p-categoria', categoria),

        el('div', { class: 'campo' }, [
          el('span', { class: 'campo__rotulo', text: 'Alérgenos' }),
          etiquetas,
          el('p', { class: 'parrafo parrafo--apagado', text:
            'Los 14 obligatorios por ley. Si un plato lleva uno y no está marcado, la carta miente.' }),
        ]),

        el('h2', { class: 'rotulo-seccion', text: 'En inglés' }),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'Opcional. Lo que dejes en blanco sale en castellano cuando alguien pone la carta '
          + 'en inglés: no se marca error ni se ve ningún hueco.' }),
        campo('Nombre en inglés', 'p-nombre-en', nombreEn),
        campo('Descripción en inglés', 'p-descripcion-en', descripcionEn),

        el('div', { class: 'campo' }, [
          el('span', { class: 'campo__rotulo', text: 'Foto' }),
          zonaFoto,
          archivo,
          el('p', { class: 'parrafo parrafo--apagado', text:
            `Se encoge sola a ${MAX_LADO} px antes de subirla, así que da igual el tamaño que tenga la del móvil.` }),
        ]),

        el('div', { class: 'campo' }, [
          el('div', { class: 'tarjeta' }, [
            interruptor({
              nombre: 'Visible en la carta',
              pie: estadoLocal.visible ? 'Los clientes lo ven ahora mismo' : 'Ahora mismo está oculto',
              puesto: estadoLocal.visible,
              alCambiar: (v) => { estadoLocal.visible = v },
            }),
          ]),
        ]),

        esAdmin() && original
          ? el('div', { class: 'campo' }, [
            el('button', {
              type: 'button', class: 'btn btn--discreto', text: 'Eliminar plato',
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

function confirmarBorrado(estado, plato) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarPlato(plato.id)
      estado.carta.platos = estado.carta.platos.filter((p) => p.id !== plato.id)
      cerrarHoja()
      ir('/carta')
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarlo'
      error.textContent = err?.status === 403
        ? 'Solo un administrador puede eliminar platos.'
        : 'No hemos podido eliminarlo. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar ${plato.nombre}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'Se borra de la base de datos y no se puede deshacer.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Si solo se ha acabado, no lo elimines: apágalo con el interruptor de la lista. '
        + 'Así vuelve a la carta con un toque cuando haya, y no hay que escribirlo otra vez.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: cerrarHoja }),
    ],
  })
}

function mensajeDeError(err) {
  if (err?.status === 403) return 'Tu cuenta no puede hacer ese cambio.'
  const datos = err?.response?.data
  if (datos && typeof datos === 'object') {
    const primero = Object.entries(datos)[0]
    if (primero) return `Revisa el campo «${primero[0]}»: ${primero[1]?.message || 'no es válido'}.`
  }
  return err?.response?.message || 'No hemos podido guardar el plato.'
}

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

function campoPrecio(id, valor) {
  const n = el('input', {
    class: 'entrada', id, type: 'text', inputmode: 'decimal',
    placeholder: '0,00',
  })
  // precioOpcional y no precio: un cero guardado significa "sin poner" y el
  // campo tiene que salir vacio, no con un "0,00" que nadie ha escrito.
  n.value = precioOpcional(valor)
  return n
}

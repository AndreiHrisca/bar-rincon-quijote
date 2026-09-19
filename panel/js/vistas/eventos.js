/**
 * Eventos
 * ---------------------------------------------------------------------------
 * El menú navideño, los vermús con música y las celebraciones. Lo que hasta hoy
 * era un papel plastificado que había que reimprimir cada año.
 *
 * LA MAQUETA NO DIBUJA ESTA PANTALLA. Dibuja la del cliente («Qué se cuece»),
 * pero no dónde se escriben. Se ha construido con las piezas que ya existen
 * —tarjeta, filas, hoja de edición, interruptor— sin inventar patrones nuevos,
 * igual que se hizo con las cuatro pantallas del almacén (D-47).
 *
 * Cuelga de «Más» por la misma razón que el almacén: la barra inferior tiene
 * las cinco entradas de la maqueta y no se toca (D-33). Un evento se crea
 * cuatro veces al año.
 *
 * Quién puede: solo el administrador. Los eventos son la cara pública del bar
 * —lo que se anuncia en la web— y anunciarlos es administrar el negocio, no
 * trabajo del turno. Lo decide la colección
 * (migración 1756700800_eventos_metricas.js); aquí solo se evita enseñar
 * botones que van a devolver un 403.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { interruptor } from '../piezas/interruptor.js'
import { esAdmin, gestionaReservas } from '../sesion.js'
import { ir } from '../enrutador.js'
import { cargarEventos, guardarEvento, borrarEvento, urlImagenEvento } from '../datos.js'
import { diaDe, hoyISO, fechaLarga, aFechaPB } from '../fechas.js'
import { precioConSimbolo, aNumero } from '../formato.js'
import { encogerImagen, MAX_LADO } from '../imagen.js'
import { icono } from '/compartido/js/iconos.js'

export async function eventos(contenedor, estado) {
  const vista = { cargando: !estado.eventos, error: null }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    nuevo() { editar(null) },
    abrir(evento) { editar(evento) },
  }

  function editar(evento) {
    if (!gestionaReservas()) return
    hojaEvento(evento, {
      alGuardar(guardado) {
        const lista = estado.eventos
        const i = lista.findIndex((e) => e.id === guardado.id)
        if (i === -1) lista.push(guardado)
        else lista[i] = guardado
        ordenar(lista)
        repintar()
      },
      alBorrar(id) {
        estado.eventos = estado.eventos.filter((e) => e.id !== id)
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
      estado.eventos = await cargarEventos()
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }
  acciones.recargar = cargar

  repintar()
  if (!estado.eventos) await cargar()
  else { vista.cargando = false; repintar() }
}

/** Del más próximo al más lejano; los pasados, del más reciente al más viejo. */
function ordenar(lista) {
  lista.sort((a, b) => String(b.fecha_inicio).localeCompare(String(a.fecha_inicio)))
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Eventos', [
      gestionaReservas() ? { icono: 'anadir', titulo: 'Evento nuevo', activo: true, alPulsar: acc.nuevo } : null,
    ], {
      volver: { titulo: 'Volver a Más', alPulsar: () => ir('/mas') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        vista.error
          ? fallo({
            texto: 'No se han podido cargar los eventos.',
            alReintentar: acc.recargar, err: vista.error, donde: 'eventos',
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
  const lista = estado.eventos || []
  if (!lista.length) {
    return el('section', { class: 'tarjeta' }, [
      el('p', { class: 'vacio', text:
        'Todavía no hay ningún evento. Con el «+» se crea el primero: el menú navideño, '
        + 'un vermú con música, una comida de empresa.' }),
    ])
  }

  const hoy = hoyISO()
  const fin = (e) => diaDe(e.fecha_fin || e.fecha_inicio)
  const proximos = lista.filter((e) => fin(e) >= hoy).reverse()
  const pasados = lista.filter((e) => fin(e) < hoy)

  return [
    el('h2', { class: 'rotulo-seccion', text: 'Por venir' }),
    el('section', { class: 'tarjeta' }, [
      proximos.length
        ? el('div', { class: 'filas' }, proximos.map((e) => fila(e, acc)))
        : el('p', { class: 'vacio', text: 'Nada anunciado. La pantalla de eventos de la web sale vacía.' }),
    ]),

    pasados.length
      ? [
        el('h2', { class: 'rotulo-seccion', text: 'Ya pasaron' }),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'No se borran: el del año pasado es el borrador del de este año. Ábrelo, cámbiale '
          + 'las fechas y vuelve a encenderlo.' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, pasados.map((e) => fila(e, acc))),
        ]),
      ]
      : null,
  ]
}

function fila(evento, acc) {
  const foto = urlImagenEvento(evento, '100x100')
  const pie = [
    cuando(evento),
    evento.hora || null,
    evento.precio ? precioConSimbolo(evento.precio) : null,
    evento.visible ? null : 'Oculto',
  ].filter(Boolean).join(' · ')

  const cuerpo = [
    foto
      ? el('span', { class: 'fila-ev__foto' }, [el('img', { src: foto, alt: '', loading: 'lazy' })])
      : null,
    el('span', { class: 'fila-prod__cuerpo' }, [
      el('span', { class: 'fila-prod__nombre', text: evento.titulo }),
      el('span', { class: 'fila-prod__pie', text: pie }),
    ]),
  ]

  return el('div', { class: `fila-prod${evento.visible ? '' : ' fila-prod--apagada'}` },
    gestionaReservas()
      ? el('button', { type: 'button', class: 'fila-prod__abrir', onclick: () => acc.abrir(evento) }, cuerpo)
      : el('div', { class: 'fila-prod__abrir fila-prod__abrir--quieta' }, cuerpo))
}

function cuando(evento) {
  const inicio = diaDe(evento.fecha_inicio)
  const fin = diaDe(evento.fecha_fin)
  if (!fin || fin === inicio) return fechaLarga(inicio)

  // Dentro del mismo ano, el ano se dice una vez: «Del 17 de octubre al 21 de
  // noviembre de 2026». Repetirlo dos veces se come dos renglones en un movil.
  const mismoAno = inicio.slice(0, 4) === fin.slice(0, 4)
  const desde = mismoAno ? fechaLarga(inicio).replace(/ de \d{4}$/, '') : fechaLarga(inicio)
  return `Del ${desde} al ${fechaLarga(fin)}`
}

// ---------------------------------------------------------------------------
// La hoja de edición
// ---------------------------------------------------------------------------

function hojaEvento(evento, { alGuardar, alBorrar }) {
  const esNuevo = !evento
  const reabrir = () => hojaEvento(evento, { alGuardar, alBorrar })

  const local = {
    visible: evento ? !!evento.visible : true,
    imagen: undefined,   // undefined = sin tocar; null = quitarla; Blob = nueva
  }

  const titulo = texto('ev-titulo', evento?.titulo || '', {
    maxlength: '120', placeholder: 'Menú navideño',
  })
  const descripcion = area('ev-descripcion', evento?.descripcion || '',
    'Tres entrantes, principal a elegir, postre, vino y café. Para empresas y familias.')

  const inicio = texto('ev-inicio', diaDe(evento?.fecha_inicio) || hoyISO(), { type: 'date' })
  const fin = texto('ev-fin', diaDe(evento?.fecha_fin), { type: 'date' })
  const hora = texto('ev-hora', evento?.hora || '', { type: 'time', placeholder: '13:00' })
  const precio = texto('ev-precio', evento?.precio ? String(evento.precio).replace('.', ',') : '', {
    inputmode: 'decimal', placeholder: '40,00',
  })

  const tituloEn = texto('ev-titulo-en', evento?.titulo_en || '', {
    maxlength: '120', placeholder: 'Christmas set menu', lang: 'en', spellcheck: 'false',
  })
  const descripcionEn = area('ev-descripcion-en', evento?.descripcion_en || '',
    'Three starters, a main course, dessert, wine and coffee.', { lang: 'en', spellcheck: 'false' })

  // --- Imagen ---
  const archivo = el('input', {
    type: 'file', id: 'ev-imagen', accept: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
    class: 'trampa',
  })
  const zonaImagen = el('div', { class: 'foto' })

  function pintarImagen() {
    const actual = local.imagen === undefined
      ? (evento?.imagen ? urlImagenEvento(evento, '400x0') : null)
      : (local.imagen ? URL.createObjectURL(local.imagen) : null)

    pintar(zonaImagen, actual
      ? [
        el('img', { class: 'foto__vista', src: actual, alt: `Imagen de ${evento?.titulo || 'el evento'}` }),
        el('div', { class: 'foto__botones' }, [
          el('button', { type: 'button', class: 'btn btn--linea', text: 'Cambiar la imagen', onclick: () => archivo.click() }),
          el('button', {
            type: 'button', class: 'btn btn--discreto', text: 'Quitarla',
            onclick: () => { local.imagen = null; archivo.value = ''; pintarImagen() },
          }),
        ]),
      ]
      : el('button', { type: 'button', class: 'foto__hueco', onclick: () => archivo.click() }, [
        icono('camara', { clase: 'ic foto__glifo' }),
        el('span', { text: 'Toca para añadir un cartel o una foto' }),
      ]))
  }
  pintarImagen()

  archivo.addEventListener('change', async () => {
    const f = archivo.files?.[0]
    if (!f) return
    try {
      // Se encoge en el navegador ANTES de subirla, igual que la foto de un
      // plato: es lo que convierte el HEIC del iPhone en JPEG, que es lo unico
      // que la coleccion acepta.
      local.imagen = await encogerImagen(f)
      pintarImagen()
    } catch (err) {
      error.textContent = 'No hemos podido leer esa imagen. Prueba con una foto normal (JPG o PNG).'
      error.hidden = false
    }
  })

  const controlVisible = interruptor({
    nombre: 'Visible en la web',
    pie: 'Apagado, no sale en «Qué se cuece». Sirve para dejarlo preparado.',
    puesto: local.visible,
    alCambiar: (v) => { local.visible = v },
  })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', {
    type: 'button', class: 'btn btn--primario', text: esNuevo ? 'Crear' : 'Guardar',
  })

  boton.addEventListener('click', async () => {
    const t = titulo.value.trim()
    if (t.length < 2) return falla('Falta el título del evento.', titulo)
    if (!inicio.value) return falla('Falta la fecha.', inicio)
    if (fin.value && fin.value < inicio.value) {
      return falla('La fecha de fin es anterior a la de inicio.', fin)
    }

    const importe = aNumero(precio.value)
    if (precio.value.trim() && importe === null) return falla('El precio no se entiende.', precio)

    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'

    // Las fechas SIN hora se guardan como medianoche UTC del dia natural (D-19).
    // La hora va aparte y como texto HH:MM, que no es un instante: son «las
    // ocho», las de aqui, y no cambian si alguien mira la web desde Londres.
    const campos = {
      titulo: t,
      descripcion: descripcion.value.trim(),
      titulo_en: tituloEn.value.trim(),
      descripcion_en: descripcionEn.value.trim(),
      fecha_inicio: aFechaPB(inicio.value),
      fecha_fin: fin.value ? aFechaPB(fin.value) : '',
      hora: hora.value || '',
      precio: importe === null ? 0 : importe,
      visible: local.visible,
    }

    try {
      let carga = campos
      if (local.imagen !== undefined) {
        const fd = new FormData()
        for (const [clave, valor] of Object.entries(campos)) {
          fd.append(clave, valor === null ? '' : valor)
        }
        fd.append('imagen', local.imagen || '')   // cadena vacia = quitarla
        carga = fd
      }

      const guardado = await guardarEvento(evento?.id, carga)
      cerrarHoja()
      alGuardar(guardado)
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNuevo ? 'Crear' : 'Guardar'
      falla(err?.status === 403
        ? 'Tu cuenta no puede tocar los eventos.'
        : (err?.response?.message || 'No hemos podido guardarlo.'))
    }
  })

  function falla(mensaje, foco) {
    error.textContent = mensaje
    error.hidden = false
    if (foco) foco.focus()
  }

  abrirHoja({
    titulo: esNuevo ? 'Evento nuevo' : evento.titulo,
    cuerpo: [
      campo('Título', 'ev-titulo', titulo),
      campo('Descripción', 'ev-descripcion', descripcion),

      el('div', { class: 'campos-dos' }, [
        campo('Empieza', 'ev-inicio', inicio),
        campo('Acaba', 'ev-fin', fin),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        '«Acaba» solo hace falta si dura varios días, como el menú navideño. '
        + 'Un día suelto se deja vacío.' }),

      el('div', { class: 'campos-dos' }, [
        campo('Hora', 'ev-hora', hora),
        campo('Precio por persona', 'ev-precio', precio),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Las dos se pueden dejar en blanco. El precio sale pegado al título en la web: '
        + '«Menú navideño · 40,00 €».' }),

      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Imagen' }),
        zonaImagen,
        archivo,
        el('p', { class: 'parrafo parrafo--apagado', text:
          `Opcional. Se encoge sola a ${MAX_LADO} px antes de subirla.` }),
      ]),

      el('h2', { class: 'rotulo-seccion', text: 'En inglés' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Opcional. Lo que dejes en blanco sale en castellano.' }),
      campo('Título en inglés', 'ev-titulo-en', tituloEn),
      campo('Descripción en inglés', 'ev-descripcion-en', descripcionEn),

      el('div', { class: 'campo' }, [el('div', { class: 'tarjeta' }, [controlVisible])]),

      esAdmin() && evento
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Eliminar evento',
          onclick: () => confirmarBorrado(evento, alBorrar, reabrir),
        })
        : null,

      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Dejarlo', onclick: cerrarHoja }),
    ],
  })

  titulo.focus()
}

function confirmarBorrado(evento, alBorrar, alEcharseAtras) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarEvento(evento.id)
      cerrarHoja()
      alBorrar(evento.id)
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarlo'
      error.textContent = err?.status === 403
        ? 'Solo un administrador puede eliminar eventos.'
        : 'No hemos podido eliminarlo. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar ${evento.titulo}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'Se borra del todo, con su imagen. Si es de un año que ya pasó, no lo borres: '
        + 'apágalo con «Visible en la web» y te sirve de borrador el año que viene.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: alEcharseAtras }),
    ],
  })
}

// --- Piezas de formulario, iguales que en proveedores.js --------------------

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

function texto(id, valor, extra = {}) {
  const n = el('input', { class: 'entrada', id, type: 'text', ...extra })
  n.value = valor || ''
  return n
}

function area(id, valor, marcador, extra = {}) {
  const n = el('textarea', {
    class: 'entrada entrada--area', id, rows: '3', maxlength: '2000',
    placeholder: marcador, ...extra,
  })
  n.value = valor || ''
  return n
}

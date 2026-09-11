/**
 * Reserva
 * ---------------------------------------------------------------------------
 * UN SOLO FORMULARIO, sin pasos (seccion 6). Todo cabe en una pantalla que se
 * recorre con el pulgar: dia, hora, comensales, zona, motivo, nombre, telefono,
 * notas y consentimiento.
 *
 * Las franjas sin sitio se TACHAN, no se ocultan.
 *
 * El cliente ayuda, pero DECIDE EL SERVIDOR: cada cambio de dia, zona o numero
 * de comensales vuelve a preguntar la disponibilidad, y al enviar el hook lo
 * comprueba todo otra vez.
 */

import { el, pintar } from '../dom.js'
import { t } from '../idioma.js'
import { ir } from '../enrutador.js'
import { disponibilidad, crearReserva } from '../api.js'
import { icono } from '/compartido/js/iconos.js'

// Estado del formulario. Vive aqui, no en un global suelto.
let f = null

function estadoInicial() {
  return {
    fecha: null,
    hora: null,
    comensales: 2,
    zona: 'indiferente',
    motivo: 'normal',
    nombre: '',
    telefono: '',
    notas: '',
    consiente: false,
    trampa: '',            // honeypot
    enviando: false,
    error: null,
    erroresCampo: {},
    disponible: null,      // respuesta del servidor
    cargandoHoras: false,
  }
}

const NOMBRE_ZONA = {
  barra: 'Barra', terraza: 'Terraza', salon: 'Salón', indiferente: 'Me da igual',
}
const MOTIVOS = [
  ['normal', 'Comida normal'], ['cumpleanos', 'Cumpleaños'],
  ['bautizo', 'Bautizo'], ['comunion', 'Comunión'], ['empresa', 'Empresa'],
]
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

let contenedorVista = null

export function reserva(contenedor, { ajustes }) {
  contenedorVista = contenedor
  if (!f) f = estadoInicial()
  if (!f.fecha) f.fecha = diaLocal(new Date())
  pintarTodo(ajustes)
  if (!f.disponible) refrescarHoras()
}

/** Se llama al salir de la vista para no arrastrar datos de una reserva a otra. */
export function olvidarFormulario() { f = null }

function diaLocal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ---------------------------------------------------------------------------

function pintarTodo(ajustes) {
  const cerradas = f.disponible && f.disponible.activas === false

  pintar(contenedorVista,
    el('header', { class: 'topbar' }, [
      el('a', { class: 'topbar__boton', href: '/', 'aria-label': t('volver') }, [icono('chevron', { clase: 'ic ic--atras' })]),
      el('h1', { class: 'topbar__titulo', text: 'Reservar mesa' }),
    ]),

    cerradas
      ? avisoCerrado(f.disponible)
      : el('form', {
          class: 'reserva',
          novalidate: true,
          onsubmit: (e) => { e.preventDefault(); enviar(ajustes) },
        }, [
          f.error ? el('p', { class: 'aviso-form aviso-form--error', role: 'alert' }, [f.error]) : null,
          campoDia(),
          campoHora(),
          campoComensales(),
          campoZona(),
          campoMotivo(),
          campoTexto('nombre', 'A nombre de', 'Nombre y apellido', { autocomplete: 'name' }),
          campoTexto('telefono', 'Teléfono', 'Para avisarte si hay algún cambio',
                     { type: 'tel', autocomplete: 'tel', inputmode: 'tel' }),
          campoNotas(),
          campoTrampa(),
          consentimiento(),
          notaLegal(ajustes),
          el('div', { style: 'height:20px' }),
        ]),

    cerradas ? null : el('div', { class: 'barra-baja' }, [
      el('button', {
        class: 'btn btn--primario',
        type: 'submit',
        form: 'form-reserva',
        disabled: f.enviando,
        text: f.enviando ? 'Enviando…' : 'Confirmar reserva',
        onclick: (e) => { e.preventDefault(); enviar(ajustes) },
      }),
    ]),
  )
}

function avisoCerrado(d) {
  return el('div', { class: 'vacio' }, [
    el('p', { class: 'vacio__titulo', text: 'Ahora no tomamos reservas por la web' }),
    el('p', { class: 'vacio__texto', text: d.mensaje || '' }),
    d.telefono
      ? el('p', { style: 'margin-top:22px' }, [
          el('a', {
            class: 'btn btn--primario',
            href: `tel:${d.telefono}`,
            text: `Llamar al ${conEspacios(d.telefono)}`,
          }),
        ])
      : null,
  ])
}

function conEspacios(tel) {
  const d = String(tel).replace(/\D/g, '')
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : tel
}

// --- Día -------------------------------------------------------------------

function campoDia() {
  const hoy = new Date()
  const dias = []
  const maximo = 14   // dos semanas en el carrusel; el limite real lo pone el servidor

  for (let i = 0; i < maximo; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i)
    const valor = diaLocal(d)
    dias.push(el('button', {
      class: 'dia',
      type: 'button',
      'aria-pressed': String(f.fecha === valor),
      onclick: () => {
        if (f.fecha === valor) return
        f.fecha = valor
        f.hora = null       // la hora elegida puede no existir el otro dia
        refrescarHoras()
      },
    }, [
      el('span', { class: 'dia__nombre', text: i === 0 ? `HOY ${DIAS_SEMANA[d.getDay()]}` : DIAS_SEMANA[d.getDay()] }),
      el('span', { class: 'dia__numero', text: String(d.getDate()) }),
    ]))
  }

  return el('div', { class: 'campo' }, [
    el('span', { class: 'campo__etiqueta', id: 'lbl-dia', text: 'Día' }),
    el('div', { class: 'dias', role: 'group', 'aria-labelledby': 'lbl-dia' }, dias),
  ])
}

// --- Hora ------------------------------------------------------------------

function campoHora() {
  let contenido

  if (f.cargandoHoras) {
    contenido = el('p', { class: 'vacio__texto', text: 'Mirando qué mesas quedan…' })
  } else if (!f.disponible || !f.disponible.franjas?.length) {
    contenido = el('p', { class: 'vacio__texto', text: 'Ese día no hay franjas disponibles.' })
  } else {
    // Se parte en comida y cena, como en la maqueta: el bar tiene dos servicios
    // y una rejilla seguida de quince horas no se lee.
    const comida = f.disponible.franjas.filter((x) => x.hora < '17:00')
    const cena = f.disponible.franjas.filter((x) => x.hora >= '17:00')
    contenido = el('div', {}, [
      comida.length ? el('p', { class: 'horas__servicio', text: 'COMIDA' }) : null,
      comida.length ? rejillaHoras(comida) : null,
      cena.length ? el('p', { class: 'horas__servicio', text: 'CENA' }) : null,
      cena.length ? rejillaHoras(cena) : null,
    ])
  }

  return el('div', { class: 'campo' }, [
    el('span', { class: 'campo__etiqueta', id: 'lbl-hora', text: 'Hora' }),
    el('div', { role: 'group', 'aria-labelledby': 'lbl-hora' }, [contenido]),
    f.erroresCampo.hora ? el('p', { class: 'error-campo', text: f.erroresCampo.hora }) : null,
  ])
}

function rejillaHoras(franjas) {
  return el('div', { class: 'horas' }, franjas.map((x) => el('button', {
    class: 'hora',
    type: 'button',
    disabled: !x.libre,
    'aria-pressed': String(f.hora === x.hora),
    // Una franja tachada tiene que decir POR QUÉ a quien no ve el tachado.
    'aria-label': x.libre
      ? `${x.hora}, hay sitio`
      : `${x.hora}, ${x.motivo === 'pasada' ? 'ya ha pasado' : 'sin sitio'}`,
    text: x.hora,
    onclick: () => { f.hora = x.hora; f.erroresCampo.hora = null; repintar() },
  })))
}

// --- Comensales ------------------------------------------------------------

function campoComensales() {
  const maximo = f.disponible?.maxComensales || 10
  const excede = f.comensales >= maximo

  return el('div', { class: 'campo' }, [
    el('span', { class: 'campo__etiqueta', id: 'lbl-com', text: 'Comensales' }),
    el('div', { class: 'contador', role: 'group', 'aria-labelledby': 'lbl-com' }, [
      el('button', {
        class: 'contador__boton', type: 'button', 'aria-label': 'Una persona menos',
        text: '−', disabled: f.comensales <= 1,
        onclick: () => { f.comensales--; refrescarHoras() },
      }),
      el('output', { class: 'contador__valor', 'aria-live': 'polite' }, [
        String(f.comensales),
        el('small', { text: f.comensales === 1 ? 'persona' : 'personas' }),
      ]),
      el('button', {
        class: 'contador__boton', type: 'button', 'aria-label': 'Una persona más',
        text: '+', disabled: excede,
        onclick: () => { f.comensales++; refrescarHoras() },
      }),
    ]),
    // Al llegar al tope se explica por qué y se da el teléfono, en vez de dejar
    // un botón muerto sin motivo (sección 6).
    excede && f.disponible?.telefono
      ? el('p', { class: 'nota-legal', style: 'padding-left:0;padding-right:0' }, [
          `Para grupos de más de ${maximo} personas, llámanos y lo organizamos: `,
          el('a', { href: `tel:${f.disponible.telefono}`, text: conEspacios(f.disponible.telefono) }),
        ])
      : null,
  ])
}

// --- Zona y motivo ---------------------------------------------------------

function campoZona() {
  const zonas = f.disponible?.zonas || ['indiferente']
  return el('div', { class: 'campo' }, [
    el('span', { class: 'campo__etiqueta', id: 'lbl-zona', text: 'Dónde' }),
    el('div', { class: 'selector', role: 'group', 'aria-labelledby': 'lbl-zona' },
      zonas.map((z) => el('button', {
        class: 'sel', type: 'button',
        'aria-pressed': String(f.zona === z),
        text: NOMBRE_ZONA[z] || z,
        onclick: () => { f.zona = z; refrescarHoras() },
      }))),
  ])
}

function campoMotivo() {
  return el('div', { class: 'campo' }, [
    el('span', { class: 'campo__etiqueta', id: 'lbl-mot', text: 'Motivo' }),
    el('div', { class: 'selector', role: 'group', 'aria-labelledby': 'lbl-mot' },
      MOTIVOS.map(([valor, texto]) => el('button', {
        class: 'sel', type: 'button',
        'aria-pressed': String(f.motivo === valor),
        text: texto,
        onclick: () => { f.motivo = valor; repintar() },
      }))),
  ])
}

// --- Campos de texto -------------------------------------------------------

function campoTexto(nombre, etiqueta, marcador, extra = {}) {
  const error = f.erroresCampo[nombre]
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__etiqueta', for: `c-${nombre}`, text: etiqueta }),
    el('input', {
      class: 'input', id: `c-${nombre}`, name: nombre,
      type: extra.type || 'text',
      placeholder: marcador,
      value: f[nombre],
      'aria-invalid': error ? 'true' : null,
      'aria-describedby': error ? `err-${nombre}` : null,
      autocomplete: extra.autocomplete || null,
      inputmode: extra.inputmode || null,
      oninput: (e) => { f[nombre] = e.target.value },
    }),
    error ? el('p', { class: 'error-campo', id: `err-${nombre}`, text: error }) : null,
  ])
}

function campoNotas() {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__etiqueta', for: 'c-notas', text: 'Algo que debamos saber' }),
    el('textarea', {
      class: 'input', id: 'c-notas', name: 'notas',
      placeholder: 'Alergias, carrito de bebé, mesa larga…',
      oninput: (e) => { f.notas = e.target.value },
    }, [f.notas]),
  ])
}

/** Honeypot: invisible para las personas, presente para los robots. */
function campoTrampa() {
  return el('div', { class: 'trampa', 'aria-hidden': 'true' }, [
    el('label', { for: 'c-web', text: 'No rellenes este campo' }),
    el('input', {
      id: 'c-web', name: 'web', type: 'text', tabindex: '-1', autocomplete: 'off',
      oninput: (e) => { f.trampa = e.target.value },
    }),
  ])
}

// --- Consentimiento y nota legal -------------------------------------------

function consentimiento() {
  const error = f.erroresCampo.consiente
  return el('div', {}, [
    el('div', { class: 'check' }, [
      // SIN marcar por defecto (sección 12). Es un checkbox de verdad.
      el('input', {
        type: 'checkbox', id: 'c-consiente', name: 'consiente',
        checked: f.consiente || null,
        'aria-invalid': error ? 'true' : null,
        onchange: (e) => { f.consiente = e.target.checked; f.erroresCampo.consiente = null; repintar() },
      }),
      el('label', { for: 'c-consiente' }, [
        'Acepto que guardéis mi nombre y mi teléfono para gestionar esta reserva. ',
        el('a', { href: '/privacidad', text: 'Cómo tratamos tus datos' }),
      ]),
    ]),
    error ? el('p', { class: 'error-campo', style: 'padding:0 20px', text: error }) : null,
  ])
}

function notaLegal(ajustes) {
  const tel = ajustes?.telefono || f.disponible?.telefono
  const maximo = f.disponible?.maxComensales || 10
  return el('p', { class: 'nota-legal' }, [
    // Texto informativo, NO una regla automática: el sistema no cancela nada
    // por su cuenta (sección 8).
    'La mesa se guarda 15 minutos. ',
    tel ? `Para grupos de más de ${maximo} personas llámanos al ` : '',
    tel ? el('a', { href: `tel:${tel}`, text: conEspacios(tel) }) : null,
    tel ? '.' : '',
  ])
}

// ---------------------------------------------------------------------------
// Disponibilidad y envío
// ---------------------------------------------------------------------------

async function refrescarHoras() {
  f.cargandoHoras = true
  repintar()
  try {
    f.disponible = await disponibilidad({
      fecha: f.fecha, comensales: f.comensales, zona: f.zona,
    })
    // Si la hora elegida ha dejado de estar libre, se suelta y se avisa.
    if (f.hora) {
      const sigue = f.disponible.franjas?.find((x) => x.hora === f.hora)
      if (!sigue || !sigue.libre) {
        f.hora = null
        f.erroresCampo.hora = 'Esa franja se ha ocupado. Elige otra.'
      }
    }
    // Si la zona elegida ya no se ofrece, se vuelve a "me da igual".
    if (f.disponible.zonas?.length && !f.disponible.zonas.includes(f.zona)) {
      f.zona = 'indiferente'
    }
  } catch (e) {
    f.error = 'No hemos podido consultar las mesas libres. Comprueba la conexión.'
  } finally {
    f.cargandoHoras = false
    repintar()
  }
}

function repintar() {
  if (contenedorVista) pintarTodo(window.__ajustesQuijote)
}

function validar() {
  const errores = {}
  if (!f.hora) errores.hora = 'Elige una hora.'
  if (f.nombre.trim().length < 2) errores.nombre = 'Dinos a nombre de quién.'

  const tel = f.telefono.replace(/[\s.\-()]/g, '').replace(/^(\+34|0034)/, '')
  if (!/^[6789]\d{8}$/.test(tel)) {
    errores.telefono = 'Escribe un teléfono español de nueve cifras.'
  }
  if (!f.consiente) errores.consiente = 'Necesitamos tu permiso para guardar la reserva.'

  f.erroresCampo = errores
  return Object.keys(errores).length === 0
}

async function enviar(ajustes) {
  if (f.enviando) return
  f.error = null

  if (!validar()) {
    repintar()
    // El foco va al primer campo con problema: quien usa lector de pantalla no
    // tiene por qué buscarlo.
    const primero = document.querySelector('[aria-invalid="true"], .error-campo')
    primero?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    document.querySelector('[aria-invalid="true"]')?.focus()
    return
  }

  f.enviando = true
  repintar()

  try {
    const creada = await crearReserva({
      fecha: `${f.fecha} 00:00:00.000Z`,
      hora: f.hora,
      comensales: f.comensales,
      zona: f.zona,
      motivo: f.motivo,
      nombre: f.nombre.trim(),
      telefono: f.telefono.trim(),
      notas: f.notas.trim(),
      web: f.trampa,          // honeypot: el servidor lo mira
    })
    // La reserva solo llega entera UNA vez, en esta respuesta: las reglas de la
    // colección impiden volver a leerla sin sesión. Se guarda para la pantalla
    // de confirmación y para poder cancelarla.
    guardarUltima(creada)
    olvidarFormulario()
    ir(`/reserva/${creada.codigo}`)
  } catch (e) {
    f.error = e.message || 'No hemos podido guardar la reserva. Inténtalo otra vez.'
    f.enviando = false
    repintar()
    contenedorVista.querySelector('.aviso-form')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}

const CLAVE_ULTIMA = 'quijote.reserva'

export function guardarUltima(reserva) {
  try { localStorage.setItem(CLAVE_ULTIMA, JSON.stringify(reserva)) } catch (e) { /* modo privado */ }
}

export function ultimaReserva() {
  try {
    const b = localStorage.getItem(CLAVE_ULTIMA)
    return b ? JSON.parse(b) : null
  } catch (e) { return null }
}

export function olvidarUltima() {
  try { localStorage.removeItem(CLAVE_ULTIMA) } catch (e) { /* modo privado */ }
}

/**
 * Reserva a mano
 * ---------------------------------------------------------------------------
 * El boton grande de la pantalla de reservas. Es para la reserva que entra por
 * telefono, que en este bar sigue siendo la mayoria.
 *
 * LA DIFERENCIA CON EL FORMULARIO DE LA WEB (y es deliberada): aqui el sistema
 * AVISA pero no prohibe. Si la franja esta llena se dice —"ya hay 20 en terraza
 * a esa hora"— y se deja decidir a quien esta en la barra viendo las mesas de
 * verdad. Un programa que le dice "no" a Santi mientras tiene al cliente al
 * telefono es un programa que se deja de usar y se vuelve a la libreta.
 * Ver DECISIONES.md, D-27.
 *
 * Lo que si se comprueba, porque son datos y no criterio: que haya nombre y que
 * el telefono sea un telefono. Eso lo repite el servidor de todas formas.
 */

import { el, pintar } from '../dom.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { crearReserva, disponibilidad } from '../datos.js'
import { hoyISO, diaLargo, conMayuscula, franjasDelDia } from '../fechas.js'

const ZONAS = [
  { clave: 'indiferente', texto: 'Donde sea' },
  { clave: 'barra',       texto: 'Barra' },
  { clave: 'terraza',     texto: 'Terraza' },
  { clave: 'salon',       texto: 'Salón' },
]

const MOTIVOS = [
  { clave: 'normal',     texto: 'Nada especial' },
  { clave: 'cumpleanos', texto: 'Cumpleaños' },
  { clave: 'bautizo',    texto: 'Bautizo' },
  { clave: 'comunion',   texto: 'Comunión' },
  { clave: 'empresa',    texto: 'Comida de empresa' },
]

/**
 * formularioReserva({ dia, horarioCocina, alGuardar })
 *   dia            el que este seleccionado en la lista, para no teclearlo
 *   horarioCocina  "12:30-16:30,20:00-23:30", para las horas sugeridas
 *   alGuardar      se llama con la reserva creada
 */
export function formularioReserva({ dia, horarioCocina, alGuardar }) {
  const estado = { zona: 'indiferente', franjas: [], hora: null }

  const nombre = campoTexto({ id: 'r-nombre', tipo: 'text', autocomplete: 'name', placeholder: 'Familia Ortega' })
  const telefono = campoTexto({ id: 'r-telefono', tipo: 'tel', autocomplete: 'tel', placeholder: '600 11 12 22' })
  const fecha = el('input', { class: 'entrada', id: 'r-fecha', type: 'date', value: dia || hoyISO() })
  const comensales = el('input', { class: 'entrada', id: 'r-comensales', type: 'number', inputmode: 'numeric', min: '1', max: '60', value: '2' })
  const notas = el('textarea', { class: 'entrada entrada--area', id: 'r-notas', rows: '2', maxlength: '500', placeholder: 'Alergias, mesa larga, silla de bebé…' })

  const motivo = el('select', { class: 'entrada', id: 'r-motivo' },
    MOTIVOS.map((m) => el('option', { value: m.clave, text: m.texto })))

  // Las horas sugeridas son las franjas de cocina, que es cuando se come. Pero
  // el desplegable lleva ademas "Otra hora", porque por telefono se apuntan
  // meriendas y copas y el panel no tiene por que decir que no.
  const hora = el('select', { class: 'entrada', id: 'r-hora' })
  const horaLibre = el('input', { class: 'entrada', id: 'r-hora-libre', type: 'time', step: '300', hidden: true, 'aria-label': 'Otra hora' })

  const zonas = el('div', { class: 'eleccion' })
  const avisoFranja = el('p', { class: 'formulario__aviso', hidden: true })
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Apuntar la reserva' })

  function pintarZonas() {
    pintar(zonas, ZONAS.map((z) => el('button', {
      type: 'button',
      class: `eleccion__opcion${estado.zona === z.clave ? ' eleccion__opcion--puesta' : ''}`,
      'aria-pressed': String(estado.zona === z.clave),
      text: z.texto,
      onclick: () => { estado.zona = z.clave; pintarZonas(); refrescarFranjas() },
    })))
  }

  function horaElegida() {
    return hora.value === 'otra' ? horaLibre.value : hora.value
  }

  /** Pinta el desplegable de horas marcando las que ya no tienen sitio. */
  function pintarHoras(franjas) {
    const sugeridas = franjas.length
      ? franjas
      : franjasDelDia(horarioCocina).map((h) => ({ hora: h, libre: true }))

    // Si todavia no se ha tocado la hora, se propone la PRIMERA CON SITIO, no
    // la primera de la lista: a las cuatro de la tarde no tiene sentido ofrecer
    // las 12:30 de hoy, que ya ha pasado. Si ninguna tiene sitio —con los
    // aforos todavia a cero, por ejemplo, ninguna lo tiene— vale la primera que
    // al menos no haya pasado. Una vez elegida a mano, manda esa.
    const elegida = estado.hora
      || (sugeridas.find((f) => f.libre)
        || sugeridas.find((f) => f.motivo !== 'pasada')
        || sugeridas[0] || {}).hora

    pintar(hora, [
      ...sugeridas.map((f) => el('option', {
        value: f.hora,
        selected: f.hora === elegida,
        text: f.libre ? f.hora : `${f.hora} — ${motivoCorto(f.motivo)}`,
      })),
      el('option', { value: 'otra', selected: hora.value === 'otra', text: 'Otra hora…' }),
    ])
    avisarSiLlena()
  }

  async function refrescarFranjas() {
    try {
      const d = await disponibilidad({
        fecha: fecha.value,
        comensales: Math.max(1, Number(comensales.value) || 1),
        zona: estado.zona,
      })
      estado.franjas = d.franjas || []
    } catch (err) {
      // Sin respuesta se ofrecen las franjas de cocina sin marcar: es mejor
      // poder apuntar la reserva a ciegas que no poder apuntarla.
      estado.franjas = []
    }
    pintarHoras(estado.franjas)
  }

  function avisarSiLlena() {
    const h = horaElegida()
    const f = estado.franjas.find((x) => x.hora === h)
    if (!f || f.libre) { avisoFranja.hidden = true; return }
    avisoFranja.textContent = `${AVISOS[f.motivo] || AVISOS.lleno} Se puede apuntar igual.`
    avisoFranja.hidden = false
  }

  hora.addEventListener('change', () => {
    horaLibre.hidden = hora.value !== 'otra'
    if (hora.value === 'otra') horaLibre.focus()
    estado.hora = horaElegida()
    avisarSiLlena()
  })
  horaLibre.addEventListener('change', () => {
    estado.hora = horaElegida()
    avisarSiLlena()
  })
  fecha.addEventListener('change', refrescarFranjas)
  comensales.addEventListener('change', refrescarFranjas)

  boton.addEventListener('click', guardar)

  async function guardar() {
    error.hidden = true

    const h = horaElegida()
    if (!nombre.value.trim()) return falla('Falta el nombre de la reserva.', nombre)
    if (!/^[6789]\d{8}$/.test(telefono.value.replace(/[\s.\-()]/g, '').replace(/^(\+34|0034)/, ''))) {
      return falla('Ese teléfono no parece español. Escríbelo con nueve cifras.', telefono)
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(h)) return falla('Falta la hora.', hora)
    if (!fecha.value) return falla('Falta el día.', fecha)

    boton.disabled = true
    boton.textContent = 'Apuntando…'
    try {
      const creada = await crearReserva({
        // El campo es un dia del calendario: se guarda como medianoche UTC de
        // ese dia, igual que en el resto del proyecto.
        fecha: `${fecha.value} 00:00:00.000Z`,
        hora: h,
        comensales: Math.max(1, Number(comensales.value) || 1),
        zona: estado.zona,
        motivo: motivo.value,
        nombre: nombre.value.trim(),
        telefono: telefono.value.trim(),
        notas: notas.value.trim(),
        // origen y estado los pone el servidor: telefono y confirmada.
      })
      cerrarHoja()
      if (alGuardar) alGuardar(creada)
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Apuntar la reserva'
      error.textContent = err?.response?.message || err?.message
        || 'No hemos podido guardar la reserva.'
      error.hidden = false
    }
  }

  function falla(mensaje, foco) {
    error.textContent = mensaje
    error.hidden = false
    if (foco) foco.focus()
  }

  pintarZonas()
  pintarHoras([])
  refrescarFranjas()

  abrirHoja({
    titulo: 'Reserva a mano',
    cuerpo: [
      campo('Nombre', 'r-nombre', nombre),
      campo('Teléfono', 'r-telefono', telefono),
      el('div', { class: 'campos-dos' }, [
        campo('Día', 'r-fecha', fecha),
        campo('Personas', 'r-comensales', comensales),
      ]),
      campo('Hora', 'r-hora', [hora, horaLibre]),
      avisoFranja,
      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Zona' }),
        zonas,
      ]),
      campo('Motivo', 'r-motivo', motivo),
      campo('Notas', 'r-notas', notas),
      el('p', { class: 'parrafo parrafo--apagado', text:
        conMayuscula(diaLargo(dia || hoyISO())) + ' es el día que estabas mirando; cámbialo si es otro.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Dejarlo', onclick: cerrarHoja }),
    ],
  })

  nombre.focus()
}

// Por que no cabe, en dos palabras, para la etiqueta del desplegable.
// "sin aforo" no es lo mismo que "completa": con los aforos a cero no es que no
// quepa nadie, es que todavia no se ha dicho cuanta gente cabe.
function motivoCorto(motivo) {
  if (motivo === 'pasada') return 'ya pasada'
  if (motivo === 'sin_aforo_configurado') return 'sin aforo puesto'
  return 'completa'
}

const AVISOS = {
  pasada: 'Esa hora ya ha pasado.',
  sin_aforo_configurado: 'Todavía no hay aforo puesto para ninguna zona.',
  zona_no_disponible: 'Esa zona no tiene aforo puesto.',
  zona_llena: 'Esa zona ya está completa a esa hora.',
  bar_lleno: 'A esa hora no queda sitio en el bar.',
  lleno: 'A esa hora ya no queda sitio según el aforo.',
}

function campoTexto({ id, tipo, autocomplete, placeholder }) {
  return el('input', { class: 'entrada', id, type: tipo, autocomplete, placeholder, maxlength: '100' })
}

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    ...[].concat(control),
  ])
}

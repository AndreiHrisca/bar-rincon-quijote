/**
 * Cuadrante
 * ---------------------------------------------------------------------------
 * La semana, por dias en vertical y no en rejilla: siete columnas en 390 px no
 * se leen. Es la pantalla 6 de la maqueta, tal cual.
 *
 * LO QUE SE CANTA EN GRANATE SON LOS HUECOS, no las horas. El cuadrante de un
 * bar de barrio se mira para una sola cosa: ¿queda algun servicio sin nadie? Lo
 * demas —cuantas horas lleva cada uno— es del informe del mes, que esta en
 * Fichajes. Los huecos se miden contra el horario de cocina de los ajustes, que
 * es el unico horario que el sistema conoce de verdad (panel/js/horas.js).
 *
 * EL CUADRANTE AVISA, NO PROHIBE (D-27). Se pueden solapar dos turnos de la
 * misma persona, poner a alguien doce horas seguidas o dejar el domingo vacio:
 * lo unico que rechaza el servidor es un turno que empieza y acaba a la misma
 * hora, porque eso no es un turno, es un error de tecleo.
 *
 * QUIEN LO TOCA: solo el administrador (regla de la coleccion `turnos`). Al resto
 * del equipo la semana les sale entera pero de solo lectura; verla es
 * justamente para lo que sirve.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoDias } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { BASE } from '../enrutador.js'
import { gestionaPersonal } from '../sesion.js'
import {
  minutosDeTurno, serviciosSinCubrir, enHoras, tramoDeTurno, resumenDeFila, huecosDelDia,
} from '../horas.js'
import { barraDia } from '../piezas/barra-dia.js'
import {
  hoyISO, conMayuscula, diaDe, aFechaPB, lunesDe, semanaDesde,
  tituloDeSemana, masDias, diaYNumero, aMinutos,
} from '../fechas.js'
import { cargarEquipo, turnosEntre, guardarTurno, borrarTurno, avisarDelCuadrante } from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

/**
 * La hora a la que cambia la franja: se acaba el turno de manana y empieza el
 * de tarde. Se pinta como una linea vertical fina sobre el eje para que se lea
 * de un vistazo donde esta la frontera.
 *
 * Esta aqui y no en los ajustes porque es una raya de ayuda visual, no un dato
 * del negocio: cambiarla no cambia ni un turno. Si algun dia hace falta que la
 * ponga Santi, el sitio es la configuracion del horario del bar y el componente
 * ya la recibe como parametro.
 */
const CAMBIO_DE_FRANJA = '16:00'

export async function personal(contenedor, estado) {
  // La semana que se mira se guarda en el estado del panel, no en la URL: se
  // va y se vuelve de Fichajes constantemente y perder la semana en cada viaje
  // seria un fastidio. Al abrir el panel, la de hoy.
  if (!estado.semana) estado.semana = lunesDe(hoyISO())

  const vista = { cargando: true, error: null, turnos: [] }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    semanaAnterior() { estado.semana = masDias(estado.semana, -7); cargar() },
    semanaSiguiente() { estado.semana = masDias(estado.semana, 7); cargar() },
    hoy() { estado.semana = lunesDe(hoyISO()); cargar() },
    nuevo(dia) { editar(null, dia) },
    abrir(turno) { editar(turno, diaDe(turno.fecha)) },
    copiar() { hojaCopiar(estado, vista) },
    recargar() { cargar() },
  }

  function editar(turno, dia) {
    if (!gestionaPersonal()) return
    hojaTurno(turno, dia, estado, vista, {
      alGuardar(guardado) {
        const i = vista.turnos.findIndex((t) => t.id === guardado.id)
        if (i === -1) vista.turnos.push(guardado)
        else vista.turnos[i] = guardado
        ordenar(vista.turnos)
        repintar()
      },
      alBorrar(id) {
        vista.turnos = vista.turnos.filter((t) => t.id !== id)
        repintar()
      },
    })
  }

  async function cargar() {
    vista.cargando = true
    vista.error = null
    repintar()
    const semana = semanaDesde(estado.semana)
    try {
      const [equipo, turnos] = await Promise.all([
        estado.equipo ? Promise.resolve(estado.equipo) : cargarEquipo(),
        turnosEntre(semana[0], semana[6]),
      ])
      estado.equipo = equipo
      vista.turnos = turnos
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  cargar()
}

function ordenar(turnos) {
  turnos.sort((a, b) => diaDe(a.fecha).localeCompare(diaDe(b.fecha))
    || String(a.hora_inicio).localeCompare(String(b.hora_inicio)))
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Cuadrante', [
      { icono: 'chevron', clase: 'ic ic--atras', titulo: 'Semana anterior', alPulsar: acc.semanaAnterior },
      { icono: 'chevron', titulo: 'Semana siguiente', alPulsar: acc.semanaSiguiente },
    ]),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen' }, [
        titulo(estado, acc),
        vista.cargando || vista.error ? null : leyenda(),
        vista.error
          ? fallo({
            texto: 'No se ha podido cargar el cuadrante.',
            alReintentar: acc.recargar, err: vista.error, donde: 'cuadrante',
          })
          : vista.cargando
            ? esqueletoDias(3, 2)
            : semana(estado, vista, acc),
        vista.cargando || vista.error ? null : botones(acc),
        puertas(),
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),

    nav('/personal'),
  ])
}

/**
 * El titulo de la semana. Cuando no es la de hoy lleva al lado la vuelta: sin
 * eso, quien se va cuatro semanas adelante tiene que dar cuatro toques atras.
 */
function titulo(estado, acc) {
  const estaSemana = estado.semana === lunesDe(hoyISO())
  return el('div', { class: 'semana' }, [
    el('h2', { class: 'rotulo-seccion semana__titulo', text: tituloDeSemana(estado.semana) }),
    estaSemana
      ? null
      : el('button', {
        type: 'button', class: 'tarjeta__enlace semana__hoy', text: 'Esta semana', onclick: acc.hoy,
      }),
  ])
}

/**
 * Que significa cada cosa en la barra. Tres muestras y se acabo: la primera vez
 * que alguien abre esto no sabe que el trazo sin relleno es un hueco, y la
 * alternativa a decirlo es que lo adivine.
 */
function leyenda() {
  const muestra = (clase, texto) => el('span', { class: 'leyenda__item' }, [
    el('i', { class: `leyenda__muestra${clase}`, 'aria-hidden': 'true' }),
    texto,
  ])
  return el('div', { class: 'leyenda' }, [
    muestra('', 'Turno'),
    muestra(' leyenda__muestra--hueco', 'Sin cubrir'),
    muestra(' leyenda__muestra--franja', 'Cambio de franja'),
  ])
}

/**
 * La semana, en vertical y un dia debajo de otro. NUNCA una rejilla de siete
 * columnas: en 390 px no se lee, y este cuadrante se mira en un movil.
 *
 * Cada dia es una tarjeta con la MISMA barra que los fichajes
 * (panel/js/piezas/barra-dia.js). Es el mismo problema —quien esta y cuando— y
 * se resuelve con la misma pieza a proposito: quien aprende a leer los fichajes
 * sabe leer esto sin volver a aprender nada.
 */
function semana(estado, vista, acc) {
  const dias = semanaDesde(estado.semana)
  const porEmpleado = new Map((estado.equipo || []).map((e) => [e.id, e]))
  const horario = estado.ajustes?.horario_cocina || ''

  return dias.map((dia) => el('div', { class: 'dia-barras' },
    bloqueDia(dia, vista.turnos.filter((t) => diaDe(t.fecha) === dia), porEmpleado, horario, acc)))
}

function bloqueDia(dia, turnos, porEmpleado, horario, acc) {
  const esHoy = dia === hoyISO()
  const filas = filasDelDia(turnos, porEmpleado, acc)

  // Los huecos van en una FILA PROPIA, no repartidos por las de la gente: no
  // son de nadie, y esa es justamente la cuestion.
  const todos = filas.flatMap((f) => f.tramos)
  const huecos = huecosDelDia(todos, horario)

  const minutos = filas.reduce((suma, f) => suma + (resumenDeFila(f.tramos).minutos || 0), 0)

  return [
    el('div', { class: 'dia-cab' }, [
      el('h2', { class: 'dia-cab__dia', text: conMayuscula(diaYNumero(dia)) }),
      el('span', { class: 'dia-cab__resumen num', text: filas.length
        ? `${filas.length} ${filas.length === 1 ? 'turno' : 'turnos'} · ${enHoras(minutos)}`
        : 'Nadie puesto' }),
    ]),

    // Lo que falta se canta; lo que esta cubierto se dice y no grita.
    huecos.length
      ? el('p', { class: 'dia-nota', text:
        `${huecos.length} ${huecos.length === 1 ? 'hueco' : 'huecos'}` })
      : el('p', { class: 'dia-nota dia-nota--ok', text: filas.length ? 'Cubierto' : 'Sin nadie' }),

    el('section', { class: `tarjeta${esHoy ? ' tarjeta--hoy' : ''}` }, [
      barraDia({
        franjas: [CAMBIO_DE_FRANJA],
        filas: [
          ...filas,
          huecos.length
            ? { nombre: 'Sin cubrir', hueco: true, tramos: huecos,
              accion: gestionaPersonal()
                ? { texto: 'asignar', alPulsar: () => acc.nuevo(dia) }
                : { texto: 'sin cubrir' } }
            : null,
        ].filter(Boolean),
      }),

      gestionaPersonal()
        ? el('button', {
          type: 'button', class: 'dia-blq__anadir',
          text: '+ Añadir turno',
          'aria-label': `Añadir turno el ${diaYNumero(dia)}`,
          onclick: () => acc.nuevo(dia),
        })
        : null,
    ]),
  ]
}

/**
 * Una fila por PERSONA, con sus turnos del dia como tramos.
 *
 * El turno partido de este bar —manana y noche con la tarde libre— era hasta
 * ahora dos lineas sueltas que no se leian como un dia de trabajo. Ahora son
 * dos tramos de la misma fila y el hueco de la tarde se ve sin leer nada.
 */
function filasDelDia(turnos, porEmpleado, acc) {
  const suyos = new Map()
  for (const t of turnos) {
    if (!suyos.has(t.empleado)) suyos.set(t.empleado, [])
    suyos.get(t.empleado).push(t)
  }

  return [...suyos.entries()]
    .map(([id, lista]) => {
      const empleado = porEmpleado.get(id)
      const tramos = lista.map(tramoDeTurno).filter(Boolean)
      return {
        nombre: empleado?.nombre || 'Ficha borrada',
        tramos,
        // Toda la fila abre el primer turno de esa persona ese dia. Con turno
        // partido se abre el de la manana, que es el que se toca primero.
        alPulsar: gestionaPersonal() ? () => acc.abrir(lista[0]) : null,
      }
    })
    .sort((a, b) => (a.tramos[0]?.inicio ?? 0) - (b.tramos[0]?.inicio ?? 0))
}

function botones(acc) {
  return el('div', { class: 'botonera' }, [
    el('button', {
      type: 'button', class: 'btn btn--primario', text: 'Avisar del cuadrante al equipo',
      onclick: acc.copiar,
    }),
  ])
}

/**
 * Las otras dos pantallas de Personal.
 *
 * Van aqui abajo y no en la barra inferior por lo mismo que el almacen cuelga
 * de «Más» (D-33, D-46): la barra tiene las cinco entradas de la maqueta y no
 * se toca. El cuadrante es lo que se mira todos los dias; los fichajes, cuando
 * hay que cerrar el mes; las fichas del equipo, cuatro veces al ano.
 */
function puertas() {
  const filas = [
    { ruta: '/personal/fichajes', nombre: 'Fichajes', pie: 'Quién está dentro, las horas del día y el informe del mes.' },
    { ruta: '/personal/equipo', nombre: 'El equipo', pie: 'Las fichas: nombre, iniciales, teléfono y cuenta de acceso.' },
  ]
  return [
    el('h2', { class: 'rotulo-seccion', text: 'Personal' }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, filas.map((f) => el('a', { class: 'fila-ir', href: BASE + f.ruta }, [
        el('span', { class: 'fila-ir__cuerpo' }, [
          el('span', { class: 'fila-ir__nombre', text: f.nombre }),
          el('span', { class: 'fila-ir__pie', text: f.pie }),
        ]),
        icono('chevron', { clase: 'ic fila-ir__flecha' }),
      ]))),
    ]),
  ]
}

// ---------------------------------------------------------------------------
// Poner, mover y quitar un turno
// ---------------------------------------------------------------------------

function hojaTurno(turno, dia, estado, vista, { alGuardar, alBorrar }) {
  const esNuevo = !turno
  const reabrir = () => hojaTurno(turno, dia, estado, vista, { alGuardar, alBorrar })
  const activos = (estado.equipo || []).filter((e) => e.activo !== false || e.id === turno?.empleado)

  const local = { dia, empleado: turno?.empleado || activos[0]?.id || '' }

  const quien = el('select', { class: 'entrada', id: 'tu-empleado' },
    activos.map((e) => el('option', { value: e.id, selected: e.id === local.empleado, text: e.nombre })))
  quien.addEventListener('change', () => { local.empleado = quien.value })

  // Los siete dias de la semana que se esta mirando, como pastillas. Poner el
  // turno del jueves estando en la semana del jueves es un toque; para otra
  // semana se cambia de semana y ya, que es como se rellena un cuadrante.
  const dias = el('div', { class: 'eleccion' })
  function pintarDias() {
    pintar(dias, semanaDesde(estado.semana).map((d) => {
      const puesto = d === local.dia
      return el('button', {
        type: 'button',
        class: `eleccion__opcion${puesto ? ' eleccion__opcion--puesta' : ''}`,
        'aria-pressed': String(puesto),
        text: conMayuscula(diaYNumero(d)),
        onclick: () => { local.dia = d; pintarDias(); repasar() },
      })
    }))
  }

  const inicio = hora('tu-inicio', turno?.hora_inicio || '12:00')
  const fin = hora('tu-fin', turno?.hora_fin || '17:00')
  inicio.addEventListener('change', repasar)
  fin.addEventListener('change', repasar)

  const notas = el('textarea', {
    class: 'entrada entrada--area', id: 'tu-notas', rows: '2', maxlength: '300',
    placeholder: 'Cierra él',
  })
  notas.value = turno?.notas || ''

  // El aviso de D-27: dice lo que chirria y deja guardar igual.
  const repaso = el('p', { class: 'formulario__aviso', role: 'status', hidden: true })
  function repasar() {
    const texto = loQueChirria(local, inicio.value, fin.value, turno, vista.turnos, estado)
    repaso.textContent = texto || ''
    repaso.hidden = !texto
  }

  pintarDias()
  repasar()

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', {
    type: 'button', class: 'btn btn--primario', text: esNuevo ? 'Poner el turno' : 'Guardar',
  })

  boton.addEventListener('click', async () => {
    if (!local.empleado) {
      error.textContent = 'Elige de quién es el turno.'
      error.hidden = false
      return
    }
    if (aMinutos(inicio.value) === null || aMinutos(fin.value) === null) {
      error.textContent = 'Las horas se escriben como 08:00.'
      error.hidden = false
      return
    }
    if (!minutosDeTurno(inicio.value, fin.value)) {
      error.textContent = 'El turno empieza y acaba a la misma hora.'
      error.hidden = false
      return
    }
    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      const guardado = await guardarTurno(turno?.id, {
        empleado: local.empleado,
        fecha: aFechaPB(local.dia),
        hora_inicio: inicio.value,
        hora_fin: fin.value,
        notas: notas.value.trim(),
      })
      cerrarHoja()
      alGuardar(guardado)
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNuevo ? 'Poner el turno' : 'Guardar'
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede tocar el cuadrante.'
        : (err?.response?.message || 'No hemos podido guardarlo.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: esNuevo ? 'Turno nuevo' : 'Cambiar el turno',
    cuerpo: [
      campo('Quién', 'tu-empleado', quien),
      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Qué día' }),
        dias,
      ]),
      el('div', { class: 'campos-dos' }, [
        campo('Entra', 'tu-inicio', inicio),
        campo('Sale', 'tu-fin', fin),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Un turno que acaba antes de empezar es el de noche: 19:00 a 02:30 son siete horas y media.' }),
      campo('Notas', 'tu-notas', notas),
      repaso,
      turno
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Quitar este turno',
          onclick: () => confirmarQuitar(turno, estado, alBorrar, reabrir),
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

/**
 * Lo que se avisa sin impedir (D-27): que esa persona ya tiene otro turno ese
 * dia que se pisa con este, y que el turno es larguisimo. Ninguna de las dos
 * cosas es imposible —hay dias de bautizo y hay quien dobla—, pero casi siempre
 * son un dedazo en la hora.
 */
function loQueChirria(local, inicio, fin, turno, turnos, estado) {
  const dura = minutosDeTurno(inicio, fin)
  if (!dura) return ''

  const desde = aMinutos(inicio)
  const suyos = turnos.filter((t) => t.id !== turno?.id
    && t.empleado === local.empleado && diaDe(t.fecha) === local.dia)

  const pisa = suyos.some((t) => {
    const a = aMinutos(t.hora_inicio)
    const b = a + minutosDeTurno(t.hora_inicio, t.hora_fin)
    return desde < b && desde + dura > a
  })

  const nombre = (estado.equipo || []).find((e) => e.id === local.empleado)?.nombre || 'Esa persona'
  if (pisa) return `${nombre} ya tiene otro turno ese día a esa misma hora. Se puede guardar igual.`
  if (dura > 10 * 60) return `Son ${enHoras(dura)} seguidas. Se puede guardar igual.`
  return ''
}

function confirmarQuitar(turno, estado, alBorrar, alEcharseAtras) {
  const nombre = (estado.equipo || []).find((e) => e.id === turno.empleado)?.nombre || 'esta persona'
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, quitarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Quitando…'
    try {
      await borrarTurno(turno.id)
      cerrarHoja()
      alBorrar(turno.id)
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, quitarlo'
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede tocar el cuadrante.'
        : 'No hemos podido quitarlo. Inténtalo otra vez.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: '¿Quitar el turno?',
    cuerpo: [
      el('p', { class: 'parrafo', text:
        `${nombre}, ${conMayuscula(diaYNumero(diaDe(turno.fecha)))}, de ${turno.hora_inicio} a ${turno.hora_fin}.` }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Quitar el turno del cuadrante no borra las horas que se hayan fichado ese día: '
        + 'el cuadrante es lo previsto y los fichajes son lo que pasó.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: alEcharseAtras }),
    ],
  })
}

// ---------------------------------------------------------------------------

/**
 * Avisar del cuadrante al equipo.
 *
 * Se copia como TEXTO para pegarlo en el grupo de WhatsApp, igual que la lista
 * de pedido (D-60). No se manda desde aqui: en la v1 no hay pasarela de SMS ni
 * de correo, y un boton que dijera «avisado» sin avisar a nadie seria mentir.
 */
function hojaCopiar(estado, vista) {
  const texto = comoTexto(estado, vista)

  const caja = el('textarea', { class: 'entrada entrada--area', id: 'cu-texto', rows: '10', readonly: true })
  caja.value = texto

  const acuse = el('p', { class: 'parrafo parrafo--apagado', role: 'status', text:
    'Se copia al portapapeles y se pega en el grupo del equipo.' })

  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Copiar' })
  boton.addEventListener('click', async () => {
    // Se apunta en el servidor que esta semana se le ha pasado al equipo. No
    // manda ningun mensaje (seccion 10): es el gancho del notificador, y si
    // falla no se entera nadie porque el boton hace lo suyo igual.
    // Los huecos se cuentan DIA A DIA: serviciosSinCubrir espera los turnos de
    // un dia, y pasarle la semana entera diria que no falta nadie nunca.
    const horario = estado.ajustes?.horario_cocina || ''
    const huecos = semanaDesde(estado.semana).reduce((suma, dia) =>
      suma + serviciosSinCubrir(vista.turnos.filter((t) => diaDe(t.fecha) === dia), horario).length, 0)

    avisarDelCuadrante({
      semana: tituloDeSemana(estado.semana),
      turnos: vista.turnos.length,
      huecos,
    })

    try {
      await navigator.clipboard.writeText(texto)
      acuse.textContent = 'Copiado. Ya se puede pegar.'
    } catch (err) {
      caja.focus()
      caja.select()
      acuse.textContent = 'Tu navegador no nos deja copiar: está seleccionado, cópialo tú.'
    }
  })

  abrirHoja({
    titulo: 'Avisar al equipo',
    cuerpo: [caja, acuse],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Cerrar', onclick: cerrarHoja }),
    ],
  })
}

function comoTexto(estado, vista) {
  const porEmpleado = new Map((estado.equipo || []).map((e) => [e.id, e]))
  const horario = estado.ajustes?.horario_cocina || ''
  const lineas = ['Cuadrante · El Rincón del Quijote', tituloDeSemana(estado.semana), '']

  for (const dia of semanaDesde(estado.semana)) {
    const turnos = vista.turnos.filter((t) => diaDe(t.fecha) === dia)
    lineas.push(conMayuscula(diaYNumero(dia)))
    if (!turnos.length) lineas.push('  (nadie puesto)')
    for (const t of turnos) {
      lineas.push(`  ${porEmpleado.get(t.empleado)?.nombre || 'Ficha borrada'}  ${t.hora_inicio}–${t.hora_fin}`
        + (t.notas ? `  (${t.notas})` : ''))
    }
    for (const hueco of serviciosSinCubrir(turnos, horario)) lineas.push(`  · ${hueco}`)   // texto plano: esto se pega en WhatsApp
    lineas.push('')
  }
  return lineas.join('\n').trimEnd()
}

// ---------------------------------------------------------------------------

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

/**
 * Una hora del cuadrante. `type="time"` saca el selector de hora del movil, que
 * es mucho mejor que teclear dos puntos con el pulgar, y devuelve siempre
 * "HH:MM", que es justo lo que guarda la coleccion. El patron es para el
 * navegador viejo que lo pinte como texto.
 */
function hora(id, valor) {
  const n = el('input', {
    class: 'entrada', id, type: 'time', step: '300',
    pattern: '[0-2][0-9]:[0-5][0-9]', placeholder: '08:00',
  })
  n.value = valor
  return n
}

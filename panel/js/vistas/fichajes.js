/**
 * Fichajes
 * ---------------------------------------------------------------------------
 * El control horario: quien esta dentro, lo que se ficho estos dias y las horas
 * del mes. Es la pantalla 7 de la maqueta.
 *
 * LO IMPORTANTE NO SON LAS HORAS, SON LOS ERRORES. Un fichaje sin cerrar de un
 * dia que ya paso sale arriba del todo y en granate, porque es lo que rompe el
 * informe: una jornada abierta no se puede sumar y nadie sabe si fueron cuatro
 * horas o catorce. Todo lo demas de esta pantalla se lee de abajo arriba una
 * vez al mes; esa linea se mira todos los dias.
 *
 * QUIEN VE QUE (seccion 12): la regla de la coleccion recorta la lista sola.
 * Dueno y encargado ven al equipo entero; cocina y empleado, solo lo suyo. Aqui
 * no se filtra nada a mano: lo que llega es lo que se pinta.
 *
 * LAS HORAS SE SUMAN AQUI Y NO EN EL SERVIDOR (panel/js/horas.js). El servidor
 * solo decide de quien es un fichaje y si un cambio es una correccion; sumar
 * jornadas a los dos lados es la forma segura de que un dia no cuadren.
 */

import { el, pintar } from '../dom.js'
import { vacio, fallo, esqueletoDias } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { ir } from '../enrutador.js'
import { gestionaPersonal, esDueno } from '../sesion.js'
import {
  minutosFichados, enHoras, horasPorEmpleado, tramoDeFichaje, resumenDeFila,
} from '../horas.js'
import { barraDia } from '../piezas/barra-dia.js'
import {
  hoyISO, masDias, diaLargo, diaYNumero, conMayuscula, diaRelativo, horaLocal,
  diaDeInstante, mesDe, masMeses, diasDelMes, nombreDeMes, aEntradaLocal,
  deEntradaLocal, ahoraPB,
} from '../fechas.js'
import {
  cargarEquipo, miFichaDeEmpleado, fichajesEntre, fichajesAbiertos,
  ficharEntrada, crearFichaje, cerrarFichaje, corregirFichaje, borrarFichaje,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// Cuantos dias se ensenan en la lista. Dos semanas es lo que se mira de verdad
// («¿que hice el jueves pasado?»); mas atras se saca el informe del mes.
const DIAS_A_LA_VISTA = 14

export async function fichajes(contenedor, estado) {
  const hoy = hoyISO()
  const vista = {
    cargando: true, error: null,
    fichajes: [], abiertos: [], ficha: null, mio: null, aviso: null, fichando: false,
  }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    async fichar() {
      // El boton se apaga mientras tanto: dos toques seguidos serian dos
      // fichajes, y el segundo lo rechazaria el servidor con un error feo.
      vista.fichando = true
      vista.aviso = null
      repintar()
      try {
        if (vista.mio) await cerrarFichaje(vista.mio.id)
        else await ficharEntrada()
      } catch (err) {
        vista.aviso = err?.response?.message || err?.message || 'No hemos podido fichar.'
      }
      vista.fichando = false
      await cargar()
    },
    aMano() { hojaAMano(null, estado, vista, { alGuardar: cargar }) },
    abrir(fichaje) {
      if (gestionaPersonal()) hojaAMano(fichaje, estado, vista, { alGuardar: cargar, alBorrar: cargar })
      else if (!fichaje.salida && vista.mio?.id === fichaje.id) acciones.fichar()
    },
    informe() { hojaInforme(estado, vista) },
    recargar() { cargar() },
  }

  async function cargar() {
    vista.cargando = true
    repintar()
    // El rango empieza en el primero del mes o hace dos semanas, lo que caiga
    // antes: con una sola peticion salen la lista de dias Y el resumen del mes.
    const desde = [masDias(hoy, -(DIAS_A_LA_VISTA - 1)), `${mesDe(hoy)}-01`].sort()[0]
    try {
      const [equipo, lista, abiertos, ficha] = await Promise.all([
        estado.equipo ? Promise.resolve(estado.equipo) : cargarEquipo(),
        fichajesEntre(desde, hoy),
        // Los abiertos se piden aparte y sin rango: el que alguien se dejo sin
        // cerrar el mes pasado es justamente el que hay que arreglar, y con el
        // rango de arriba no aparecerria.
        fichajesAbiertos(),
        miFichaDeEmpleado(),
      ])
      estado.equipo = equipo
      vista.fichajes = lista
      vista.abiertos = abiertos
      vista.ficha = ficha
      vista.mio = ficha ? abiertos.find((f) => f.empleado === ficha.id) || null : null
      vista.error = null
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  cargar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Fichajes', [
      gestionaPersonal()
        ? { icono: 'anadir', titulo: 'Apuntar un fichaje a mano', alPulsar: acc.aMano }
        : null,
      { icono: 'descargar', titulo: 'Informe de horas del mes', activo: true, alPulsar: acc.informe },
    ], {
      volver: { titulo: 'Volver al cuadrante', alPulsar: () => ir('/personal') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      avisoSinCerrar(estado, vista, acc),
      el('div', { class: 'margen' }, [
        vista.aviso ? el('p', { class: 'hoja__error', role: 'alert', text: vista.aviso }) : null,
        botonFichar(vista, acc),
        vista.error
          ? fallo({
            texto: 'No se han podido cargar los fichajes.',
            alReintentar: acc.recargar, err: vista.error, donde: 'fichajes',
          })
          : vista.cargando
            ? esqueletoDias(2, 3)
            : [porDias(estado, vista, acc), resumenDelMes(estado, vista)],
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),

    nav('/personal'),
  ])
}

/**
 * El aviso de arriba: los fichajes sin cerrar de dias que ya pasaron.
 *
 * El de hoy NO cuenta: quien esta dentro tiene su fichaje abierto y eso es lo
 * normal, no un error. Avisar de eso todas las mananas seria ruido y en tres
 * dias nadie leeria el aviso.
 */
function avisoSinCerrar(estado, vista, acc) {
  const hoy = hoyISO()
  const viejos = vista.abiertos.filter((f) => diaDeInstante(f.entrada) !== hoy)
  if (!viejos.length) return null

  const nombres = new Map((estado.equipo || []).map((e) => [e.id, e.nombre]))
  const uno = viejos[0]
  const quien = nombres.get(uno.empleado) || 'Alguien'

  const uno_solo = viejos.length === 1

  return el('div', { class: 'aviso aviso--error' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      // Dos frases y un boton. Lo que antes ocupaba cuatro lineas cabe en dos:
      // que hay y por que importa. El resto se ve en la lista de abajo.
      el('b', { text: uno_solo
        ? `${quien} no cerró el turno ${diaRelativo(diaDeInstante(uno.entrada))}.`
        : `Hay ${viejos.length} turnos sin cerrar.` }),
      el('span', { text: uno_solo
        ? 'No suma horas hasta que lo cierres.'
        : 'No suman horas hasta que los cierres.' }),
      gestionaPersonal()
        ? el('button', {
          type: 'button', class: 'aviso__accion',
          text: uno_solo ? 'Arreglarlo' : 'Arreglar el primero',
          onclick: () => acc.abrir(uno),
        })
        : null,
    ]),
  ])
}

/**
 * Fichar es un boton grande y uno solo: entrar o salir, segun donde se este.
 *
 * Solo sale si la cuenta tiene ficha de empleado enlazada. Una cuenta sin ficha
 * —la del gestor, por ejemplo— no ficha, y un boton que da error al pulsarlo es
 * peor que no tener boton.
 */
function botonFichar(vista, acc) {
  if (!vista.ficha) return null
  const dentro = !!vista.mio
  const llevo = dentro ? minutosFichados(vista.mio.entrada, ahoraPB()) : null

  return [
    el('button', {
      type: 'button',
      class: `btn ${dentro ? 'btn--linea' : 'btn--primario'} btn--suelto`,
      disabled: vista.fichando || null,
      text: vista.fichando
        ? 'Un momento…'
        : (dentro ? 'Fichar la salida' : 'Fichar la entrada'),
      onclick: acc.fichar,
    }),
    dentro
      ? el('p', { class: 'parrafo parrafo--apagado', text:
        `Entraste a las ${horaLocal(vista.mio.entrada)}` + (llevo ? `, hace ${enHoras(llevo)}.` : '.') })
      : null,
  ]
}

/**
 * Los dias, del mas reciente al mas antiguo, saltando los que no tienen nada.
 *
 * LA DIVISION POR DIAS SE QUEDA, que es lo que funcionaba. Lo que cambia es el
 * contenido: donde habia una linea de texto por fichaje ahora hay una BARRA
 * SOBRE UN EJE DE HORAS, la misma pieza que usa el cuadrante
 * (panel/js/piezas/barra-dia.js).
 *
 * Y una fila por PERSONA, no por fichaje. El turno partido es lo normal en este
 * bar: quien entra a las 08:00, libra a las 13:00 y vuelve a las 17:00 tenia
 * dos lineas sueltas que no se leian como una jornada. Ahora son dos tramos de
 * la misma fila, con el hueco de la tarde a la vista y las horas ya sumadas.
 * Agrupar es cosa de aqui; la pieza recibe la lista de tramos hecha.
 */
function porDias(estado, vista, acc) {
  const nombres = new Map((estado.equipo || []).map((e) => [e.id, e.nombre]))
  const hoy = hoyISO()

  const dias = new Map()
  const meter = (f) => {
    const dia = diaDeInstante(f.entrada)
    if (!dias.has(dia)) dias.set(dia, [])
    if (!dias.get(dia).some((x) => x.id === f.id)) dias.get(dia).push(f)
  }
  for (const f of vista.fichajes) meter(f)
  // Los abiertos viejos pueden caer fuera del rango pedido; se meten igual,
  // que son justo los que hay que ver.
  for (const f of vista.abiertos) meter(f)

  if (!dias.size) {
    return vacio({
      texto: 'Aún no se ha fichado nada estos días',
      pie: 'Se ficha desde «Hoy», o se apunta a mano con el «+».',
      accion: gestionaPersonal()
        ? el('button', { type: 'button', class: 'btn btn--linea', text: 'Apuntar un fichaje', onclick: acc.aMano })
        : null,
    })
  }

  return [...dias.keys()].sort().reverse().map((dia) =>
    el('div', { class: 'dia-barras' },
      bloqueDeDia(dia, dias.get(dia), nombres, hoy, vista.ficha?.id || null, acc)))
}

/** Un dia: su cabecera, su nota y la tarjeta con las barras. */
function bloqueDeDia(dia, delDia, nombres, hoy, miFichaId, acc) {
  const filas = filasDelDia(delDia, nombres, dia === hoy, miFichaId, acc)

  const minutos = filas.reduce((suma, f) => suma + (f.resumen.minutos || 0), 0)
  const sinCerrar = filas.filter((f) => f.resumen.abierta && !f.enCurso).length
  const dentro = filas.filter((f) => f.enCurso).length

  return [
    el('div', { class: 'dia-cab' }, [
      el('h2', { class: 'dia-cab__dia', text: dia === hoy
        ? `Hoy, ${diaYNumero(dia)}`
        : conMayuscula(diaYNumero(dia)) }),
      el('span', { class: 'dia-cab__resumen num', text:
        `${filas.length} ${filas.length === 1 ? 'turno' : 'turnos'} · ${enHoras(minutos)}` }),
    ]),

    // Lo que hay que arreglar se canta; lo que esta bien se dice y no grita.
    sinCerrar
      ? el('p', { class: 'dia-nota', text: `${sinCerrar} sin cerrar` })
      : dentro
        ? el('p', { class: 'dia-nota dia-nota--ok', text:
          dentro === 1 ? '1 dentro ahora' : `${dentro} dentro ahora` })
        : el('p', { class: 'dia-nota dia-nota--ok', text: 'Todo cerrado' }),

    el('section', { class: 'tarjeta' }, [
      barraDia({ filas: filas.map((f) => f.fila) }),
    ]),
  ]
}

/**
 * De los fichajes de un dia a las filas de la barra: una por persona, con sus
 * tramos ordenados.
 *
 * LOS SIN CERRAR SALEN ARRIBA, como hasta ahora: son lo que hay que arreglar
 * antes de sacar el informe del mes. Detras, el resto por hora de entrada.
 */
function filasDelDia(delDia, nombres, esHoy, miFichaId, acc) {
  const porEmpleado = new Map()
  for (const f of delDia) {
    if (!porEmpleado.has(f.empleado)) porEmpleado.set(f.empleado, [])
    porEmpleado.get(f.empleado).push(f)
  }

  const filas = []
  for (const [id, suyos] of porEmpleado) {
    const tramos = suyos.map(tramoDeFichaje).filter(Boolean)
    const resumen = resumenDeFila(tramos)
    const nombre = nombres.get(id) || 'Ficha borrada'

    // El primero sin cerrar es el que abre la hoja de correccion: es el que se
    // esta señalando, y no tiene sentido preguntar cual de los dos.
    const suelto = suyos.find((f) => !f.salida) || null
    const enCurso = !!suelto && esHoy
    // Corregir es de dueno y encargado; cerrar el propio turno de hoy lo puede
    // hacer cualquiera, que es el boton de fichar la salida de toda la vida.
    const puede = !!suelto && (gestionaPersonal() || (enCurso && suelto.empleado === miFichaId))

    filas.push({
      resumen,
      enCurso,
      fila: {
        nombre,
        tramos,
        enCurso,
        // TRAZA DE LA CORRECCION. Si a alguno de los tramos de esta persona le
        // han tocado las horas a mano, se dice: es lo que separa una jornada
        // fichada de una escrita, y el encargo pide que no se pierda.
        marca: suyos.some((f) => f.corregido_por)
          ? { icono: 'editar', titulo: 'Corregido a mano' }
          : null,
        accion: resumen.abierta
          ? (enCurso
            // Dentro ahora: en vez de un total que seria mentira, lo que lleva.
            ? { texto: enHoras(minutosFichados(suelto.entrada, ahoraPB())) }
            : (puede
              ? { texto: 'corregir', alPulsar: () => acc.abrir(suelto) }
              : { texto: 'sin cerrar' }))
          : null,
        // Toda la fila lleva a la correccion para quien pueda corregirla.
        alPulsar: gestionaPersonal() ? () => acc.abrir(suelto || suyos[0]) : null,
      },
    })
  }

  return filas.sort((a, b) => {
    const rotoA = a.resumen.abierta && !a.enCurso ? 0 : 1
    const rotoB = b.resumen.abierta && !b.enCurso ? 0 : 1
    if (rotoA !== rotoB) return rotoA - rotoB
    const iA = a.resumen.tramos[0]?.inicio ?? 0
    const iB = b.resumen.tramos[0]?.inicio ?? 0
    return iA - iB
  })
}

/**
 * El resumen del mes en curso, que es lo que se mira antes de mandarle nada a
 * la gestoria.
 *
 * Los fichajes SIN CERRAR no suman y se dicen aparte: una jornada abierta no es
 * una jornada de cero horas, es una que no sabemos cuanto duro. Meterla como
 * cero haria mentir al total.
 */
function resumenDelMes(estado, vista) {
  const mes = mesDe(hoyISO())
  const [primero] = diasDelMes(mes)
  const delMes = vista.fichajes.filter((f) => diaDeInstante(f.entrada) >= primero)
  if (!delMes.length) return null

  const suma = horasPorEmpleado(delMes)
  const nombres = new Map((estado.equipo || []).map((e) => [e.id, e.nombre]))

  return [
    el('h2', { class: 'rotulo-seccion', text: `Resumen de ${nombreDeMes(mes)}` }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, [...suma.entries()]
        .sort((a, b) => (nombres.get(a[0]) || '').localeCompare(nombres.get(b[0]) || '', 'es'))
        .map(([id, fila]) => el('div', { class: 'fichaje' }, [
          el('div', { class: 'fichaje__nombre', text: nombres.get(id) || 'Ficha borrada' }),
          el('div', { class: 'fichaje__hora' }, [
            fila.abiertos ? `${fila.abiertos} sin cerrar · ` : null,
            el('b', { text: enHoras(fila.minutos) }),
          ]),
        ]))),
    ]),
    el('p', { class: 'parrafo parrafo--apagado', text:
      'Van solo las jornadas cerradas: lo que sigue abierto no se puede sumar.' }),
  ]
}

// ---------------------------------------------------------------------------
// Apuntar y corregir a mano (dueño y encargado)
// ---------------------------------------------------------------------------

/**
 * La hoja de corregir, que es tambien la de apuntar el fichaje de quien se dejo
 * el movil en casa.
 *
 * Todo lo que se toque aqui queda firmado en `corregido_por`, y eso lo pone el
 * servidor con la sesion, no este formulario (pb_hooks/fichajes.pb.js): es lo
 * que permite preguntar luego quien movio esa hora.
 */
function hojaAMano(fichaje, estado, vista, { alGuardar, alBorrar = null }) {
  const esNuevo = !fichaje
  const reabrir = () => hojaAMano(fichaje, estado, vista, { alGuardar, alBorrar })
  const activos = (estado.equipo || []).filter((e) => e.activo !== false || e.id === fichaje?.empleado)
  const nombre = (estado.equipo || []).find((e) => e.id === fichaje?.empleado)?.nombre || ''

  const quien = el('select', { class: 'entrada', id: 'fi-empleado', disabled: !esNuevo || null },
    activos.map((e) => el('option', {
      value: e.id, selected: e.id === fichaje?.empleado, text: e.nombre,
    })))

  const entrada = instante('fi-entrada', fichaje ? aEntradaLocal(fichaje.entrada) : aEntradaLocal(ahoraPB()))
  const salida = instante('fi-salida', fichaje?.salida ? aEntradaLocal(fichaje.salida) : '')

  const nota = el('input', {
    class: 'entrada', id: 'fi-nota', type: 'text', maxlength: '300',
    placeholder: 'Se dejó el móvil en casa',
  })
  nota.value = fichaje?.nota_correccion || ''

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: esNuevo ? 'Apuntar' : 'Guardar' })

  boton.addEventListener('click', async () => {
    const dentro = deEntradaLocal(entrada.value)
    const fuera = salida.value ? deEntradaLocal(salida.value) : ''
    if (!dentro) {
      error.textContent = 'Falta la hora de entrada.'
      error.hidden = false
      return
    }
    if (fuera && fuera <= dentro) {
      error.textContent = 'La salida tiene que ser posterior a la entrada.'
      error.hidden = false
      return
    }
    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      if (esNuevo) {
        // Se crea con la entrada escrita —el servidor deja escribirla a dueno y
        // encargado— y, si tambien se ha puesto la salida, se cierra despues:
        // al crear, el hook deja el fichaje abierto a proposito.
        const creado = await crearFichaje({ empleado: quien.value, entrada: dentro })
        if (fuera) await corregirFichaje(creado.id, { salida: fuera, nota_correccion: nota.value.trim() })
        else if (nota.value.trim()) await corregirFichaje(creado.id, { nota_correccion: nota.value.trim() })
      } else {
        await corregirFichaje(fichaje.id, {
          entrada: dentro,
          salida: fuera,
          nota_correccion: nota.value.trim(),
        })
      }
      cerrarHoja()
      await alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNuevo ? 'Apuntar' : 'Guardar'
      error.textContent = err?.status === 403
        ? 'Las horas ya fichadas las corrige el encargado o el dueño.'
        : (err?.response?.message || 'No hemos podido guardarlo.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: esNuevo ? 'Fichaje a mano' : `Corregir el fichaje${nombre ? ` de ${nombre}` : ''}`,
    cuerpo: [
      campo('Quién', 'fi-empleado', quien),
      campo('Entrada', 'fi-entrada', entrada),
      campo('Salida', 'fi-salida', salida),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'La salida en blanco es un turno abierto: la persona sigue dentro.' }),
      campo('Por qué se toca', 'fi-nota', nota),
      esDueno() && fichaje
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Eliminar el fichaje',
          onclick: () => confirmarBorrado(fichaje, nombre, alBorrar, reabrir),
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

function confirmarBorrado(fichaje, nombre, alBorrar, alEcharseAtras) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarlo' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarFichaje(fichaje.id)
      cerrarHoja()
      if (alBorrar) await alBorrar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarlo'
      error.textContent = err?.status === 403
        ? 'Solo el dueño puede eliminar un fichaje.'
        : 'No hemos podido eliminarlo.'
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: '¿Eliminar el fichaje?',
    cuerpo: [
      el('p', { class: 'parrafo', text:
        `${nombre || 'Esta persona'}, ${conMayuscula(diaLargo(diaDeInstante(fichaje.entrada)))}, `
        + `de ${horaLocal(fichaje.entrada)} a ${fichaje.salida ? horaLocal(fichaje.salida) : 'sin cerrar'}.` }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Un registro de jornada casi nunca se borra: si la hora está mal, se corrige y queda '
        + 'firmado quién la tocó. Eliminarlo no deja rastro de que existió.' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: alEcharseAtras }),
    ],
  })
}

// ---------------------------------------------------------------------------
// El informe del mes
// ---------------------------------------------------------------------------

/**
 * Informe de horas de un mes, con su descarga.
 *
 * Se descarga como CSV y no como PDF: lo que hace la gestoria con esto es
 * abrirlo en una hoja de calculo. Un PDF pediria una libreria de 300 KB para
 * dar algo que hay que volver a teclear.
 *
 * El mes se elige aqui porque el informe se saca a primeros del mes siguiente,
 * cuando la pantalla ya ensena el resumen del mes nuevo.
 */
function hojaInforme(estado, vista) {
  const local = { mes: mesDe(hoyISO()), cargando: true, lista: [], error: null }
  const cuerpo = el('div')

  const hoja = abrirHoja({
    titulo: 'Informe de horas',
    cuerpo: [cuerpo],
    acciones: [el('button', { type: 'button', class: 'btn btn--linea', text: 'Cerrar', onclick: cerrarHoja })],
  })

  async function cargar() {
    local.cargando = true
    pintarCuerpo()
    const [primero, ultimo] = diasDelMes(local.mes)
    try {
      local.lista = await fichajesEntre(primero, ultimo)
      local.error = null
    } catch (err) {
      local.error = err
    }
    local.cargando = false
    pintarCuerpo()
  }

  function pintarCuerpo() {
    const nombres = new Map((estado.equipo || []).map((e) => [e.id, e.nombre]))
    const suma = horasPorEmpleado(local.lista)
    const total = [...suma.values()].reduce((s, f) => s + f.minutos, 0)
    const abiertos = [...suma.values()].reduce((s, f) => s + f.abiertos, 0)

    // Va dentro de un div y no como lista suelta: pintar() aplana un solo
    // nivel, y esto son listas dentro de listas. Sin el envoltorio, el DOM se
    // come «[object HTMLDivElement]» (D-22 del panel, mismo tropiezo que con
    // el()).
    pintar(cuerpo, el('div', {}, [
      el('div', { class: 'mes' }, [
        el('button', {
          type: 'button', class: 'cabecera__boton mes__ir', 'aria-label': 'Mes anterior',
          onclick: () => { local.mes = masMeses(local.mes, -1); cargar() },
        }, [icono('chevron', { clase: 'ic ic--atras' })]),
        el('span', { class: 'mes__nombre', text: conMayuscula(nombreDeMes(local.mes)) }),
        el('button', {
          type: 'button', class: 'cabecera__boton mes__ir', 'aria-label': 'Mes siguiente',
          disabled: local.mes >= mesDe(hoyISO()) || null,
          onclick: () => { local.mes = masMeses(local.mes, 1); cargar() },
        }, [icono('chevron', { clase: 'ic' })]),
      ]),

      local.error
        ? el('p', { class: 'vacio', text: 'No hemos podido cargar ese mes.' })
        : local.cargando
          ? el('p', { class: 'cargando', text: 'Cargando…' })
          : [
            suma.size
              ? el('div', { class: 'filas' }, [...suma.entries()]
                .sort((a, b) => (nombres.get(a[0]) || '').localeCompare(nombres.get(b[0]) || '', 'es'))
                .map(([id, fila]) => el('div', { class: 'fichaje' }, [
                  el('div', { class: 'fichaje__nombre', text: nombres.get(id) || 'Ficha borrada' }),
                  el('div', { class: 'fichaje__hora' }, [
                    `${fila.jornadas} ${fila.jornadas === 1 ? 'jornada' : 'jornadas'}`
                    + (fila.abiertos ? ` · ${fila.abiertos} sin cerrar` : '') + ' · ',
                    el('b', { text: enHoras(fila.minutos) }),
                  ]),
                ])))
              : el('p', { class: 'vacio', text: 'Ese mes no tiene ningún fichaje.' }),

            abiertos
              ? el('p', { class: 'hoja__error', text:
                'Hay jornadas sin cerrar. No suman, así que el informe sale corto hasta que se corrijan.' })
              : null,

            suma.size
              ? el('button', {
                type: 'button', class: 'btn btn--primario btn--suelto',
                text: `Descargar ${nombreDeMes(local.mes)} · ${enHoras(total)}`,
                onclick: () => descargar(local.mes, local.lista, nombres),
              })
              : null,
            el('p', { class: 'parrafo parrafo--apagado', text:
              'Se descarga como CSV: se abre en cualquier hoja de cálculo y es lo que se le manda a la gestoría.' }),
          ],
    ]))
  }

  cargar()
  return hoja
}

/**
 * El CSV.
 *
 * Separado por punto y coma y con la marca de orden de bytes delante, que es lo
 * que hace que el Excel en castellano lo abra en columnas y con las tildes
 * bien. Con comas y sin marca sale todo en una columna y con simbolos raros, y
 * entonces alguien lo teclea a mano.
 */
function descargar(mes, lista, nombres) {
  const filas = [['Empleado', 'Día', 'Entrada', 'Salida', 'Horas', 'Minutos']]

  for (const f of lista.slice().sort((a, b) => String(a.entrada).localeCompare(String(b.entrada)))) {
    const minutos = minutosFichados(f.entrada, f.salida)
    filas.push([
      nombres.get(f.empleado) || 'Ficha borrada',
      diaDeInstante(f.entrada),
      horaLocal(f.entrada),
      f.salida ? horaLocal(f.salida) : 'SIN CERRAR',
      minutos === null ? '' : enHoras(minutos),
      minutos === null ? '' : String(minutos),
    ])
  }

  filas.push([])
  filas.push(['Total del mes', '', '', '', '', ''])
  for (const [id, fila] of horasPorEmpleado(lista)) {
    filas.push([
      nombres.get(id) || 'Ficha borrada',
      `${fila.jornadas} ${fila.jornadas === 1 ? 'jornada' : 'jornadas'}`,
      fila.abiertos ? `${fila.abiertos} sin cerrar` : '',
      '',
      enHoras(fila.minutos),
      String(fila.minutos),
    ])
  }

  const texto = filas
    .map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')

  const enlace = el('a', {
    href: URL.createObjectURL(new Blob(['﻿', texto], { type: 'text/csv;charset=utf-8' })),
    download: `horas-${mes}.csv`,
  })
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  // Se suelta el objeto en cuanto el navegador ha empezado la descarga; sin
  // esto el fichero se queda en memoria hasta que se recargue el panel.
  setTimeout(() => URL.revokeObjectURL(enlace.href), 30000)
}

// ---------------------------------------------------------------------------

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

function instante(id, valor) {
  const n = el('input', { class: 'entrada', id, type: 'datetime-local' })
  n.value = valor
  return n
}

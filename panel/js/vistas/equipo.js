/**
 * El equipo
 * ---------------------------------------------------------------------------
 * Las fichas de quien trabaja aqui: quien es, que hace, desde cuando, cuantas
 * horas tiene contratadas y con que cuenta entra al panel.
 *
 * LA MAQUETA NO DIBUJA ESTA PANTALLA, igual que no dibujaba el almacen (D-47).
 * Esta hecha con piezas que ya existian: la lista de proveedores y la hoja de
 * editar. No se ha inventado estetica nueva.
 *
 * LA FICHA Y LA CUENTA SON COSAS DISTINTAS, y por eso son dos pantallas
 * (`/personal/equipo` y `/personal/cuentas`):
 *
 *   - la ficha dice quien trabaja aqui y es la que llevan los turnos y los
 *     fichajes. Puede no tener cuenta: hay quien no entra nunca al panel.
 *   - la cuenta es una llave: usuario, contraseña y rol. Puede no tener ficha:
 *     el gestor, o un dueño que no esta en el cuadrante.
 *
 * Enlazarlas es lo que hace que cada cual vea SUS horas y las de nadie mas
 * (regla de `fichajes`: `empleado.usuario = @request.auth.id`).
 *
 * QUIEN LA TOCA: el dueno crea y borra fichas; el encargado edita las que hay
 * (reglas de `empleados`). Al resto la lista les sale entera pero quieta: saber
 * con quien se trabaja no es un secreto.
 *
 * LO QUE NO SE GUARDA AQUI: ni DNI, ni direccion, ni numero de la Seguridad
 * Social, ni nomina. Eso es una decision legal (proteccion de datos, seccion
 * 12) y se pregunta antes de construirla; esta anotada como propuesta.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { punteroFino } from '../foco.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { avatar } from '../piezas/avatar.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { BASE, ir } from '../enrutador.js'
import { esDueno, gestionaPersonal, NOMBRE_ROL } from '../sesion.js'
import { hojaCuenta } from './cuentas.js'
import { diaDe, aFechaPB, fechaLarga, antiguedad, hoyISO } from '../fechas.js'
import { enHoras } from '../horas.js'
import {
  cargarEquipo, cargarCuentas, guardarEmpleado, borrarEmpleado,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// Los tres de la maqueta —granate, cobre y oliva— y tres mas para cuando el
// equipo crezca. Es una eleccion cerrada a proposito: un selector de color
// libre acaba con un amarillo fluorescente sobre crema que no lee nadie.
const COLORES = [
  ['#93202A', 'Granate'],
  ['#A8672F', 'Cobre'],
  ['#6B6B33', 'Oliva'],
  ['#3F6E3A', 'Verde'],
  ['#5A4C40', 'Tierra'],
  ['#4A5A6E', 'Pizarra'],
]

export async function equipo(contenedor, estado) {
  const vista = { cargando: !estado.equipo, error: null, cuentas: [] }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    nueva() { editar(null) },
    abrir(empleado) { editar(empleado) },
    async recargar() {
      try {
        const [gente, cuentas] = await Promise.all([
          cargarEquipo(),
          gestionaPersonal() ? cargarCuentas().catch(() => []) : Promise.resolve([]),
        ])
        estado.equipo = gente
        vista.cuentas = cuentas
      } catch (err) {
        vista.error = err
      }
      vista.cargando = false
      repintar()
    },
  }

  function editar(empleado) {
    if (!gestionaPersonal()) return
    if (!empleado && !esDueno()) return
    hojaFicha(empleado, estado, vista, acciones)
  }

  repintar()
  await acciones.recargar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('El equipo', [
      esDueno() ? { icono: 'anadir', titulo: 'Ficha nueva', activo: true, alPulsar: acc.nueva } : null,
    ], {
      volver: { titulo: 'Volver al cuadrante', alPulsar: () => ir('/personal') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        vista.error
          ? fallo({
            texto: 'No se ha podido cargar el equipo.',
            alReintentar: acc.recargar, err: vista.error, donde: 'equipo',
          })
          : vista.cargando
            ? esqueletoFilas(4)
            : [listado(estado, vista, acc), puertaCuentas(vista)],
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),

    nav('/personal'),
  ])
}

function listado(estado, vista, acc) {
  const gente = estado.equipo || []
  if (!gente.length) {
    return el('section', { class: 'tarjeta' }, [
      el('p', { class: 'vacio', text: esDueno()
        ? 'Todavía no hay nadie. Con el «+» se crea la primera ficha.'
        : 'Todavía no hay ninguna ficha del equipo.' }),
    ])
  }

  const dentro = gente.filter((e) => e.activo !== false)
  const fuera = gente.filter((e) => e.activo === false)

  return [
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, dentro.map((e) => fila(e, vista, acc))),
    ]),
    fuera.length
      ? [
        el('h2', { class: 'rotulo-seccion', text: 'Ya no trabajan aquí' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, fuera.map((e) => fila(e, vista, acc))),
        ]),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'Sus turnos y sus horas siguen guardados: por eso una ficha se aparta y no se borra.' }),
      ]
      : null,
  ]
}

function fila(empleado, vista, acc) {
  const cuenta = vista.cuentas.find((c) => c.id === empleado.usuario)
  const desde = diaDe(empleado.fecha_alta)
  const baja = diaDe(empleado.fecha_baja)

  // Lo que se quiere saber de un vistazo: qué hace, si puede entrar al panel y
  // cuánto lleva. El teléfono va en la ficha, que es donde se busca para llamar.
  const pie = empleado.activo === false
    ? [empleado.puesto || null, baja ? `Se fue el ${fechaLarga(baja)}` : 'Ya no trabaja aquí']
      .filter(Boolean).join(' · ')
    : [
      empleado.puesto || null,
      // El rol no se repite cuando se llama igual que el puesto: «Cocina ·
      // Cocina · 2 años» es lo que pasa en un bar donde la persona de cocina
      // tiene el rol cocina, que es casi siempre.
      nombreDeRol(cuenta, empleado) === (empleado.puesto || '').trim().toLowerCase()
        ? null
        : (cuenta ? NOMBRE_ROL[cuenta.rol] || cuenta.rol : (empleado.usuario ? 'Con cuenta' : 'Sin cuenta')),
      desde ? antiguedad(desde) : null,
    ].filter(Boolean).join(' · ')

  const cuerpo = [
    avatar(empleado),
    el('span', { class: 'fila-prod__cuerpo' }, [
      el('span', { class: 'fila-prod__nombre', text: empleado.nombre }),
      el('span', { class: 'fila-prod__pie', text: pie }),
    ]),
    empleado.horas_semana
      ? el('span', { class: 'fila-horas', text: `${empleado.horas_semana} h/sem` })
      : null,
  ]

  return el('div', { class: `fila-prod${empleado.activo === false ? ' fila-prod--apagada' : ''}` }, [
    gestionaPersonal()
      ? el('button', { type: 'button', class: 'fila-prod__abrir', onclick: () => acc.abrir(empleado) }, cuerpo)
      : el('div', { class: 'fila-prod__abrir fila-prod__abrir--quieta' }, cuerpo),
  ])
}

/** El rol en minusculas, para comparar con el puesto sin que chirrie. */
function nombreDeRol(cuenta, empleado) {
  const nombre = cuenta
    ? NOMBRE_ROL[cuenta.rol] || cuenta.rol
    : (empleado.usuario ? 'Con cuenta' : 'Sin cuenta')
  return nombre.toLowerCase()
}

/** La puerta a las cuentas de acceso. La ve quien puede listarlas. */
function puertaCuentas(vista) {
  if (!gestionaPersonal()) return null
  const cuantas = vista.cuentas.length

  return [
    el('h2', { class: 'rotulo-seccion', text: 'Acceso al panel' }),
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, [
        el('a', { class: 'fila-ir', href: `${BASE}/personal/cuentas` }, [
          el('span', { class: 'fila-ir__cuerpo' }, [
            el('span', { class: 'fila-ir__nombre', text: 'Cuentas de acceso' }),
            el('span', { class: 'fila-ir__pie', text: esDueno()
              ? `${cuantas} ${cuantas === 1 ? 'cuenta' : 'cuentas'}. Quién entra al panel, con qué usuario y qué puede hacer.`
              : `${cuantas} ${cuantas === 1 ? 'cuenta' : 'cuentas'}. Las crea y las cambia el dueño.` }),
          ]),
          icono('chevron', { clase: 'ic fila-ir__flecha' }),
        ]),
      ]),
    ]),
  ]
}

// ---------------------------------------------------------------------------
// La ficha
// ---------------------------------------------------------------------------

function hojaFicha(empleado, estado, vista, acc) {
  const esNueva = !empleado
  const reabrir = () => hojaFicha(empleado, estado, vista, acc)
  const local = {
    color: empleado?.color || COLORES[0][0],
    activo: empleado ? empleado.activo !== false : true,
  }

  // Teclados: en un movil, el teclado que sale tiene que ser el del dato.
  const nombre = texto('eq-nombre', empleado?.nombre || '', {
    maxlength: '80', placeholder: 'Génesis', autocapitalize: 'words', autocomplete: 'off',
  })
  const alias = texto('eq-alias', empleado?.alias || '', {
    maxlength: '3', placeholder: 'G', autocapitalize: 'characters', autocomplete: 'off',
  })
  const puesto = texto('eq-puesto', empleado?.puesto || '', {
    maxlength: '40', placeholder: 'Barra y sala', list: 'eq-puestos', autocapitalize: 'sentences',
  })
  const telefono = texto('eq-telefono', empleado?.telefono || '', {
    maxlength: '20', type: 'tel', inputmode: 'tel', placeholder: '600 000 000',
  })
  const alta = el('input', {
    class: 'entrada', id: 'eq-alta', type: 'date', max: hoyISO(),
  })
  alta.value = diaDe(empleado?.fecha_alta) || (esNueva ? hoyISO() : '')

  const horas = el('input', {
    class: 'entrada', id: 'eq-horas', type: 'number', min: '0', max: '60', step: '0.5',
    // Ultimo campo con teclado antes de los botones: la tecla dice «hecho».
    inputmode: 'decimal', placeholder: '40', enterkeyhint: 'done',
  })
  horas.value = empleado?.horas_semana ? String(empleado.horas_semana) : ''

  const notas = el('textarea', {
    class: 'entrada entrada--area', id: 'eq-notas', rows: '2', maxlength: '300',
    placeholder: 'Libra los martes. Habla ruso.',
  })
  notas.value = empleado?.notas || ''

  // Las iniciales se rellenan solas con la primera letra del nombre mientras no
  // se toquen a mano. Es un campo de tres letras que nadie quiere pensar.
  let aliasTocado = !!empleado?.alias
  alias.addEventListener('input', () => { aliasTocado = true })
  nombre.addEventListener('input', () => {
    if (!aliasTocado) alias.value = nombre.value.trim().slice(0, 1).toUpperCase()
  })

  const colores = el('div', { class: 'eleccion' })
  function pintarColores() {
    pintar(colores, COLORES.map(([hex, rotulo]) => {
      const puesta = hex === local.color
      return el('button', {
        type: 'button',
        class: `color${puesta ? ' color--puesto' : ''}`,
        style: `background: ${hex}`,
        'aria-pressed': String(puesta),
        'aria-label': rotulo,
        title: rotulo,
        onclick: () => { local.color = hex; pintarColores() },
      })
    }))
  }
  pintarColores()

  const cuenta = vista.cuentas.find((c) => c.id === empleado?.usuario) || null
  const selector = el('select', { class: 'entrada', id: 'eq-cuenta' }, [
    el('option', { value: '', selected: !empleado?.usuario, text: 'Sin cuenta de acceso' }),
    ...vista.cuentas.map((c) => el('option', {
      value: c.id,
      selected: c.id === empleado?.usuario,
      text: `${c.nombre || c.usuario} · ${NOMBRE_ROL[c.rol] || c.rol}`,
    })),
  ])

  const activo = el('input', {
    type: 'checkbox', class: 'interruptor__casilla', id: 'eq-activo', checked: local.activo,
  })
  activo.addEventListener('change', () => { local.activo = activo.checked })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: esNueva ? 'Crear' : 'Guardar' })

  boton.addEventListener('click', async () => {
    const n = nombre.value.trim()
    if (n.length < 2) {
      error.textContent = 'Falta el nombre.'
      error.hidden = false
      nombre.focus()
      return
    }
    const semanales = horas.value.trim() === '' ? 0 : Number(horas.value.replace(',', '.'))
    if (!Number.isFinite(semanales) || semanales < 0 || semanales > 60) {
      error.textContent = 'Las horas de la semana van entre 0 y 60.'
      error.hidden = false
      horas.focus()
      return
    }

    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      await guardarEmpleado(empleado?.id, {
        nombre: n,
        alias: (alias.value.trim() || n.slice(0, 1)).toUpperCase(),
        puesto: puesto.value.trim(),
        color: local.color,
        telefono: telefono.value.trim(),
        // Dia del calendario: medianoche UTC, como todas las fechas sin hora.
        fecha_alta: alta.value ? aFechaPB(alta.value) : '',
        horas_semana: semanales,
        notas: notas.value.trim(),
        usuario: selector.value,
        activo: local.activo,
        // `fecha_baja` NO se manda: la escribe el servidor al apagar «Trabaja
        // aquí» (pb_hooks/equipo.pb.js).
      })
      cerrarHoja()
      await acc.recargar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNueva ? 'Crear' : 'Guardar'
      error.textContent = err?.status === 403
        ? 'Tu cuenta no puede cambiar las fichas del equipo.'
        : (err?.response?.message || 'No hemos podido guardarlo.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: esNueva ? 'Ficha nueva' : empleado.nombre,
    // Solo en un alta y solo con raton: ver panel/js/foco.js.
    foco: (esNueva && punteroFino()) ? nombre : null,
    cuerpo: [
      resumen(empleado),

      campo('Nombre', 'eq-nombre', nombre),
      el('div', { class: 'campos-dos' }, [
        campo('Iniciales', 'eq-alias', alias),
        campo('Teléfono', 'eq-telefono', telefono),
      ]),
      campo('Puesto', 'eq-puesto', puesto),
      // Sugerencias, no una lista cerrada: en un bar de cuatro personas los
      // puestos se llaman como se llaman.
      el('datalist', { id: 'eq-puestos' }, ['Barra', 'Sala', 'Cocina', 'Barra y sala', 'Ayudante de cocina', 'Limpieza']
        .map((p) => el('option', { value: p }))),

      el('div', { class: 'campos-dos' }, [
        campo('En el equipo desde', 'eq-alta', alta),
        campo('Horas por semana', 'eq-horas', horas),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Las horas son las del contrato, para saber si el cuadrante se queda corto o se pasa. '
        + 'En blanco, no se compara con nada.' }),

      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Color en el cuadrante' }),
        colores,
      ]),

      campo('Notas', 'eq-notas', notas),

      gestionaPersonal()
        ? [
          campo('Cuenta de acceso', 'eq-cuenta', selector),
          el('p', { class: 'parrafo parrafo--apagado', text:
            'Es lo que hace que esta persona vea SUS horas al entrar al panel, y que al fichar '
            + 'el fichaje sea suyo. Quien no entra al panel se queda sin cuenta y se le ficha a mano.' }),
          botonesDeCuenta(empleado, cuenta, estado, vista, acc),
        ]
        : null,

      el('label', { class: 'interruptor', for: 'eq-activo' }, [
        el('span', { class: 'interruptor__cuerpo' }, [
          el('span', { class: 'interruptor__nombre', text: 'Trabaja aquí' }),
          el('span', { class: 'interruptor__pie', text:
            'Al apagarlo, el servidor apunta la fecha y deja de ofrecerse al poner turnos. '
            + 'Lo que ya hizo se queda.' }),
        ]),
        activo,
        el('span', { class: 'interruptor__palanca', 'aria-hidden': 'true' }),
      ]),

      esDueno() && empleado
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Eliminar la ficha',
          onclick: () => confirmarBorrado(empleado, acc, reabrir),
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
 * La cabecera de la ficha: lo que ya se sabe de esa persona, escrito, sin tener
 * que leer los campos. Solo sale si hay algo que decir.
 */
function resumen(empleado) {
  if (!empleado) return null
  const desde = diaDe(empleado.fecha_alta)
  const baja = diaDe(empleado.fecha_baja)

  const lineas = [
    desde ? `En el equipo desde el ${fechaLarga(desde)}${antiguedad(desde) ? ` · ${antiguedad(desde)}` : ''}` : null,
    baja ? `Se fue el ${fechaLarga(baja)}` : null,
    // Las medias horas se dicen ademas en horas y minutos: «37,5 horas» es lo
    // que pone el contrato, pero «37 h 30» es lo que se compara con el
    // cuadrante. Con horas justas seria repetir el mismo numero dos veces.
    empleado.horas_semana
      ? `${String(empleado.horas_semana).replace('.', ',')} horas por semana`
        + (Number.isInteger(empleado.horas_semana)
          ? ''
          : ` · ${enHoras(Math.round(empleado.horas_semana * 60))}`)
      : null,
  ].filter(Boolean)

  if (!lineas.length) return null

  return el('div', { class: 'resumen-ficha' },
    lineas.map((t) => el('p', { class: 'resumen-ficha__linea', text: t })))
}

/**
 * Lo que se puede hacer con la cuenta desde aqui. Es el atajo que faltaba: el
 * caso de verdad es «acabo de contratar a alguien y quiero que entre al panel»,
 * y obligar a ir a otra pantalla a crear la cuenta y volver a enlazarla eran
 * cuatro gestos para uno.
 */
function botonesDeCuenta(empleado, cuenta, estado, vista, acc) {
  if (!esDueno()) return null

  // Al volver de la hoja de la cuenta se reabre la ficha CON LO QUE HAY EN EL
  // SERVIDOR, no con el objeto que se tenia al abrirla: si se acaba de crear la
  // cuenta, ese objeto todavia dice «sin cuenta de acceso» y la pantalla
  // parecia no haber guardado nada.
  async function volverALaFicha() {
    await acc.recargar()
    const fresca = (estado.equipo || []).find((e) => e.id === empleado?.id)
    if (fresca) hojaFicha(fresca, estado, vista, acc)
  }

  if (cuenta) {
    return el('button', {
      type: 'button', class: 'btn btn--linea btn--suelto',
      text: `Cambiar la cuenta de ${cuenta.usuario}`,
      onclick: () => hojaCuenta(cuenta, estado, vista, { alGuardar: volverALaFicha }),
    })
  }

  if (!empleado) {
    return el('p', { class: 'parrafo parrafo--apagado', text:
      'Guarda la ficha primero y luego créale la cuenta desde aquí.' })
  }

  return el('button', {
    type: 'button', class: 'btn btn--linea btn--suelto',
    text: `Crear una cuenta para ${empleado.nombre.split(/\s+/)[0]}`,
    onclick: () => hojaCuenta(null, estado, vista, { alGuardar: volverALaFicha }, empleado),
  })
}

/**
 * Eliminar una ficha ARRASTRA sus turnos: la relacion se declaro con
 * `cascadeDelete` en la migracion. Con horas fichadas el servidor ya no deja
 * borrarla (pb_hooks/equipo.pb.js), que es lo correcto para un registro de
 * jornada; aqui se avisa antes de llegar a ese error.
 */
function confirmarBorrado(empleado, acc, alEcharseAtras) {
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarla' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarEmpleado(empleado.id)
      cerrarHoja()
      await acc.recargar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarla'
      error.textContent = err?.status === 403
        ? 'Solo el dueño puede eliminar una ficha.'
        : (err?.response?.message || 'No hemos podido eliminarla.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar la ficha de ${empleado.nombre}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'Se van con ella todos sus turnos del cuadrante. No se puede deshacer.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Si tiene horas fichadas, el servidor no dejará borrarla: un registro de jornada es lo '
        + 'que hay que poder enseñar si algún día se pregunta por sus horas. Para alguien que ya '
        + 'no trabaja aquí, apaga «Trabaja aquí»: deja de salir al poner turnos y su historial se '
        + 'queda. La cuenta de acceso se borra aparte, desde «Cuentas».' }),
      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'No, dejarlo', onclick: alEcharseAtras }),
    ],
  })
}

// ---------------------------------------------------------------------------

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

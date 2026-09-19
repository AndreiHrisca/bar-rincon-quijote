/**
 * Cuentas de acceso
 * ---------------------------------------------------------------------------
 * Quien entra al panel y con que. Cuelga de «El equipo» porque son las dos
 * caras de la misma persona, pero son cosas distintas y por eso son dos
 * pantallas:
 *
 *   - LA FICHA dice quien trabaja aqui: nombre, puesto, desde cuando, sus
 *     turnos y sus horas. Puede haber fichas sin cuenta —quien no entra nunca
 *     al panel— y son perfectamente normales.
 *   - LA CUENTA es una llave: un nombre de usuario, una contraseña y un rol.
 *     Puede haber cuentas sin ficha: la del gestor, o la de un administrador
 *     que no esta en el cuadrante.
 *
 * Enlazarlas es lo que hace que cada cual vea SUS horas y las de nadie mas
 * (regla de `fichajes`: `empleado.usuario = @request.auth.id`), y el enlace se
 * puede poner desde los dos lados.
 *
 * SOLO EL ADMINISTRADOR. Crear cuentas, cambiar roles y borrarlas es la llave
 * del negocio entero: quien puede crear una cuenta de administrador puede
 * hacerlo todo. Un empleado no ve esta pantalla siquiera: la regla de `users`
 * solo le deja verse a si mismo, asi que la lista le sale con su propia fila.
 * Lo dice la regla, no solo esta pantalla.
 */

import { el, pintar } from '../dom.js'
import { fallo, esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { ir } from '../enrutador.js'
import { esAdmin, usuario as sesionUsuario, NOMBRE_ROL } from '../sesion.js'
import {
  cargarEquipo, cargarCuentas, crearCuenta, guardarCuenta, borrarCuenta,
  cambiarCuenta, guardarEmpleado,
} from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// El orden es el de mando: es como se lee «quien es quien» de un vistazo.
//
// Son DOS y no cuatro desde la migracion 1757200000_rol_administrador.js. El
// pie de cada uno dice lo que PUEDE, no lo que no puede: es lo que hay que
// saber al elegir, y «todo menos ajustes, precios y cuentas» obligaba a
// reconstruir de memoria lo que si.
const ROLES = [
  ['admin', 'Administrador', 'Todo: ajustes, cuentas, equipo, almacén, eventos y la actividad del panel.'],
  ['empleado', 'Empleado', 'Almacén, reservas, fichaje y carta de solo lectura.'],
]

export async function cuentas(contenedor, estado) {
  const vista = { cargando: true, error: null, cuentas: [] }

  function repintar() {
    pintar(contenedor, pantalla(estado, vista, acciones))
  }

  const acciones = {
    nueva() { if (esAdmin()) hojaCuenta(null, estado, vista, { alGuardar: recargar }) },
    abrir(cuenta) { if (esAdmin()) hojaCuenta(cuenta, estado, vista, { alGuardar: recargar }) },
    // Crear la cuenta de alguien que ya tiene ficha: se rellena con su nombre y
    // al guardar se enlazan las dos cosas.
    nuevaPara(ficha) { if (esAdmin()) hojaCuenta(null, estado, vista, { alGuardar: recargar }, ficha) },
    recargar() { vista.cargando = true; vista.error = null; repintar(); recargar() },
  }

  async function recargar() {
    try {
      const [cuentasNuevas, equipo] = await Promise.all([cargarCuentas(), cargarEquipo()])
      vista.cuentas = cuentasNuevas
      estado.equipo = equipo
      vista.error = null
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  repintar()
  await recargar()
}

// ---------------------------------------------------------------------------

function pantalla(estado, vista, acc) {
  return el('div', { class: 'pantalla' }, [
    cabecera('Cuentas', [
      esAdmin() ? { icono: 'anadir', titulo: 'Cuenta nueva', activo: true, alPulsar: acc.nueva } : null,
    ], {
      volver: { titulo: 'Volver al equipo', alPulsar: () => ir('/personal/equipo') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      el('div', { class: 'margen margen--alto' }, [
        vista.error
          ? fallo({
            texto: 'No se han podido cargar las cuentas.',
            alReintentar: acc.recargar, err: vista.error, donde: 'cuentas',
          })
          : vista.cargando
            ? esqueletoFilas(4)
            : listado(estado, vista, acc),
        el('div', { style: 'height: var(--sp-5)' }),
      ]),
    ]),

    nav('/personal'),
  ])
}

function listado(estado, vista, acc) {
  const fichas = estado.equipo || []
  const sinCuenta = fichas.filter((f) => !f.usuario && f.activo !== false)

  return [
    el('section', { class: 'tarjeta' }, [
      el('div', { class: 'filas' }, vista.cuentas.map((c) => fila(c, fichas, acc))),
    ]),

    !esAdmin()
      ? el('p', { class: 'parrafo parrafo--apagado', text:
        'Las cuentas las crea y las cambia un administrador. Aquí las ves para saber a quién enlazar '
        + 'cada ficha del equipo.' })
      : null,

    // Lo que de verdad se viene a arreglar aquí: alguien del equipo que no
    // puede entrar al panel. Se dice con nombres, no con un número.
    sinCuenta.length && esAdmin()
      ? [
        el('h2', { class: 'rotulo-seccion', text: 'Sin cuenta de acceso' }),
        el('section', { class: 'tarjeta' }, [
          el('div', { class: 'filas' }, sinCuenta.map((f) => el('div', { class: 'fila-prod' }, [
            el('button', {
              type: 'button', class: 'fila-prod__abrir',
              onclick: () => acc.nuevaPara(f),
            }, [
              el('span', { class: 'fila-prod__cuerpo' }, [
                el('span', { class: 'fila-prod__nombre', text: f.nombre }),
                el('span', { class: 'fila-prod__pie', text:
                  `${f.puesto || 'Sin puesto'} · no puede entrar al panel` }),
              ]),
              el('span', { class: 'fila-ir__flecha', 'aria-hidden': 'true', text: '＋' }),
            ]),
          ]))),
        ]),
        el('p', { class: 'parrafo parrafo--apagado', text:
          'No es un error: hay quien no entra nunca al panel y se le ficha a mano. '
          + 'Toca una para crearle la cuenta.' }),
      ]
      : null,
  ]
}

function fila(cuenta, fichas, acc) {
  const ficha = fichas.find((f) => f.usuario === cuenta.id)
  const yo = sesionUsuario()?.id === cuenta.id

  const pie = [
    NOMBRE_ROL[cuenta.rol] || cuenta.rol,
    ficha ? `ficha de ${ficha.nombre}` : 'sin ficha del equipo',
    cuenta.email || null,
  ].filter(Boolean).join(' · ')

  const cuerpo = [
    el('span', { class: 'fila-prod__cuerpo' }, [
      el('span', { class: 'fila-prod__nombre' }, [
        cuenta.nombre || cuenta.usuario,
        yo ? el('span', { class: 'marca-tu', text: 'tú' }) : null,
      ]),
      el('span', { class: 'fila-prod__pie', text: pie }),
    ]),
    el('span', { class: 'fila-usuario', text: cuenta.usuario || '—' }),
  ]

  return el('div', { class: 'fila-prod' }, [
    esAdmin()
      ? el('button', { type: 'button', class: 'fila-prod__abrir', onclick: () => acc.abrir(cuenta) }, cuerpo)
      : el('div', { class: 'fila-prod__abrir fila-prod__abrir--quieta' }, cuerpo),
  ])
}

// ---------------------------------------------------------------------------
// Crear y cambiar una cuenta
// ---------------------------------------------------------------------------

/**
 * `paraFicha` es la ficha del equipo que se quiere enlazar de una vez, cuando
 * la cuenta se crea desde «Sin cuenta de acceso» o desde la ficha del empleado:
 * se rellena el nombre y, al guardar, se enlaza sola.
 */
export function hojaCuenta(cuenta, estado, vista, { alGuardar }, paraFicha = null) {
  const esNueva = !cuenta
  const yo = sesionUsuario()?.id === cuenta?.id
  const local = { rol: cuenta?.rol || paraFicha?.rol || 'empleado' }

  const nombre = texto('cu-nombre', cuenta?.nombre || paraFicha?.nombre || '', {
    maxlength: '80', placeholder: 'Génesis',
  })
  const identidad = texto('cu-usuario', cuenta?.usuario || sugerirUsuario(paraFicha?.nombre || ''), {
    maxlength: '30', autocapitalize: 'none', autocomplete: 'off',
    spellcheck: 'false', placeholder: 'genesis',
  })
  const correo = texto('cu-correo', cuenta?.email || '', {
    type: 'email', maxlength: '120', autocapitalize: 'none', autocomplete: 'off',
    inputmode: 'email', spellcheck: 'false', enterkeyhint: 'done',
    placeholder: 'sin correo',
  })
  const clave = texto('cu-clave', '', {
    maxlength: '72', autocomplete: 'off', placeholder: esNueva ? 'quijote-2026' : 'dejar en blanco para no cambiarla',
  })

  const roles = el('div', { class: 'eleccion' })
  const pieRol = el('p', { class: 'parrafo parrafo--apagado' })
  function pintarRoles() {
    pintar(roles, ROLES.map(([valor, rotulo]) => {
      const puesto = valor === local.rol
      return el('button', {
        type: 'button',
        class: `eleccion__opcion${puesto ? ' eleccion__opcion--puesta' : ''}`,
        'aria-pressed': String(puesto),
        text: rotulo,
        disabled: yo || null,
        onclick: () => { local.rol = valor; pintarRoles() },
      })
    }))
    pieRol.textContent = yo
      ? 'Tu propio rol no te lo puedes cambiar. Que te lo cambie otro administrador.'
      : (ROLES.find(([v]) => v === local.rol)?.[2] || '')
  }
  pintarRoles()

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: esNueva ? 'Crear la cuenta' : 'Guardar' })

  boton.addEventListener('click', async () => {
    const n = nombre.value.trim()
    const u = identidad.value.trim().toLowerCase()
    const c = clave.value.trim()

    if (n.length < 2) return falla('Falta el nombre de la persona.', nombre)
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) {
      return falla('El usuario va en minúsculas, sin espacios ni eñes, y con 3 letras al menos.', identidad)
    }
    if (esNueva && c.length < 8) return falla('La contraseña tiene que tener 8 caracteres o más.', clave)
    if (!esNueva && c && c.length < 8) return falla('La contraseña tiene que tener 8 caracteres o más.', clave)

    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      if (esNueva) {
        const creada = await crearCuenta({
          usuario: u, nombre: n, rol: local.rol, clave: c, correo: correo.value.trim(),
        })
        // Si venía de una ficha sin cuenta, se enlazan de una vez: es lo que se
        // venía a hacer, y dejarlo a medias sería pedir dos gestos para uno.
        if (paraFicha) await guardarEmpleado(paraFicha.id, { usuario: creada.id })
      } else {
        const cambios = { nombre: n, usuario: u }
        if (!yo && local.rol !== cuenta.rol) cambios.rol = local.rol
        await guardarCuenta(cuenta.id, cambios)

        // El correo y la contraseña no pasan por la API normal: van por la ruta
        // del servidor (pb_hooks/cuentas.pb.js).
        const correoNuevo = correo.value.trim().toLowerCase()
        const cambiaCorreo = correoNuevo !== String(cuenta.email || '').toLowerCase()
        if (c || cambiaCorreo) {
          await cambiarCuenta(cuenta.id, {
            clave: c,
            correo: cambiaCorreo ? correoNuevo : null,
          })
        }
      }
      cerrarHoja()
      await alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = esNueva ? 'Crear la cuenta' : 'Guardar'
      error.textContent = mensaje(err)
      error.hidden = false
    }
  })

  function falla(texto, donde) {
    error.textContent = texto
    error.hidden = false
    donde.focus()
  }

  abrirHoja({
    titulo: esNueva ? 'Cuenta nueva' : `Cuenta de ${cuenta.nombre || cuenta.usuario}`,
    cuerpo: [
      campo('Nombre', 'cu-nombre', nombre),
      campo('Usuario', 'cu-usuario', identidad),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Es lo que se escribe para entrar al panel. Se dicta en voz alta, así que cuanto más corto mejor.' }),

      campo(esNueva ? 'Contraseña' : 'Contraseña nueva', 'cu-clave', clave),
      el('p', { class: 'parrafo parrafo--apagado', text: esNueva
        ? 'Se ve mientras se escribe, para poder dictarla. Ocho caracteres o más.'
        : 'En blanco, no se toca. Si la cambias, las sesiones que tenga abiertas se cierran.' }),

      campo('Correo (opcional)', 'cu-correo', correo),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'No hace falta: el bar no manda correos. Sirve para entrar también con él y para saber de quién es la cuenta.' }),

      el('div', { class: 'campo' }, [
        el('span', { class: 'campo__rotulo', text: 'Qué puede hacer' }),
        roles,
        pieRol,
      ]),

      esAdmin() && cuenta && !yo
        ? el('button', {
          type: 'button', class: 'btn btn--discreto btn--suelto', text: 'Eliminar la cuenta',
          onclick: () => confirmarBorrado(cuenta, estado, alGuardar,
            () => hojaCuenta(cuenta, estado, vista, { alGuardar }, paraFicha)),
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

/** "Génesis Ortega" -> "genesis". Es una propuesta: se puede cambiar a mano. */
function sugerirUsuario(nombre) {
  return String(nombre || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // fuera tildes
    .replace(/ñ/g, 'n')
    .split(/\s+/)[0]
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30)
}

function mensaje(err) {
  if (err?.status === 403) return 'Solo un administrador puede tocar las cuentas.'
  const datos = err?.response?.data || {}
  if (datos.usuario) return 'Ese nombre de usuario ya lo tiene otra cuenta.'
  if (datos.email) return 'Ese correo ya lo tiene otra cuenta, o no es un correo.'
  if (datos.password) return 'La contraseña no vale: ocho caracteres o más.'
  return err?.response?.error || err?.response?.message || err?.message || 'No hemos podido guardarlo.'
}

function confirmarBorrado(cuenta, estado, alGuardar, alEcharseAtras) {
  const ficha = (estado.equipo || []).find((f) => f.usuario === cuenta.id)
  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--peligro', text: 'Sí, eliminarla' })

  boton.addEventListener('click', async () => {
    boton.disabled = true
    boton.textContent = 'Eliminando…'
    try {
      await borrarCuenta(cuenta.id)
      cerrarHoja()
      await alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Sí, eliminarla'
      error.textContent = mensaje(err)
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: `¿Eliminar la cuenta de ${cuenta.nombre || cuenta.usuario}?`,
    cuerpo: [
      el('p', { class: 'parrafo', text: ficha
        ? `${ficha.nombre} dejará de poder entrar al panel. Su ficha del equipo, sus turnos y sus `
          + 'horas fichadas NO se borran: la cuenta es solo la llave.'
        : 'Esta cuenta dejará de poder entrar al panel.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Si es que esa persona ya no trabaja aquí, con esto basta: la cuenta se va y la ficha '
        + 'se queda con su historial. La ficha se apaga desde «El equipo».' }),
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

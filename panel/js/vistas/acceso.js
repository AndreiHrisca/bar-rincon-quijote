/**
 * Acceso
 * ---------------------------------------------------------------------------
 * La unica pantalla del panel con la marca a tamano grande. A partir de aqui
 * manda la informacion, no el logotipo.
 *
 * El campo dice "Usuario" y no "Correo" porque en la maqueta pone "santi": se
 * admiten los dos, que PocketBase autentica por "identity". Obligar a escribir
 * un correo entero en un movil a las once de la noche es una pequena crueldad.
 */

import { el, pintar } from '../dom.js'
import { entrar } from '../sesion.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'

export function acceso(contenedor, { alEntrar }) {
  let enviando = false

  const identidad = el('input', {
    class: 'entrada', id: 'acceso-usuario', name: 'username',
    type: 'text', autocomplete: 'username', autocapitalize: 'none',
    spellcheck: 'false', required: true, placeholder: 'santi',
  })

  const clave = el('input', {
    class: 'entrada', id: 'acceso-clave', name: 'current-password',
    type: 'password', autocomplete: 'current-password', required: true,
  })

  const error = el('p', { class: 'acceso__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'submit', class: 'btn btn--primario', text: 'Entrar' })

  const formulario = el('form', { class: 'acceso__form', novalidate: true, onsubmit: enviar }, [
    el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'acceso-usuario', text: 'Usuario' }),
      identidad,
    ]),
    el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'acceso-clave', text: 'Contraseña' }),
      clave,
    ]),
    error,
    boton,
    el('button', {
      type: 'button', class: 'acceso__olvido', text: 'He olvidado la contraseña',
      onclick: olvido,
    }),
  ])

  async function enviar(e) {
    e.preventDefault()
    if (enviando) return

    error.hidden = true
    if (!identidad.value.trim() || !clave.value) {
      return falla('Escribe el usuario y la contraseña.')
    }

    enviando = true
    boton.disabled = true
    boton.textContent = 'Entrando…'
    try {
      await entrar(identidad.value, clave.value)
      alEntrar()
    } catch (err) {
      // Un 400 de PocketBase aqui significa "usuario o contrasena mal", y se
      // dice asi de vago A PROPOSITO: decir cual de los dos falla le confirma a
      // quien prueba nombres cuales existen.
      falla(err?.status === 400
        ? 'Usuario o contraseña incorrectos.'
        : 'No hemos podido entrar. Comprueba la conexión e inténtalo otra vez.')
    } finally {
      enviando = false
      boton.disabled = false
      boton.textContent = 'Entrar'
    }
  }

  function falla(mensaje) {
    error.textContent = mensaje
    error.hidden = false
    clave.value = ''
    clave.focus()
  }

  pintar(contenedor,
    el('main', { class: 'acceso' }, [
      el('div', { class: 'acceso__marca' }, [
        // El logo es un fichero estatico compartido con la carta publica: se
        // sirve una sola vez y ya esta en la cache del navegador.
        el('img', { class: 'acceso__logo', src: '/compartido/img/logo.svg', alt: '', width: '158', height: '119' }),
        el('h1', { class: 'acceso__nombre', text: 'El Rincón del Quijote' }),
        el('div', { class: 'onda acceso__onda', role: 'presentation' }),
        el('p', { class: 'acceso__lema', text: 'Panel de gestión' }),
      ]),
      formulario,
      el('p', { class: 'acceso__pie', text: 'nndrei.dev · soporte 24/48 h' }),
    ]))

  identidad.focus()
}

/**
 * No hay recuperacion por correo, y no se finge que la haya.
 *
 * El bar no tiene servidor de correo configurado (no hay SMTP en el compose), y
 * un enlace que dice "te hemos enviado un correo" cuando no se ha enviado nada
 * es peor que no tener el enlace: la persona se queda esperando. Se dice lo que
 * hay que hacer de verdad, que en un bar de cuatro personas es hablar con
 * Santi. Ver DECISIONES.md, D-29.
 */
function olvido() {
  abrirHoja({
    titulo: 'He olvidado la contraseña',
    cuerpo: [
      el('p', { class: 'parrafo', text:
        'Las contraseñas del panel las pone Santi. Pídele que te la cambie: '
        + 'entra en Personal, te abre la ficha y le pone una nueva.' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'No se envían correos de recuperación: el bar no tiene servidor de correo, '
        + 'y un enlace que no llega hace perder más tiempo del que ahorra.' }),
    ],
    acciones: [
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Entendido', onclick: cerrarHoja }),
    ],
  })
}

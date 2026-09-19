/**
 * Ajustes de reservas
 * ---------------------------------------------------------------------------
 * El botón del engranaje de la cabecera. Solo lo ve el administrador, igual que
 * la regla de la colección "ajustes" (migraciones 1756701100_ajustes_dueno.js y
 * 1757200000_rol_administrador.js): quien sube el aforo del salón sin poder
 * verlo acepta mesas que no existen.
 *
 * Aquí está lo que hace falta para PODER abrir las reservas por la web. Sin
 * esta pantalla, los aforos arrancan a cero —a propósito, para que nadie
 * herede un número inventado— y no habría forma de ponerlos sin entrar al panel
 * de administración de PocketBase. Eso no se le pide a nadie.
 */

import { el } from '../dom.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { guardarAjustes } from '../datos.js'

export function ajustesReservas(estado, alGuardar) {
  const a = estado.ajustes
  if (!a) return

  const activas = el('input', { type: 'checkbox', class: 'interruptor__casilla', id: 'aj-activas', checked: !!a.reservas_activas })
  const mensaje = el('textarea', { class: 'entrada entrada--area', id: 'aj-mensaje', rows: '3', maxlength: '400' })
  mensaje.value = a.mensaje_cerrado || ''

  const barra = numero('aj-barra', a.aforo_barra)
  const terraza = numero('aj-terraza', a.aforo_terraza)
  const salon = numero('aj-salon', a.aforo_salon)
  const duracion = numero('aj-duracion', a.duracion_mesa_min, { min: 15, max: 480 })
  const antelacion = numero('aj-antelacion', a.antelacion_maxima_dias, { min: 1, max: 365 })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Guardar' })

  boton.addEventListener('click', async () => {
    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      const guardado = await guardarAjustes(a.id, {
        reservas_activas: activas.checked,
        mensaje_cerrado: mensaje.value.trim(),
        aforo_barra: Number(barra.value) || 0,
        aforo_terraza: Number(terraza.value) || 0,
        aforo_salon: Number(salon.value) || 0,
        duracion_mesa_min: Number(duracion.value) || 90,
        antelacion_maxima_dias: Number(antelacion.value) || 30,
      })
      estado.ajustes = guardado
      cerrarHoja()
      if (alGuardar) alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Guardar'
      error.textContent = err?.status === 403
        ? 'Solo un administrador puede cambiar los ajustes.'
        : (err?.response?.message || 'No hemos podido guardar los ajustes.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: 'Ajustes de reservas',
    cuerpo: [
      el('label', { class: 'interruptor', for: 'aj-activas' }, [
        el('span', { class: 'interruptor__cuerpo' }, [
          el('span', { class: 'interruptor__nombre', text: 'Reservas por la web' }),
          el('span', { class: 'interruptor__pie', text:
            'Apagado, la web enseña el mensaje de abajo y el teléfono. Por el panel se siguen apuntando igual.' }),
        ]),
        activas,
        el('span', { class: 'interruptor__palanca', 'aria-hidden': 'true' }),
      ]),

      campo('Mensaje cuando están cerradas', 'aj-mensaje', mensaje),

      el('h3', { class: 'ficha__rotulo', text: 'Aforo por zona' }),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Personas que caben a la vez en cada sitio. Una zona a cero no se ofrece '
        + 'en la web: no se enseña como llena, se deja fuera.' }),
      el('div', { class: 'campos-tres' }, [
        campo('Barra', 'aj-barra', barra),
        campo('Terraza', 'aj-terraza', terraza),
        campo('Salón', 'aj-salon', salon),
      ]),

      el('div', { class: 'campos-dos' }, [
        campo('Minutos por mesa', 'aj-duracion', duracion),
        campo('Días de antelación', 'aj-antelacion', antelacion),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Los minutos por mesa son lo que se cuenta ocupada una reserva para el aforo, '
        + 'no una hora a la que se eche a nadie.' }),

      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Dejarlo', onclick: cerrarHoja }),
    ],
  })
}

function numero(id, valor, { min = 0, max = 500 } = {}) {
  return el('input', {
    class: 'entrada', id, type: 'number', inputmode: 'numeric',
    min: String(min), max: String(max), value: String(valor ?? 0),
  })
}

function campo(rotulo, para, control) {
  return el('div', { class: 'campo' }, [
    el('label', { class: 'campo__rotulo', for: para, text: rotulo }),
    control,
  ])
}

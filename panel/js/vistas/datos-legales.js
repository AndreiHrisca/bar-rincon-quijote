/**
 * Datos legales del negocio
 * ---------------------------------------------------------------------------
 * Los cuatro datos que el aviso legal de la web tiene que publicar por ley —
 * titular, NIF, domicilio fiscal y un correo de contacto— más el plazo de
 * conservación de las reservas.
 *
 * POR QUÉ ESTÁN AQUÍ Y NO EN EL CÓDIGO. Un NIF no se escribe en un fichero
 * fuente: es un dato del negocio, cambia si Santi cambia de forma jurídica, y
 * mientras no lo dé nadie puede inventárselo. Nacen vacíos (migración
 * 1756701500_ajustes_legales.js), la web omite la línea que no tenga dato y
 * «Más» se lo recuerda al dueño hasta que los ponga. Ver DECISIONES.md, D-92.
 *
 * EL PLAZO DE RESERVAS NO ES DECORATIVO: es el mismo número que usa el borrado
 * automático de todas las madrugadas (pb_hooks/retencion.pb.js) y el mismo que
 * la política de privacidad le promete al cliente. Se cambia aquí y cambian las
 * tres cosas a la vez.
 *
 * Solo el dueño. Lo decide la regla de la colección `ajustes` (migración
 * 1756701100_ajustes_dueno.js); aquí solo se evita enseñar un formulario que va
 * a devolver un 403.
 */

import { el } from '../dom.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { guardarAjustes } from '../datos.js'

/** ¿Le falta al aviso legal algún dato obligatorio? */
export function faltanDatosLegales(ajustes) {
  if (!ajustes) return false        // sin ajustes cargados no se afirma nada
  return !String(ajustes.titular_legal || '').trim()
      || !String(ajustes.nif || '').trim()
      || !String(ajustes.correo_contacto || '').trim()
}

export function hojaDatosLegales(estado, alGuardar) {
  const a = estado.ajustes
  if (!a) return

  const titular = texto('dl-titular', a.titular_legal, {
    maxlength: '200', placeholder: 'Santiago … / Bar El Rincón del Quijote S.L.',
  })
  const nif = texto('dl-nif', a.nif, { maxlength: '20', placeholder: '00000000X', spellcheck: 'false' })
  const domicilio = texto('dl-domicilio', a.direccion_fiscal, {
    maxlength: '200', placeholder: 'Calle …, 00 — 28021 Madrid',
  })
  const correo = texto('dl-correo', a.correo_contacto, {
    type: 'email', inputmode: 'email', placeholder: 'hola@barrinconquijote.es', spellcheck: 'false',
  })
  const meses = texto('dl-meses', String(a.meses_retencion_reservas || 12), {
    type: 'number', inputmode: 'numeric', min: '1', max: '120',
  })

  const error = el('p', { class: 'hoja__error', role: 'alert', hidden: true })
  const boton = el('button', { type: 'button', class: 'btn btn--primario', text: 'Guardar' })

  boton.addEventListener('click', async () => {
    const n = Number(meses.value)
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      error.textContent = 'El plazo tiene que ser un número de meses entre 1 y 120.'
      error.hidden = false
      meses.focus()
      return
    }

    error.hidden = true
    boton.disabled = true
    boton.textContent = 'Guardando…'
    try {
      estado.ajustes = await guardarAjustes(a.id, {
        titular_legal: titular.value.trim(),
        nif: nif.value.trim().toUpperCase(),
        direccion_fiscal: domicilio.value.trim(),
        correo_contacto: correo.value.trim(),
        meses_retencion_reservas: n,
      })
      cerrarHoja()
      if (alGuardar) alGuardar()
    } catch (err) {
      boton.disabled = false
      boton.textContent = 'Guardar'
      error.textContent = err?.status === 403
        ? 'Solo el dueño puede cambiar estos datos.'
        : err?.response?.data?.correo_contacto
          ? 'Ese correo no parece un correo.'
          : (err?.response?.message || 'No hemos podido guardarlos.')
      error.hidden = false
    }
  })

  abrirHoja({
    titulo: 'Datos legales',
    cuerpo: [
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Esto es lo que sale en el aviso legal de la web. Son datos públicos por ley: '
        + 'quién está detrás de barrinconquijote.es y cómo escribirle.' }),

      campo('Titular', 'dl-titular', titular),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'La persona o la sociedad que responde, no el rótulo del bar.' }),

      campo('NIF o CIF', 'dl-nif', nif),
      campo('Domicilio fiscal', 'dl-domicilio', domicilio),
      campo('Correo de contacto', 'dl-correo', correo),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Hace falta una vía escrita para que alguien pueda pedir que borremos sus datos. '
        + 'El teléfono solo no basta.' }),

      el('h2', { class: 'rotulo-seccion', text: 'Reservas guardadas' }),
      campo('Meses que se conservan', 'dl-meses', meses),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Pasado ese plazo, cada reserva se borra sola de madrugada, con su nombre y su '
        + 'teléfono. Es el mismo número que la web le promete al cliente cuando reserva.' }),

      error,
    ],
    acciones: [
      boton,
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Dejarlo', onclick: cerrarHoja }),
    ],
  })

  titular.focus()
}

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

/**
 * Portada
 * ---------------------------------------------------------------------------
 * Es lo primero que ve alguien al escanear el QR de la mesa. Segun la maqueta,
 * solo lo que busca de verdad quien tiene el movil en la mano: si estais
 * abiertos, la carta y el telefono.
 */

import { el, pintar, logo } from '../dom.js'
import { t, campo } from '../idioma.js'
import { franjaCocina } from '../formato.js'
import { estadoDeApertura, textoDelHorario } from '/compartido/js/horario.js'
import { icono } from '/compartido/js/iconos.js'

export function portada(contenedor, { ajustes }) {
  const nombre = ajustes?.nombre_bar || 'El Rincón del Quijote'
  const telefono = ajustes?.telefono || ''

  pintar(contenedor,
    cabecera(nombre, ajustes),
    botonera(),
    el('div', { class: 'onda separador-onda', role: 'presentation' }),
    informacion(ajustes, telefono),
    celebraciones(),
    pie(),
  )
}

function cabecera(nombre, ajustes) {
  // TODO SALE DE LA CONFIGURACION y se calcula en hora de Madrid, no del
  // navegador de quien mira. Ver compartido/js/horario.js.
  const estado = estadoDeApertura(ajustes)

  return el('header', { class: 'portada' }, [
    logo('portada__logo'),
    el('p', { class: 'portada__marca', text: nombre }),
    el('p', { class: 'portada__lema', text: ajustes?.direccion || 'Ciudad de los Ángeles · Madrid' }),

    // Sin horario configurado no se ensena nada: vale mas callar que decir
    // "cerrado" con el bar lleno.
    estado.abierto === null ? null : el('p', { class: 'portada__estado' }, [
      el('i', { class: `portada__punto${estado.abierto ? '' : ' portada__punto--cerrado'}`, 'aria-hidden': 'true' }),
      estado.abierto
        ? `${t('abierto')} · ${t('cerramosALas')} ${estado.cierraA}`
        : `${t('cerrado')} · ${cuandoVolvemos(estado)}`,
    ]),

    // El motivo de un cierre puntual va aparte y entero: «Cerrado por Navidad»
    // dicho en la pastilla se comeria la hora de vuelta.
    estado.motivo
      ? el('p', { class: 'portada__cierre', text: estado.motivo })
      : null,
  ])
}

/** «abrimos a las 08:00», «abrimos mañana a las 08:00», «abrimos el jueves…». */
function cuandoVolvemos(estado) {
  if (!estado.abreA) return t('cerrado')
  if (estado.cuando === 'hoy') return `${t('abrimosALas')} ${estado.abreA}`
  if (estado.cuando === 'mañana') return `${t('abrimosManana')} ${estado.abreA}`
  return `${t('abrimosEl')} ${estado.cuando} ${t('aLas')} ${estado.abreA}`
}

function botonera() {
  return el('nav', { class: 'acciones', 'aria-label': t('carta') }, [
    el('div', { class: 'acciones__carta' }, [
      el('a', { class: 'btn btn--primario', href: '/carta#comida', text: t('verComida') }),
      el('a', { class: 'btn btn--primario', href: '/carta#bebidas', text: t('verBebidas') }),
    ]),
    el('a', { class: 'btn btn--linea', href: '/reserva', text: t('reservar') }),
  ])
}

function informacion(ajustes, telefono) {
  const cocina = franjaCocina(ajustes?.horario_cocina)

  return el('section', { class: 'info' }, [
    fila('reloj', t('horario'), [
      // La frase se GENERA desde el horario semanal. No hay ningun texto de
      // horario guardado a mano que pueda quedarse viejo.
      ...enLineas(textoDelHorario(ajustes?.horario_semanal)),
      cocina ? el('br') : null,
      cocina ? `${t('cocina')} ${cocina.abreTexto} – ${cocina.cierraTexto}` : null,
    ]),

    telefono ? fila('telefono', t('reservas'), [
      // Enlace real: se toca y llama. Es la accion mas util de la pantalla
      // cuando alguien esta de pie en la puerta.
      el('a', { href: `tel:${telefono.replace(/\s/g, '')}`, text: conEspacios(telefono) }),
    ]) : null,

    fila('ubicacion', t('donde'), [ajustes?.direccion || 'Ciudad de los Ángeles, Madrid']),
  ])
}

function fila(nombreIcono, clave, valor) {
  return el('div', { class: 'info__fila' }, [
    // Decorativo: el rotulo de al lado ya dice «Horario», «Reservas», «Dónde».
    icono(nombreIcono, { clase: 'ic info__icono' }),
    el('div', {}, [
      el('div', { class: 'info__clave', text: clave }),
      el('div', { class: 'info__valor' }, valor),
    ]),
  ])
}

/** Un texto con saltos de linea -> nodos con <br> en medio. */
function enLineas(texto) {
  const lineas = String(texto || '').split('\n').filter(Boolean)
  return lineas.flatMap((l, i) => (i ? [el('br'), l] : [l]))
}

/** 912881027 -> "91 288 10 27", que es como se lee un fijo de Madrid. */
function conEspacios(telefono) {
  const d = telefono.replace(/\D/g, '')
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : telefono
}

/**
 * El cachet de CELEBRACIONES es ademas la puerta de los eventos.
 *
 * La maqueta lo dibuja como un bloque de texto suelto, y la pantalla de eventos
 * («Qué se cuece») no tenia desde donde abrirse: la portada solo lleva a la
 * carta y a la reserva. En vez de anadir un tercer boton a la botonera —que son
 * dos a proposito, porque son las dos cosas que se buscan con el movil en la
 * mano—, el bloque que YA habla de celebraciones se convierte en el enlace.
 * Ver DECISIONES.md, D-85.
 */
function celebraciones() {
  return el('a', { class: 'destacado destacado--enlace', href: '/eventos' }, [
    el('p', { class: 'destacado__rotulo', text: t('celebraciones') }),
    el('h2', { class: 'destacado__titulo', text: t('celebracionesTitulo') }),
    el('p', { class: 'destacado__texto', text: t('celebracionesTexto') }),
    el('p', { class: 'destacado__ir' }, [t('verEventos'), icono('chevron', { clase: 'ic destacado__ic' })]),
  ])
}

/**
 * Pie con los tres textos legales (seccion 12 del encargo).
 *
 * La maqueta no dibuja ningun pie —las seis pantallas acaban en el borde— pero
 * el aviso legal, la privacidad y las cookies tienen que estar accesibles desde
 * la web, y este es el unico sitio donde caben sin estorbar: la carta y la
 * reserva terminan en una barra fija, y meterlos ahi seria taparlas.
 *
 * Va en gris tenue y en cuerpo pequeno, como lo que es: algo que casi nadie
 * abre, pero que tiene que poder abrirse.
 */
function pie() {
  return el('footer', { class: 'pie' }, [
    el('nav', { class: 'pie__enlaces', 'aria-label': t('avisoLegal') }, [
      el('a', { href: '/aviso-legal', text: t('avisoLegal') }),
      el('a', { href: '/privacidad', text: t('privacidad') }),
      el('a', { href: '/cookies', text: t('cookies') }),
    ]),
    el('p', { class: 'pie__nota', text: t('sinRastreo') }),
  ])
}

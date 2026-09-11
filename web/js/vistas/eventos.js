/**
 * Eventos — «Qué se cuece»
 * ---------------------------------------------------------------------------
 * Aqui es donde el menu navideno deja de ser un papel plastificado que hay que
 * reimprimir cada ano, que es literalmente lo que dice la maqueta.
 *
 * La pantalla NO va en la primera carga: se carga sola —el modulo y sus datos—
 * cuando alguien entra en /eventos. Quien escanea el QR para ver la carta no
 * paga ni un byte por esto (D-20, el presupuesto de 150 KB).
 *
 * Se ensenan primero los que estan por venir y despues los que ya pasaron, en
 * gris: la maqueta lo dibuja asi, y tiene sentido: al que llega nuevo le dice
 * que aqui pasan cosas.
 */

import { el, pintar } from '../dom.js'
import { t, campo, idioma } from '../idioma.js'
import { precioConSimbolo } from '../formato.js'
import { cargarEventos, urlImagenEvento } from '../api.js'
import { icono } from '/compartido/js/iconos.js'

// Se guardan entre visitas a la pantalla: se va y se vuelve del evento a la
// carta, y no tiene sentido volver a pedir la lista cada vez.
let guardados = null

export async function eventos(contenedor) {
  const lista = el('div', { class: 'lista' })

  pintar(contenedor,
    barraSuperior(),
    el('div', { class: 'eventos' }, [lista]),
    el('div', { class: 'barra-baja' }, [
      // La maqueta pone aqui «Avísame de los próximos». En la v1 no hay ni SMS
      // ni WhatsApp (seccion 2 del encargo: la integracion no se monta), asi
      // que ese boton solo podria pedir un telefono para no llamar a nadie.
      // Se pone en su lugar lo que el bar SI puede cumplir hoy. Ver D-86.
      el('a', { class: 'btn btn--primario', href: '/reserva', text: t('reservar') }),
    ]),
  )

  if (guardados) return pintarLista(lista, guardados)

  pintar(lista, el('p', { class: 'eventos__cargando', text: t('cargandoEventos') }))
  try {
    guardados = await cargarEventos()
    pintarLista(lista, guardados)
  } catch (e) {
    pintar(lista, vacio(t('eventosErrorTitulo'), t('eventosErrorTexto')))
  }
}

function barraSuperior() {
  return el('header', { class: 'topbar' }, [
    el('a', { class: 'topbar__boton', href: '/', 'aria-label': t('volver') }, [icono('chevron', { clase: 'ic ic--atras' })]),
    el('h1', { class: 'topbar__titulo', text: t('queSeCuece') }),
    el('button', {
      class: 'topbar__boton',
      'aria-label': t('cambiarIdioma'),
      text: idioma() === 'es' ? 'ES' : 'EN',
      onclick: () => document.dispatchEvent(new CustomEvent('quijote:idioma')),
    }),
  ])
}

function pintarLista(lista, todos) {
  if (!todos.length) return pintar(lista, vacio(t('sinEventosTitulo'), t('sinEventosTexto')))

  // El corte es HOY a medianoche: un evento que es hoy sigue siendo futuro
  // hasta que acabe el dia.
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const conFin = (e) => new Date(e.fecha_fin || e.fecha_inicio)
  const proximos = todos.filter((e) => conFin(e) >= hoy)
  const pasados = todos.filter((e) => conFin(e) < hoy).reverse()

  pintar(lista,
    ...proximos.map((e) => fila(e, false)),
    ...pasados.map((e) => fila(e, true)),
  )
}

function fila(evento, pasado) {
  const inicio = new Date(evento.fecha_inicio)
  const foto = urlImagenEvento(evento, '400x0')

  return el('article', { class: `evento${pasado ? ' evento--pasado' : ''}` }, [
    el('div', { class: 'fecha-b', 'aria-hidden': 'true' }, [
      el('div', { class: 'fecha-b__mes', text: mesCorto(inicio) }),
      el('div', { class: 'fecha-b__dia', text: String(inicio.getUTCDate()) }),
    ]),

    el('div', { class: 'evento__txt' }, [
      el('h2', { class: 'evento__nombre', text: titulo(evento) }),
      el('p', { class: 'evento__cuando', text: pasado ? t('yaPaso') : cuando(evento) }),
      campo(evento, 'descripcion')
        ? el('p', { class: 'evento__desc', text: campo(evento, 'descripcion') })
        : null,
    ]),

    // La foto va como en la linea de la carta: misma medida y mismo sitio. Es
    // el componente que la maqueta ya usa para una lista con imagen, y no se
    // inventa otro (mismo criterio que D-47).
    foto
      ? el('div', { class: 'evento__foto' }, [
          el('img', { src: foto, alt: '', loading: 'lazy', decoding: 'async' }),
        ])
      : null,
  ])
}

/**
 * El titulo lleva el precio pegado cuando lo hay: «Menú navideño · 40 €», tal
 * cual la maqueta. Un evento sin precio no ensena ningun cero.
 */
function titulo(evento) {
  const nombre = campo(evento, 'titulo')
  return evento.precio ? `${nombre} · ${precioConSimbolo(evento.precio)}` : nombre
}

/**
 * La linea granate de debajo del titulo: «Sábado · 13:00» para un dia suelto,
 * «Del 1 de diciembre al 6 de enero» para un tramo.
 */
function cuando(evento) {
  const inicio = new Date(evento.fecha_inicio)
  const fin = evento.fecha_fin ? new Date(evento.fecha_fin) : null
  const partes = []

  if (fin && fin.getTime() !== inicio.getTime()) {
    partes.push(`${t('del')} ${diaYMes(inicio)} ${t('al')} ${diaYMes(fin)}`)
  } else {
    partes.push(diaSemana(inicio))
  }

  if (evento.hora) partes.push(evento.hora)
  return partes.join(' · ')
}

// Las fechas sin hora se guardan como medianoche UTC del dia natural (D-19), asi
// que se leen SIEMPRE en UTC: en Madrid, un new Date('2026-12-01') interpretado
// en local es el 1 de diciembre a la 01:00, pero pintarlo con getDate() de otra
// zona daria el 30 de noviembre. Por eso todo va con timeZone: 'UTC'.
function local() { return idioma() === 'en' ? 'en-GB' : 'es-ES' }

function mesCorto(fecha) {
  return fecha.toLocaleDateString(local(), { month: 'short', timeZone: 'UTC' })
    .replace('.', '').toUpperCase()
}

function diaSemana(fecha) {
  const nombre = fecha.toLocaleDateString(local(), { weekday: 'long', timeZone: 'UTC' })
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

function diaYMes(fecha) {
  return fecha.toLocaleDateString(local(), { day: 'numeric', month: 'long', timeZone: 'UTC' })
}

function vacio(titulo, texto) {
  return el('div', { class: 'vacio' }, [
    el('p', { class: 'vacio__titulo', text: titulo }),
    el('p', { class: 'vacio__texto', text: texto }),
  ])
}

/**
 * Textos legales — aviso legal, privacidad y cookies
 * ---------------------------------------------------------------------------
 * Seccion 12 del encargo: los tres accesibles desde el pie de la web.
 *
 * NO van en la primera carga: este modulo se carga solo cuando alguien entra
 * en /aviso-legal, /privacidad o /cookies. Son tres pantallas que se visitan
 * una vez en la vida y pesan mas que la portada entera.
 *
 * DOS COSAS QUE NO SE INVENTAN AQUI:
 *
 *  1. Los datos del titular (razon social, NIF, domicilio fiscal y correo de
 *     contacto) salen de `ajustes`, que los rellena Santi desde el panel. Si
 *     falta alguno, esa linea NO se pinta: un aviso legal con un NIF inventado
 *     es peor que uno incompleto. El panel se lo recuerda al dueno mientras
 *     falten (panel/js/vistas/mas.js).
 *
 *  2. El plazo de conservacion de las reservas se lee de
 *     `ajustes.meses_retencion_reservas`, que es el MISMO numero que usa el
 *     borrado automatico (pb_hooks/retencion.pb.js). Si el plazo cambia, el
 *     texto cambia con el: no puede quedarse diciendo doce meses mientras el
 *     servidor borra a los seis.
 *
 * Estan escritos en castellano y NO se traducen al ingles. Un texto legal mal
 * traducido dice cosas distintas en cada idioma, y el que vale es el de la
 * jurisdiccion donde esta el bar. Ver DECISIONES.md, D-88.
 */

import { el, pintar } from '../dom.js'
import { t } from '../idioma.js'
import { icono } from '/compartido/js/iconos.js'

/** Las tres rutas que atiende este modulo. */
export const RUTAS = ['/aviso-legal', '/privacidad', '/cookies']

export function legal(contenedor, { ajustes }, ruta) {
  const doc = documento(ruta, ajustes || {})

  pintar(contenedor,
    el('header', { class: 'topbar' }, [
      el('a', { class: 'topbar__boton', href: '/', 'aria-label': t('volver') }, [icono('chevron', { clase: 'ic ic--atras' })]),
      el('h1', { class: 'topbar__titulo', text: doc.titulo }),
      // Hueco del ancho de un boton: centra el titulo sin dibujar un boton que
      // no hace nada. Aqui no hay conmutador de idioma (D-88).
      el('span', { class: 'topbar__hueco', 'aria-hidden': 'true' }),
    ]),

    el('article', { class: 'legal' }, doc.secciones.map((s) => [
      s.titulo ? el('h2', { class: 'legal__rotulo', text: s.titulo }) : null,
      ...s.parrafos.filter(Boolean).map((p) => (
        Array.isArray(p)
          ? el('ul', { class: 'legal__lista' }, p.filter(Boolean).map((li) => el('li', { text: li })))
          : el('p', { class: 'legal__texto', text: p })
      )),
    ])),

    el('nav', { class: 'legal__otros' }, RUTAS
      .filter((r) => r !== ruta)
      .map((r) => el('a', { class: 'enlace-suave', href: r, text: documento(r, {}).titulo }))),
  )
}

// ---------------------------------------------------------------------------
// Los tres textos
// ---------------------------------------------------------------------------

function documento(ruta, ajustes) {
  const bar = ajustes.nombre_bar || 'El Rincón del Quijote'
  const titular = (ajustes.titular_legal || '').trim()
  const nif = (ajustes.nif || '').trim()
  const domicilio = (ajustes.direccion_fiscal || '').trim() || (ajustes.direccion || '').trim()
  const correo = (ajustes.correo_contacto || '').trim()
  const telefono = (ajustes.telefono || '').trim()
  const meses = Number(ajustes.meses_retencion_reservas) || 12

  const contacto = [
    telefono ? `Teléfono: ${escrito(telefono)}` : null,
    correo ? `Correo electrónico: ${correo}` : null,
    domicilio ? `Dirección: ${domicilio}` : null,
  ].filter(Boolean)

  if (ruta === '/privacidad') return privacidad({ bar, titular, nif, contacto, meses })
  if (ruta === '/cookies') return cookies({ bar })
  return avisoLegal({ bar, titular, nif, domicilio, contacto })
}

function avisoLegal({ bar, titular, nif, domicilio, contacto }) {
  return {
    titulo: 'Aviso legal',
    secciones: [
      {
        titulo: 'Quién es el titular de esta web',
        parrafos: [
          `Esta web es la carta digital y el sistema de reservas de ${bar}, `
          + 'en Ciudad de los Ángeles (Madrid).',
          [
            titular ? `Titular: ${titular}` : null,
            nif ? `NIF: ${nif}` : null,
            domicilio ? `Domicilio: ${domicilio}` : null,
            ...contacto.filter((c) => !c.startsWith('Dirección')),
            'Dominio: barrinconquijote.es',
          ],
        ],
      },
      {
        titulo: 'Para qué sirve',
        parrafos: [
          'Aquí se publican la carta del bar, sus precios y los eventos que '
          + 'organizamos, y se pueden pedir mesas. No se vende nada por esta web: '
          + 'no hay pagos, ni cobros, ni facturación. Una reserva es una petición '
          + 'de mesa, no un contrato de compraventa.',
          'Los precios de la carta son los vigentes en el momento de publicarlos '
          + 'y pueden cambiar. Cada plato lleva dos precios, el de barra y el de '
          + 'terraza o salón, y se cobra el del sitio donde se sirve.',
          'La información sobre alérgenos se publica de buena fe y con el mayor '
          + 'cuidado, pero la cocina es pequeña y comparte espacio: si tienes una '
          + 'alergia, dínoslo al pedir y te lo confirmamos en el momento.',
        ],
      },
      {
        titulo: 'Cómo se puede usar',
        parrafos: [
          'Puedes consultar la carta y reservar mesa libremente. No está permitido '
          + 'usar esta web para hacer reservas falsas, automatizar peticiones ni '
          + 'intentar acceder a datos que no son tuyos.',
          'Los textos, las fotografías, el logotipo y el diseño de esta web '
          + `pertenecen a ${bar} o se usan con permiso. Puedes compartir el enlace `
          + 'todo lo que quieras; copiar el contenido para publicarlo en otro sitio, no.',
        ],
      },
      {
        titulo: 'Responsabilidad',
        parrafos: [
          'Ponemos los medios razonables para que la web funcione y para que lo '
          + 'que dice sea cierto, pero no podemos garantizar que esté disponible '
          + 'sin interrupciones. Si algo falla justo cuando quieres reservar, '
          + 'llámanos por teléfono: siempre hay alguien.',
          'Esta web no incrusta contenido de otras empresas ni carga nada desde '
          + 'servidores ajenos. Si en algún momento enlazamos a otra página '
          + '(un mapa, por ejemplo), lo que haya al otro lado no depende de nosotros.',
        ],
      },
      {
        titulo: 'Ley aplicable',
        parrafos: [
          'Esta web se rige por la ley española. Para cualquier discrepancia son '
          + 'competentes los juzgados y tribunales de Madrid.',
        ],
      },
    ],
  }
}

function privacidad({ bar, titular, nif, contacto, meses }) {
  return {
    titulo: 'Política de privacidad',
    secciones: [
      {
        titulo: 'Lo corto',
        parrafos: [
          'Si reservas mesa, guardamos tu nombre y tu teléfono para tenerte la '
          + `mesa puesta. Nada más. No los vendemos, no los cedemos a nadie y se `
          + `borran solos a los ${meses} meses.`,
          'Si solo miras la carta, no guardamos nada tuyo: ni cookies, ni tu IP, '
          + 'ni por dónde has pasado.',
        ],
      },
      {
        titulo: 'Quién responde de tus datos',
        parrafos: [
          [
            titular ? `Responsable: ${titular}` : `Responsable: ${bar}`,
            nif ? `NIF: ${nif}` : null,
            ...contacto,
          ],
        ],
      },
      {
        titulo: 'Qué guardamos cuando reservas, y por qué',
        parrafos: [
          'De una reserva guardamos: tu nombre, tu teléfono, el día y la hora, '
          + 'cuántos sois, la zona que prefieres, el motivo si nos lo dices '
          + '(un cumpleaños, una comunión) y lo que escribas en el recuadro de notas.',
          'Los usamos para una sola cosa: tener la mesa preparada y poder llamarte '
          + 'si hay algún problema con ella. El nombre, para saber quién llega; el '
          + 'teléfono, para avisarte. La base legal es tu consentimiento, que nos '
          + 'das marcando la casilla del formulario, y la gestión de la reserva '
          + 'que nos pides.',
          'El recuadro de notas es libre: no escribas ahí datos de salud, alergias '
          + 'graves ni nada delicado. Eso es mejor decírnoslo al llegar o por '
          + 'teléfono, y así lo trata quien está en la cocina y no queda escrito.',
        ],
      },
      {
        titulo: 'Cuánto tiempo',
        parrafos: [
          `Las reservas se borran automáticamente a los ${meses} meses de la fecha `
          + 'en que se hicieron. No es una promesa: lo hace el propio sistema todas '
          + 'las madrugadas, y se borra la reserva entera, no solo el nombre.',
          'Si nos pides que la borremos antes, la borramos y ya está.',
        ],
      },
      {
        titulo: 'Quién más los ve',
        parrafos: [
          'Nadie fuera del bar. Los datos están en un servidor propio, en Europa, '
          + 'y solo entran el dueño y el personal con cuenta en el panel de gestión. '
          + 'No hay empresas de marketing, ni redes sociales, ni servicios de '
          + 'analítica de por medio. No se envían datos fuera de la Unión Europea.',
          'Tampoco tomamos ninguna decisión automática sobre ti: una reserva la '
          + 'confirma una persona.',
        ],
      },
      {
        titulo: 'Qué contamos de la carta (y qué no)',
        parrafos: [
          'Para saber si la carta digital le sirve a alguien contamos tres cosas, '
          + 'y solo tres: cuántas veces se ha abierto la carta cada día, qué platos '
          + 'se han mirado y qué se ha buscado sin encontrarlo.',
          'Se cuentan sumadas por día, como quien echa palotes en una libreta. No '
          + 'guardamos tu dirección IP, ni ningún identificador tuyo, ni la hora, ni '
          + 'qué móvil usas. Con lo que queda apuntado es imposible saber que fuiste '
          + 'tú quien miró los huevos rotos, y esa es justamente la idea.',
        ],
      },
      {
        titulo: 'Tus derechos',
        parrafos: [
          'Puedes pedirnos ver lo que tenemos tuyo, corregirlo, borrarlo, limitar '
          + 'su uso, oponerte a que lo usemos o que te lo demos en un fichero. Se '
          + 'pide llamando al bar o por escrito a la dirección de arriba, y no '
          + 'cuesta nada.',
          'Si crees que no lo hemos hecho bien, puedes reclamar ante la Agencia '
          + 'Española de Protección de Datos (www.aepd.es).',
        ],
      },
    ],
  }
}

function cookies({ bar }) {
  return {
    titulo: 'Política de cookies',
    secciones: [
      {
        titulo: 'No hay banner porque no hace falta',
        parrafos: [
          `${bar} no usa cookies de publicidad, ni de análisis, ni de terceros. `
          + 'No hay Google Analytics, ni píxeles de redes sociales, ni botones de '
          + 'compartir que espíen. Por eso esta web no te saca ninguna ventana '
          + 'pidiéndote permiso: no hay nada que permitir.',
          'La ley solo obliga a pedir consentimiento para lo que no es '
          + 'estrictamente necesario. Aquí todo lo que se guarda en tu móvil lo es, '
          + 'y se queda en tu móvil.',
        ],
      },
      {
        titulo: 'Qué se guarda en tu móvil',
        parrafos: [
          'Nada de esto viaja a ningún servidor: son notas que el navegador guarda '
          + 'para ti y que puedes borrar cuando quieras desde los ajustes del '
          + 'navegador.',
          [
            'El idioma que has elegido, para no volver a preguntártelo.',
            'Una copia de la carta, para que puedas verla aunque te quedes sin '
            + 'cobertura en la terraza.',
            'Tu última reserva, para poder enseñarte el código y dejarte cancelarla '
            + 'sin tener que darte de alta en nada.',
            'Una marca de que ya se ha contado tu visita, para no contarla dos veces.',
          ],
        ],
      },
      {
        titulo: 'Y si borras todo eso',
        parrafos: [
          'No pasa nada: la web vuelve a abrirse en castellano y la carta se '
          + 'descarga otra vez. Lo único que se pierde es el enlace a tu última '
          + 'reserva; si la necesitas, llámanos con tu nombre y la buscamos.',
        ],
      },
    ],
  }
}

/** 912881027 -> "91 288 10 27". Igual que en la portada. */
function escrito(telefono) {
  const d = telefono.replace(/\D/g, '')
  return d.length === 9 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : telefono
}

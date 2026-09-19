/**
 * Estadísticas — «La carta en números»
 * ---------------------------------------------------------------------------
 * Pantalla 8 de la maqueta del panel.
 *
 * LO PRIMERO QUE DICE LA PANTALLA ES LO QUE NO ES: son consultas de la carta,
 * no ventas. Este sistema no cobra nada y no tiene ni un dato de caja
 * (secciones 2 y 7 del encargo). Sin ese aviso, «184» al lado de «Huevos rotos»
 * se lee como raciones vendidas, y no lo es.
 *
 * Los números salen de /api/quijote/estadisticas, que los suma en el servidor.
 * Aquí no se descarga la tabla de métricas: un mes son miles de filas y esto se
 * abre en un móvil.
 *
 * QUÉ NO ESTÁ, Y POR QUÉ. La maqueta dibuja una casilla de «2:40 minutos de
 * media». No se ha construido: medir cuánto rato está alguien mirando la carta
 * exige seguirle la pista durante la visita, y la sección 13 dice qué se puede
 * contar —escaneos, platos mirados y búsquedas sin resultado— y añade «nada
 * más». En su lugar va el reparto por idioma, que la sección 7 sí pide y que
 * sale del propio escaneo sin contar nada nuevo. Ver DECISIONES.md, D-90.
 */

import { el, pintar } from '../dom.js'
import { esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { ir } from '../enrutador.js'
import { estadisticas as pedirEstadisticas } from '../datos.js'
import { icono } from '/compartido/js/iconos.js'

// Cortos a proposito: los tres tienen que caber en una sola linea a 390 px.
const PERIODOS = [[7, 'Semana'], [30, 'Mes'], [90, 'Tres meses']]

export async function estadisticas(contenedor, estado) {
  // El periodo elegido se recuerda mientras dure la sesion del panel: se entra
  // y se sale de esta pantalla, y volver a empezar en «semana» cada vez es una
  // pulsacion de mas cada vez.
  const vista = { dias: estado.diasEstadisticas || 7, datos: null, error: null, cargando: true }

  async function cargar() {
    vista.cargando = true
    vista.error = null
    repintar()
    try {
      vista.datos = await pedirEstadisticas(vista.dias)
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  function repintar() {
    pintar(contenedor, pantalla(vista, (dias) => {
      vista.dias = dias
      estado.diasEstadisticas = dias
      cargar()
    }, cargar))
  }

  await cargar()
}

// ---------------------------------------------------------------------------

function pantalla(vista, alCambiarPeriodo, alReintentar) {
  return el('div', { class: 'pantalla' }, [
    cabecera('La carta en números', [], {
      volver: { titulo: 'Volver a Más', alPulsar: () => ir('/mas') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      selector(vista, alCambiarPeriodo),

      vista.error
        ? el('div', { class: 'margen margen--alto' }, [fallo(vista.error, alReintentar)])
        : vista.cargando
          ? el('div', { class: 'margen margen--alto' }, esqueletoFilas(4))
          : cuerpo(vista.datos),

      el('div', { style: 'height: var(--sp-5)' }),
    ]),

    nav('/mas'),
  ])
}

function selector(vista, alCambiar) {
  return el('div', { class: 'margen margen--alto' }, [
    el('div', { class: 'eleccion' }, PERIODOS.map(([dias, rotulo]) => {
      const puesto = vista.dias === dias
      return el('button', {
        type: 'button',
        class: `eleccion__opcion${puesto ? ' eleccion__opcion--puesta' : ''}`,
        'aria-pressed': String(puesto),
        text: rotulo,
        onclick: () => { if (!puesto) alCambiar(dias) },
      })
    })),
  ])
}

function fallo(err, alReintentar) {
  console.warn('[quijote] estadisticas:', err)
  const sinPermiso = err?.status === 403
  return el('div', { class: 'aviso aviso--error' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: sinPermiso ? 'Esta pantalla no es para tu cuenta' : 'No hemos podido cargar los números' }),
      el('span', { text: sinPermiso
        ? 'Las estadísticas de la carta las ve el administrador.'
        : 'Comprueba la conexión y vuelve a intentarlo.' }),
      // Sin permiso no hay nada que reintentar: reintentar dara otro 403.
      sinPermiso ? null : el('button', {
        type: 'button', class: 'aviso__accion', text: 'Reintentar', onclick: alReintentar,
      }),
    ]),
  ])
}

function cuerpo(d) {
  const hayAlgo = d.escaneos.total || d.vistas_plato || d.busquedas_sin_resultado

  return [
    casillas(d),

    !hayAlgo
      ? el('div', { class: 'margen margen--alto' }, [
        el('section', { class: 'tarjeta' }, [
          el('p', { class: 'vacio', text:
            'Todavía no hay nada que contar en este periodo. En cuanto alguien escanee el '
            + 'QR de una mesa, empieza a llenarse.' }),
        ]),
      ])
      : null,

    el('div', { class: 'margen' }, [
      el('h2', { class: 'rotulo-seccion', text: 'Escaneos por día' }),
      el('section', { class: 'tarjeta' }, [
        grafico(d.por_dia),
        el('p', { class: 'grafico__leyenda', text: leyenda(d.por_dia) }),
      ]),

      el('h2', { class: 'rotulo-seccion', text: 'Platos más mirados' }),
      el('section', { class: 'tarjeta' }, [
        d.platos.length
          ? el('div', { class: 'filas' }, d.platos.map((p, i) => puesto(i + 1, p.valor, String(p.total))))
          : el('p', { class: 'vacio', text: 'Nadie ha abierto todavía la ficha de un plato.' }),
      ]),

      el('h2', { class: 'rotulo-seccion', text: 'Buscado y no encontrado' }),
      el('section', { class: 'tarjeta' }, [
        d.busquedas.length
          ? el('div', { class: 'filas' }, d.busquedas.map((b) =>
            puesto(null, `«${b.valor}»`, `${b.total} ${b.total === 1 ? 'vez' : 'veces'}`)))
          : el('p', { class: 'vacio', text:
            'Nadie ha buscado nada que no esté en la carta. Cuando pase, aparece aquí.' }),
      ]),
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Esto es lo que la gente busca y no encuentra. Si «menú del día» sale veinte veces, '
        + 'no es un fallo de la web: es lo que te están pidiendo.' }),

      // El recordatorio va al final y en pequeno, pero va: sin el, «184» al
      // lado de un plato se lee como raciones vendidas.
      el('p', { class: 'parrafo parrafo--apagado', text:
        'Son consultas de la carta digital, no ventas. Este sistema no cobra ni factura '
        + 'nada, así que no hay ningún dato de caja aquí dentro. Se cuentan por día y sin '
        + 'saber quién es quién: no hay cookies ni se guarda ninguna dirección.' }),
    ]),
  ]
}

function casillas(d) {
  return el('div', { class: 'casillas' }, [
    casilla(String(d.escaneos.total), d.escaneos.total === 1 ? 'escaneo' : 'escaneos', true),
    casilla(String(d.vistas_plato), d.vistas_plato === 1 ? 'plato mirado' : 'platos mirados'),
    // Sin un solo escaneo, un «0 %» diria que nadie la ve en ingles, y lo que
    // pasa es que no la ve nadie. Un guion dice «no hay dato».
    casilla(d.escaneos.total ? `${d.escaneos.pct_ingles}%` : '—', 'en inglés'),
  ])
}

function casilla(numero, rotulo, acento = false) {
  return el('div', { class: `casilla${acento ? ' casilla--acento' : ''}` }, [
    el('div', { class: 'casilla__numero', text: numero }),
    el('div', { class: 'casilla__rotulo', text: rotulo }),
  ])
}

/**
 * Barras por dia.
 *
 * No es una libreria de graficos: son divs con una altura en porcentaje, que es
 * lo que la maqueta dibuja. Meter una libreria de 60 KB para siete barras seria
 * justo lo contrario de lo que pide el encargo.
 *
 * Las dos barras mas altas van en granate lleno, como en la maqueta: son las
 * que se buscan de un vistazo.
 */
function grafico(porDia) {
  if (!porDia.length) return el('p', { class: 'vacio', text: 'Sin datos todavía.' })

  const maximo = Math.max(...porDia.map((p) => p.total), 1)
  const corte = Math.max(...porDia.map((p) => p.total)) * 0.8

  return el('div', { class: 'grafico', role: 'img', 'aria-label': descripcion(porDia) }, porDia.map((p) => {
    // Minimo del 3 % para que un dia con visitas no se vea igual que uno a cero:
    // una barra de 0 px y otra de 1 px son la misma barra en un movil.
    const alto = p.total ? Math.max(3, Math.round((p.total / maximo) * 100)) : 0
    return el('div', { class: 'grafico__col' }, [
      el('div', {
        class: `grafico__barra${p.total >= corte && p.total > 0 ? ' grafico__barra--alta' : ''}`,
        style: `height:${alto}%`,
      }),
      el('div', { class: 'grafico__pie', text: etiquetaDia(p.dia, porDia.length) }),
    ])
  }))
}

/** L, M, X... para una semana; el numero del dia cada cinco para un mes. */
function etiquetaDia(dia, cuantos) {
  const [a, m, d] = dia.split('-').map(Number)
  const fecha = new Date(a, m - 1, d, 12)
  if (cuantos <= 7) return ['D', 'L', 'M', 'X', 'J', 'V', 'S'][fecha.getDay()]
  return d === 1 || d % 5 === 0 ? String(d) : ''
}

function descripcion(porDia) {
  return `Escaneos por día: ${porDia.map((p) => `${p.dia}, ${p.total}`).join('; ')}`
}

/**
 * La frase de debajo del grafico.
 *
 * La maqueta pone ahi una conclusion escrita a mano («el sábado se escanea
 * cuatro veces mas que el lunes»). Aqui se calcula, y solo se dice cuando hay
 * datos suficientes para que sea verdad: con cuatro escaneos sueltos, «el mejor
 * dia es el jueves» es ruido, no informacion.
 */
function leyenda(porDia) {
  const total = porDia.reduce((s, p) => s + p.total, 0)
  if (total < 20) return 'Con pocos escaneos todavía no se puede sacar conclusión de qué día se mira más.'

  const mejor = porDia.reduce((a, b) => (b.total > a.total ? b : a))
  const [a, m, d] = mejor.dia.split('-').map(Number)
  const nombre = new Date(a, m - 1, d, 12).toLocaleDateString('es-ES', { weekday: 'long' })
  const media = total / porDia.length
  const veces = media ? (mejor.total / media) : 0

  return veces >= 1.5
    ? `El día fuerte es el ${nombre} ${d}: se escanea ${veces.toFixed(1)} veces más que un día normal.`
    : `Se escanea de forma parecida todos los días, unos ${Math.round(media)} al día.`
}

function puesto(numero, nombre, valor) {
  return el('div', { class: 'puesto' }, [
    numero ? el('span', { class: 'puesto__numero', text: String(numero) }) : null,
    el('span', { class: 'puesto__nombre', text: nombre }),
    el('span', { class: 'puesto__valor', text: valor }),
  ])
}

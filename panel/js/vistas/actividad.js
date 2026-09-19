/**
 * Actividad — quién ha hecho cada cambio en el panel
 * ---------------------------------------------------------------------------
 * El diario del panel, tal y como lo escribe pb_hooks/actividad.pb.js: una
 * línea por cada cosa que alguien del equipo hace aquí dentro, con quién, qué,
 * sobre qué y —cuando importa— qué había antes y qué hay ahora.
 *
 * PARA QUÉ ESTÁ. Para contestar «¿quién ha cambiado el precio del cachopo?» y
 * «¿quién canceló la mesa de los Ortega?» sin preguntar y sin creerse la
 * respuesta. En un bar donde el móvil del panel se deja en la barra, eso no es
 * desconfianza: la mitad de las veces la respuesta es «se tocó sin querer» y lo
 * único que hace falta es saber qué deshacer.
 *
 * SOLO EL ADMINISTRADOR, y no solo porque esta pantalla lo compruebe: la regla
 * de la colección `actividad` solo deja listar a `rol = "admin"`. A un empleado
 * que teclee la dirección le sale la pantalla de «esto no es para tu cuenta»,
 * no una lista vacía que parece un error.
 *
 * LA FORMA ES LA DE FICHAJES, no una tabla: día, y debajo las horas. Una tabla
 * con seis columnas no cabe en un móvil de 390 px, que es donde se abre esto.
 *
 * SE TRAE DE 40 EN 40. La tabla crece con cada gesto del turno; pedirla entera
 * sería descargar un año de trabajo para leer lo de esta tarde.
 */

import { el, pintar } from '../dom.js'
import { esqueletoFilas } from '../piezas/estados.js'
import { nav } from '../piezas/nav.js'
import { cabecera } from '../piezas/cabecera.js'
import { abrirHoja, cerrarHoja } from '../piezas/hoja.js'
import { ir } from '../enrutador.js'
import { esAdmin } from '../sesion.js'
import { cargarActividad, cargarCuentas } from '../datos.js'
import { diaDeInstante, horaLocal, diaRelativo, conMayuscula, hoyISO } from '../fechas.js'
import { icono } from '/compartido/js/iconos.js'

const POR_PAGINA = 40

/**
 * Cómo se llama en pantalla cada tipo de cosa.
 *
 * El valor que guarda el servidor es el nombre de la colección en singular
 * («plato», «aviso_stock»); aquí se traduce al idioma del bar. Si aparece uno
 * que no esté en esta lista se pinta tal cual: es preferible una palabra fea a
 * una opción que desaparece del filtro.
 */
const NOMBRE_RECURSO = {
  reserva: 'Reservas',
  plato: 'Platos',
  categoria: 'Categorías',
  evento: 'Eventos',
  producto: 'Productos',
  proveedor: 'Proveedores',
  falta: 'Faltas',
  recuento: 'Recuentos',
  empleado: 'Fichas del equipo',
  cuenta: 'Cuentas',
  turno: 'Turnos',
  fichaje: 'Fichajes',
  ajustes: 'Ajustes',
  sesion: 'Entradas y salidas',
}

/**
 * Cómo se llama en pantalla cada campo que puede aparecer en un «antes →
 * después».
 *
 * Es el único sitio del proyecto donde hace falta esta traducción, y vive aquí
 * y no en el servidor a propósito: el servidor guarda el nombre del campo tal
 * cual, que es el dato, y esto es presentación. Un campo sin traducir se pinta
 * con su nombre a secas y se entiende igual.
 */
const NOMBRE_CAMPO = {
  hora: 'Hora', fecha: 'Fecha', comensales: 'Personas', zona: 'Zona',
  estado: 'Estado', nombre: 'Nombre', telefono: 'Teléfono', nota: 'Nota',
  precio_barra: 'Precio barra', precio_terraza: 'Precio terraza',
  descripcion: 'Descripción', descripcion_en: 'Descripción (inglés)',
  nombre_en: 'Nombre (inglés)', categoria: 'Categoría', visible: 'En la carta',
  alergenos: 'Alérgenos', foto: 'Foto', orden: 'Orden',
  admite_extras: 'Ingredientes extra',
  rol: 'Rol', usuario: 'Usuario', activo: 'Trabaja aquí', puesto: 'Puesto',
  nivel: 'Gravedad', resuelto: 'Resuelto', cantidad: 'Cantidad',
  minimo: 'Mínimo', unidad: 'Unidad', ubicacion: 'Ubicación',
  proveedor: 'Proveedor', entrada: 'Entrada', salida: 'Salida',
  hora_inicio: 'Empieza', hora_fin: 'Acaba', empleado: 'Empleado',
  titulo: 'Título', imagen: 'Imagen', fecha_inicio: 'Empieza', fecha_fin: 'Acaba',
  aforo_salon: 'Aforo del salón', aforo_terraza: 'Aforo de la terraza',
  horario_cocina: 'Horario de cocina', horario_semanal: 'Horario del bar',
  meses_retencion_reservas: 'Meses que se guardan las reservas',
}

/** Los valores que se leen mejor en palabras que como vienen de la base. */
const EN_PALABRAS = {
  true: 'sí', false: 'no', '': '—',
  admin: 'administrador', empleado: 'empleado',
  agotado: 'agotado', queda_poco: 'queda poco',
  pendiente: 'pendiente', confirmada: 'confirmada', sentada: 'sentada',
  cumplida: 'cumplida', anulada: 'anulada', no_presentada: 'no se presentó',
  en_curso: 'en curso', cerrado: 'cerrado',
  salon: 'salón', terraza: 'terraza',
}

export async function actividad(contenedor, estado) {
  const vista = {
    cargando: true,
    error: null,
    lineas: [],
    pagina: 1,
    hayMas: false,
    trayendoMas: false,
    sinPermiso: false,
    // Los filtros. Vacío significa «todo», que es como se entra siempre.
    filtros: { actor: '', recurso: '', dia: '' },
    // Las cuentas, para el selector de empleado. Se piden una vez.
    cuentas: null,
    filtrosAbiertos: false,
  }

  function repintar() {
    pintar(contenedor, pantalla(vista, acciones))
  }

  const acciones = {
    alternarFiltros() {
      vista.filtrosAbiertos = !vista.filtrosAbiertos
      repintar()
    },
    filtrar(campo, valor) {
      vista.filtros[campo] = valor
      cargar()
    },
    limpiar() {
      vista.filtros = { actor: '', recurso: '', dia: '' }
      cargar()
    },
    mas: traerMas,
    reintentar: cargar,
    detalle(linea) { hojaDetalle(linea) },
  }

  async function cargar() {
    // A quien no es administrador no se le pide nada: la regla de la coleccion
    // le devolveria un 200 con cero filas —una listRule es un FILTRO, no un
    // permiso— y la pantalla le diria «todavia no hay nada apuntado», que es
    // mentira y ademas confunde. El aviso honesto es que esto no es para su
    // cuenta. La restriccion de verdad sigue estando en el servidor; esto solo
    // decide que frase se lee.
    if (!esAdmin()) {
      vista.cargando = false
      vista.sinPermiso = true
      repintar()
      return
    }

    vista.cargando = true
    vista.error = null
    vista.pagina = 1
    repintar()
    try {
      const r = await cargarActividad({ porPagina: POR_PAGINA, ...vista.filtros })
      vista.lineas = r.items
      vista.hayMas = r.page < r.totalPages
    } catch (err) {
      vista.error = err
    }
    vista.cargando = false
    repintar()
  }

  async function traerMas() {
    if (vista.trayendoMas || !vista.hayMas) return
    vista.trayendoMas = true
    repintar()
    try {
      const r = await cargarActividad({
        pagina: vista.pagina + 1, porPagina: POR_PAGINA, ...vista.filtros,
      })
      vista.lineas = vista.lineas.concat(r.items)
      vista.pagina = r.page
      vista.hayMas = r.page < r.totalPages
    } catch (err) {
      // Un fallo al traer más no puede tirar lo que ya se está leyendo: se deja
      // la lista como está y el botón vuelve a estar disponible.
      console.warn('[quijote] actividad, traer más:', err)
    }
    vista.trayendoMas = false
    repintar()
  }

  repintar()

  // Las cuentas solo hacen falta para el selector de empleado, así que no
  // retrasan la lista: se piden a la vez y se repinta cuando lleguen.
  if (esAdmin()) {
    cargarCuentas()
      .then((c) => { vista.cuentas = c; if (vista.filtrosAbiertos) repintar() })
      .catch(() => { vista.cuentas = [] })
  }

  await cargar()
}

// ---------------------------------------------------------------------------

function pantalla(vista, acc) {
  const hayFiltro = !!(vista.filtros.actor || vista.filtros.recurso || vista.filtros.dia)

  return el('div', { class: 'pantalla' }, [
    cabecera('Actividad', vista.sinPermiso ? [] : [
      {
        icono: 'buscar',
        titulo: 'Filtrar la actividad',
        activo: vista.filtrosAbiertos || hayFiltro,
        alPulsar: acc.alternarFiltros,
      },
    ], {
      volver: { titulo: 'Volver a Más', alPulsar: () => ir('/mas') },
    }),

    el('div', { class: 'pantalla__scroll' }, [
      vista.filtrosAbiertos && !vista.sinPermiso ? filtros(vista, acc) : null,

      el('div', { class: 'margen margen--alto' }, [
        vista.sinPermiso
          ? avisoSinPermiso()
          : vista.error
            ? errorDeCarga(vista.error, acc.reintentar)
            : vista.cargando
              ? esqueletoFilas(6)
              : cuerpo(vista, acc, hayFiltro),
      ]),

      el('div', { style: 'height: var(--sp-5)' }),
    ]),

    nav('/mas'),
  ])
}

function cuerpo(vista, acc, hayFiltro) {
  if (!vista.lineas.length) {
    return el('section', { class: 'tarjeta' }, [
      el('p', { class: 'vacio', text: hayFiltro
        ? 'No hay nada que encaje con lo que has pedido. Prueba a quitar algún filtro.'
        : 'Todavía no hay nada apuntado. En cuanto alguien toque algo en el panel, '
          + 'aparece aquí.' }),
    ])
  }

  return [
    // Se agrupa por día aquí y no en el servidor: las líneas ya vienen
    // ordenadas por fecha, así que repartirlas es recorrer la lista una vez.
    porDias(vista.lineas).map(([dia, lineas]) => [
      el('div', { class: 'dia-cab' }, [
        el('h2', { class: 'dia-cab__dia', text: conMayuscula(diaRelativo(dia)) }),
        el('span', { class: 'dia-cab__resumen', text:
          `${lineas.length} ${lineas.length === 1 ? 'apunte' : 'apuntes'}` }),
      ]),
      el('section', { class: 'tarjeta', style: 'margin-bottom: var(--sp-4)' }, [
        el('div', { class: 'filas' }, lineas.map((l) => fila(l, acc))),
      ]),
    ]),

    vista.hayMas
      ? el('button', {
        type: 'button',
        class: 'btn btn--linea',
        disabled: vista.trayendoMas || null,
        text: vista.trayendoMas ? 'Trayendo…' : 'Ver más',
        onclick: acc.mas,
      })
      : el('p', { class: 'pie-nota', text: 'No hay nada más atrás.' }),
  ]
}

/**
 * Una línea del diario.
 *
 * Es un botón cuando hay detalle que enseñar y un div cuando no: así el dedo no
 * se encuentra con filas que parecen pulsables y no hacen nada. El «antes →
 * después» de los dos cambios más importantes se ve ya en la lista, porque es
 * justo lo que se viene a mirar; el resto está en el detalle.
 */
function fila(linea, acc) {
  const cambios = Object.entries(linea.datos?.cambios || {})
  const hayDetalle = cambios.length > 0

  const dentro = [
    el('span', { class: 'apunte__hora', text: horaLocal(linea.creado) }),
    el('span', { class: 'apunte__cuerpo' }, [
      el('span', { class: 'apunte__quien', text: linea.actor_nombre }),
      el('span', { class: 'apunte__que', text: linea.descripcion }),
      cambios.length
        ? el('span', { class: 'apunte__cambios' },
          cambios.slice(0, 2).map(([campo, [antes, despues]]) => cambio(campo, antes, despues)))
        : null,
      cambios.length > 2
        ? el('span', { class: 'apunte__mas', text:
          `y ${cambios.length - 2} ${cambios.length - 2 === 1 ? 'cambio más' : 'cambios más'}` })
        : null,
    ]),
    hayDetalle ? icono('chevron', { clase: 'ic apunte__flecha' }) : null,
  ]

  return hayDetalle
    ? el('button', {
      type: 'button',
      class: `apunte apunte--pulsable apunte--${clase(linea.accion)}`,
      onclick: () => acc.detalle(linea),
    }, dentro)
    : el('div', { class: `apunte apunte--${clase(linea.accion)}` }, dentro)
}

/** «Hora  20:00 → 21:00», en una línea. */
function cambio(campo, antes, despues) {
  return el('span', { class: 'cambio' }, [
    el('span', { class: 'cambio__campo', text: NOMBRE_CAMPO[campo] || campo }),
    el('span', { class: 'cambio__valores' }, [
      el('span', { class: 'cambio__antes', text: enPalabras(antes) }),
      el('span', { class: 'cambio__flecha', text: '→', 'aria-hidden': 'true' }),
      el('span', { class: 'cambio__despues', text: enPalabras(despues) }),
    ]),
  ])
}

function hojaDetalle(linea) {
  const cambios = Object.entries(linea.datos?.cambios || {})

  abrirHoja({
    titulo: linea.descripcion,
    cuerpo: el('div', {}, [
      el('p', { class: 'parrafo parrafo--apagado', text:
        `${linea.actor_nombre} · ${conMayuscula(diaRelativo(diaDeInstante(linea.creado)))} `
        + `a las ${horaLocal(linea.creado)}` }),

      cambios.length
        ? el('div', { class: 'tarjeta', style: 'margin-top: var(--sp-3)' }, [
          el('div', { class: 'filas' }, cambios.map(([campo, [antes, despues]]) =>
            el('div', { class: 'cambio cambio--hoja' }, [
              el('span', { class: 'cambio__campo', text: NOMBRE_CAMPO[campo] || campo }),
              el('span', { class: 'cambio__valores' }, [
                el('span', { class: 'cambio__antes', text: enPalabras(antes) }),
                el('span', { class: 'cambio__flecha', text: '→', 'aria-hidden': 'true' }),
                el('span', { class: 'cambio__despues', text: enPalabras(despues) }),
              ]),
            ]))),
        ])
        : el('p', { class: 'parrafo', text: 'No hay más detalle de este apunte.' }),

      // Ni contraseñas ni teléfonos: lo dice la pantalla porque quien mira esto
      // tiene que saber que lo que no está es porque no se guarda, no porque se
      // haya perdido.
      el('p', { class: 'parrafo parrafo--apagado', style: 'margin-top: var(--sp-3)', text:
        'Los datos de contacto de los clientes y las contraseñas no se guardan aquí: '
        + 'si cambiaron, sale que cambiaron, pero no a qué.' }),
    ]),
    acciones: [
      el('button', { type: 'button', class: 'btn btn--linea', text: 'Cerrar', onclick: cerrarHoja }),
    ],
  })
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

function filtros(vista, acc) {
  const recursos = [...new Set(vista.lineas.map((l) => l.recurso))].sort()
  // El que esté puesto tiene que seguir en la lista aunque la página que se ve
  // ahora no lo contenga; si no, el filtro se borraría solo al pintarse.
  if (vista.filtros.recurso && !recursos.includes(vista.filtros.recurso)) {
    recursos.push(vista.filtros.recurso)
  }

  const hayFiltro = !!(vista.filtros.actor || vista.filtros.recurso || vista.filtros.dia)

  return el('div', { class: 'margen margen--alto filtros' }, [
    el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'ac-quien', text: 'Quién' }),
      el('select', {
        class: 'entrada', id: 'ac-quien',
        onchange: (e) => acc.filtrar('actor', e.target.value),
      }, [
        el('option', { value: '', text: 'Todo el equipo', selected: !vista.filtros.actor }),
        ...(vista.cuentas || []).map((c) => el('option', {
          value: c.id,
          selected: c.id === vista.filtros.actor,
          text: c.nombre || c.usuario,
        })),
      ]),
    ]),

    el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'ac-que', text: 'Sobre qué' }),
      el('select', {
        class: 'entrada', id: 'ac-que',
        onchange: (e) => acc.filtrar('recurso', e.target.value),
      }, [
        el('option', { value: '', text: 'Todo', selected: !vista.filtros.recurso }),
        ...recursos.map((r) => el('option', {
          value: r,
          selected: r === vista.filtros.recurso,
          text: NOMBRE_RECURSO[r] || r,
        })),
      ]),
    ]),

    el('div', { class: 'campo' }, [
      el('label', { class: 'campo__rotulo', for: 'ac-dia', text: 'Qué día' }),
      el('input', {
        class: 'entrada', id: 'ac-dia', type: 'date',
        value: vista.filtros.dia || '',
        max: hoyISO(),
        onchange: (e) => acc.filtrar('dia', e.target.value),
      }),
    ]),

    hayFiltro
      ? el('button', {
        type: 'button', class: 'btn btn--linea', text: 'Quitar los filtros', onclick: acc.limpiar,
      })
      : null,
  ])
}

// ---------------------------------------------------------------------------

/** Lo que ve quien no es administrador. Misma forma que en Estadísticas. */
function avisoSinPermiso() {
  return el('div', { class: 'aviso aviso--error' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: 'Esta pantalla no es para tu cuenta' }),
      el('span', { text: 'La actividad del panel la consulta el administrador.' }),
    ]),
  ])
}

function errorDeCarga(err, alReintentar) {
  console.warn('[quijote] actividad:', err)
  // Un 403 aquí solo puede venir de que la cuenta haya dejado de ser
  // administradora entre que se pintó la pantalla y se pidieron los datos.
  if (err?.status === 403) return avisoSinPermiso()

  return el('div', { class: 'aviso aviso--error' }, [
    icono('aviso', { clase: 'ic aviso__glifo' }),
    el('div', { class: 'aviso__texto' }, [
      el('b', { text: 'No hemos podido cargar la actividad' }),
      el('span', { text: 'Comprueba la conexión y vuelve a intentarlo.' }),
      el('button', {
        type: 'button', class: 'aviso__accion', text: 'Reintentar', onclick: alReintentar,
      }),
    ]),
  ])
}

/** Reparte las líneas por día natural de aquí, conservando el orden. */
function porDias(lineas) {
  const dias = new Map()
  for (const l of lineas) {
    const dia = diaDeInstante(l.creado)
    if (!dias.has(dia)) dias.set(dia, [])
    dias.get(dia).push(l)
  }
  return [...dias.entries()]
}

/** «entrar_fallido» -> «entrar-fallido», para la clase CSS. */
function clase(accion) {
  return String(accion || '').replace(/_/g, '-')
}

/**
 * Un valor guardado, escrito para leerlo.
 *
 * El vacío se pinta como una raya y no como nada: «Nota  → algo» no se entiende,
 * y «Nota  —  →  algo» dice que antes no había nada.
 */
function enPalabras(valor) {
  const clave = String(valor)
  if (Object.prototype.hasOwnProperty.call(EN_PALABRAS, clave)) return EN_PALABRAS[clave]
  return clave === '' ? '—' : clave
}

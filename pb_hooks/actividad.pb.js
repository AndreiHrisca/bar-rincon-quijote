/// <reference path="../pb_data/types.d.ts" />
//
// Actividad — quien ha hecho cada cosa en el panel
// ===========================================================================
// UNA SOLA PUERTA para todo el diario. No hay ni una llamada a «apunta esto»
// repartida por las demas pantallas ni por los demas hooks: aqui se enganchan
// de golpe las colecciones que se auditan, y lo que decide que se guarda y como
// se cuenta esta en pb_hooks/lib/actividad.js, que se prueba suelto
// (pruebas/unitarias/actividad.test.js).
//
// POR QUE LOS HOOKS DE *Request* Y NO LOS DE *AfterSuccess*, que serian los
// naturales: en PocketBase 0.40 el evento de «ya se ha guardado»
// (onRecordAfterUpdateSuccess) es un RecordEvent y NO lleva la peticion dentro,
// asi que no tiene `e.auth` y no hay forma de saber quien lo hizo. El de
// peticion si. El precio es que hay que llamar a `e.next()` en medio: antes se
// mira como estaba el registro, se deja que la operacion ocurra, y despues —si
// no ha lanzado— se escribe la linea.
//
//   SI e.next() LANZA, LA LINEA NO SE ESCRIBE. Es lo correcto: un 403 o un
//   fallo de validacion no es una accion, es un intento que no llego a nada.
//
// TRES COSAS QUE NO ENTRAN AL DIARIO, y las tres a proposito:
//
//   1. LO QUE HACE LA WEB PUBLICA. Una reserva desde el movil de un cliente
//      llega sin sesion y no se apunta. El encargo lo pide con todas las
//      letras: el diario es de las acciones del equipo. Lo que hace la gente en
//      la carta ya se cuenta, y sin identificar a nadie, en `metricas`.
//
//   2. LO QUE HACE EL SUPERUSUARIO desde /_/. No es una persona del negocio: es
//      la valvula de escape para arreglar la base a mano, y por ahi entran
//      tambien las migraciones y las pruebas. Si se auditara, cada pasada de
//      pruebas dejaria cien lineas falsas.
//
//   3. `metricas` y el propio `actividad` (lib/actividad.js, NO_SE_AUDITA).
//      Auditar la auditoria es una carrera sin final.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado y NO ve lo que se declare en el nivel
// superior de este fichero —ni siquiera una funcion suelta escrita aqui
// debajo—. Por eso TODO lo compartido vive en lib/actividad.js y cada handler
// empieza por su propio require().
// ===========================================================================

// Las colecciones auditadas van repetidas en los tres registros porque las
// etiquetas se pasan como argumentos sueltos, no como lista. `ajustes` solo
// aparece en editar: es una fila unica que ni se crea ni se borra.

// --- Crear -----------------------------------------------------------------
onRecordCreateRequest((e) => {
  const A = require(`${__hooks}/lib/actividad.js`)
  const quien = A.actorDe(e)

  e.next()

  if (!quien) return
  const coleccion = e.record.collection().name
  A.anotar(e.app, {
    actor: quien,
    coleccion: coleccion,
    accion: 'crear',
    recursoId: e.record.id,
    etiqueta: A.etiquetaDe(coleccion, A.instantanea(e.record)),
    cambios: {},
  })
}, 'reservas', 'platos', 'categorias', 'eventos', 'productos', 'proveedores',
   'avisos_stock', 'recuentos', 'empleados', 'turnos', 'fichajes', 'users')

// --- Editar ----------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const A = require(`${__hooks}/lib/actividad.js`)
  const quien = A.actorDe(e)

  // La foto de antes se saca AHORA, con el registro todavia sin tocar. Despues
  // de e.next() ya no hay con que compararlo.
  const antes = quien ? A.instantanea(e.record.original()) : null

  e.next()

  if (!quien) return

  const cambios = A.diferencias(antes, A.instantanea(e.record))

  // UN PATCH QUE NO CAMBIA NADA NO ES UN CAMBIO. El panel repinta pantallas
  // enteras y manda el registro completo; sin esto, abrir un plato y cerrarlo
  // sin tocar nada dejaria una linea diciendo que alguien lo modifico, y el
  // diario dejaria de servir justo para lo que esta.
  if (!Object.keys(cambios).length) return

  const coleccion = e.record.collection().name
  A.anotar(e.app, {
    actor: quien,
    coleccion: coleccion,
    accion: 'editar',
    recursoId: e.record.id,
    etiqueta: A.etiquetaDe(coleccion, A.instantanea(e.record)),
    cambios: cambios,
  })
}, 'reservas', 'platos', 'categorias', 'eventos', 'productos', 'proveedores',
   'avisos_stock', 'recuentos', 'empleados', 'turnos', 'fichajes', 'users', 'ajustes')

// --- Borrar ----------------------------------------------------------------
onRecordDeleteRequest((e) => {
  const A = require(`${__hooks}/lib/actividad.js`)
  const quien = A.actorDe(e)

  // Igual que arriba, pero por un motivo aun mas evidente: despues del borrado
  // no queda de donde sacar el nombre de lo que se ha borrado, que es justo el
  // dato que hace util la linea.
  const copia = quien ? A.instantanea(e.record) : null
  const coleccion = e.record.collection().name
  const id = e.record.id

  e.next()

  if (!quien) return
  A.anotar(e.app, {
    actor: quien,
    coleccion: coleccion,
    accion: 'borrar',
    recursoId: id,
    etiqueta: A.etiquetaDe(coleccion, copia),
    cambios: {},
  })
}, 'reservas', 'platos', 'categorias', 'eventos', 'productos', 'proveedores',
   'avisos_stock', 'recuentos', 'empleados', 'turnos', 'fichajes', 'users')

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
// Se engancha al acceso POR CONTRASENA y no a onRecordAuthRequest, que es el
// que parece. onRecordAuthRequest salta tambien en cada `authRefresh()`, y el
// panel refresca la sesion cada vez que se abre: el diario se llenaria de
// «Santi inició sesión» cuatro veces por turno y no se distinguiria el acceso
// de verdad.
//
// EL FALLO SE APUNTA CUANDO SABEMOS A QUIEN IBA DIRIGIDO, que es lo que pide el
// encargo. Se guarda la identidad TECLEADA —el nombre de usuario o el correo—,
// NUNCA la contrasena, ni siquiera para decir que era incorrecta: un diario con
// contrasenas equivocadas dentro es un diccionario de contrasenas casi buenas.
onRecordAuthWithPasswordRequest((e) => {
  const A = require(`${__hooks}/lib/actividad.js`)
  const identidad = String(e.identity || '')

  try {
    e.next()
  } catch (err) {
    // Si PocketBase ha llegado a encontrar la cuenta, se firma con ella para
    // que el filtro por empleado la encuentre; si no existe, queda sin actor y
    // con la identidad tecleada en el detalle.
    const cuenta = e.record
    A.anotar(e.app, {
      actor: cuenta
        ? { id: cuenta.id, nombre: cuenta.getString('nombre') || identidad }
        : { id: '', nombre: identidad || 'desconocido' },
      coleccion: null,
      accion: 'entrar_fallido',
      recursoId: cuenta ? cuenta.id : '',
      extra: identidad,
    })
    throw err
  }

  const cuenta = e.record
  if (!cuenta) return
  A.anotar(e.app, {
    actor: {
      id: cuenta.id,
      nombre: cuenta.getString('nombre') || cuenta.getString('usuario') || 'Sin nombre',
    },
    coleccion: null,
    accion: 'entrar',
    recursoId: cuenta.id,
  })
}, 'users')

// ---------------------------------------------------------------------------
// Salir
// ---------------------------------------------------------------------------
// PocketBase no tiene cierre de sesion: el token es un JWT y el navegador lo
// tira y ya esta. Como el encargo pide auditar la salida, el panel avisa por
// esta ruta ANTES de tirarlo (panel/js/sesion.js).
//
// QUIEN SALE LO DICE EL TOKEN, no el cuerpo de la peticion: sin sesion valida
// esto no escribe nada. Y no devuelve error nunca: que el aviso se pierda no
// puede dejar a nadie dentro de una sesion que queria cerrar.
routerAdd('POST', '/api/quijote/salir', (e) => {
  const A = require(`${__hooks}/lib/actividad.js`)
  const quien = A.actorDe(e)

  if (quien) {
    A.anotar(e.app, {
      actor: quien, coleccion: null, accion: 'salir', recursoId: quien.id,
    })
  }
  return e.json(200, { ok: true })
})

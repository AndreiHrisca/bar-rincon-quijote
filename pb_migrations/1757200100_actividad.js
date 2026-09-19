/// <reference path="../pb_data/types.d.ts" />
//
// Coleccion "actividad" — el diario del panel
// ---------------------------------------------------------------------------
// QUE ES. Una linea por cada cosa que alguien del equipo hace dentro del panel:
// quien, que, sobre que, cuando y —cuando merece la pena— que habia antes y que
// hay ahora. Es lo que permite contestar «¿quien ha cambiado el precio del
// cachopo?» sin tener que creerse la respuesta de nadie.
//
// SOLO EL EQUIPO. Aqui NO entra la web publica: ni los escaneos del QR, ni las
// reservas que hace un cliente desde su movil, ni las cancelaciones por el
// enlace del correo. Eso son visitas, no acciones de nadie del negocio, y
// ademas ya se cuentan aparte en `metricas`. La linea se escribe unicamente
// cuando la peticion trae una sesion del panel; lo garantiza
// pb_hooks/actividad.pb.js, que sin `e.auth` no escribe nada.
//
// POR QUE UNA COLECCION Y NO EL DIARIO DEL SERVIDOR. PocketBase ya escribe sus
// propios registros, pero viven en otra base (auxiliary.db), se rotan solos a
// los pocos dias y no se pueden consultar desde el panel. Un audit log que se
// borra a los cinco dias y que hay que leer por SSH no lo va a mirar nadie.
//
// LO QUE NO SE GUARDA NUNCA: contrasenas, hashes, tokens, cookies ni el correo
// de un cliente. La lista negra y el saneado estan en pb_hooks/lib/actividad.js
// y se aplican ANTES de escribir, no al pintarlo. Un dato sensible que llega a
// la tabla ya esta filtrado aunque la pantalla no lo ensene.
//
// NADIE ESCRIBE AQUI DESDE FUERA. Las cuatro reglas de escritura quedan en null
// (solo superusuario): las lineas las pone el servidor desde los hooks, que
// entran por app.save() y no pasan por las reglas. Si `createRule` fuera
// `@request.auth.id != ""`, cualquiera con sesion podria fabricarse una linea
// diciendo que fue otro quien borro la reserva.
//
// TAMPOCO SE EDITAN NI SE BORRAN. Un diario que se puede corregir no es un
// diario. Lo unico que recorta la tabla es la retencion automatica
// (pb_hooks/retencion.pb.js), por el mismo motivo que las reservas viejas.
// ---------------------------------------------------------------------------

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  const actividad = new Collection({
    type: 'base',
    name: 'actividad',

    // Leerlo es cosa del administrador (seccion 9 del encargo). Para el resto
    // del equipo la coleccion no existe: la regla de lista no es un permiso,
    // es un filtro, asi que a un empleado le devuelve cero filas.
    listRule: '@request.auth.rol = "admin"',
    viewRule: '@request.auth.rol = "admin"',
    createRule: null,
    updateRule: null,
    deleteRule: null,

    fields: [
      // Quien. La relacion se queda SIN borrado en cascada a proposito: el dia
      // que se borre una cuenta, sus lineas siguen ahi. Un diario que se vacia
      // solo borrando al autor no sirve para nada.
      { name: 'actor', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: users.id },

      // Y su nombre EN EL MOMENTO de hacerlo. No es duplicar el dato: si Marisa
      // se casa y se cambia el nombre, o si su cuenta desaparece, la linea de
      // hace ocho meses tiene que seguir diciendo quien era entonces.
      { name: 'actor_nombre', type: 'text', required: true, max: 120 },

      { name: 'accion', type: 'select', maxSelect: 1, required: true,
        values: [
          'crear', 'editar', 'borrar',
          'entrar', 'entrar_fallido', 'salir',
        ] },

      // Sobre que. Es `text` y no `select` a proposito: una coleccion nueva no
      // deberia obligar a una migracion para poder auditarse. El valor es el
      // nombre de la coleccion (reserva, plato, producto...) en singular.
      { name: 'recurso', type: 'text', required: true, max: 40 },

      // El id del registro afectado, cuando lo hay. Se guarda como texto suelto
      // y no como relacion porque apunta a doce colecciones distintas y porque
      // el registro puede haberse borrado: es justo lo que la linea cuenta.
      { name: 'recurso_id', type: 'text', max: 40 },

      // La frase que se lee en pantalla, ya escrita por el servidor: «Santi
      // cambió el precio de Cachopo». Se guarda hecha y no se compone al pintar
      // para que siga siendo verdad dentro de un ano, cuando el plato se llame
      // de otra forma o ya no exista.
      { name: 'descripcion', type: 'text', required: true, max: 300 },

      // Lo que cambio y cualquier otro dato util, ya saneado. Forma:
      //   { "cambios": { "hora": ["20:00", "21:00"] }, ... }
      { name: 'datos', type: 'json', maxSize: 8000 },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      // La consulta de la pantalla: lo ultimo primero. Es la que se hace
      // siempre, asi que va sola y por delante de las demas.
      'CREATE INDEX idx_actividad_creado ON actividad (creado DESC)',
      // Los dos filtros de la pantalla. Llevan `creado` dentro porque el orden
      // es siempre el mismo: sin esa segunda columna, filtrar por empleado
      // obliga a SQLite a ordenar a mano lo que encuentre.
      'CREATE INDEX idx_actividad_actor ON actividad (actor, creado DESC)',
      'CREATE INDEX idx_actividad_recurso ON actividad (recurso, creado DESC)',
    ],
  })

  app.save(actividad)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('actividad'))
})

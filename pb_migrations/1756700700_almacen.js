/// <reference path="../pb_data/types.d.ts" />
//
// Colecciones "recuentos", "recuento_lineas" y "avisos_stock"
// El Rincon del Quijote
// ---------------------------------------------------------------------------
// El modulo de almacen tiene DOS FLUJOS QUE NO SE MEZCLAN (seccion 9), y por
// eso son colecciones separadas:
//
//   avisos_stock     El aviso rapido durante el servicio. Dos toques, sin
//                    cantidades, sin formulario. Se arrastra de un dia a otro
//                    hasta que alguien lo resuelve: ese es justo el problema
//                    del papel que viene a arreglar.
//
//   recuentos +      El recuento del domingo en el sotano. Recorrido fisico,
//   recuento_lineas  cantidades, y de ahi sale la lista de pedido.
//
// NINGUNA de las tres es publica jamas (seccion 5).
//
// Ni valoracion economica, ni escandallos, ni caducidades, ni albaranes. Es la
// libreta del almacen, bien hecha (seccion 9.4).
// ---------------------------------------------------------------------------

migrate((app) => {
  const productos = app.findCollectionByNameOrId('productos')
  const empleados = app.findCollectionByNameOrId('empleados')

  // --- Recuentos -----------------------------------------------------------
  const recuentos = new Collection({
    type: 'base',
    name: 'recuentos',

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    // Cualquiera del equipo puede empezar un recuento: baja al almacen quien
    // baja, no siempre el encargado.
    createRule: '@request.auth.id != ""',
    // Cerrarlo (que es lo que genera la lista de pedido) lo comprueba el hook:
    // solo dueno y encargado. Ver pb_hooks/almacen.pb.js.
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'fecha', type: 'date', required: true },

      { name: 'hecho_por', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: empleados.id },

      { name: 'estado', type: 'select', maxSelect: 1, required: true,
        values: ['en_curso', 'cerrado'] },

      { name: 'notas',      type: 'text', max: 1000 },
      { name: 'cerrado_en', type: 'date' },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      'CREATE INDEX idx_recuentos_fecha ON recuentos (fecha)',
      // Solo puede haber UN recuento en curso a la vez. Es lo que permite que
      // "Empezar recuento" continue el abierto en vez de crear otro y perder lo
      // tecleado (seccion 9.2).
      'CREATE UNIQUE INDEX idx_recuentos_uno_en_curso ON recuentos (estado) WHERE estado = "en_curso"',
    ],
  })
  app.save(recuentos)

  // --- Lineas de recuento --------------------------------------------------
  const lineas = new Collection({
    type: 'base',
    name: 'recuento_lineas',

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',

    fields: [
      { name: 'recuento', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: true, collectionId: recuentos.id },

      { name: 'producto', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: false, collectionId: productos.id },

      { name: 'cantidad', type: 'number', min: 0 },

      // Se calcula al guardar comparando con stock_minimo, PERO es editable a
      // mano (seccion 5): quien esta delante de la estanteria sabe cosas que el
      // minimo no recoge.
      { name: 'hay_que_pedir',  type: 'bool' },
      { name: 'cantidad_pedir', type: 'number', min: 0 },

      { name: 'nota', type: 'text', max: 300 },

      // Marca de "esta linea todavia no se ha contado". Permite saltar
      // productos y volver, y alimenta la barra de progreso.
      { name: 'contada', type: 'bool' },

      { name: 'actualizada', type: 'autodate', onCreate: true, onUpdate: true },
    ],

    indexes: [
      // Un producto no puede aparecer dos veces en el mismo recuento. Es lo que
      // hace segura la sincronizacion de la cola sin conexion: si una linea se
      // envia dos veces, la segunda choca contra este indice en vez de duplicar.
      'CREATE UNIQUE INDEX idx_lineas_unicas ON recuento_lineas (recuento, producto)',
      'CREATE INDEX idx_lineas_recuento ON recuento_lineas (recuento, contada)',
    ],
  })
  app.save(lineas)

  // --- Avisos de falta -----------------------------------------------------
  const avisos = new Collection({
    type: 'base',
    name: 'avisos_stock',

    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    // Cocina crea avisos: es su funcion principal en el sistema.
    createRule: '@request.auth.id != ""',
    // Resolver un aviso lo puede hacer cualquiera del equipo: si se repone algo,
    // lo repone quien pasa por ahi.
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',

    fields: [
      { name: 'producto', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: true, collectionId: productos.id },

      { name: 'nivel', type: 'select', maxSelect: 1, required: true,
        values: ['queda_poco', 'agotado'] },

      // Lleva autor, pero NO se usa para medir a nadie: nada de rankings ni de
      // estadisticas por persona (seccion 12). Sirve para poder preguntar
      // "oye, esto que apuntaste, era de la camara o del sotano".
      { name: 'creado_por', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: empleados.id },

      { name: 'nota', type: 'text', max: 300 },

      // Mientras resuelto sea false, el aviso sigue saliendo en "Hoy". Se
      // arrastra de un dia a otro: no se borra al cambiar de dia (seccion 9.1).
      { name: 'resuelto',    type: 'bool' },
      { name: 'resuelto_en', type: 'date' },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      // La consulta de "Hoy": faltas sin resolver, las mas graves primero.
      'CREATE INDEX idx_avisos_pendientes ON avisos_stock (resuelto, nivel, creado)',
      // "Los mas usados arriba" de la pantalla de falta rapida se calcula
      // contando avisos previos por producto.
      'CREATE INDEX idx_avisos_producto ON avisos_stock (producto, creado)',
    ],
  })
  app.save(avisos)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('avisos_stock'))
  app.delete(app.findCollectionByNameOrId('recuento_lineas'))
  app.delete(app.findCollectionByNameOrId('recuentos'))
})

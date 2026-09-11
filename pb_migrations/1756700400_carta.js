/// <reference path="../pb_data/types.d.ts" />
//
// Colecciones "categorias" y "platos" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// La carta. Dos cosas que atraviesan todo el proyecto:
//
//  1. DOBLE PRECIO. Cada plato tiene precio de barra y precio de terraza. No es
//     un extra ni un recargo calculado: son dos numeros independientes. Si
//     precio_terraza esta vacio se muestra un solo precio.
//
//  2. VISIBILIDAD. El interruptor de disponibilidad es el gesto que Santi hara
//     todos los dias. Los platos con visible=false NO se descargan siquiera al
//     cliente (seccion 6), de ahi la regla de lectura de abajo.
// ---------------------------------------------------------------------------

migrate((app) => {

  // --- Categorias ----------------------------------------------------------
  const categorias = new Collection({
    type: 'base',
    name: 'categorias',

    // Lectura publica de las visibles. Quien esta autenticado ve tambien las
    // ocultas, porque el panel necesita poder volver a encenderlas.
    listRule: 'visible = true || @request.auth.id != ""',
    viewRule: 'visible = true || @request.auth.id != ""',

    // Cocina y empleado no tocan la carta (seccion 7).
    createRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'nombre', type: 'text', required: true, max: 60 },
      { name: 'slug',   type: 'text', required: true, max: 60,
        pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
      { name: 'orden',   type: 'number', onlyInt: true },
      { name: 'visible', type: 'bool' },

      // Nombre en ingles. Si esta vacio, la web cae al castellano sin marcar
      // error (seccion 6).
      { name: 'nombre_en', type: 'text', max: 60 },
    ],

    indexes: [
      'CREATE UNIQUE INDEX idx_categorias_slug ON categorias (slug)',
      'CREATE INDEX idx_categorias_orden ON categorias (visible, orden)',
    ],
  })
  app.save(categorias)

  // --- Platos --------------------------------------------------------------
  const platos = new Collection({
    type: 'base',
    name: 'platos',

    // Misma regla que categorias: lo oculto no sale de aqui sin sesion.
    listRule: 'visible = true || @request.auth.id != ""',
    viewRule: 'visible = true || @request.auth.id != ""',

    createRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    // El encargado puede actualizar, pero NO los precios: eso no se puede
    // expresar en una regla de coleccion (no distinguen por campo) y se
    // comprueba en pb_hooks/roles.pb.js.
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'categoria', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: false, collectionId: categorias.id },

      { name: 'nombre',      type: 'text', required: true, max: 120 },
      { name: 'descripcion', type: 'text', max: 500 },

      // --- Los dos precios ---
      // precio_barra es obligatorio; precio_terraza puede quedarse vacio y
      // entonces se muestra un unico precio.
      { name: 'precio_barra',   type: 'number', required: true, min: 0 },
      { name: 'precio_terraza', type: 'number', min: 0 },

      // --- Los 14 alergenos oficiales de la UE ---
      // Reglamento (UE) 1169/2011, anexo II. La lista es cerrada por ley: no se
      // anaden ni se quitan entradas sin cambiar la normativa.
      { name: 'alergenos', type: 'select', maxSelect: 14,
        values: [
          'gluten',        // 1. cereales con gluten
          'crustaceos',    // 2.
          'huevos',        // 3.
          'pescado',       // 4.
          'cacahuetes',    // 5.
          'soja',          // 6.
          'lacteos',       // 7. leche y derivados, incluida la lactosa
          'frutos_cascara',// 8. almendra, avellana, nuez, anacardo...
          'apio',          // 9.
          'mostaza',       // 10.
          'sesamo',        // 11.
          'sulfitos',      // 12. dioxido de azufre y sulfitos > 10 mg/kg
          'altramuces',    // 13.
          'moluscos',      // 14.
        ] },

      // Miniaturas de 400 y 800 px (seccion 5). La web publica pide la que
      // corresponda al hueco, no el original: importa para la carga en 3G.
      { name: 'foto', type: 'file', maxSelect: 1, maxSize: 8388608,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        thumbs: ['400x0', '800x0'] },

      { name: 'visible', type: 'bool' },

      // Se rellena al ocultar, para poder decir "oculto desde el sabado" en el
      // panel (seccion 7). Lo escribe el hook, no la persona.
      { name: 'oculto_desde', type: 'date' },

      { name: 'orden',     type: 'number', onlyInt: true },
      { name: 'destacado', type: 'bool' },

      { name: 'nombre_en',      type: 'text', max: 120 },
      { name: 'descripcion_en', type: 'text', max: 500 },

      // Que productos del almacen lleva este plato. De aqui sale la sugerencia
      // de la seccion 9.1: al marcar un producto como agotado, el panel propone
      // ocultar los platos que lo llevan. Opcional: la mayoria de platos no
      // necesitan tenerlo relleno para que el sistema sirva.
      { name: 'ingredientes', type: 'relation', maxSelect: 40,
        cascadeDelete: false,
        collectionId: app.findCollectionByNameOrId('productos').id },

      { name: 'creado',      type: 'autodate', onCreate: true },
      { name: 'actualizado', type: 'autodate', onCreate: true, onUpdate: true },
    ],

    indexes: [
      // La carta se pide de una sola vez y se ordena por categoria y orden.
      'CREATE INDEX idx_platos_carta ON platos (visible, categoria, orden)',
      // Busqueda de "que platos llevan este producto" para la sugerencia de
      // ocultar. Es una relacion multiple, asi que se guarda como JSON.
      'CREATE INDEX idx_platos_destacado ON platos (destacado, visible)',
    ],
  })
  app.save(platos)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('platos'))
  app.delete(app.findCollectionByNameOrId('categorias'))
})

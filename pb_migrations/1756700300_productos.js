/// <reference path="../pb_data/types.d.ts" />
//
// Coleccion "productos" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// El catalogo del almacen. Es la libreta de lo que hay, NO contabilidad: aqui
// no hay precios de coste, ni valoracion en euros, ni escandallos, ni lotes, ni
// caducidades (seccion 2 del encargo). Si algo empuja hacia ahi, se anota como
// propuesta y se sigue.
//
// Dos campos gobiernan el recorrido fisico del almacen y no son decorativos:
//   ubicacion  camara, congelador, sotano, barra... El recuento del domingo se
//              recorre agrupado por esto, porque asi es como se camina.
//   orden      dentro de cada grupo, el orden de las estanterias.
//
// NUNCA es publica (seccion 5).
// ---------------------------------------------------------------------------

migrate((app) => {
  const c = new Collection({
    type: 'base',
    name: 'productos',

    // Todo el equipo lo lee: cocina necesita la lista para marcar faltas.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    // Cualquiera autenticado puede crear. Es deliberado: la seccion 9.1 pide
    // que quien esta en cocina pueda dar de alta un producto al vuelo, con solo
    // el nombre, sin esperar a nadie. Queda marcado como "sin configurar".
    createRule: '@request.auth.id != ""',

    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'nombre', type: 'text', required: true, max: 120 },

      { name: 'categoria_almacen', type: 'select', maxSelect: 1,
        values: ['carne', 'pescado', 'verdura', 'lacteos', 'bebidas', 'congelados',
                 'seco', 'limpieza', 'desechables', 'otros'] },

      // Texto corto y libre a proposito: kg, litros, unidades, cajas, bandejas,
      // botellas... Cerrarlo a una lista obliga a mantenerla y no aporta nada.
      { name: 'unidad', type: 'text', max: 20 },

      // Punto a partir del cual hay que pedir. De aqui sale la lista de pedido.
      { name: 'stock_minimo',    type: 'number', min: 0 },
      // Cuanto se suele pedir. Es la cantidad sugerida, editable linea a linea.
      { name: 'pedido_habitual', type: 'number', min: 0 },

      { name: 'proveedor', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: app.findCollectionByNameOrId('proveedores').id },

      { name: 'ubicacion', type: 'select', maxSelect: 1,
        values: ['camara', 'congelador', 'sotano', 'barra', 'cocina', 'otros'] },

      { name: 'activo', type: 'bool' },
      { name: 'orden',  type: 'number', onlyInt: true },

      // Marca de "creado al vuelo desde cocina, le falta unidad, minimo y
      // proveedor". La pantalla de almacen los destaca para que alguien los
      // termine de configurar (seccion 9.3).
      { name: 'sin_configurar', type: 'bool' },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      'CREATE UNIQUE INDEX idx_productos_nombre ON productos (nombre)',
      // El recuento recorre por ubicacion y luego por orden: se indexa igual.
      'CREATE INDEX idx_productos_recorrido ON productos (activo, ubicacion, orden)',
    ],
  })

  app.save(c)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('productos'))
})

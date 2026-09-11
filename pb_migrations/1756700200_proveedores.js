/// <reference path="../pb_data/types.d.ts" />
//
// Coleccion "proveedores" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// Quien trae cada cosa y que dia. El dia de reparto importa de verdad: la lista
// de pedido que sale del recuento del domingo se agrupa por proveedor, y saber
// que el del pescado reparte los martes cambia lo que se pide.
//
// Nunca es publica: son datos comerciales del bar.
// ---------------------------------------------------------------------------

migrate((app) => {
  const c = new Collection({
    type: 'base',
    name: 'proveedores',

    // Cualquiera del equipo puede consultarlos; solo dueno y encargado tocan.
    listRule:   '@request.auth.id != ""',
    viewRule:   '@request.auth.id != ""',
    createRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'nombre',   type: 'text', required: true, max: 120 },
      { name: 'contacto', type: 'text', max: 120 },
      { name: 'telefono', type: 'text', max: 20 },

      // Multiple: hay proveedores que reparten dos o tres dias.
      { name: 'dia_reparto', type: 'select', maxSelect: 7,
        values: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },

      { name: 'notas',  type: 'text', max: 500 },
      { name: 'activo', type: 'bool' },
      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      'CREATE UNIQUE INDEX idx_proveedores_nombre ON proveedores (nombre)',
    ],
  })

  app.save(c)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('proveedores'))
})

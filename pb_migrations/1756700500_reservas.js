/// <reference path="../pb_data/types.d.ts" />
//
// Coleccion "reservas" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// Reglas de acceso, que es lo delicado aqui (seccion 5):
//
//   CREAR    sin autenticar. Cualquiera reserva desde la web.
//   LEER     nunca sin sesion. Una reserva lleva nombre y telefono de una
//            persona: no puede ser legible por alguien que adivine su ID.
//   MODIFICAR / BORRAR   solo el equipo.
//
// El cliente recibe su reserva UNA vez, en la respuesta a la creacion, y de ahi
// saca el codigo y el resumen. Para cancelar hay un enlace con token que
// resuelve un hook, no una regla de coleccion.
//
// Las reglas de aforo, antelacion y maximo de comensales las decide el SERVIDOR
// en pb_hooks/reservas.pb.js (seccion 8). Lo de aqui son solo los limites del
// dato; el cliente puede ayudar, pero no manda.
// ---------------------------------------------------------------------------

migrate((app) => {
  const c = new Collection({
    type: 'base',
    name: 'reservas',

    // Regla vacia = permitido a cualquiera, incluido sin sesion.
    createRule: '',

    // null = prohibido salvo superusuario... pero el panel necesita leerlas,
    // asi que se exige sesion. Sin sesion no se lista ni se ve NADA.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    // Cocina y empleado no tocan reservas (seccion 7).
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'fecha', type: 'date', required: true },

      // Hora como texto HH:MM y no como fecha: la reserva es "a las 14:30 del
      // dia 12", no un instante con zona horaria. Guardarlo como fecha-hora
      // invita a errores de huso en el cambio de hora de octubre.
      { name: 'hora', type: 'text', required: true, max: 5,
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },

      // Maximo 10 por la web (seccion 8). El limite duro se pone aqui tambien
      // para que no dependa solo del hook. Por telefono el panel puede mas: esa
      // via entra con origen="telefono" y el hook la deja pasar.
      { name: 'comensales', type: 'number', required: true, min: 1, max: 60, onlyInt: true },

      { name: 'zona', type: 'select', maxSelect: 1, required: true,
        values: ['barra', 'terraza', 'salon', 'indiferente'] },

      { name: 'motivo', type: 'select', maxSelect: 1,
        values: ['normal', 'cumpleanos', 'bautizo', 'comunion', 'empresa'] },

      { name: 'nombre',   type: 'text', required: true, max: 100 },
      { name: 'telefono', type: 'text', required: true, max: 20 },
      { name: 'notas',    type: 'text', max: 500 },

      { name: 'estado', type: 'select', maxSelect: 1, required: true,
        values: ['pendiente', 'confirmada', 'sentada', 'no_vino', 'cancelada'] },

      // Formato RQ-1234, generado en el servidor. Sin caracteres ambiguos
      // (ni O/0 ni I/1/l): se lee en voz alta por telefono.
      { name: 'codigo', type: 'text', required: true, max: 12,
        pattern: '^RQ-[A-Z0-9]{4}$' },

      { name: 'origen', type: 'select', maxSelect: 1, required: true,
        values: ['web', 'telefono'] },

      // Token de cancelacion. Va en el enlace de la confirmacion. No se
      // devuelve en las lecturas normales porque las lecturas exigen sesion.
      { name: 'token_cancelacion', type: 'text', max: 64 },

      { name: 'creada', type: 'autodate', onCreate: true },
      { name: 'actualizada', type: 'autodate', onCreate: true, onUpdate: true },
    ],

    indexes: [
      'CREATE UNIQUE INDEX idx_reservas_codigo ON reservas (codigo)',
      // La consulta caliente: "que hay solapado en esta franja de este dia",
      // que es como se calcula el aforo.
      'CREATE INDEX idx_reservas_dia ON reservas (fecha, estado, hora)',
      // Buscador del panel por nombre y telefono.
      'CREATE INDEX idx_reservas_telefono ON reservas (telefono)',
    ],
  })

  app.save(c)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('reservas'))
})

/// <reference path="../pb_data/types.d.ts" />
//
// Colecciones "empleados", "turnos" y "fichajes" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// Tres o cuatro personas, no una plantilla. El sistema hace ficha, cuadrante,
// fichaje e informe mensual de horas.
//
// PROTECCION DE DATOS (seccion 12): las horas y los fichajes solo son
// accesibles para dueno, encargado y el propio empleado. Eso se escribe en las
// reglas de abajo, no se deja a la buena voluntad de la interfaz.
// ---------------------------------------------------------------------------

migrate((app) => {

  // --- Empleados -----------------------------------------------------------
  const empleados = new Collection({
    type: 'base',
    name: 'empleados',

    // Toda la plantilla se ve entre si: hace falta para leer el cuadrante y
    // saber con quien se trabaja. No hay nada sensible en la ficha salvo el
    // telefono, que en un bar de cuatro personas ya se saben.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    createRule: '@request.auth.rol = "dueno"',
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'nombre', type: 'text', required: true, max: 80 },

      // Iniciales para el circulo del avatar del cuadrante.
      { name: 'alias', type: 'text', required: true, max: 3 },

      // Color del avatar. Los tres de la maqueta son granate, cobre y oliva; se
      // deja abierto por si entra alguien mas, pero se valida como hexadecimal
      // para que nadie meta ahi un nombre de color suelto.
      { name: 'color', type: 'text', max: 7, pattern: '^#[0-9A-Fa-f]{6}$' },

      { name: 'telefono', type: 'text', max: 20 },
      { name: 'activo',   type: 'bool' },

      // Enlace con la cuenta de acceso. Opcional: puede haber alguien en el
      // cuadrante que no entre nunca al panel.
      { name: 'usuario', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: app.findCollectionByNameOrId('users').id },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      'CREATE INDEX idx_empleados_activo ON empleados (activo, nombre)',
    ],
  })
  app.save(empleados)

  // --- Turnos (el cuadrante) -----------------------------------------------
  const turnos = new Collection({
    type: 'base',
    name: 'turnos',

    // Todo el mundo ve el cuadrante entero: es justo para lo que sirve.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    createRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',

    fields: [
      { name: 'empleado', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: true, collectionId: empleados.id },

      { name: 'fecha', type: 'date', required: true },

      // Texto HH:MM por el mismo motivo que la hora de las reservas: es un turno
      // de un dia, no un instante con huso horario.
      { name: 'hora_inicio', type: 'text', required: true, max: 5,
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      { name: 'hora_fin',    type: 'text', required: true, max: 5,
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },

      { name: 'notas', type: 'text', max: 300 },
    ],

    indexes: [
      'CREATE INDEX idx_turnos_semana ON turnos (fecha, hora_inicio)',
    ],
  })
  app.save(turnos)

  // --- Fichajes ------------------------------------------------------------
  const fichajes = new Collection({
    type: 'base',
    name: 'fichajes',

    // Dueno y encargado ven todo; cada cual ve lo suyo. Nadie mas.
    // Se compara contra empleado.usuario, que es la cuenta de acceso ligada a
    // la ficha de empleado.
    listRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado" || empleado.usuario = @request.auth.id',
    viewRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado" || empleado.usuario = @request.auth.id',

    // Cualquiera del equipo ficha; solo puede fichar por si mismo, y eso se
    // comprueba en pb_hooks/fichajes.pb.js (una regla no puede impedir que
    // alguien ponga otro empleado en el campo al crear).
    createRule: '@request.auth.id != ""',

    // Corregir un fichaje es cosa de dueno o encargado, y deja traza en
    // corregido_por y nota_correccion (seccion 7).
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado" || empleado.usuario = @request.auth.id',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'empleado', type: 'relation', required: true, maxSelect: 1,
        cascadeDelete: true, collectionId: empleados.id },

      // Aqui SI son fecha-hora completas: un fichaje es un instante real.
      { name: 'entrada', type: 'date', required: true },
      // Vacia mientras la persona sigue dentro. Un fichaje sin cerrar es
      // justamente lo que el panel saca arriba del todo como aviso.
      { name: 'salida',  type: 'date' },

      { name: 'corregido_por', type: 'relation', maxSelect: 1, cascadeDelete: false,
        collectionId: app.findCollectionByNameOrId('users').id },
      { name: 'nota_correccion', type: 'text', max: 300 },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      // El informe mensual va por empleado y rango de fechas.
      'CREATE INDEX idx_fichajes_empleado ON fichajes (empleado, entrada)',
      // Los fichajes sin cerrar, que son el aviso importante.
      'CREATE INDEX idx_fichajes_abiertos ON fichajes (salida, entrada)',
    ],
  })
  app.save(fichajes)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('fichajes'))
  app.delete(app.findCollectionByNameOrId('turnos'))
  app.delete(app.findCollectionByNameOrId('empleados'))
})

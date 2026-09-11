/// <reference path="../pb_data/types.d.ts" />
//
// Coleccion "ajustes" — El Rincon del Quijote
// ---------------------------------------------------------------------------
// Registro unico con la configuracion del bar. Es lo primero que se crea porque
// de aqui cuelgan las reglas de reserva (aforos, horario de cocina, antelacion)
// y el recordatorio del recuento semanal.
//
// De lectura publica: la carta necesita el telefono, el horario y el mensaje de
// "reservas cerradas" sin que nadie inicie sesion. Escritura solo para el rol
// dueno, que se comprueba en la fase 5 cuando existan los usuarios.
//
// Todas las colecciones se definen en migraciones versionadas, nunca a mano por
// la interfaz de administracion (seccion 5 del encargo): asi un servidor nuevo
// se levanta identico al de produccion con un solo "docker compose up -d".
// ---------------------------------------------------------------------------

migrate((app) => {
  const ajustes = new Collection({
    type: 'base',
    name: 'ajustes',

    // Lectura publica; escritura, de momento, solo desde el panel de
    // administracion de PocketBase. La regla por rol llega en la fase 5.
    listRule: '',
    viewRule: '',
    createRule: null,
    updateRule: null,
    deleteRule: null,

    fields: [
      // --- Identidad del bar ---
      { name: 'nombre_bar', type: 'text', required: true, max: 120 },
      { name: 'telefono',   type: 'text', required: true, max: 20 },
      { name: 'direccion',  type: 'text', required: true, max: 200 },

      // --- Horarios ---
      // Texto libre para enseñar ("Todos los días de 08:00 a 02:00"), y el de
      // cocina en formato HH:MM-HH:MM porque de el salen las franjas de reserva.
      { name: 'horario_texto',   type: 'text', required: true, max: 200 },
      { name: 'horario_cocina',  type: 'text', required: true, max: 60,
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d$' },

      // --- Aforo y reglas de mesa ---
      // Sin "required": PocketBase considera vacio el numero 0, y 0 es
      // justamente el valor de partida ("aforo sin configurar"). Las reservas
      // arrancan desactivadas, asi que un aforo a 0 no acepta nada.
      { name: 'aforo_terraza',        type: 'number', min: 0, onlyInt: true },
      { name: 'aforo_salon',          type: 'number', min: 0, onlyInt: true },
      { name: 'duracion_mesa_min',    type: 'number', required: true, min: 15, max: 480, onlyInt: true },
      { name: 'antelacion_maxima_dias', type: 'number', required: true, min: 1, max: 365, onlyInt: true },

      // --- Reservas ---
      // Si reservas_activas esta desactivado, la web enseña mensaje_cerrado y el
      // telefono en lugar del formulario (seccion 8).
      { name: 'reservas_activas', type: 'bool' },
      { name: 'mensaje_cerrado',  type: 'text', max: 400 },

      // --- Almacen ---
      { name: 'dia_recuento', type: 'select', maxSelect: 1,
        values: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] },
      { name: 'recordatorio_recuento', type: 'bool' },

      // --- Proteccion de datos ---
      // Plazo de borrado automatico de reservas pasadas (seccion 12).
      { name: 'meses_retencion_reservas', type: 'number', required: true, min: 1, max: 120, onlyInt: true },

      { name: 'actualizado', type: 'autodate', onCreate: true, onUpdate: true },
    ],
  })

  app.save(ajustes)

  // --- Registro unico ------------------------------------------------------
  // Valores reales del bar, no inventados: salen del encabezado del encargo
  // (seccion 1). Los aforos van a cero a proposito, para que Santi los ponga
  // antes de abrir las reservas: un aforo inventado aceptaria mesas que no
  // existen.
  const fila = new Record(ajustes)
  fila.set('nombre_bar', 'El Rincón del Quijote')
  fila.set('telefono', '912881027')
  fila.set('direccion', 'Ciudad de los Ángeles, Madrid')
  fila.set('horario_texto', 'Todos los días de 08:00 a 02:00')
  fila.set('horario_cocina', '13:00-23:30')
  fila.set('aforo_terraza', 0)
  fila.set('aforo_salon', 0)
  fila.set('duracion_mesa_min', 90)
  fila.set('antelacion_maxima_dias', 30)
  fila.set('reservas_activas', false)
  fila.set('mensaje_cerrado', 'Ahora mismo no tomamos reservas por la web. Llámanos al 91 288 10 27 y te atendemos.')
  fila.set('dia_recuento', 'domingo')
  fila.set('recordatorio_recuento', true)
  fila.set('meses_retencion_reservas', 12)
  app.save(fila)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('ajustes'))
})

/// <reference path="../pb_data/types.d.ts" />
//
// Roles de usuario — El Rincon del Quijote
// ---------------------------------------------------------------------------
// PocketBase trae de fabrica una coleccion "users". Se le anade el rol, que es
// lo que gobierna todas las reglas de acceso del resto de colecciones.
//
// Los cuatro roles de la seccion 7 del encargo:
//
//   dueno      Santi. Todo.
//   encargado  Todo menos ajustes y precios. Puede hacer y cerrar recuentos.
//   cocina     Marca faltas de producto, ve el cuadrante y ficha.
//              NO toca carta, precios ni reservas.
//   empleado   Ve el cuadrante y ficha. Nada mas.
//
// El valor se escribe sin enye ("dueno") a proposito: va dentro de reglas de
// acceso que se comparan como texto y en URLs de la API. La enye ahi es una
// fuente de fallos tontos. En pantalla se muestra "dueño".
// ---------------------------------------------------------------------------

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  users.fields.add(new Field({
    name: 'rol',
    type: 'select',
    required: true,
    maxSelect: 1,
    values: ['dueno', 'encargado', 'cocina', 'empleado'],
  }))

  users.fields.add(new Field({
    name: 'nombre',
    type: 'text',
    required: true,
    max: 80,
  }))

  // --- Reglas ---------------------------------------------------------------
  // Nadie se registra solo: las cuentas las crea el dueno. Un bar de barrio no
  // necesita autoservicio de altas y si lo dejamos abierto es un agujero.
  users.createRule = '@request.auth.rol = "dueno"'

  // Cada cual se ve a si mismo; dueno y encargado ven a todo el equipo.
  users.listRule = '@request.auth.id = id || @request.auth.rol = "dueno" || @request.auth.rol = "encargado"'
  users.viewRule = users.listRule

  // Solo el dueno cambia cuentas ajenas. Cada cual puede cambiar la suya, pero
  // NO su propio rol: eso se bloquea en el hook de pb_hooks/roles.pb.js, porque
  // las reglas de PocketBase no distinguen por campo.
  users.updateRule = '@request.auth.id = id || @request.auth.rol = "dueno"'
  users.deleteRule = '@request.auth.rol = "dueno"'

  app.save(users)

}, (app) => {
  const users = app.findCollectionByNameOrId('users')
  users.fields.removeByName('rol')
  users.fields.removeByName('nombre')
  users.createRule = null
  users.listRule = null
  users.viewRule = null
  users.updateRule = null
  users.deleteRule = null
  app.save(users)
})

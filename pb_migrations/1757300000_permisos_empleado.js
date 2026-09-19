/// <reference path="../pb_data/types.d.ts" />
// La carta es de solo lectura para el empleado. Los datos auxiliares de
// fichaje se limitan a su ficha; el cuadrante y las métricas son administración.
migrate((app) => {
  const admin = '@request.auth.rol = "admin"'
  for (const nombre of ['platos', 'categorias']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.createRule = admin
    c.updateRule = admin
    c.deleteRule = admin
    app.save(c)
  }
  for (const nombre of ['turnos', 'metricas']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.listRule = admin
    c.viewRule = admin
    app.save(c)
  }
  const empleados = app.findCollectionByNameOrId('empleados')
  empleados.listRule = '@request.auth.id != "" && (@request.auth.rol = "admin" || usuario = @request.auth.id)'
  empleados.viewRule = empleados.listRule
  app.save(empleados)
  const eventos = app.findCollectionByNameOrId('eventos')
  eventos.listRule = 'visible = true || @request.auth.rol = "admin"'
  eventos.viewRule = eventos.listRule
  app.save(eventos)
}, (app) => {
  for (const nombre of ['platos', 'categorias']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.createRule = '@request.auth.id != ""'
    c.updateRule = '@request.auth.id != ""'
    app.save(c)
  }
  for (const nombre of ['turnos', 'metricas', 'empleados', 'eventos']) {
    const c = app.findCollectionByNameOrId(nombre)
    c.listRule = nombre === 'eventos' ? 'visible = true || @request.auth.id != ""' : '@request.auth.id != ""'
    c.viewRule = c.listRule
    app.save(c)
  }
})

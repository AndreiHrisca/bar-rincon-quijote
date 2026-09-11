/// <reference path="../pb_data/types.d.ts" />
//
// Los ajustes los cambia el dueno — y solo el dueno
// ---------------------------------------------------------------------------
// La coleccion "ajustes" se creo en la fase 1 con updateRule = null, es decir,
// solo desde el panel de administracion de PocketBase. Su propio comentario lo
// dejaba anotado: «La regla por rol llega en la fase 5». Es esta.
//
// Aqui vive lo que no puede tocar nadie mas (seccion 7): aforos, horario de
// cocina, antelacion, el interruptor de las reservas y el plazo de borrado de
// datos personales. Un encargado que sube el aforo del salon acepta mesas que
// no existen; uno que baja meses_retencion_reservas borra datos antes de
// tiempo. Son decisiones del dueno.
//
// createRule y deleteRule siguen en null a proposito: "ajustes" es un registro
// UNICO. Ni se crean mas ni se borra el que hay.
// ---------------------------------------------------------------------------

migrate((app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')
  ajustes.updateRule = '@request.auth.rol = "dueno"'
  app.save(ajustes)
}, (app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')
  ajustes.updateRule = null
  app.save(ajustes)
})

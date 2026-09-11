/// <reference path="../pb_data/types.d.ts" />
//
// CORRECCION DE SEGURIDAD — reglas de acceso de "fichajes"
// ---------------------------------------------------------------------------
// La regla original de 1756700600_personal.js era:
//
//   @request.auth.rol = "dueno" || @request.auth.rol = "encargado"
//   || empleado.usuario = @request.auth.id
//
// y DEJABA VER TODOS LOS FICHAJES A CUALQUIERA, sin sesion siquiera.
//
// El motivo, que es una trampa clasica de PocketBase y conviene tener escrita:
// en una peticion sin autenticar, `@request.auth.id` vale CADENA VACIA. Y un
// empleado que todavia no tiene cuenta de acceso ligada tiene `usuario` tambien
// vacio. Asi que la tercera condicion se convierte en:
//
//   "" = ""   ->  VERDADERO
//
// Resultado: los fichajes de toda persona sin cuenta quedaban publicos. En un
// bar con tres o cuatro empleados, donde lo normal es no tener cuenta, eso son
// PRACTICAMENTE TODOS. Y son datos de jornada laboral, que la seccion 12 del
// encargo restringe expresamente a dueno, encargado y el propio empleado.
//
// La correccion es exigir sesion ANTES de evaluar nada mas. Se aplica a las
// tres reglas que comparan contra @request.auth.id.
//
// Lo encontro pruebas/reglas_acceso.py, que ahora lo vigila explicitamente.
// ---------------------------------------------------------------------------

migrate((app) => {
  const fichajes = app.findCollectionByNameOrId('fichajes')

  const propioODeMando =
    '@request.auth.id != "" && (' +
      '@request.auth.rol = "dueno" || ' +
      '@request.auth.rol = "encargado" || ' +
      'empleado.usuario = @request.auth.id' +
    ')'

  fichajes.listRule = propioODeMando
  fichajes.viewRule = propioODeMando
  fichajes.updateRule = propioODeMando

  app.save(fichajes)

}, (app) => {
  const fichajes = app.findCollectionByNameOrId('fichajes')
  const anterior =
    '@request.auth.rol = "dueno" || @request.auth.rol = "encargado" || empleado.usuario = @request.auth.id'
  fichajes.listRule = anterior
  fichajes.viewRule = anterior
  fichajes.updateRule = anterior
  app.save(fichajes)
})

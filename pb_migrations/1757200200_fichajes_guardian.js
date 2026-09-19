/// <reference path="../pb_data/types.d.ts" />
//
// CORRECCION DE SEGURIDAD — el guardian de sesion de "fichajes", otra vez
// ---------------------------------------------------------------------------
// La migracion 1756700900_fichajes_regla.js corrigio este mismo fallo en su
// dia, y 1757200000_rol_administrador.js lo volvio a abrir sin querer al
// reescribir las reglas para los dos roles nuevos: se cambio
//
//   @request.auth.id != "" && (@request.auth.rol = "dueno" || ...)
//
// por la version sin el `@request.auth.id != ""` de delante. El parentesis y su
// guardian parecen ruido y no lo son.
//
// POR QUE IMPORTA TANTO, escrito una segunda vez para que no haya una tercera:
// en una peticion SIN SESION, `@request.auth.id` vale cadena vacia. Y un
// empleado que no tiene cuenta de acceso ligada tiene `usuario` tambien vacio.
// La ultima condicion se convierte entonces en
//
//   "" = ""   ->  VERDADERO
//
// y los fichajes de toda persona sin cuenta quedan publicos. En un bar de
// barrio, donde lo normal es no tener cuenta, eso son practicamente todos. Son
// datos de jornada laboral, que la seccion 12 del encargo restringe a quien
// administra y al propio empleado.
//
// NO SE ARREGLA EDITANDO LA MIGRACION ANTERIOR: PocketBase ya la tiene anotada
// como aplicada y no la volveria a ejecutar; sobre la base de produccion no
// cambiaria nada. Una correccion es una migracion nueva.
//
// Lo encontro pruebas/reglas_acceso.py, seccion 4, que lo vigila explicitamente
// desde la primera vez. Por eso esa prueba existe.
// ---------------------------------------------------------------------------

migrate((app) => {
  const fichajes = app.findCollectionByNameOrId('fichajes')

  const propioOAdmin =
    '@request.auth.id != "" && (' +
      '@request.auth.rol = "admin" || ' +
      'empleado.usuario = @request.auth.id' +
    ')'

  fichajes.listRule = propioOAdmin
  fichajes.viewRule = propioOAdmin
  fichajes.updateRule = propioOAdmin

  app.save(fichajes)

}, (app) => {
  // La vuelta atras deja la version SIN guardian que tenia 1757200000, no una
  // mas segura: deshacer tiene que devolver el estado anterior exacto, o la
  // pareja de migraciones deja de ser reversible. Quien tire de aqui hacia
  // atras esta volviendo a un estado con el agujero, y eso es lo que significa.
  const fichajes = app.findCollectionByNameOrId('fichajes')
  const anterior =
    '@request.auth.rol = "admin" || empleado.usuario = @request.auth.id'
  fichajes.listRule = anterior
  fichajes.viewRule = anterior
  fichajes.updateRule = anterior
  app.save(fichajes)
})

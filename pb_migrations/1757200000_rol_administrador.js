/// <reference path="../pb_data/types.d.ts" />
//
// Dos roles: administrador y empleado
// ---------------------------------------------------------------------------
// EL PROBLEMA QUE ARREGLA. La migracion 1756700100_usuarios_rol.js creo cuatro
// roles —dueno, encargado, cocina y empleado— copiados de la seccion 7 del
// encargo. Un ano despues, en la base solo hay dos cuentas de "dueno" y una de
// "empleado": "encargado" y "cocina" no los ha usado nadie nunca. Lo que si ha
// pasado es que el empleado que atiende la barra no puede ni mirar la lista de
// reservas ni corregir la descripcion de un plato, que es justo lo que hace
// todo el dia.
//
// Cuatro roles para tres personas no son un modelo de permisos: son cuatro
// sitios donde equivocarse. Se quedan DOS:
//
//   admin     Todo. Es el rol de Santi. Antes se llamaba "dueno".
//   empleado  El trabajo del turno: reservas y carta enteras, apuntar y
//             resolver faltas del almacen, fichar y ver SUS horas. Nada de
//             administracion del negocio.
//
// LA PALABRA "DUENO" DESAPARECE DEL PRODUCTO. No es solo un cambio de etiqueta:
// "dueño" describe a una persona (quien es el titular del bar) y lo que hay que
// describir es un permiso (quien administra el sistema). El dia que Santi le dé
// acceso completo a su hija, "dueño" seria mentira y "administrador" no.
//
// QUE GANA Y QUE PIERDE CADA UNO:
//
//   - Las dos cuentas de "dueno" pasan a "admin" y pueden exactamente lo mismo.
//   - La cuenta de "empleado" GANA reservas y carta (seccion 7 del encargo
//     nuevo). No pierde nada.
//   - "encargado" y "cocina" se convierten a "empleado". Nadie los usa, asi que
//     esto no le cambia el dia a ninguna persona real; lo que hace es que la
//     conversion sea segura si algun dia aparece una cuenta vieja en una copia
//     de seguridad restaurada.
//
// LO QUE ERA "dueno || encargado" SE PARTE EN DOS, y ahi esta la decision:
//
//   - reservas y carta (platos y categorias)  ->  cualquiera con sesion
//     Es lo que el encargo pide para el empleado: verlas y modificarlas.
//
//   - todo lo demas (proveedores, catalogo de productos, eventos, fichas del
//     equipo, cuadrante, borrados)            ->  solo admin
//     Son administracion del negocio, y el encargo las deja fuera del empleado
//     con todas las letras.
//
// EL ORDEN DE LOS PASOS IMPORTA. Primero se convierten los datos por SQL y
// despues se cambia el campo. Al reves no se puede: mientras el campo solo
// admita los cuatro valores viejos, guardar "admin" falla la validacion; y en
// cuanto solo admita los dos nuevos, cualquier fila que siga en "dueno" es
// invalida. El UPDATE directo no pasa por la validacion, que es justo lo que
// hace falta en el medio.
// ---------------------------------------------------------------------------

migrate((app) => {
  // --- 1. Los datos --------------------------------------------------------
  app.db().newQuery(`UPDATE users SET rol = 'admin' WHERE rol = 'dueno'`).execute()
  app.db().newQuery(
    `UPDATE users SET rol = 'empleado' WHERE rol IN ('encargado', 'cocina')`).execute()

  // --- 2. El campo ---------------------------------------------------------
  // Se muta el Field que ya existe en vez de quitarlo y volver a ponerlo: la
  // columna de SQLite la identifica el id del campo, y un campo nuevo con el
  // mismo nombre se lleva por delante lo que acabamos de convertir.
  const users = app.findCollectionByNameOrId('users')
  const rol = users.fields.getByName('rol')
  rol.values = ['admin', 'empleado']

  // --- 3. Las reglas de `users` -------------------------------------------
  // Quien crea y quien borra cuentas, solo el administrador. Cada cual sigue
  // pudiendo cambiar la suya (el nombre, la contrasena) pero NO su propio rol:
  // eso lo para pb_hooks/roles.pb.js, porque una regla no distingue por campo.
  users.createRule = '@request.auth.rol = "admin"'
  users.listRule = '@request.auth.id = id || @request.auth.rol = "admin"'
  users.viewRule = users.listRule
  users.updateRule = '@request.auth.id = id || @request.auth.rol = "admin"'
  users.deleteRule = '@request.auth.rol = "admin"'
  app.save(users)

  // --- 4. Las reglas del resto --------------------------------------------
  const conSesion = '@request.auth.id != ""'
  const soloAdmin = '@request.auth.rol = "admin"'

  // Reservas y carta: el turno entero. Borrar no: una reserva borrada por error
  // es un cliente que se presenta y no tiene mesa, y un plato borrado se lleva
  // su foto y su sitio en la carta. Para quitar algo de en medio esta el
  // interruptor de "visible", que se deshace.
  regla(app, 'reservas',   { editar: conSesion, borrar: soloAdmin })
  regla(app, 'platos',     { crear: conSesion, editar: conSesion, borrar: soloAdmin })
  regla(app, 'categorias', { crear: conSesion, editar: conSesion, borrar: soloAdmin })

  // Administracion del negocio.
  regla(app, 'proveedores',     { crear: soloAdmin, editar: soloAdmin, borrar: soloAdmin })
  regla(app, 'productos',       { editar: soloAdmin, borrar: soloAdmin })
  regla(app, 'eventos',         { crear: soloAdmin, editar: soloAdmin, borrar: soloAdmin })
  regla(app, 'ajustes',         { editar: soloAdmin })
  regla(app, 'recuentos',       { borrar: soloAdmin })
  regla(app, 'recuento_lineas', { borrar: soloAdmin })
  regla(app, 'avisos_stock',    { borrar: soloAdmin })

  // Equipo y cuadrante: las fichas y los turnos los pone el administrador.
  regla(app, 'empleados', { crear: soloAdmin, editar: soloAdmin, borrar: soloAdmin })
  regla(app, 'turnos',    { crear: soloAdmin, editar: soloAdmin, borrar: soloAdmin })

  // Fichajes: el administrador los ve todos; cada cual, los suyos. Esto NO se
  // abre a todo el equipo aunque ahora solo haya dos roles: las horas de los
  // demas no son asunto de nadie (seccion 12 del encargo).
  //
  // EL `@request.auth.id != ""` DE DELANTE NO SOBRA NUNCA, y borrarlo es el
  // fallo que ya corrigio la migracion 1756700900_fichajes_regla.js: en una
  // peticion sin sesion `@request.auth.id` vale cadena vacia, y un empleado sin
  // cuenta ligada tiene `usuario` tambien vacio, asi que la ultima condicion se
  // vuelve «"" = ""», que es CIERTO. Sin el guardian, los fichajes de toda
  // persona sin cuenta quedan publicos —que en un bar de barrio son casi
  // todos—. Lo vigila pruebas/reglas_acceso.py, seccion 4.
  const propioOAdmin =
    `@request.auth.id != "" && (${soloAdmin} || empleado.usuario = @request.auth.id)`
  regla(app, 'fichajes', {
    listar: propioOAdmin, ver: propioOAdmin, editar: propioOAdmin, borrar: soloAdmin,
  })

}, (app) => {
  const users = app.findCollectionByNameOrId('users')
  const rol = users.fields.getByName('rol')
  rol.values = ['dueno', 'encargado', 'cocina', 'empleado']

  users.createRule = '@request.auth.rol = "dueno"'
  users.listRule = '@request.auth.id = id || @request.auth.rol = "dueno" || @request.auth.rol = "encargado"'
  users.viewRule = users.listRule
  users.updateRule = '@request.auth.id = id || @request.auth.rol = "dueno"'
  users.deleteRule = '@request.auth.rol = "dueno"'
  app.save(users)

  // "empleado" no se puede repartir de vuelta entre encargado, cocina y
  // empleado: esa informacion ya no existe. Todos vuelven como empleado, que es
  // el rol de menos permisos y por tanto el error seguro.
  app.db().newQuery(`UPDATE users SET rol = 'dueno' WHERE rol = 'admin'`).execute()

  const mando = '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"'
  const dueno = '@request.auth.rol = "dueno"'

  regla(app, 'reservas',   { editar: mando, borrar: dueno })
  regla(app, 'platos',     { crear: mando, editar: mando, borrar: dueno })
  regla(app, 'categorias', { crear: mando, editar: mando, borrar: dueno })
  regla(app, 'proveedores', { crear: mando, editar: mando, borrar: dueno })
  regla(app, 'productos',   { editar: mando, borrar: dueno })
  regla(app, 'eventos',     { crear: mando, editar: mando, borrar: dueno })
  regla(app, 'ajustes',     { editar: dueno })
  regla(app, 'recuentos',       { borrar: dueno })
  regla(app, 'recuento_lineas', { borrar: mando })
  regla(app, 'avisos_stock',    { borrar: mando })
  regla(app, 'empleados', { crear: dueno, editar: mando, borrar: dueno })
  regla(app, 'turnos',    { crear: mando, editar: mando, borrar: mando })

  const propioODeMando =
    `@request.auth.id != "" && (${mando} || empleado.usuario = @request.auth.id)`
  regla(app, 'fichajes', {
    listar: propioODeMando, ver: propioODeMando, editar: propioODeMando, borrar: dueno,
  })
})

/**
 * Cambia solo las reglas que se le pasan y deja las demas como estan.
 *
 * Se escribe aqui abajo y no en pb_hooks/lib/ porque una migracion no puede
 * depender de un fichero que se puede borrar: tiene que seguir corriendo igual
 * dentro de cinco anos, sobre una base restaurada de una copia.
 */
function regla(app, nombre, reglas) {
  const col = app.findCollectionByNameOrId(nombre)
  // Las claves van en espanol y no como los campos de PocketBase (listRule,
  // deleteRule...) por un motivo muy concreto: el motor de JavaScript de
  // PocketBase no admite `reglas.delete`, porque "delete" es palabra reservada
  // y su analizador no la acepta detras de un punto.
  if (reglas.listar !== undefined) col.listRule = reglas.listar
  if (reglas.ver !== undefined) col.viewRule = reglas.ver
  if (reglas.crear !== undefined) col.createRule = reglas.crear
  if (reglas.editar !== undefined) col.updateRule = reglas.editar
  if (reglas.borrar !== undefined) col.deleteRule = reglas.borrar
  app.save(col)
}

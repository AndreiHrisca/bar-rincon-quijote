/// <reference path="../pb_data/types.d.ts" />
//
// Roles — lo que una regla de coleccion no puede decir
// ===========================================================================
// Las reglas de PocketBase deciden POR REGISTRO ("¿puede este usuario tocar
// esta fila?"), pero no POR CAMPO ("¿puede tocar ESTE campo de esta fila?"). En
// ese hueco cae una cosa, y es la mas importante de todas:
//
//   Cada cual puede editar su propia cuenta (cambiarse el nombre o la
//   contrasena), pero NADIE SE CAMBIA EL ROL A SI MISMO. Sin esto, la regla
//   `@request.auth.id = id` de users deja que un empleado se ascienda a
//   administrador con una peticion PATCH de una linea. Es el agujero mas obvio
//   de todo el sistema de permisos y no lo tapa ninguna regla.
//
// Esta comprobacion esta anunciada en los comentarios de las migraciones
// 1756700100_usuarios_rol.js y 1757200000_rol_administrador.js, que remiten a
// este fichero.
//
// LO QUE YA NO ESTA AQUI: hasta la migracion 1757200000 habia un segundo hook
// que le impedia al «encargado» tocar los precios de la carta. El rol
// «encargado» ya no existe —ahora hay administrador y empleado, y nada mas— y
// el encargo nuevo pide expresamente que el empleado pueda modificar los platos
// existentes, precio incluido. Un plato que se puede editar entero menos el
// numero mas importante es una regla que se explica sola en una discusion pero
// no en una pantalla. Quien cambie un precio queda apuntado en «Actividad» con
// el antes y el despues, que es la garantia que de verdad hacia falta.
//
// OJO CON EL ALCANCE DE LOS HOOKS (ver DECISIONES.md, D-22): cada handler corre
// en un runtime de JavaScript aislado. Nada de lo que se declare en el nivel
// superior de este fichero llega al cuerpo de los handlers, asi que todo lo que
// necesitan lo declaran dentro.
// ===========================================================================

// ---------------------------------------------------------------------------
// El rol solo lo cambia el administrador, y nunca sobre si mismo
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  // El panel de administracion de PocketBase (superusuario) queda fuera: es la
  // valvula de escape para arreglar la base cuando algo se tuerce, y quien
  // entra ahi ya tiene acceso a todo el fichero SQLite.
  if (e.hasSuperuserAuth()) return e.next()

  const antes = e.record.original()
  const rolNuevo = e.record.getString('rol')
  const rolAntes = antes.getString('rol')

  if (rolNuevo === rolAntes) return e.next()

  const quien = e.auth
  if (!quien || quien.getString('rol') !== 'admin') {
    throw new ForbiddenError('Solo un administrador puede cambiar el rol de una cuenta.')
  }

  // Un administrador tampoco se degrada a si mismo. No es paternalismo: si el
  // unico administrador se pone "empleado" por error, ya no queda nadie que
  // pueda deshacerlo y hay que entrar por el panel de administracion de
  // PocketBase.
  if (quien.id === e.record.id) {
    throw new ForbiddenError('No puedes cambiarte el rol a ti mismo. Que te lo cambie otro administrador.')
  }

  // Queda tambien en «Actividad», con el antes y el despues, por
  // pb_hooks/actividad.pb.js. Esta linea del diario del servidor se mantiene
  // aparte a proposito: un cambio de rol es lo que hay que poder rastrear el
  // dia que la base este rara, y el diario del servidor no lo puede borrar
  // nadie desde dentro de la aplicacion.
  e.app.logger().info('Cambio de rol',
    'cuenta', e.record.getString('email'), 'de', rolAntes, 'a', rolNuevo,
    'por', quien.getString('email'))

  e.next()
}, 'users')

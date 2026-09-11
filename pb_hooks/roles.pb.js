/// <reference path="../pb_data/types.d.ts" />
//
// Roles — lo que una regla de coleccion no puede decir
// ===========================================================================
// Las reglas de PocketBase deciden POR REGISTRO ("¿puede este usuario tocar
// esta fila?"), pero no POR CAMPO ("¿puede tocar ESTE campo de esta fila?").
// Dos cosas del encargo caen justo en ese hueco (seccion 7) y se resuelven
// aqui:
//
//   1. Cada cual puede editar su propia cuenta (cambiarse el nombre o la
//      contrasena), pero NADIE se cambia el rol a si mismo. Sin esto, la regla
//      `@request.auth.id = id` de users deja que un empleado se ascienda a
//      dueno con una peticion PATCH de una linea.
//
//   2. El encargado mantiene la carta pero NO toca los precios. La regla de
//      platos le deja actualizar el plato entero porque no sabe distinguir
//      campos; aqui se le paran los dos precios y el interruptor de los
//      ingredientes extra, que es lo mismo por otra puerta: enciende un recargo
//      de 0,50 € por ingrediente sobre ese plato.
//
// Las dos comprobaciones estan anunciadas en los comentarios de las migraciones
// 1756700100_usuarios_rol.js y 1756700400_carta.js, que remiten a este fichero.
//
// OJO CON EL ALCANCE DE LOS HOOKS (ver DECISIONES.md, D-22): cada handler corre
// en un runtime de JavaScript aislado. Nada de lo que se declare en el nivel
// superior de este fichero llega al cuerpo de los handlers, asi que todo lo que
// necesitan lo declaran dentro.
// ===========================================================================

// ---------------------------------------------------------------------------
// El rol solo lo cambia el dueno, y nunca sobre si mismo
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
  if (!quien || quien.getString('rol') !== 'dueno') {
    throw new ForbiddenError('Solo el dueño puede cambiar el rol de una cuenta.')
  }

  // Un dueno tampoco se degrada a si mismo. No es paternalismo: si el unico
  // dueno se pone "empleado" por error, ya no queda nadie que pueda deshacerlo
  // y hay que entrar por el panel de administracion de PocketBase.
  if (quien.id === e.record.id) {
    throw new ForbiddenError('No puedes cambiarte el rol a ti mismo. Que te lo cambie otro dueño.')
  }

  e.app.logger().info('Cambio de rol',
    'cuenta', e.record.getString('email'), 'de', rolAntes, 'a', rolNuevo,
    'por', quien.getString('email'))

  e.next()
}, 'users')

// ---------------------------------------------------------------------------
// El encargado no toca los precios
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const quien = e.auth
  if (!quien || quien.getString('rol') !== 'encargado') return e.next()

  const antes = e.record.original()
  const cambiados = ['precio_barra', 'precio_terraza'].filter(
    (campo) => Number(e.record.get(campo) || 0) !== Number(antes.get(campo) || 0))

  if (cambiados.length) {
    throw new ForbiddenError('Los precios de la carta solo los cambia el dueño.')
  }

  // El interruptor de ingredientes extra decide si a ese plato se le pueden
  // cobrar 0,50 € de mas por ingrediente. Es una decision de precio, asi que va
  // por el mismo camino que los dos de arriba. Se compara aparte y con getBool
  // porque es un booleano: pasarlo por Number() funcionaria hoy, pero no dice
  // lo que es.
  if (e.record.getBool('admite_extras') !== antes.getBool('admite_extras')) {
    throw new ForbiddenError('Los ingredientes extra son un precio: solo los cambia el dueño.')
  }

  e.next()
}, 'platos')

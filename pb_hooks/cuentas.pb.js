/// <reference path="../pb_data/types.d.ts" />
//
// Contraseña y correo de una cuenta del equipo — El Rincon del Quijote
// ===========================================================================
// Una sola ruta, `POST /api/quijote/cuenta`, para las dos cosas de una cuenta
// que la API de PocketBase NO deja tocar a nadie que no sea superusuario:
//
//   - la contraseña, que exige `oldPassword`;
//   - el correo, que exige el circuito de confirmacion por correo.
//
// Las dos protecciones son correctas para una aplicacion con correo saliente y
// gente que se administra sola. Aqui no hay ni una cosa ni la otra: no hay SMTP
// (D-29) y las cuentas las lleva el administrador desde el panel. Quien pierde la clave
// se la pide a Santi, y si el correo esta mal escrito hay que poder arreglarlo
// sin borrar la cuenta y volver a crearla.
//
// Todo lo demas de una cuenta —nombre, nombre de usuario, rol, alta y baja— SI
// se puede por la API normal, y va por ahi. Esta ruta es solo para lo que no
// se puede de otra forma.
//
// POR QUE ESTO NO ES UN AGUJERO: la ruta se salta comprobaciones de PocketBase,
// asi que quien puede llamarla es lo unico que la separa de un desastre.
//   - Solo el administrador, y el rol se lee de la SESION, no del navegador.
//   - Nunca sobre su propia cuenta: si se deja la sesion abierta en el movil de
//     la barra, eso seria regalarsela a quien lo coja. La suya se cambia por el
//     camino normal, escribiendo la que tiene ahora.
//   - No toca cuentas de superusuario: viven en otra coleccion y aqui no se
//     buscan.
//   - Minimo de 8 caracteres, el mismo que la coleccion.
//   - Queda escrito en el diario del servidor.
// Cambiar la contraseña renueva ademas el `tokenKey`, asi que las sesiones
// abiertas con la clave vieja dejan de valer al momento.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado; lo que se declare aqui arriba no llega
// dentro.
// ===========================================================================

routerAdd('POST', '/api/quijote/cuenta', (e) => {
  const quien = e.auth

  // Sin sesion o sin ser administrador, ni se dice si la cuenta existe.
  if (!quien || quien.getString('rol') !== 'admin') {
    return e.json(403, { error: 'Solo un administrador puede cambiar la contraseña o el correo de una cuenta.' })
  }

  const datos = new DynamicModel({ usuario: '', clave: '', correo: '' })
  e.bindBody(datos)

  // Para saber si la peticion TRAE el correo —y poder distinguir «no lo toques»
  // de «dejalo en blanco»— hay que mirar el cuerpo tal cual llego, no el modelo:
  // un DynamicModel no distingue un campo ausente de uno vacio. Es el mismo
  // criterio que en almacen.pb.js (D-58).
  //
  // OJO: el valor por defecto NO puede ser null. Con `correo: null`, bindBody
  // no sabe de que tipo es el campo y la peticion revienta con un 500.
  const cuerpo = e.requestInfo().body || {}

  const clave = String(datos.clave || '')
  const tocaClave = clave !== ''
  const tocaCorreo = cuerpo.correo !== undefined

  if (!tocaClave && !tocaCorreo) {
    return e.json(400, { error: 'No has pedido ningún cambio.' })
  }
  if (tocaClave && clave.length < 8) {
    return e.json(400, { error: 'La contraseña tiene que tener 8 caracteres o más.' })
  }

  let cuenta
  try {
    cuenta = e.app.findRecordById('users', String(datos.usuario || ''))
  } catch (err) {
    cuenta = null
  }
  if (!cuenta) {
    return e.json(404, { error: 'Esa cuenta ya no existe.' })
  }

  if (cuenta.id === quien.id) {
    return e.json(400, {
      error: 'Tu propia cuenta se cambia desde tu ficha, escribiendo la contraseña que tienes ahora.',
    })
  }

  if (tocaClave) cuenta.setPassword(clave)
  if (tocaCorreo) cuenta.set('email', String(datos.correo || '').trim().toLowerCase())

  try {
    e.app.save(cuenta)
  } catch (err) {
    // Lo tipico: el correo ya lo tiene otra cuenta, o no es un correo.
    return e.json(400, { error: 'No hemos podido guardarlo: revisa el correo, puede que ya lo tenga otra cuenta.' })
  }

  e.app.logger().info('Cuenta del equipo cambiada',
    'cuenta', cuenta.id,
    'nombre', cuenta.getString('nombre'),
    'contraseña', tocaClave ? 'sí' : 'no',
    'correo', tocaCorreo ? 'sí' : 'no',
    'por', quien.getString('email') || quien.getString('usuario'))

  return e.json(200, { ok: true })
})

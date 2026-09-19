/// <reference path="../pb_data/types.d.ts" />
//
// El equipo: cuentas de acceso y fichas — lo que no puede decir una regla
// ===========================================================================
// Compañero de roles.pb.js. Aquel guarda el ROL (quien puede cambiarlo);
// este guarda lo demas de la cuenta y la ficha del empleado, ahora que las dos
// cosas se crean y se borran desde el panel (fase 9).
//
// Cuatro cosas:
//
//   1. EL NOMBRE DE USUARIO SE NORMALIZA. Se guarda en minusculas y sin
//      espacios alrededor. Es una identidad de acceso: «Kevin» y «kevin» tienen
//      que ser la misma cuenta, y quien la teclea a las once de la noche no
//      tiene que acordarse de como se escribio el dia que se creo.
//
//   2. NADIE SE BORRA A SI MISMO, y no se borra la ultima cuenta de
//      administrador. Si Santi borra su cuenta por error, o se queda el bar sin
//      ningun administrador, la unica forma de volver a entrar es el panel de
//      administracion de PocketBase. Es el mismo criterio que impide degradarse
//      a uno mismo (roles.pb.js).
//
//   3. LA FECHA DE BAJA LA ESCRIBE EL SERVIDOR al apagar «Trabaja aqui», y la
//      borra al volver a encenderlo. Igual que `oculto_desde` en los platos
//      (D-36): una fecha que dice desde cuando alguien ya no trabaja aqui no es
//      algo que deba poder teclear el navegador.
//
//   4. UNA FICHA CON HORAS FICHADAS NO SE BORRA. La relacion se declaro con
//      `cascadeDelete`, asi que borrarla se llevaria por delante el registro de
//      jornada de esa persona, que es justo lo que hay que poder ensenar si
//      algun dia se pregunta por sus horas. El panel ya empuja a apartarla en
//      vez de borrarla; esto lo hace de verdad.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado; lo que se declare aqui arriba no llega
// dentro.
// ===========================================================================

// ---------------------------------------------------------------------------
// El nombre de usuario, en minusculas
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const usuario = e.record.getString('usuario')
  if (usuario) e.record.set('usuario', usuario.trim().toLowerCase())
  e.next()
}, 'users')

onRecordUpdateRequest((e) => {
  const usuario = e.record.getString('usuario')
  if (usuario) e.record.set('usuario', usuario.trim().toLowerCase())
  e.next()
}, 'users')

// ---------------------------------------------------------------------------
// Borrar una cuenta: ni la propia, ni la ultima de administrador
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const quien = e.auth
  if (quien && quien.id === e.record.id) {
    throw new ForbiddenError('No puedes borrar tu propia cuenta. Que la borre otro administrador.')
  }

  if (e.record.getString('rol') === 'admin') {
    // findRecordsByFilter devuelve la lista entera; son cuatro cuentas, no un censo.
    const admins = e.app.findRecordsByFilter('users', 'rol = "admin"', '', 0, 0)
    if (admins.length <= 1) {
      throw new BadRequestError(
        'Es la única cuenta de administrador que queda. Haz administradora a otra '
        + 'persona antes de borrarla.')
    }
  }

  e.next()
}, 'users')

// ---------------------------------------------------------------------------
// La fecha de baja la pone y la quita el servidor
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const antes = e.record.original()
  const activoAntes = antes.getBool('activo')
  const activoAhora = e.record.getBool('activo')

  if (activoAntes === activoAhora) {
    // Sin cambio de estado, la fecha no se toca: ni la que hay ni la que
    // mandara el navegador. Es un campo del servidor.
    e.record.set('fecha_baja', antes.get('fecha_baja'))
    return e.next()
  }

  if (!activoAhora) {
    // Medianoche UTC del dia natural, como todas las fechas sin hora del
    // proyecto: la medianoche local pasada por toISOString() cae en el dia
    // anterior y la baja saldria fechada un dia antes.
    const hoy = new Date()
    const dia = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
    e.record.set('fecha_baja', dia.toISOString().replace('T', ' '))
  } else {
    e.record.set('fecha_baja', '')
  }

  e.next()
}, 'empleados')

onRecordCreateRequest((e) => {
  // Una ficha nace sin fecha de baja, diga lo que diga el navegador. Si se crea
  // ya apagada —alguien que trabajo aqui y se apunta despues— la fecha la pone
  // el servidor el dia que se apague de verdad.
  e.record.set('fecha_baja', '')
  e.next()
}, 'empleados')

// ---------------------------------------------------------------------------
// Una ficha con horas fichadas no se borra
// ---------------------------------------------------------------------------
onRecordDeleteRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const suyos = e.app.findRecordsByFilter(
    'fichajes', 'empleado = {:e}', '', 1, 0, { e: e.record.id })

  if (suyos.length) {
    throw new BadRequestError(
      'Esta persona tiene horas fichadas y borrar la ficha se las llevaría por delante. '
      + 'Apaga «Trabaja aquí» en vez de borrarla.')
  }

  e.next()
}, 'empleados')

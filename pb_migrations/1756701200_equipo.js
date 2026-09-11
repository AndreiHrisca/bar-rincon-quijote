/// <reference path="../pb_data/types.d.ts" />
//
// El equipo: nombre de usuario en las cuentas y ficha de empleado completa
// ---------------------------------------------------------------------------
// Dos cosas que salieron al construir la fase 9, y que van juntas porque son la
// misma pantalla: las cuentas se crean desde el panel y las fichas del equipo
// tienen que decir algo mas que el nombre.
//
// 1) NOMBRE DE USUARIO. La pantalla de acceso dice «Usuario» y la maqueta pone
//    «santi», pero la coleccion venia con `identityFields: ["email"]`: escribir
//    «santi» NO entraba. Y ahora que el dueno crea las cuentas desde el panel,
//    exigir un correo a cada persona del equipo es pedir algo que en un bar de
//    barrio muchas veces no existe (y que ademas no se usa para nada: no hay
//    correo saliente, D-29).
//
//    Asi que se anade `usuario`, se admite como identidad JUNTO al correo —las
//    cuentas que ya entraban por correo siguen entrando— y el correo pasa a ser
//    opcional. El indice unico es PARCIAL: sin el `WHERE usuario != ''`, dos
//    cuentas sin nombre de usuario chocarian entre ellas.
//
//    A las cuentas que ya existen se les rellena el nombre de usuario con la
//    parte de delante de su correo, que es justamente «santi» en las de
//    demostracion.
//
// 2) LA FICHA DEL EMPLEADO. Tenia nombre, alias, color, telefono y poco mas.
//    Se le anaden los datos que hacen falta para que sea la ficha de alguien
//    que trabaja aqui: puesto, desde cuando, horas contratadas y notas.
//
//    NO se guarda el DNI ni la direccion ni el numero de la Seguridad Social.
//    Eso es una decision legal (proteccion de datos, seccion 12), no tecnica, y
//    se pregunta antes: esta anotada como propuesta en DECISIONES.md.
// ---------------------------------------------------------------------------

migrate((app) => {

  // --- 1. Cuentas: nombre de usuario ---------------------------------------
  const users = app.findCollectionByNameOrId('users')

  users.fields.add(new Field({
    name: 'usuario',
    type: 'text',
    max: 30,
    // Minusculas, numeros y punto/guion. Sin espacios ni enyes: se teclea en el
    // movil de la barra a las once de la noche y se dicta en voz alta.
    pattern: '^[a-z0-9._-]{3,30}$',
  }))

  users.addIndex('idx_users_usuario', true, 'usuario', "usuario != ''")

  // El correo deja de ser obligatorio: ahora hay otra forma de entrar.
  const correo = users.fields.getByName('email')
  correo.required = false

  users.passwordAuth.identityFields = ['usuario', 'email']

  app.save(users)

  // Las cuentas que ya existen se quedarian sin nombre de usuario y solo
  // podrian entrar por correo. Se les pone la parte de delante del correo.
  for (const cuenta of app.findAllRecords('users')) {
    if (cuenta.getString('usuario')) continue
    const correoCuenta = cuenta.getString('email')
    let propuesto = correoCuenta.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (propuesto.length < 3) propuesto = `cuenta${cuenta.id.slice(0, 6)}`
    propuesto = propuesto.slice(0, 30)

    // Dos correos distintos pueden empezar igual (santi@ y santi@otro): al
    // segundo se le pone un numero detras.
    let intento = propuesto
    let n = 2
    while (true) {
      let chocado = null
      try {
        chocado = app.findFirstRecordByFilter('users', 'usuario = {:u}', { u: intento })
      } catch (err) {
        chocado = null
      }
      if (!chocado) break
      intento = `${propuesto.slice(0, 28)}${n}`
      n++
    }

    cuenta.set('usuario', intento)
    app.save(cuenta)
  }

  // --- 2. La ficha del empleado --------------------------------------------
  const empleados = app.findCollectionByNameOrId('empleados')

  // Que hace en el bar. Texto y no lista cerrada: en un bar de cuatro personas
  // los puestos se llaman como se llaman («barra y sala», «cocina y pedidos»),
  // y una lista de valores obligaria a volver aqui cada vez que cambie uno.
  empleados.fields.add(new Field({ name: 'puesto', type: 'text', max: 40 }))

  // Dia del calendario, no instante: se guarda como medianoche UTC, igual que
  // la fecha de una reserva o la de un turno.
  empleados.fields.add(new Field({ name: 'fecha_alta', type: 'date' }))

  // La escribe el SERVIDOR al apagar «Trabaja aqui» (pb_hooks/equipo.pb.js),
  // igual que `oculto_desde` en los platos (D-36): la fecha de una baja no es
  // algo que deba poder teclear el navegador.
  empleados.fields.add(new Field({ name: 'fecha_baja', type: 'date' }))

  // Horas contratadas por semana. Sirve para saber si el cuadrante de la
  // semana se pasa o se queda corto, que es la pregunta que se hace al ponerlo.
  // NO es una medicion de personas (seccion 12): es lo que pone el contrato.
  empleados.fields.add(new Field({
    name: 'horas_semana', type: 'number', min: 0, max: 60, onlyInt: false,
  }))

  empleados.fields.add(new Field({ name: 'notas', type: 'text', max: 300 }))

  app.save(empleados)

}, (app) => {
  const empleados = app.findCollectionByNameOrId('empleados')
  for (const campo of ['puesto', 'fecha_alta', 'fecha_baja', 'horas_semana', 'notas']) {
    empleados.fields.removeByName(campo)
  }
  app.save(empleados)

  const users = app.findCollectionByNameOrId('users')
  users.passwordAuth.identityFields = ['email']
  users.fields.getByName('email').required = true
  users.removeIndex('idx_users_usuario')
  users.fields.removeByName('usuario')
  app.save(users)
})

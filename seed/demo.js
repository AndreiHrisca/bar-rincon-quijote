/// <reference path="../pb_data/types.d.ts" />
//
// DATOS DE DEMOSTRACION — El Rincon del Quijote
// ===========================================================================
//
//   *** TODO LO QUE GENERA ESTE FICHERO ES FICTICIO. ***
//   *** NO SE EJECUTA NUNCA CONTRA LA BASE DE PRODUCCION. ***
//
// Existe para poder ver el panel lleno mientras se construye: reservas del dia,
// empleados, un cuadrante, fichajes (incluido uno sin cerrar, que es el aviso
// importante), un recuento cerrado con sus lineas y varios avisos de falta sin
// resolver.
//
// Los nombres de persona son inventados y los telefonos estan en el rango
// 600 000 000 reservado para ficcion. Todo lo importado lleva la marca
// [DEMO] para poder distinguirlo y borrarlo de un vistazo.
//
// Uso:
//   docker exec quijote-pocketbase pocketbase demo --dir=/pb/pb_data
//
// Es idempotente: borra lo que genero antes y lo vuelve a crear, para que se
// pueda lanzar tantas veces como haga falta sin acumular basura.
// ===========================================================================

const MARCA = '[DEMO]'

// --- Utilidades de fecha ---------------------------------------------------
// Todo se genera relativo a HOY para que el panel tenga siempre algo que
// ensenar, sin importar cuando se lance.

function hoy() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function masDias(fecha, n) {
  const d = new Date(fecha.getTime())
  d.setDate(d.getDate() + n)
  return d
}

// PocketBase espera las fechas en "AAAA-MM-DD HH:MM:SS.mmmZ".
function pbFecha(fecha) {
  return fecha.toISOString().replace('T', ' ').replace('Z', 'Z')
}

// CUIDADO CON LA ZONA HORARIA. Un campo de fecha SIN hora (el dia de una
// reserva, el de un turno, el de un recuento) representa un dia del calendario,
// no un instante. Si se coge la medianoche local de Madrid (UTC+2 en verano) y
// se pasa por toISOString(), sale las 22:00 del dia ANTERIOR y todo se corre un
// dia: el recuento del domingo aparece hecho el sabado.
//
// Convenio del proyecto: los campos de fecha sin hora se guardan como
// MEDIANOCHE UTC del dia del calendario. Asi "2026-08-30" va y vuelve igual.
// Los campos que si son un instante (entrada y salida de un fichaje, cerrado_en)
// se guardan en UTC de verdad, con pbFecha().
function pbDia(fecha) {
  const a = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${a}-${m}-${d} 00:00:00.000Z`
}

function conHora(fecha, hhmm) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(fecha.getTime())
  d.setHours(h, m, 0, 0)
  return d
}

// Codigo de reserva: mismo formato que el del servidor, RQ- y cuatro
// caracteres sin ambiguos (ni O/0 ni I/1).
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function codigo() {
  let s = ''
  for (let i = 0; i < 4; i++) s += ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
  return `RQ-${s}`
}

function borrarMarcados(app, coleccion, campo) {
  let borrados = 0
  try {
    const filas = app.findRecordsByFilter(coleccion, `${campo} ~ {:m}`, '', 500, 0, { m: MARCA })
    filas.forEach((f) => { app.delete(f); borrados++ })
  } catch (e) { /* la coleccion puede estar vacia */ }
  return borrados
}

// ===========================================================================
function generar(app) {
  console.log('')
  console.log('=========================================================')
  console.log('  DATOS DE DEMOSTRACION — TODO FICTICIO')
  console.log('  No lanzar esto contra la base de produccion.')
  console.log('=========================================================')
  console.log('')

  const h = hoy()

  // --- Limpieza de lo generado en pasadas anteriores ----------------------
  // Se borra de dentro hacia fuera para no chocar con las relaciones.
  let limpiados = 0
  limpiados += borrarMarcados(app, 'reservas', 'nombre')
  limpiados += borrarMarcados(app, 'recuentos', 'notas')      // arrastra sus lineas
  limpiados += borrarMarcados(app, 'avisos_stock', 'nota')
  limpiados += borrarMarcados(app, 'eventos', 'titulo')
  limpiados += borrarMarcados(app, 'empleados', 'nombre')     // arrastra turnos y fichajes
  if (limpiados) console.log(`Limpiados ${limpiados} registros de la pasada anterior.`)

  // =========================================================================
  // Empleados
  // =========================================================================
  const colEmpleados = app.findCollectionByNameOrId('empleados')
  const PLANTILLA = [
    { nombre: `Santi ${MARCA}`,  alias: 'S',  color: '#93202A', telefono: '600000001',
      puesto: 'Barra y jefe',      antiguedad: 14, horas: 40 },
    { nombre: `Marisa ${MARCA}`, alias: 'M',  color: '#A8672F', telefono: '600000002',
      puesto: 'Barra y sala',      antiguedad: 6,  horas: 40 },
    { nombre: `Kevin ${MARCA}`,  alias: 'K',  color: '#6B6B33', telefono: '600000003',
      puesto: 'Cocina',            antiguedad: 2,  horas: 30 },
    { nombre: `Lucia ${MARCA}`,  alias: 'L',  color: '#6E141C', telefono: '600000004',
      puesto: 'Sala los findes',   antiguedad: 0,  horas: 16 },
  ]

  const empleados = PLANTILLA.map((p) => {
    const r = new Record(colEmpleados)
    r.set('nombre', p.nombre)
    r.set('alias', p.alias)
    r.set('color', p.color)
    r.set('telefono', p.telefono)
    r.set('puesto', p.puesto)
    // pbDia() porque es un dia del calendario, no un instante. Se cuenta hacia
    // atras en anos para que las antiguedades se vean distintas en la ficha
    // («14 años», «6 meses»); a quien entro "hace 0 anos" se le pone el marzo
    // de este ano, o el del pasado si marzo aun no ha llegado.
    const anoAlta = h.getFullYear() - p.antiguedad - (h.getMonth() < 2 ? 1 : 0)
    r.set('fecha_alta', pbDia(new Date(anoAlta, 2, 3)))
    r.set('horas_semana', p.horas)
    r.set('activo', true)
    app.save(r)
    return r
  })
  console.log(`  ${empleados.length} empleados`)

  // =========================================================================
  // Cuentas de acceso al panel
  // =========================================================================
  // Desde la fase 5 el panel pide usuario y contrasena, asi que los datos de
  // demostracion traen una cuenta POR ROL —los dos que hay desde la migracion
  // 1757200000_rol_administrador.js— y dos empleados, que es el caso normal:
  // varias personas de turno y una sola que administra. Sin esto no hay forma
  // de ver el panel lleno: la pantalla de acceso no deja pasar.
  //
  // TODAS SON FICTICIAS Y LA CONTRASENA ES PUBLICA. Estan en dominio
  // .invalid, que es un TLD reservado y no existe: no se le puede escribir a
  // nadie por error. En produccion las cuentas las crea Santi, y este
  // subcomando no se ejecuta alli.
  const CUENTAS = [
    { usuario: 'santi',  correo: 'santi@ejemplo.invalid',  rol: 'admin',    nombre: 'Santi',  empleado: 0 },
    { usuario: 'marisa', correo: 'marisa@ejemplo.invalid', rol: 'empleado', nombre: 'Marisa', empleado: 1 },
    { usuario: 'kevin',  correo: 'kevin@ejemplo.invalid',  rol: 'empleado', nombre: 'Kevin',  empleado: 2 },
    { usuario: 'lucia',  correo: 'lucia@ejemplo.invalid',  rol: 'empleado', nombre: 'Lucia',  empleado: 3 },
  ]
  const CLAVE_DEMO = 'demo-2026-quijote'

  const colUsuarios = app.findCollectionByNameOrId('users')
  CUENTAS.forEach((c) => {
    // Se borra la de la pasada anterior: los usuarios no llevan la marca en el
    // nombre porque ese nombre se ensena en pantalla ("Buenos dias, Santi").
    try {
      app.delete(app.findFirstRecordByFilter('users', 'email = {:e}', { e: c.correo }))
    } catch (e) { /* no existia */ }

    // EL NOMBRE DE USUARIO PUEDE ESTAR COGIDO POR UNA CUENTA DE VERDAD. Pasa en
    // cuanto se prueba esto sobre una copia de la base real: alli «santi» es la
    // cuenta de Santi, con su contrasena, y no la de mentira. El indice unico
    // de `usuario` hace que el demo reviente con «Value must be unique».
    //
    // NO SE BORRA la que hay: seria borrar la cuenta real de alguien por
    // generar datos de prueba. Se le pone otro nombre a la de mentira y se
    // avisa, que es lo unico honesto que se puede hacer aqui.
    let usuario = c.usuario
    try {
      app.findFirstRecordByFilter('users', 'usuario = {:u}', { u: c.usuario })
      usuario = `${c.usuario}-demo`
      console.log(`  OJO: ya hay una cuenta con el usuario "${c.usuario}"; la de demostracion se llamara "${usuario}"`)
    } catch (e) { /* libre */ }

    const u = new Record(colUsuarios)
    // El nombre de usuario es como se entra de verdad al panel («santi»), que
    // es lo que dibuja la maqueta. El correo sigue valiendo como identidad.
    u.set('usuario', usuario)
    u.set('email', c.correo)
    u.setPassword(CLAVE_DEMO)
    u.set('verified', true)
    u.set('emailVisibility', false)
    u.set('rol', c.rol)
    u.set('nombre', c.nombre)
    app.save(u)

    // Se engancha con su ficha de empleado, que es lo que hace que cada cual
    // vea SUS fichajes y no los del resto (regla de acceso de "fichajes").
    const emp = empleados[c.empleado]
    emp.set('usuario', u.id)
    app.save(emp)
  })
  console.log(`  ${CUENTAS.length} cuentas de acceso (clave: ${CLAVE_DEMO})`)

  // =========================================================================
  // Cuadrante de la semana
  // =========================================================================
  // Se deja un hueco a proposito el sabado de noche: el panel lo pinta en
  // granate como turno sin cubrir, que es justo lo que hay que ver.
  const colTurnos = app.findCollectionByNameOrId('turnos')
  const TURNOS = [
    [0, 0, '08:00', '16:00'], [0, 1, '16:00', '00:30'],
    [1, 1, '08:00', '16:00'], [1, 2, '16:00', '00:30'],
    [2, 2, '08:00', '16:00'], [2, 3, '16:00', '00:30'],
    [3, 3, '08:00', '16:00'], [3, 0, '16:00', '00:30'],
    [4, 0, '08:00', '16:00'], [4, 1, '16:00', '02:00'],
    [5, 1, '08:00', '16:00'],  // sabado noche sin cubrir, a proposito
    [6, 2, '08:00', '16:00'], [6, 3, '16:00', '00:30'],
  ]
  let nTurnos = 0
  TURNOS.forEach(([dia, quien, inicio, fin]) => {
    const r = new Record(colTurnos)
    r.set('empleado', empleados[quien].id)
    r.set('fecha', pbDia(masDias(h, dia)))
    r.set('hora_inicio', inicio)
    r.set('hora_fin', fin)
    app.save(r)
    nTurnos++
  })
  console.log(`  ${nTurnos} turnos (con un hueco sin cubrir el sabado de noche)`)

  // =========================================================================
  // Fichajes
  // =========================================================================
  // Los ultimos 20 dias. Se dejan DOS averias a proposito, porque lo importante
  // de esta pantalla son los errores, no las horas (seccion 7):
  //   - un fichaje de hace tres dias sin cerrar
  //   - el de hoy de una persona que sigue dentro (ese es normal)
  const colFichajes = app.findCollectionByNameOrId('fichajes')
  let nFichajes = 0
  let sinCerrar = 0

  for (let d = 20; d >= 0; d--) {
    const dia = masDias(h, -d)
    empleados.slice(0, 3).forEach((emp, i) => {
      const entrada = conHora(dia, i === 0 ? '08:00' : (i === 1 ? '09:00' : '16:00'))
      const r = new Record(colFichajes)
      r.set('empleado', emp.id)
      r.set('entrada', pbFecha(entrada))

      const olvidado = (d === 3 && i === 1)          // averia: se fue sin fichar
      const dentroAhora = (d === 0 && i === 2)       // normal: sigue trabajando

      if (!olvidado && !dentroAhora) {
        const salida = new Date(entrada.getTime() + (i === 2 ? 8.5 : 8) * 3600 * 1000)
        r.set('salida', pbFecha(salida))
      } else {
        sinCerrar++
      }
      app.save(r)
      nFichajes++
    })
  }
  console.log(`  ${nFichajes} fichajes (${sinCerrar} sin cerrar: uno olvidado y uno en curso)`)

  // =========================================================================
  // Reservas
  // =========================================================================
  const colReservas = app.findCollectionByNameOrId('reservas')
  const NOMBRES = ['Ana Ruiz', 'Paco Delgado', 'Rosa Nieto', 'Julian Vega', 'Elena Prado',
                   'Toni Serrano', 'Bea Molina', 'Nacho Cuesta', 'Pilar Ortega', 'Ramon Gil']
  const ZONAS = ['terraza', 'salon', 'barra', 'indiferente']
  const MOTIVOS = ['normal', 'normal', 'normal', 'cumpleanos', 'empresa', 'bautizo']

  let nReservas = 0
  // De ayer a dentro de seis dias, para que "Hoy" y el selector de dias tengan
  // contenido en las dos direcciones.
  for (let d = -1; d <= 6; d++) {
    const dia = masDias(h, d)
    const cuantas = d === 0 ? 7 : (2 + Math.floor(Math.random() * 4))
    for (let i = 0; i < cuantas; i++) {
      const comida = Math.random() < 0.55
      const hora = comida
        ? ['13:00', '13:30', '14:00', '14:30', '15:00'][Math.floor(Math.random() * 5)]
        : ['20:30', '21:00', '21:30', '22:00'][Math.floor(Math.random() * 4)]

      let estado = 'confirmada'
      if (d < 0) estado = Math.random() < 0.2 ? 'no_vino' : 'sentada'
      else if (d === 0 && Math.random() < 0.3) estado = 'pendiente'
      else if (d > 0 && Math.random() < 0.15) estado = 'pendiente'

      const r = new Record(colReservas)
      r.set('fecha', pbDia(dia))
      r.set('hora', hora)
      r.set('comensales', 2 + Math.floor(Math.random() * 7))
      r.set('zona', ZONAS[Math.floor(Math.random() * ZONAS.length)])
      r.set('motivo', MOTIVOS[Math.floor(Math.random() * MOTIVOS.length)])
      r.set('nombre', `${NOMBRES[Math.floor(Math.random() * NOMBRES.length)]} ${MARCA}`)
      r.set('telefono', `6000000${String(10 + nReservas).slice(-2)}`)
      r.set('estado', estado)
      r.set('codigo', codigo())
      r.set('origen', Math.random() < 0.7 ? 'web' : 'telefono')
      if (Math.random() < 0.25) r.set('notas', 'Trona para un nino')
      app.save(r)
      nReservas++
    }
  }
  console.log(`  ${nReservas} reservas (de ayer a dentro de seis dias)`)

  // =========================================================================
  // Almacen: un recuento cerrado y avisos de falta sin resolver
  // =========================================================================
  const productos = app.findRecordsByFilter('productos', 'activo = true', 'ubicacion,orden', 200, 0)

  if (!productos.length) {
    console.log('')
    console.log('  AVISO: no hay productos. Importa antes el almacen:')
    console.log('    pocketbase importar-productos seed/productos.csv --dir=/pb/pb_data')
    console.log('')
  } else {
    // --- Recuento cerrado del domingo pasado ---
    const colRecuentos = app.findCollectionByNameOrId('recuentos')
    const colLineas = app.findCollectionByNameOrId('recuento_lineas')

    // Retrocede hasta el domingo anterior (getDay(): 0 = domingo).
    let domingo = masDias(h, -1)
    while (domingo.getDay() !== 0) domingo = masDias(domingo, -1)

    const recuento = new Record(colRecuentos)
    recuento.set('fecha', pbDia(domingo))
    recuento.set('hecho_por', empleados[1].id)
    recuento.set('estado', 'cerrado')
    recuento.set('notas', `Recuento de ejemplo ${MARCA}`)
    recuento.set('cerrado_en', pbFecha(conHora(domingo, '12:30')))
    app.save(recuento)

    let bajoMinimo = 0
    productos.forEach((p) => {
      const minimo = p.getFloat('stock_minimo') || 0
      // Un tercio de los productos sale por debajo del minimo, para que la
      // lista de pedido tenga contenido de verdad.
      const escaso = Math.random() < 0.33
      const cantidad = escaso
        ? Math.max(0, Math.round(minimo * (0.2 + Math.random() * 0.5) * 10) / 10)
        : Math.round(minimo * (1.2 + Math.random() * 1.5) * 10) / 10

      const hayQuePedir = cantidad < minimo
      if (hayQuePedir) bajoMinimo++

      const l = new Record(colLineas)
      l.set('recuento', recuento.id)
      l.set('producto', p.id)
      l.set('cantidad', cantidad)
      l.set('contada', true)
      l.set('hay_que_pedir', hayQuePedir)
      l.set('cantidad_pedir', hayQuePedir ? (p.getFloat('pedido_habitual') || 0) : 0)
      app.save(l)
    })
    console.log(`  1 recuento cerrado del ${pbDia(domingo).slice(0, 10)} con ${productos.length} lineas (${bajoMinimo} por debajo del minimo)`)

    // --- Avisos de falta sin resolver ---
    // Se arrastran de dias anteriores a proposito: ese es justo el problema del
    // papel que viene a arreglar (seccion 9.1). Uno es de hace cuatro dias.
    const colAvisos = app.findCollectionByNameOrId('avisos_stock')
    const AVISOS = [
      { i: 0, nivel: 'agotado',    dias: 0, nota: `Se acabo en el servicio de comidas ${MARCA}` },
      { i: 3, nivel: 'queda_poco', dias: 0, nota: `Queda para hoy ${MARCA}` },
      { i: 7, nivel: 'agotado',    dias: 1, nota: `${MARCA}` },
      { i: 11, nivel: 'queda_poco', dias: 2, nota: `${MARCA}` },
      { i: 15, nivel: 'agotado',   dias: 4, nota: `Lleva cuatro dias sin resolver ${MARCA}` },
    ]
    let nAvisos = 0
    AVISOS.forEach((a) => {
      const p = productos[a.i % productos.length]
      const r = new Record(colAvisos)
      r.set('producto', p.id)
      r.set('nivel', a.nivel)
      r.set('creado_por', empleados[2 + (nAvisos % 2)].id)
      r.set('nota', a.nota)
      r.set('resuelto', false)
      app.save(r)
      nAvisos++
    })
    console.log(`  ${nAvisos} avisos de falta SIN RESOLVER (el mas viejo, de hace 4 dias)`)
  }

  // =========================================================================
  // Eventos
  // =========================================================================
  // Los tres casos que de verdad tiene este bar y que la pantalla «Qué se
  // cuece» tiene que saber pintar: uno de un dia con hora, uno de varios dias
  // con precio por persona, y uno que ya paso (que sale en gris y no se borra,
  // porque el del ano que viene se copia de el).
  const colEventos = app.findCollectionByNameOrId('eventos')
  const EVENTOS = [
    {
      titulo: `Vermú con Los del Puente ${MARCA}`,
      descripcion: 'Rumba en directo. Entrada libre hasta llenar.',
      titulo_en: `Vermouth with Los del Puente ${MARCA}`,
      descripcion_en: 'Live rumba. Free entry until full.',
      dias: 5, hora: '13:00', precio: 0, visible: true,
    },
    {
      titulo: `Menú navideño ${MARCA}`,
      descripcion: 'Tres entrantes, principal a elegir, postre, vino y café. Para empresas y familias.',
      titulo_en: `Christmas set menu ${MARCA}`,
      descripcion_en: 'Three starters, a main course, dessert, wine and coffee.',
      dias: 40, diasFin: 75, precio: 40, visible: true,
    },
    {
      titulo: `Fiesta de la peña ${MARCA}`,
      descripcion: 'Gracias a los 80 que os pasasteis.',
      dias: -15, hora: '20:00', precio: 0, visible: true,
    },
  ]

  EVENTOS.forEach((e) => {
    const r = new Record(colEventos)
    r.set('titulo', e.titulo)
    r.set('descripcion', e.descripcion)
    if (e.titulo_en) r.set('titulo_en', e.titulo_en)
    if (e.descripcion_en) r.set('descripcion_en', e.descripcion_en)
    // pbDia() y no pbFecha(): un evento es un dia del calendario, no un
    // instante. La hora va aparte y como texto.
    r.set('fecha_inicio', pbDia(masDias(h, e.dias)))
    if (e.diasFin) r.set('fecha_fin', pbDia(masDias(h, e.diasFin)))
    if (e.hora) r.set('hora', e.hora)
    r.set('precio', e.precio)
    r.set('visible', e.visible)
    app.save(r)
  })
  console.log(`  ${EVENTOS.length} eventos (uno de varios dias con precio, uno pasado)`)

  console.log('')
  console.log('Cuentas del panel: santi / marisa / kevin / lucia  (o su correo @ejemplo.invalid)')
  console.log(`Contrasena de todas: ${CLAVE_DEMO}`)
  console.log('')
  console.log('Listo. Todo lo generado lleva la marca [DEMO] en el nombre o en las notas.')
  console.log('Para borrarlo, vuelve a lanzar este comando o filtra por [DEMO] en el panel.')
  console.log('')
}

module.exports = { generar }

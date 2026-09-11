/// <reference path="../pb_data/types.d.ts" />
//
// Fichajes y cuadrante — lo que no puede decir una regla de coleccion
// ===========================================================================
// La migracion 1756700600_personal.js ya lo dejo anunciado: «Cualquiera del
// equipo ficha; solo puede fichar por si mismo, y eso se comprueba en
// pb_hooks/fichajes.pb.js (una regla no puede impedir que alguien ponga otro
// empleado en el campo al crear)». Esto es ese fichero.
//
// Cuatro cosas, y las cuatro son de control horario, no de interfaz:
//
//   1. DE QUIEN ES EL FICHAJE lo dice la sesion, no el navegador. Sin esto,
//      cualquiera podria fichar la entrada de un companero que aun no ha
//      llegado. Es el fraude que un registro de jornada tiene que impedir.
//
//   2. LA HORA LA PONE EL SERVIDOR, la de entrada y la de salida. El reloj del
//      movil se cambia en dos toques. Dueno y encargado SI pueden escribir una
//      hora a mano —para arreglar el olvido de ayer—, y por eso queda firmado
//      quien lo hizo.
//
//   3. NO SE FICHA DOS VECES. Con un fichaje abierto, el gesto que toca es
//      cerrarlo. Dos abiertos a la vez son dos jornadas solapadas en el informe
//      del mes y nadie sabe cual vale.
//
//   4. CORREGIR DEJA RASTRO. Mover una entrada, cambiar una salida ya puesta o
//      reabrir un fichaje cerrado solo lo hacen dueno y encargado, y se firma en
//      `corregido_por` (seccion 7 del encargo). Cerrar el turno propio no es
//      corregir: eso lo hace cada cual al irse a casa.
//
// Y una de cuadrante: un turno que empieza y acaba a la misma hora no es un
// turno. Lo demas del cuadrante SI se deja pasar, incluidos los solapes: si el
// sabado dos personas hacen el mismo tramo, sera que hay bautizo. El panel
// AVISA, NO PROHIBE (D-27).
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado. Nada de lo que se declare en el nivel
// superior de este fichero llega al cuerpo de los handlers, asi que el
// require() de la logica compartida va DENTRO de cada uno.
// ===========================================================================

// ---------------------------------------------------------------------------
// Fichar: de quien es, a que hora, y no dos veces
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const P = require(`${__hooks}/lib/personal.js`)

  // El superusuario queda fuera: es la valvula de escape para arreglar la base
  // a mano, igual que en roles.pb.js y almacen.pb.js. Por ahi entran tambien
  // las pruebas de reglas de acceso cuando preparan datos.
  if (e.hasSuperuserAuth()) return e.next()

  const quien = e.auth
  const rol = quien ? quien.getString('rol') : ''

  // La ficha de empleado ligada a la sesion. Puede no haberla: hay cuentas de
  // acceso que no estan en el cuadrante.
  let propio = ''
  if (quien) {
    try {
      propio = e.app.findFirstRecordByFilter(
        'empleados', 'usuario = {:u}', { u: quien.id }).id
    } catch (err) {
      propio = ''
    }
  }

  const decidido = P.empleadoQueFicha({
    pedido: e.record.getString('empleado'),
    propio: propio,
    rol: rol,
  })
  if (decidido.error) throw new ForbiddenError(decidido.error)
  e.record.set('empleado', decidido.empleado)

  // La hora. Para quien ficha lo suyo, siempre la del servidor; el reloj del
  // movil no vale como registro de jornada. Dueno y encargado pueden mandarla
  // escrita, que es como se arregla el olvido de ayer.
  const enviado = e.requestInfo().body || {}
  const puedeEscribirHoras = P.esMando(rol)
  if (!puedeEscribirHoras || enviado.entrada === undefined || !enviado.entrada) {
    e.record.set('entrada', new Date().toISOString().replace('T', ' '))
  }
  if (!puedeEscribirHoras) e.record.set('salida', '')

  if (!P.ordenValido(e.record.getString('entrada'), e.record.getString('salida'))) {
    throw new BadRequestError('La salida no puede ser anterior a la entrada.')
  }

  // Un fichaje nace sin firma de correccion aunque el navegador la mande.
  e.record.set('corregido_por', '')

  // Un fichaje abierto por empleado, no dos. findFirstRecordByFilter LANZA
  // cuando no encuentra nada, que aqui es el caso normal: de ahi el try en dos
  // pasos, con la decision FUERA del catch (D-22 y almacen.pb.js).
  let abierto = null
  try {
    abierto = e.app.findFirstRecordByFilter('fichajes',
      'empleado = {:e} && salida = ""', { e: decidido.empleado })
  } catch (err) {
    abierto = null
  }
  if (abierto) {
    throw new BadRequestError('Ya hay un fichaje sin cerrar. Cierra ese antes de empezar otro.')
  }

  e.next()
}, 'fichajes')

// ---------------------------------------------------------------------------
// Corregir un fichaje deja rastro; cerrar el propio, no
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const P = require(`${__hooks}/lib/personal.js`)

  if (e.hasSuperuserAuth()) return e.next()

  const antes = e.record.original()
  const quien = e.auth
  const rol = quien ? quien.getString('rol') : ''

  if (!P.ordenValido(e.record.getString('entrada'), e.record.getString('salida'))) {
    throw new BadRequestError('La salida no puede ser anterior a la entrada.')
  }

  const cambiaDeDueno = antes.getString('empleado') !== e.record.getString('empleado')
  const corrige = cambiaDeDueno || P.esCorreccion({
    entradaAntes: antes.getString('entrada'),
    salidaAntes: antes.getString('salida'),
    entradaAhora: e.record.getString('entrada'),
    salidaAhora: e.record.getString('salida'),
  })

  if (!corrige) {
    // Cerrar el turno. Lo unico que se deja tocar es la salida; la firma de
    // correccion se queda como estaba.
    //
    // Y LA HORA DE SALIDA LA PONE TAMBIEN EL SERVIDOR, por el mismo motivo que
    // la de entrada: si el reloj del movil valiera para cerrar, irse a las
    // 22:00 y fichar la salida de las 02:00 seria un toque. Dueno y encargado
    // si pueden escribirla, que es como se cierra el turno que alguien se dejo
    // abierto ayer.
    if (!P.esMando(rol) && e.record.getString('salida')) {
      e.record.set('salida', new Date().toISOString().replace('T', ' '))
      if (!P.ordenValido(e.record.getString('entrada'), e.record.getString('salida'))) {
        throw new BadRequestError('La salida no puede ser anterior a la entrada.')
      }
    }
    e.record.set('corregido_por', antes.getString('corregido_por'))
    return e.next()
  }

  if (!P.esMando(rol)) {
    throw new ForbiddenError('Las horas ya fichadas las corrige el encargado o el dueño.')
  }

  // La firma sale de la sesion, no del navegador: es lo que permite preguntar
  // luego quien movio esa hora. Mismo criterio que `avisos_stock.creado_por`.
  e.record.set('corregido_por', quien ? quien.id : '')

  e.app.logger().info('Fichaje corregido',
    'fichaje', e.record.id,
    'entrada', antes.getString('entrada') + ' -> ' + e.record.getString('entrada'),
    'salida', (antes.getString('salida') || '(abierto)') + ' -> ' + (e.record.getString('salida') || '(abierto)'),
    'por', quien ? quien.getString('email') : '?')

  e.next()
}, 'fichajes')

// ---------------------------------------------------------------------------
// Un turno de cero minutos no es un turno
// ---------------------------------------------------------------------------
// Es lo unico que se rechaza del cuadrante. Un turno que acaba antes de empezar
// SI vale: es el de noche, que cruza la medianoche (19:00-02:30).
onRecordCreateRequest((e) => {
  const P = require(`${__hooks}/lib/personal.js`)
  if (!P.minutosDeTurno(e.record.getString('hora_inicio'), e.record.getString('hora_fin'))) {
    throw new BadRequestError('El turno empieza y acaba a la misma hora.')
  }
  e.next()
}, 'turnos')

onRecordUpdateRequest((e) => {
  const P = require(`${__hooks}/lib/personal.js`)
  if (!P.minutosDeTurno(e.record.getString('hora_inicio'), e.record.getString('hora_fin'))) {
    throw new BadRequestError('El turno empieza y acaba a la misma hora.')
  }
  e.next()
}, 'turnos')

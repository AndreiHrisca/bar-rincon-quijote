/// <reference path="../pb_data/types.d.ts" />
//
// Reglas de reserva — lado servidor
// ===========================================================================
// DECIDE EL SERVIDOR (seccion 8). El formulario puede pintar las franjas llenas
// en gris y avisar de un telefono mal escrito, pero todo se vuelve a comprobar
// aqui. Quien manda una peticion a mano no se salta ni una regla.
//
// Lo que hay:
//   - Validacion completa al crear una reserva desde la web.
//   - GET  /api/quijote/disponibilidad   franjas de un dia con su estado.
//   - POST /api/quijote/cancelar         cancelar con codigo + token.
//   - Antibot: honeypot y limite por IP. Nada de CAPTCHA (seccion 6).
//
// Desde la fase 5 entran reservas por DOS vias y no se tratan igual:
//   web    (sin sesion)  el desconocido. Se le comprueba todo.
//   panel  (con sesion)  el equipo apuntando lo que le dicen por telefono. Se
//                        le comprueban los datos, no las reglas del formulario:
//                        aforo, antelacion y horario de cocina son AVISOS en
//                        pantalla, no muros. Ver DECISIONES.md, D-27.
//
// La logica pura esta en lib/reglas-reserva.js, con sus pruebas unitarias.
// ===========================================================================

// OJO CON EL ALCANCE DE LOS HOOKS DE POCKETBASE:
// cada handler se ejecuta en un runtime de JavaScript AISLADO, sacado de un
// grupo. Lo que se declare aqui fuera (constantes, funciones, un Map con
// estado) NO llega al cuerpo del handler: da "X is not defined" en cuanto entra
// la primera peticion.
//
// Por eso:
//   - la logica compartida vive en lib/reglas-reserva.js y se carga con
//     require() DENTRO de cada handler;
//   - el estado que tiene que sobrevivir entre peticiones (el contador del
//     antibot) va en $app.store(), que si es comun a todos los runtimes.
// Ver DECISIONES.md, D-22.

// ---------------------------------------------------------------------------
// Al crear una reserva
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const R = require(`${__hooks}/lib/reglas-reserva.js`)
  const reserva = e.record
  const esDelPanel = !!e.auth   // el panel apunta reservas de telefono

  // --- Ajustes del bar ---
  let ajustes
  try {
    ajustes = e.app.findFirstRecordByFilter('ajustes', 'id != ""')
  } catch (err) {
    throw new BadRequestError('Las reservas no están configuradas todavía.')
  }

  const conf = {
    horario_cocina: ajustes.getString('horario_cocina'),
    // El horario del BAR, aparte del de la cocina: una franja fuera de la
    // apertura no se ofrece, y un dia de cierre puntual no ofrece ninguna.
    // getString y no get: de un campo json el JSVM devuelve un tipo de Go, y
    // barAbierto ya sabe leer la cadena.
    horario_semanal: ajustes.getString('horario_semanal'),
    cierre_desde: ajustes.getString('cierre_desde'),
    cierre_hasta: ajustes.getString('cierre_hasta'),
    duracion_mesa_min: ajustes.getInt('duracion_mesa_min'),
    antelacion_maxima_dias: ajustes.getInt('antelacion_maxima_dias'),
    aforo_barra: ajustes.getInt('aforo_barra'),
    aforo_terraza: ajustes.getInt('aforo_terraza'),
    aforo_salon: ajustes.getInt('aforo_salon'),
  }

  // =========================================================================
  // Lo que solo se comprueba en las reservas de la WEB
  // =========================================================================
  if (!esDelPanel) {
    // --- Reservas cerradas ---
    if (!ajustes.getBool('reservas_activas')) {
      throw new BadRequestError(
        ajustes.getString('mensaje_cerrado')
        || 'Ahora mismo no tomamos reservas por la web. Llámanos por teléfono.')
    }

    // --- Honeypot ---
    // El formulario lleva un campo invisible que una persona nunca rellena. Si
    // viene con algo, es un robot. Se responde con un 200 falso para no
    // ensenarle cual es el campo que le ha delatado.
    const trampa = e.requestInfo().body?.web
    if (trampa) {
      e.app.logger().warn('Reserva descartada por el honeypot')
      throw new BadRequestError('No hemos podido guardar la reserva.')
    }

    // --- Limite por IP ---
    // El contador vive en $app.store(): en memoria, comun a todos los runtimes
    // y se pierde al reiniciar. La IP NO se guarda en disco en ningun momento
    // (seccion 13). Sin CAPTCHA (seccion 6).
    const ip = e.realIP || 'desconocida'
    const clave = `intentos_reserva_${ip}`
    const maximo = Number($os.getenv('QUIJOTE_MAX_RESERVAS_IP')) || R.MAX_RESERVAS_POR_IP
    const { marcas, demasiados } = R.contarIntento(e.app.store().get(clave), Date.now(), maximo)
    e.app.store().set(clave, marcas)

    if (demasiados) {
      throw new TooManyRequestsError(
        'Has hecho varias reservas seguidas. Espera un rato o llámanos al teléfono del bar.')
    }

    // --- Maximo 10 personas por la web ---
    if (reserva.getInt('comensales') > R.MAX_COMENSALES_WEB) {
      throw new BadRequestError(
        `Para grupos de más de ${R.MAX_COMENSALES_WEB} personas, llámanos y lo organizamos: `
        + (ajustes.getString('telefono') || ''))
    }

    // --- El cliente NO decide estos campos ---
    // Vengan como vengan en la peticion, se reescriben aqui.
    reserva.set('origen', 'web')
    reserva.set('estado', 'pendiente')
  } else {
    // Una reserva creada desde el panel es, por definicion, la que ha entrado
    // por telefono o por la puerta. La apunta alguien del equipo con el cliente
    // delante o al aparato, asi que nace confirmada salvo que se diga otra cosa.
    reserva.set('origen', 'telefono')
    if (!reserva.getString('estado')) reserva.set('estado', 'confirmada')
  }

  // =========================================================================
  // Lo que se comprueba SIEMPRE
  // =========================================================================

  // --- Telefono espanol ---
  const telefono = R.normalizarTelefono(reserva.getString('telefono'))
  if (!telefono) {
    throw new BadRequestError('Ese teléfono no parece español. Escríbelo con nueve cifras.')
  }
  reserva.set('telefono', telefono)

  // --- Nombre ---
  const nombre = reserva.getString('nombre').trim()
  if (nombre.length < 2) throw new BadRequestError('Falta el nombre de la reserva.')
  reserva.set('nombre', nombre)

  // --- Fecha y hora ---
  const fecha = String(reserva.get('fecha')).slice(0, 10)
  const hora = reserva.getString('hora')

  // Estas tres son reglas del FORMULARIO DE LA WEB, no del bar: existen para
  // que un desconocido no reserve a las cuatro de la manana, para dentro de
  // cinco minutos o para dentro de dos anos. Al telefono manda quien coge el
  // telefono. Ver DECISIONES.md, D-27.
  if (!esDelPanel) {
    if (!R.franjasDelDia(conf.horario_cocina).includes(hora)) {
      throw new BadRequestError('A esa hora la cocina está cerrada. Elige otra franja.')
    }
    if (R.esDemasiadoTarde({ fecha, hora })) {
      throw new BadRequestError(
        `Necesitamos al menos ${R.MIN_ANTELACION_MIN} minutos de antelación. `
        + 'Para algo más inmediato, llámanos.')
    }
    if (R.esDemasiadoPronto({ fecha, ajustes: conf })) {
      throw new BadRequestError(
        `Solo tomamos reservas con ${conf.antelacion_maxima_dias} días de antelación como máximo.`)
    }
  }

  // --- Aforo ---
  // Se leen las reservas vivas del mismo dia y se comprueba si cabe. Es la
  // regla que no puede estar solo en el cliente.
  const delDia = e.app.findRecordsByFilter(
    'reservas',
    'fecha >= {:desde} && fecha < {:hasta} && estado != "cancelada" && estado != "no_vino"',
    'hora', 500, 0,
    { desde: `${fecha} 00:00:00.000Z`, hasta: `${fecha} 23:59:59.999Z` },
  ).map((r) => ({
    hora: r.getString('hora'),
    comensales: r.getInt('comensales'),
    zona: r.getString('zona'),
    estado: r.getString('estado'),
  }))

  const veredicto = R.cabe({
    reservasDelDia: delDia,
    hora,
    zona: reserva.getString('zona'),
    comensales: reserva.getInt('comensales'),
    ajustes: conf,
  })

  // El aforo tampoco frena al panel: se avisa en pantalla ANTES de guardar
  // («esa franja ya está completa, ¿la anoto igual?») y queda en el registro,
  // pero la ultima palabra la tiene quien esta en la barra viendo las mesas.
  if (!veredicto.cabe && esDelPanel) {
    e.app.logger().warn('Reserva del panel por encima del aforo',
      'fecha', fecha, 'hora', hora, 'zona', reserva.getString('zona'),
      'comensales', reserva.getInt('comensales'), 'motivo', veredicto.motivo)
  }

  if (!veredicto.cabe && !esDelPanel) {
    const mensajes = {
      zona_llena: 'Esa zona ya está completa a esa hora. Prueba con otra zona o con otra franja.',
      bar_lleno: 'A esa hora no nos queda sitio. Prueba con otra franja.',
      zona_no_disponible: 'Ahora mismo no tomamos reservas para esa zona.',
      sin_aforo_configurado: 'Las reservas no están configuradas todavía. Llámanos por teléfono.',
      hora_invalida: 'Esa hora no es válida.',
    }
    throw new BadRequestError(mensajes[veredicto.motivo] || 'No podemos aceptar esa reserva.')
  }

  // --- Codigo unico y token de cancelacion ---
  // Se reintenta ante una colision. Con 29^4 combinaciones es rarisimo, pero
  // dejar un codigo repetido significaria que dos reservas se confunden en la
  // puerta.
  let codigo = null
  for (let intento = 0; intento < 12 && !codigo; intento++) {
    const candidato = R.generarCodigo()
    try {
      e.app.findFirstRecordByFilter('reservas', 'codigo = {:c}', { c: candidato })
    } catch (err) {
      codigo = candidato   // no existe: nos vale
    }
  }
  if (!codigo) throw new BadRequestError('No hemos podido generar el código. Inténtalo otra vez.')

  reserva.set('codigo', codigo)
  reserva.set('token_cancelacion', R.generarToken())

  if (!reserva.getString('estado')) reserva.set('estado', 'pendiente')
  if (!reserva.getString('motivo')) reserva.set('motivo', 'normal')

  e.next()
}, 'reservas')

// ---------------------------------------------------------------------------
// GET /api/quijote/disponibilidad?fecha=AAAA-MM-DD&comensales=4&zona=terraza
// ---------------------------------------------------------------------------
// Devuelve TODAS las franjas del dia con su estado. Las llenas vienen marcadas,
// no omitidas: la maqueta las tacha, y un hueco tachado dice "aqui no cabeis"
// mientras que uno que desaparece no dice nada.
//
// Publico y de solo lectura. No devuelve ni un dato de ninguna reserva: solo si
// cada franja tiene sitio.
//
// Con sesion (el panel apuntando una reserva de telefono) responde ademas
// cuando las reservas por la web estan APAGADAS: ahi el interruptor solo cierra
// el formulario del cliente, no la libreta del bar. Las franjas llenas vienen
// marcadas igual, porque el panel las usa para avisar antes de guardar.
routerAdd('GET', '/api/quijote/disponibilidad', (e) => {
  const R = require(`${__hooks}/lib/reglas-reserva.js`)
  const esDelPanel = !!e.auth

  const fecha = String(e.request.url.query().get('fecha') || '').slice(0, 10)
  const comensales = Number(e.request.url.query().get('comensales')) || 2
  const zona = String(e.request.url.query().get('zona') || 'indiferente')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return e.json(400, { error: 'Falta la fecha o no tiene el formato AAAA-MM-DD.' })
  }

  let ajustes
  try {
    ajustes = e.app.findFirstRecordByFilter('ajustes', 'id != ""')
  } catch (err) {
    return e.json(200, { activas: false, franjas: [], zonas: [] })
  }

  const conf = {
    horario_cocina: ajustes.getString('horario_cocina'),
    // El horario del BAR, aparte del de la cocina: una franja fuera de la
    // apertura no se ofrece, y un dia de cierre puntual no ofrece ninguna.
    // getString y no get: de un campo json el JSVM devuelve un tipo de Go, y
    // barAbierto ya sabe leer la cadena.
    horario_semanal: ajustes.getString('horario_semanal'),
    cierre_desde: ajustes.getString('cierre_desde'),
    cierre_hasta: ajustes.getString('cierre_hasta'),
    duracion_mesa_min: ajustes.getInt('duracion_mesa_min'),
    antelacion_maxima_dias: ajustes.getInt('antelacion_maxima_dias'),
    aforo_barra: ajustes.getInt('aforo_barra'),
    aforo_terraza: ajustes.getInt('aforo_terraza'),
    aforo_salon: ajustes.getInt('aforo_salon'),
  }

  if (!ajustes.getBool('reservas_activas') && !esDelPanel) {
    return e.json(200, {
      activas: false,
      mensaje: ajustes.getString('mensaje_cerrado'),
      telefono: ajustes.getString('telefono'),
      franjas: [],
      zonas: [],
    })
  }

  const delDia = e.app.findRecordsByFilter(
    'reservas',
    'fecha >= {:desde} && fecha < {:hasta} && estado != "cancelada" && estado != "no_vino"',
    'hora', 500, 0,
    { desde: `${fecha} 00:00:00.000Z`, hasta: `${fecha} 23:59:59.999Z` },
  ).map((r) => ({
    hora: r.getString('hora'),
    comensales: r.getInt('comensales'),
    zona: r.getString('zona'),
    estado: r.getString('estado'),
  }))

  return e.json(200, {
    activas: ajustes.getBool('reservas_activas'),
    fecha,
    maxComensales: R.MAX_COMENSALES_WEB,
    duracionMin: conf.duracion_mesa_min,
    telefono: ajustes.getString('telefono'),
    zonas: R.zonasDisponibles(conf),
    franjas: R.franjasConEstado({
      reservasDelDia: delDia, zona, comensales, ajustes: conf, fecha,
    }),
  })
})

// ---------------------------------------------------------------------------
// POST /api/quijote/cancelar   { codigo, token }
// ---------------------------------------------------------------------------
// El enlace de cancelacion de la pantalla de confirmacion. Hacen falta LAS DOS
// cosas: el codigo (que se ve) y el token (que solo tiene quien hizo la
// reserva). Con el codigo suelto cualquiera cancelaria mesas ajenas.
routerAdd('POST', '/api/quijote/cancelar', (e) => {
  const datos = new DynamicModel({ codigo: '', token: '' })
  e.bindBody(datos)

  if (!datos.codigo || !datos.token) {
    return e.json(400, { error: 'Falta el código o el enlace de cancelación.' })
  }

  let reserva
  try {
    reserva = e.app.findFirstRecordByFilter(
      'reservas', 'codigo = {:c}', { c: String(datos.codigo).toUpperCase() })
  } catch (err) {
    // Mismo mensaje que si el token no cuadra: no se confirma si un codigo
    // existe o no.
    return e.json(404, { error: 'No encontramos esa reserva.' })
  }

  if (reserva.getString('token_cancelacion') !== String(datos.token)) {
    return e.json(404, { error: 'No encontramos esa reserva.' })
  }

  if (reserva.getString('estado') === 'cancelada') {
    return e.json(200, { ok: true, yaEstaba: true })
  }
  if (['sentada', 'no_vino'].includes(reserva.getString('estado'))) {
    return e.json(400, { error: 'Esa reserva ya no se puede cancelar. Llámanos y lo vemos.' })
  }

  reserva.set('estado', 'cancelada')
  e.app.save(reserva)

  e.app.logger().info('Reserva cancelada por el cliente', 'codigo', reserva.getString('codigo'))

  // Aviso al bar: esa mesa vuelve a estar libre (seccion 10). Va DESPUES de
  // guardar y no puede romper nada: notificar() no lanza nunca.
  require(`${__hooks}/lib/avisos.js`).notificar(e.app, 'reserva_cancelada', {
    codigo: reserva.getString('codigo'),
    nombre: reserva.getString('nombre'),
    fecha: reserva.getString('fecha').slice(0, 10),
    hora: reserva.getString('hora'),
    comensales: reserva.getInt('comensales'),
  })

  return e.json(200, { ok: true })
})

// ---------------------------------------------------------------------------
// Avisos (seccion 10)
// ---------------------------------------------------------------------------
// Una reserva que entra por la web es la unica cosa de este sistema que ocurre
// SIN que haya nadie del bar delante: puede caer a las once de la noche con la
// barra llena. Por eso es el primer punto de disparo del notificador.
//
// Solo las de la WEB: las que apunta el equipo desde el panel ya las esta
// escribiendo alguien que esta mirando la pantalla, y avisarle de lo que acaba
// de escribir es ruido.
//
// Va en un hook de EXITO (…AfterCreateSuccess): si la reserva no llegara a
// guardarse, no hay nada que anunciar.
onRecordAfterCreateSuccess((e) => {
  const reserva = e.record
  if (reserva.getString('origen') !== 'web') return e.next()

  require(`${__hooks}/lib/avisos.js`).notificar(e.app, 'reserva_creada', {
    codigo: reserva.getString('codigo'),
    nombre: reserva.getString('nombre'),
    telefono: reserva.getString('telefono'),
    fecha: reserva.getString('fecha').slice(0, 10),
    hora: reserva.getString('hora'),
    comensales: reserva.getInt('comensales'),
    zona: reserva.getString('zona'),
    notas: reserva.getString('notas'),
  })

  e.next()
}, 'reservas')

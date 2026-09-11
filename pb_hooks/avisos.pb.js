/// <reference path="../pb_data/types.d.ts" />
//
// Avisos — los dos disparos que no cuelgan de un registro
// ===========================================================================
// La seccion 10 del encargo pide cinco puntos de disparo. Tres salen solos de
// algo que se guarda, y estan donde ocurre:
//
//   reserva creada        pb_hooks/reservas.pb.js
//   reserva cancelada     pb_hooks/reservas.pb.js
//   producto agotado      pb_hooks/almacen.pb.js
//
// Los otros dos no tienen registro detras y viven aqui:
//
//   recordatorio del recuento   un cron, el dia que diga `ajustes.dia_recuento`
//   cuadrante publicado         una ruta que llama el panel al pasarle el
//                               cuadrante al equipo
//
// El canal, los textos y por que en la v1 solo se escribe en el diario del
// servidor: pb_hooks/lib/avisos.js.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler y cada
// cron corren en un runtime aislado; el require() va DENTRO.
// ===========================================================================

// ---------------------------------------------------------------------------
// «Hoy toca recuento»
// ---------------------------------------------------------------------------
// A las 10:00, con el bar abierto y antes del servicio de comidas: da tiempo a
// organizar quien baja. Solo si `recordatorio_recuento` esta encendido y solo
// el dia de la semana configurado (por defecto, domingo).
//
// El aviso dice ademas cuando fue el ultimo recuento, que es el dato que hace
// que alguien se mueva: «el ultimo fue hace tres semanas» no es lo mismo que
// «el ultimo fue el domingo pasado».
cronAdd('recordatorio_recuento', '0 10 * * *', () => {
  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

  let ajustes
  try {
    ajustes = $app.findFirstRecordByFilter('ajustes', 'id != ""')
  } catch (err) {
    return   // base sin configurar: no hay a quien recordarle nada
  }

  if (!ajustes.getBool('recordatorio_recuento')) return
  if (DIAS[new Date().getDay()] !== ajustes.getString('dia_recuento')) return

  // Si ya hay un recuento de hoy, no se recuerda nada: ya se esta haciendo.
  const hoy = new Date()
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  try {
    $app.findFirstRecordByFilter('recuentos', 'fecha >= {:d}', { d: `${dia} 00:00:00.000Z` })
    return
  } catch (err) {
    // no hay ninguno de hoy: se sigue
  }

  let ultimo = ''
  try {
    const previos = $app.findRecordsByFilter('recuentos', 'estado = "cerrado"', '-fecha', 1, 0)
    if (previos.length) ultimo = previos[0].getString('fecha').slice(0, 10)
  } catch (err) {
    ultimo = ''
  }

  require(`${__hooks}/lib/avisos.js`).notificar($app, 'recordatorio_recuento', {
    dia: ajustes.getString('dia_recuento'),
    ultimo,
  })
})

// ---------------------------------------------------------------------------
// POST /api/quijote/aviso-cuadrante   { semana, turnos, huecos }
// ---------------------------------------------------------------------------
// La llama el panel cuando alguien copia el cuadrante para pegarlo en el grupo
// del equipo. HOY NO MANDA NINGUN MENSAJE: deja constancia de que la semana se
// publico, con cuantos turnos y cuantos huecos, que es lo que hace falta para
// poder decir «esto se aviso el jueves». El dia que haya una pasarela, este
// mismo punto la usa sin tocar el panel.
//
// Quien puede: los mismos que ponen el cuadrante (dueno y encargado). No es un
// dato sensible, pero una ruta publica que escribe en el diario del servidor es
// una forma barata de llenarlo de basura.
routerAdd('POST', '/api/quijote/aviso-cuadrante', (e) => {
  const quien = e.auth
  // El superusuario entra: no tiene campo `rol` que comprobar. Mismo criterio
  // que en roles.pb.js y en la ruta de estadisticas.
  const rol = e.hasSuperuserAuth() ? 'dueno' : (quien ? quien.getString('rol') : '')
  if (!quien || (rol !== 'dueno' && rol !== 'encargado')) {
    return e.json(403, { error: 'El cuadrante lo publican el dueño y el encargado.' })
  }

  const datos = new DynamicModel({ semana: '', turnos: 0, huecos: 0 })
  try {
    e.bindBody(datos)
  } catch (err) {
    return e.json(400, { error: 'No hemos entendido la petición.' })
  }

  require(`${__hooks}/lib/avisos.js`).notificar(e.app, 'cuadrante_publicado', {
    semana: String(datos.semana || '').slice(0, 30),
    turnos: Number(datos.turnos) || 0,
    huecos: Number(datos.huecos) || 0,
  })

  return e.json(200, { ok: true })
})

/// <reference path="../pb_data/types.d.ts" />
//
// El horario del bar, en la configuracion y por dia de la semana
// ---------------------------------------------------------------------------
// EL PROBLEMA QUE ARREGLA. El horario vivia en `horario_texto`, un campo de
// TEXTO LIBRE que decia "Todos los dias de 08:00 a 02:00". De ahi salia todo:
// el bloque de horario de la portada lo pintaba tal cual y la pastilla de
// «Abierto / Cerrado» lo leia con una expresion regular. Tres problemas:
//
//   1. EL DATO ERA FALSO. El bar cierra a las 00:00, no a las 02:00. Con el
//      horario en texto libre no habia forma de que nadie lo notara: es una
//      frase, y una frase no se puede comprobar.
//   2. UN SOLO TRAMO PARA LOS SIETE DIAS. Si algun dia el bar abriera distinto
//      —o no abriera— no habia donde decirlo.
//   3. NO SE PODIA CERRAR UN DIA SUELTO. Un festivo o unas vacaciones obligaban
//      a reescribir la frase y a acordarse de volver a cambiarla.
//
// LO QUE HAY AHORA. `horario_semanal` es un JSON con SIETE entradas, una por
// dia de la semana e indexadas como `Date.getDay()`: 0 domingo, 1 lunes... 6
// sabado. Cada una es `{ "abre": "HH:MM", "cierra": "HH:MM" }`, o `null` el dia
// que el bar no abra.
//
//   CIERRA "00:00" SIGNIFICA MEDIANOCHE DEL DIA SIGUIENTE, no que no abra.
//   Es la unica convencion posible con horas de reloj, y es la misma que ya
//   usan los turnos del cuadrante: si la hora de cierre no es mayor que la de
//   apertura, el tramo cruza la medianoche. Quien lea esto tiene que tenerlo
//   presente, porque es justo el caso de este bar.
//
// `horario_texto` SE ELIMINA. La frase de la portada se genera ahora desde
// `horario_semanal` (compartido/js/horario.js): un dato y una sola forma de
// decirlo. Dejarlo habria sido dejar dos fuentes de verdad, que es exactamente
// el fallo que esta migracion viene a corregir.
//
// EL CIERRE PUNTUAL son tres campos y no un JSON a proposito: se editan en un
// formulario del panel, y una fecha suelta se valida sola.
// ---------------------------------------------------------------------------

migrate((app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')

  ajustes.fields.add(new Field({
    name: 'horario_semanal',
    type: 'json',
    required: true,
    maxSize: 2000,
  }))

  // --- Cierre puntual: festivo, vacaciones, obra ---------------------------
  // Vacio = el bar abre segun el horario semanal. Con fechas, pisa el horario
  // en ese rango y la portada dice el motivo.
  ajustes.fields.add(new Field({ name: 'cierre_desde',  type: 'date' }))
  ajustes.fields.add(new Field({ name: 'cierre_hasta',  type: 'date' }))
  ajustes.fields.add(new Field({ name: 'cierre_motivo', type: 'text', max: 120 }))

  app.save(ajustes)

  // --- El horario de verdad: todos los dias de 08:00 a 00:00 ---------------
  const fila = app.findFirstRecordByFilter('ajustes', 'id != ""')
  if (fila) {
    const todos = { abre: '08:00', cierra: '00:00' }
    fila.set('horario_semanal', [todos, todos, todos, todos, todos, todos, todos])
    app.save(fila)
  }

  // El texto libre se va DESPUES de sembrar el semanal, para no dejar la fila
  // sin ningun horario en ningun momento.
  ajustes.fields.removeById(ajustes.fields.getByName('horario_texto').id)
  app.save(ajustes)

}, (app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')

  ajustes.fields.add(new Field({
    name: 'horario_texto', type: 'text', required: true, max: 200,
  }))
  app.save(ajustes)

  const fila = app.findFirstRecordByFilter('ajustes', 'id != ""')
  if (fila) {
    fila.set('horario_texto', 'Todos los días de 08:00 a 00:00')
    app.save(fila)
  }

  for (const campo of ['horario_semanal', 'cierre_desde', 'cierre_hasta', 'cierre_motivo']) {
    const f = ajustes.fields.getByName(campo)
    if (f) ajustes.fields.removeById(f.id)
  }
  app.save(ajustes)
})

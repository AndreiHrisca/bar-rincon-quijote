/**
 * Pruebas del horario del bar — compartido/js/horario.js
 * ===========================================================================
 * Aqui se comprueba lo que la web estuvo diciendo mal: que el bar cerraba a las
 * 02:00. Ahora el horario es un dato con siete entradas y esto lo vigila.
 *
 * LA ZONA HORARIA NO SE FIJA CON process.env.TZ A PROPOSITO, al reves que en
 * las otras pruebas. El modulo tiene que dar la hora de Madrid AUNQUE el reloj
 * de quien mira este en otro huso: es el caso de un turista, o de un navegador
 * en UTC. Por eso las pruebas corren con el contenedor en UTC —que es como
 * viene— y comprueban que las respuestas siguen siendo de Madrid.
 */

const test = require('node:test')
const assert = require('node:assert')

let H

test.before(async () => {
  H = await import('../../compartido/js/horario.js')
})

/** El horario de verdad del bar: todos los dias de 08:00 a 00:00. */
const ABRE = { abre: '08:00', cierra: '00:00' }
const BAR = { horario_semanal: [ABRE, ABRE, ABRE, ABRE, ABRE, ABRE, ABRE] }

/** Un instante dicho en hora de Madrid. Septiembre va en UTC+2. */
const madrid = (iso, offset = '+02:00') => new Date(`${iso}${offset}`)

// ---------------------------------------------------------------------------
test('enMadrid: la hora es la de Madrid, no la del navegador', async (t) => {
  await t.test('las 23:50 de Madrid son las 21:50 UTC', () => {
    const r = H.enMadrid(new Date('2026-09-08T21:50:00Z'))
    assert.equal(r.minutos, 23 * 60 + 50)
    assert.equal(r.iso, '2026-09-08')
    assert.equal(r.dia, 2)                       // martes
  })

  await t.test('a las 22:10 UTC en Madrid ya es el dia siguiente', () => {
    const r = H.enMadrid(new Date('2026-09-08T22:10:00Z'))
    assert.equal(r.minutos, 10)                  // 00:10
    assert.equal(r.iso, '2026-09-09')            // miercoles ya
    assert.equal(r.dia, 3)
  })

  await t.test('la medianoche clavada son 0 minutos, no 1440', () => {
    // Con hour12:false algunas versiones de ICU devuelven «24» aqui y la cuenta
    // se va un dia entero. Por eso el modulo usa hourCycle:'h23'.
    const r = H.enMadrid(new Date('2026-09-08T22:00:00Z'))
    assert.equal(r.minutos, 0)
    assert.equal(r.iso, '2026-09-09')
  })

  await t.test('en invierno Madrid es UTC+1 y sale solo', () => {
    const r = H.enMadrid(new Date('2026-01-15T23:30:00Z'))
    assert.equal(r.minutos, 30)                  // 00:30 del 16
    assert.equal(r.iso, '2026-01-16')
  })
})

// ---------------------------------------------------------------------------
test('tramoDelDia: cerrar a las 00:00 es medianoche, no cero horas', async (t) => {
  await t.test('08:00–00:00 son dieciseis horas', () => {
    assert.deepEqual(H.tramoDelDia(BAR.horario_semanal, 1), { abre: 480, cierra: 1440 })
  })

  await t.test('el horario viejo, 08:00–02:00, cruza y llega a 1560', () => {
    const viejo = [{ abre: '08:00', cierra: '02:00' }]
    assert.deepEqual(H.tramoDelDia(viejo, 0), { abre: 480, cierra: 1560 })
  })

  await t.test('un dia sin horario no es un dia de cero horas', () => {
    assert.equal(H.tramoDelDia([null, ABRE], 0), null)
  })

  await t.test('aguanta que el JSON llegue como cadena', () => {
    assert.deepEqual(H.tramoDelDia(JSON.stringify([ABRE]), 0), { abre: 480, cierra: 1440 })
  })
})

// ===========================================================================
// LOS DOS CASOS DEL ENCARGO
// ===========================================================================
test('el borde de la medianoche', async (t) => {

  await t.test('a las 23:50 -> Abierto, cerramos a las 00:00', () => {
    const r = H.estadoDeApertura(BAR, madrid('2026-09-08T23:50'))
    assert.equal(r.abierto, true)
    assert.equal(r.cierraA, '00:00')
  })

  await t.test('a las 00:10 -> Cerrado, abrimos a las 08:00, y es HOY', () => {
    // Es el caso que rompia: a las 00:10 ya es el dia siguiente, y decir que
    // «abre hoy» tenia que referirse a este dia nuevo, no al que acaba de
    // terminar. Como todo se calcula desde la fecha de Madrid de AHORA, sale
    // solo.
    const r = H.estadoDeApertura(BAR, madrid('2026-09-09T00:10'))
    assert.equal(r.abierto, false)
    assert.equal(r.abreA, '08:00')
    assert.equal(r.cuando, 'hoy')
  })

  await t.test('a las 00:00 clavadas ya esta cerrado', () => {
    const r = H.estadoDeApertura(BAR, madrid('2026-09-09T00:00'))
    assert.equal(r.abierto, false)
    assert.equal(r.cuando, 'hoy')
  })

  await t.test('a las 07:59 cerrado; a las 08:00 abierto', () => {
    assert.equal(H.estadoDeApertura(BAR, madrid('2026-09-09T07:59')).abierto, false)
    assert.equal(H.estadoDeApertura(BAR, madrid('2026-09-09T08:00')).abierto, true)
  })

  await t.test('con el horario VIEJO de 02:00, a las 00:10 seguiria abierto', () => {
    // Sirve de contraste: la diferencia entre los dos horarios se ve aqui, y es
    // justo la que la portada estaba contando mal.
    const dosDeLaManana = { abre: '08:00', cierra: '02:00' }
    const viejo = { horario_semanal: Array(7).fill(dosDeLaManana) }
    const r = H.estadoDeApertura(viejo, madrid('2026-09-09T00:10'))
    assert.equal(r.abierto, true)
    assert.equal(r.cierraA, '02:00')
  })
})

// ---------------------------------------------------------------------------
test('estadoDeApertura: el resto de casos', async (t) => {
  await t.test('sin horario configurado no se dice nada', () => {
    assert.equal(H.estadoDeApertura({}, madrid('2026-09-08T12:00')).abierto, null)
    assert.equal(H.estadoDeApertura({ horario_semanal: [] }, madrid('2026-09-08T12:00')).abierto, null)
  })

  await t.test('un dia cerrado manda al siguiente que abra', () => {
    // Cerrado los lunes (dia 1).
    const semanal = [ABRE, null, ABRE, ABRE, ABRE, ABRE, ABRE]
    const r = H.estadoDeApertura({ horario_semanal: semanal }, madrid('2026-09-07T12:00'))
    assert.equal(r.abierto, false)
    assert.equal(r.abreA, '08:00')
    assert.equal(r.cuando, 'mañana')
  })

  await t.test('a las 03:00 de un dia cerrado, la vuelta es pasado manana', () => {
    const semanal = [ABRE, null, null, ABRE, ABRE, ABRE, ABRE]
    const r = H.estadoDeApertura({ horario_semanal: semanal }, madrid('2026-09-07T03:00'))
    assert.equal(r.abierto, false)
    assert.equal(r.cuando, 'miércoles')
  })
})

// ---------------------------------------------------------------------------
test('cierre puntual: pisa el horario semanal', async (t) => {
  const NAVIDAD = {
    ...BAR,
    cierre_desde: '2026-12-24 00:00:00.000Z',
    cierre_hasta: '2026-12-26 00:00:00.000Z',
    cierre_motivo: 'Cerrado por Navidad',
  }
  const inv = '+01:00'   // diciembre va en UTC+1

  await t.test('dentro del rango, cerrado y con motivo', () => {
    const r = H.estadoDeApertura(NAVIDAD, new Date(`2026-12-25T12:00${inv}`))
    assert.equal(r.abierto, false)
    assert.equal(r.motivo, 'Cerrado por Navidad')
  })

  await t.test('dice cuando se vuelve, saltandose los dias cerrados', () => {
    const r = H.estadoDeApertura(NAVIDAD, new Date(`2026-12-24T12:00${inv}`))
    assert.equal(r.abreA, '08:00')
    assert.equal(r.cuando, 'domingo')      // el 27, tres dias despues
  })

  await t.test('el dia de antes, abierto y sin motivo', () => {
    const r = H.estadoDeApertura(NAVIDAD, new Date(`2026-12-23T12:00${inv}`))
    assert.equal(r.abierto, true)
    assert.equal(r.motivo, undefined)
  })

  await t.test('el dia despues, abierto otra vez', () => {
    assert.equal(H.estadoDeApertura(NAVIDAD, new Date(`2026-12-27T12:00${inv}`)).abierto, true)
  })

  await t.test('un solo dia: sin fecha de fin, cierra ese dia y ya', () => {
    const festivo = { ...BAR, cierre_desde: '2026-10-12 00:00:00.000Z', cierre_motivo: 'Fiesta' }
    assert.equal(H.estadoDeApertura(festivo, madrid('2026-10-12T12:00')).abierto, false)
    assert.equal(H.estadoDeApertura(festivo, madrid('2026-10-13T12:00')).abierto, true)
  })
})

// ---------------------------------------------------------------------------
test('textoDelHorario: el horario dicho en una frase', async (t) => {
  await t.test('los siete iguales se dicen en una linea', () => {
    assert.equal(H.textoDelHorario(BAR.horario_semanal), 'Todos los días de 08:00 a 00:00')
  })

  await t.test('si algun dia cambia, se agrupan los seguidos', () => {
    const finde = { abre: '09:00', cierra: '02:00' }
    const semanal = [finde, ABRE, ABRE, ABRE, ABRE, finde, finde]
    assert.equal(H.textoDelHorario(semanal),
      'Lunes a jueves, de 08:00 a 00:00\nViernes a domingo, de 09:00 a 02:00')
  })

  await t.test('el dia que no abre se dice', () => {
    const semanal = [ABRE, null, ABRE, ABRE, ABRE, ABRE, ABRE]
    assert.equal(H.textoDelHorario(semanal),
      'Lunes, cerrado\nMartes a domingo, de 08:00 a 00:00')
  })

  await t.test('sin horario, ni una palabra', () => {
    assert.equal(H.textoDelHorario(null), '')
  })
})

// ---------------------------------------------------------------------------
test('abiertoEse: la hora de una reserva cae dentro del horario', async (t) => {
  await t.test('a las 14:00 si', () => {
    assert.equal(H.abiertoEse(BAR, '2026-09-10', '14:00'), true)
  })

  await t.test('a las 07:00 no: el bar todavia no ha abierto', () => {
    assert.equal(H.abiertoEse(BAR, '2026-09-10', '07:00'), false)
  })

  await t.test('a las 23:30 si, que cierra a las 00:00', () => {
    assert.equal(H.abiertoEse(BAR, '2026-09-10', '23:30'), true)
  })

  await t.test('en un cierre puntual, no', () => {
    const festivo = { ...BAR, cierre_desde: '2026-09-10 00:00:00.000Z' }
    assert.equal(H.abiertoEse(festivo, '2026-09-10', '14:00'), false)
  })
})

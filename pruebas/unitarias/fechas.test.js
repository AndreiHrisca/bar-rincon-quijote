/**
 * Pruebas de panel/js/fechas.js — semanas, meses e instantes
 * ===========================================================================
 * Solo lo que anadio el cuadrante (fase 9), que es justo la parte donde estan
 * las trampas: la semana empieza en LUNES y un fichaje es un INSTANTE, no un
 * dia del calendario.
 *
 * LA ZONA HORARIA SE FIJA EN MADRID a proposito y antes de cargar el modulo.
 * Estas funciones existen para traducir entre el dia natural de aqui y lo que
 * guarda PocketBase, que es UTC; probandolas en UTC no se veria el fallo que
 * vienen a evitar (la medianoche de Madrid cae en el dia anterior en UTC).
 */

process.env.TZ = 'Europe/Madrid'

const test = require('node:test')
const assert = require('node:assert')

let F

test.before(async () => {
  F = await import('../../panel/js/fechas.js')
})

// ---------------------------------------------------------------------------
test('la semana del cuadrante empieza en lunes', async (t) => {
  await t.test('un miercoles vuelve a su lunes', () => {
    assert.equal(F.lunesDe('2026-09-02'), '2026-08-31')
  })

  await t.test('el lunes se queda donde esta', () => {
    assert.equal(F.lunesDe('2026-08-31'), '2026-08-31')
  })

  await t.test('el domingo NO empieza semana: pertenece a la que acaba', () => {
    // getDay() cuenta el domingo como 0; sin el ajuste, el domingo se iria a la
    // semana siguiente y el cuadrante ensenaria el domingo solo.
    assert.equal(F.lunesDe('2026-09-06'), '2026-08-31')
  })

  await t.test('los siete dias, de lunes a domingo', () => {
    assert.deepEqual(F.semanaDesde('2026-08-31'), [
      '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
      '2026-09-04', '2026-09-05', '2026-09-06',
    ])
  })
})

// ---------------------------------------------------------------------------
test('el titulo de la semana', async (t) => {
  await t.test('dentro del mismo mes, el mes se dice una vez', () => {
    assert.equal(F.tituloDeSemana('2026-09-07'), 'Semana del 7 al 13 de septiembre')
  })

  await t.test('a caballo entre dos meses se dicen los dos', () => {
    assert.equal(F.tituloDeSemana('2026-08-31'), 'Semana del 31 de agosto al 6 de septiembre')
  })
})

// ---------------------------------------------------------------------------
test('meses', async (t) => {
  await t.test('el mes de un dia', () => {
    assert.equal(F.mesDe('2026-09-04'), '2026-09')
  })

  await t.test('el mes anterior salta de ano sin liarse', () => {
    assert.equal(F.masMeses('2026-01', -1), '2025-12')
    assert.equal(F.masMeses('2026-12', 1), '2027-01')
  })

  await t.test('el primero y el ultimo dia del mes', () => {
    assert.deepEqual(F.diasDelMes('2026-09'), ['2026-09-01', '2026-09-30'])
    assert.deepEqual(F.diasDelMes('2026-02'), ['2026-02-01', '2026-02-28'])
    assert.deepEqual(F.diasDelMes('2028-02'), ['2028-02-01', '2028-02-29'])
  })

  await t.test('el nombre del mes lleva el ano solo si no es este', () => {
    const ahora = new Date(2026, 8, 4)
    assert.equal(F.nombreDeMes('2026-08', ahora), 'agosto')
    assert.equal(F.nombreDeMes('2025-08', ahora), 'agosto de 2025')
  })
})

// ---------------------------------------------------------------------------
test('el dia natural de aqui, traducido a instantes de PocketBase', async (t) => {
  await t.test('el dia empieza a las 22:00 UTC del dia anterior (horario de verano)', () => {
    assert.equal(F.inicioDelDiaPB('2026-09-01'), '2026-08-31 22:00:00.000Z')
  })

  await t.test('y en invierno, a las 23:00', () => {
    assert.equal(F.inicioDelDiaPB('2026-01-15'), '2026-01-14 23:00:00.000Z')
  })

  await t.test('el final del dia es el ultimo milisegundo', () => {
    assert.equal(F.finDelDiaPB('2026-09-01'), '2026-09-01 21:59:59.999Z')
  })

  await t.test('el turno de noche cae en el dia en que se empezo', () => {
    // Entrar a las 00:30 de Madrid del dia 2 es "2026-09-01 22:30Z". Si el
    // informe del mes filtrara por medianoche UTC, esa jornada se contaria en
    // el dia anterior y las cuentas del mes no cuadrarian.
    const entrada = '2026-09-01 22:30:00.000Z'
    assert.ok(entrada >= F.inicioDelDiaPB('2026-09-02'))
    assert.ok(entrada <= F.finDelDiaPB('2026-09-02'))
    assert.equal(F.diaDeInstante(entrada), '2026-09-02')
  })
})

// ---------------------------------------------------------------------------
test('las horas que se corrigen a mano van y vuelven en hora de aqui', async (t) => {
  await t.test('de PocketBase al campo del formulario', () => {
    assert.equal(F.aEntradaLocal('2026-09-01 06:15:00.000Z'), '2026-09-01T08:15')
  })

  await t.test('y del formulario a PocketBase', () => {
    assert.equal(F.deEntradaLocal('2026-09-01T08:15'), '2026-09-01 06:15:00.000Z')
  })

  await t.test('ida y vuelta sin moverse dos horas', () => {
    const guardado = '2026-09-01 06:15:00.000Z'
    assert.equal(F.deEntradaLocal(F.aEntradaLocal(guardado)), guardado)
  })

  await t.test('vacio se queda vacio', () => {
    assert.equal(F.aEntradaLocal(''), '')
    assert.equal(F.deEntradaLocal(''), '')
  })
})

// ---------------------------------------------------------------------------
test('la antiguedad de una ficha del equipo', async (t) => {
  const AHORA = new Date(2026, 8, 4)          // 4 de septiembre de 2026

  await t.test('anos y meses, como se dice', () => {
    assert.equal(F.antiguedad('2024-03-03', AHORA), '2 años y 6 meses')
  })

  await t.test('los anos justos van sin meses', () => {
    assert.equal(F.antiguedad('2024-09-04', AHORA), '2 años')
  })

  await t.test('menos de un ano, en meses', () => {
    assert.equal(F.antiguedad('2026-04-04', AHORA), '5 meses')
    assert.equal(F.antiguedad('2026-08-04', AHORA), '1 mes')
  })

  await t.test('el mes que no esta cumplido no cuenta', () => {
    // Entro el 20 de agosto: el 4 de septiembre todavia no ha hecho el mes.
    assert.equal(F.antiguedad('2026-08-20', AHORA), '15 días')
  })

  await t.test('el primer dia se dice como es', () => {
    assert.equal(F.antiguedad('2026-09-04', AHORA), 'desde hoy')
    assert.equal(F.antiguedad('2026-09-03', AHORA), '1 día')
  })

  await t.test('sin fecha, o con una futura, no hay antiguedad', () => {
    assert.equal(F.antiguedad('', AHORA), '')
    assert.equal(F.antiguedad('2027-01-01', AHORA), '')
  })

  await t.test('la fecha larga lleva el ano: un alta es de cuando es', () => {
    assert.equal(F.fechaLarga('2024-03-03'), '3 de marzo de 2024')
    assert.equal(F.fechaLarga(''), '')
  })
})

// ---------------------------------------------------------------------------
test('el dia como lo titula la maqueta', async (t) => {
  await t.test('"martes 1"', () => {
    assert.equal(F.diaYNumero('2026-09-01'), 'martes 1')
  })
})

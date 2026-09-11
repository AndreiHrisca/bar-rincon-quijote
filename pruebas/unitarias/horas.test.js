/**
 * Pruebas de panel/js/horas.js — las cuentas del cuadrante y del control horario
 * ===========================================================================
 * Este es el unico sitio del proyecto donde se suman jornadas. El servidor NO
 * las suma (pb_hooks/lib/personal.js lo dice en su cabecera): solo decide de
 * quien es un fichaje y si un cambio es una correccion. Por eso estas cuentas
 * tienen que estar probadas aqui, que es donde viven.
 *
 * El modulo es del navegador (ESM y con `import`), no CommonJS como el resto de
 * lo que se prueba aqui: se carga con import() dinamico, que node resuelve
 * relativo a este fichero. Funciona sin `type: module` ni package.json porque
 * node 22 reconoce solo la sintaxis de modulo.
 *
 * La zona horaria se fija en Madrid ANTES de cargar el modulo: las horas
 * fichadas son instantes de verdad y con otra zona las cuentas cambian.
 */

process.env.TZ = 'Europe/Madrid'

const test = require('node:test')
const assert = require('node:assert')

let H

test.before(async () => {
  H = await import('../../panel/js/horas.js')
})

// ---------------------------------------------------------------------------
test('minutosDeTurno: lo que dura un turno del cuadrante', async (t) => {
  await t.test('un turno normal', () => {
    assert.equal(H.minutosDeTurno('12:00', '17:00'), 300)
  })

  await t.test('el de noche cruza la medianoche y NO es un error', () => {
    assert.equal(H.minutosDeTurno('19:00', '02:30'), 450)
  })

  await t.test('empezar y acabar a la misma hora no es un turno', () => {
    assert.equal(H.minutosDeTurno('19:00', '19:00'), 0)
  })

  await t.test('una hora que no encaja da cero, no un disparate', () => {
    assert.equal(H.minutosDeTurno('', '17:00'), 0)
    assert.equal(H.minutosDeTurno('25:00', '17:00'), 0)
  })
})

// ---------------------------------------------------------------------------
test('minutosFichados: lo que duro una jornada', async (t) => {
  await t.test('entrada y salida del mismo dia', () => {
    assert.equal(H.minutosFichados('2026-09-01 10:02:00.000Z', '2026-09-01 15:14:00.000Z'), 312)
  })

  await t.test('la que cruza la medianoche se mide igual: son instantes', () => {
    assert.equal(H.minutosFichados('2026-09-01 17:28:00.000Z', '2026-09-02 00:09:00.000Z'), 401)
  })

  await t.test('sin salida devuelve null, que NO es cero', () => {
    // Cero seria una jornada de nada; lo que hay es una jornada que no ha
    // terminado y que por eso no puede sumar en el informe del mes.
    assert.equal(H.minutosFichados('2026-09-01 08:00:00.000Z', ''), null)
    assert.equal(H.minutosFichados('2026-09-01 08:00:00.000Z', null), null)
  })

  await t.test('una salida anterior a la entrada tampoco suma', () => {
    assert.equal(H.minutosFichados('2026-09-01 10:00:00.000Z', '2026-09-01 09:00:00.000Z'), null)
    assert.equal(H.minutosFichados('2026-09-01 10:00:00.000Z', '2026-09-01 10:00:00.000Z'), null)
  })
})

// ---------------------------------------------------------------------------
test('enHoras: como se escriben las horas', async (t) => {
  await t.test('con minutos, la hache en medio', () => {
    assert.equal(H.enHoras(312), '5 h 12')
  })

  await t.test('las horas justas van sin minutos', () => {
    assert.equal(H.enHoras(480), '8 h')
  })

  await t.test('los minutos sueltos van con dos cifras', () => {
    assert.equal(H.enHoras(305), '5 h 05')
  })

  await t.test('sin dato, un guion', () => {
    assert.equal(H.enHoras(null), '—')
    assert.equal(H.enHoras(undefined), '—')
  })

  await t.test('cero horas es "0 h", que es un dato', () => {
    assert.equal(H.enHoras(0), '0 h')
  })
})

// ---------------------------------------------------------------------------
test('franjaCubierta: de la primera entrada a la ultima salida', async (t) => {
  const turnos = [
    { hora_inicio: '12:00', hora_fin: '17:00' },
    { hora_inicio: '08:00', hora_fin: '16:00' },
    { hora_inicio: '19:00', hora_fin: '02:00' },
  ]

  await t.test('la franja del dia entero', () => {
    assert.equal(H.franjaCubierta(turnos), '08:00 – 02:00')
  })

  await t.test('un dia sin nadie no tiene franja', () => {
    assert.equal(H.franjaCubierta([]), null)
  })

  await t.test('un solo turno', () => {
    assert.equal(H.franjaCubierta([{ hora_inicio: '19:00', hora_fin: '02:30' }]), '19:00 – 02:30')
  })
})

// ---------------------------------------------------------------------------
test('serviciosSinCubrir: el granate de la maqueta', async (t) => {
  const COCINA = '12:30-16:30,20:00-23:30'

  await t.test('el turno de mediodia deja la noche sin cubrir', () => {
    assert.deepEqual(
      H.serviciosSinCubrir([{ hora_inicio: '12:00', hora_fin: '17:00' }], COCINA),
      ['La noche sin cubrir'])
  })

  await t.test('con los dos servicios puestos no se avisa de nada', () => {
    assert.deepEqual(H.serviciosSinCubrir([
      { hora_inicio: '12:00', hora_fin: '17:00' },
      { hora_inicio: '19:00', hora_fin: '02:00' },
    ], COCINA), [])
  })

  await t.test('un dia vacio canta los dos servicios', () => {
    assert.deepEqual(H.serviciosSinCubrir([], COCINA),
      ['La comida sin cubrir', 'La noche sin cubrir'])
  })

  await t.test('irse a las 23:00 con la cocina abierta hasta las 23:30 NO es un hueco', () => {
    // Es el final del servicio, no un descubierto. Avisar de esto todos los
    // dias seria ruido y en tres dias nadie leeria los avisos.
    assert.deepEqual(H.serviciosSinCubrir([
      { hora_inicio: '12:00', hora_fin: '17:00' },
      { hora_inicio: '19:00', hora_fin: '23:00' },
    ], COCINA), [])
  })

  await t.test('sin horario de cocina guardado no se inventa ningun hueco', () => {
    assert.deepEqual(H.serviciosSinCubrir([], ''), [])
  })
})

// ---------------------------------------------------------------------------
test('horasPorEmpleado: el resumen del mes', async (t) => {
  const fichajes = [
    { empleado: 'a', entrada: '2026-09-01 08:00:00.000Z', salida: '2026-09-01 16:00:00.000Z' },
    { empleado: 'a', entrada: '2026-09-02 08:00:00.000Z', salida: '2026-09-02 12:30:00.000Z' },
    { empleado: 'a', entrada: '2026-09-03 08:00:00.000Z', salida: '' },
    { empleado: 'b', entrada: '2026-09-01 17:00:00.000Z', salida: '2026-09-01 23:00:00.000Z' },
  ]

  await t.test('suma las jornadas cerradas de cada uno', () => {
    const suma = H.horasPorEmpleado(fichajes)
    assert.equal(suma.get('a').minutos, 8 * 60 + 4 * 60 + 30)
    assert.equal(suma.get('a').jornadas, 2)
    assert.equal(suma.get('b').minutos, 6 * 60)
  })

  await t.test('las abiertas se cuentan aparte y NO suman como cero', () => {
    const suma = H.horasPorEmpleado(fichajes)
    assert.equal(suma.get('a').abiertos, 1)
    assert.equal(suma.get('b').abiertos, 0)
  })

  await t.test('sin fichajes, ni una fila', () => {
    assert.equal(H.horasPorEmpleado([]).size, 0)
  })
})

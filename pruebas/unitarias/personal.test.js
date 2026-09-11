/**
 * Pruebas unitarias de la logica de personal
 * ===========================================================================
 * Control horario: de quien es un fichaje, que cuenta como correccion y que es
 * un turno valido. Es la logica que impide que alguien fiche por un companero
 * que todavia no ha llegado y la que decide cuando hay que firmar un cambio de
 * horas (seccion 7 del encargo).
 *
 * Se ejecutan con  ./pruebas/unitarias.sh  (node en contenedor, sin instalar
 * nada en el host y sin dependencias: solo node:test, que viene de serie).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const P = require('../../pb_hooks/lib/personal.js')

// ===========================================================================
describe('esMando', () => {
  test('dueño y encargado mandan; cocina y empleado, no', () => {
    assert.equal(P.esMando('dueno'), true)
    assert.equal(P.esMando('encargado'), true)
    assert.equal(P.esMando('cocina'), false)
    assert.equal(P.esMando('empleado'), false)
    assert.equal(P.esMando(''), false)
    assert.equal(P.esMando(undefined), false)
  })
})

// ===========================================================================
describe('empleadoQueFicha', () => {
  test('sin decir nada, se ficha uno mismo', () => {
    const r = P.empleadoQueFicha({ pedido: '', propio: 'emp1', rol: 'empleado' })
    assert.equal(r.empleado, 'emp1')
    assert.equal(r.error, undefined)
  })

  test('pedir el propio explicitamente tambien vale', () => {
    const r = P.empleadoQueFicha({ pedido: 'emp1', propio: 'emp1', rol: 'cocina' })
    assert.equal(r.empleado, 'emp1')
  })

  test('NADIE FICHA POR OTRO', () => {
    // Es la comprobacion que da sentido al fichero: la regla de la coleccion
    // solo puede exigir sesion, no sabe comparar el empleado del cuerpo con el
    // de quien manda la peticion.
    const r = P.empleadoQueFicha({ pedido: 'emp2', propio: 'emp1', rol: 'empleado' })
    assert.equal(r.empleado, undefined)
    assert.match(r.error, /Solo puedes fichar por ti/)
  })

  test('una cuenta sin ficha de empleado no ficha', () => {
    const r = P.empleadoQueFicha({ pedido: '', propio: '', rol: 'cocina' })
    assert.equal(r.empleado, undefined)
    assert.match(r.error, /no está ligada/)
  })

  test('el encargado SI ficha por otro: arregla el olvido de ayer', () => {
    const r = P.empleadoQueFicha({ pedido: 'emp2', propio: 'emp1', rol: 'encargado' })
    assert.equal(r.empleado, 'emp2')
  })

  test('el dueño sin ficha propia puede fichar por otro, pero no por nadie', () => {
    assert.equal(P.empleadoQueFicha({ pedido: 'emp2', propio: '', rol: 'dueno' }).empleado, 'emp2')
    assert.match(P.empleadoQueFicha({ pedido: '', propio: '', rol: 'dueno' }).error, /de quién/)
  })
})

// ===========================================================================
describe('esCorreccion', () => {
  const entrada = '2026-09-03 08:00:00.000Z'
  const salida = '2026-09-03 16:00:00.000Z'

  test('CERRAR UN FICHAJE ABIERTO NO ES CORREGIR', () => {
    // Es el gesto de cada dia: se llega, se ficha, y al irse a casa se cierra.
    // Si esto contara como correccion, nadie podria fichar su propia salida.
    assert.equal(P.esCorreccion({
      entradaAntes: entrada, salidaAntes: '',
      entradaAhora: entrada, salidaAhora: salida,
    }), false)
  })

  test('no tocar nada tampoco es corregir', () => {
    assert.equal(P.esCorreccion({
      entradaAntes: entrada, salidaAntes: salida,
      entradaAhora: entrada, salidaAhora: salida,
    }), false)
  })

  test('mover la entrada es corregir', () => {
    assert.equal(P.esCorreccion({
      entradaAntes: entrada, salidaAntes: '',
      entradaAhora: '2026-09-03 07:50:00.000Z', salidaAhora: '',
    }), true)
  })

  test('cambiar una salida que ya estaba puesta es corregir', () => {
    assert.equal(P.esCorreccion({
      entradaAntes: entrada, salidaAntes: salida,
      entradaAhora: entrada, salidaAhora: '2026-09-03 17:30:00.000Z',
    }), true)
  })

  test('volver a abrir un fichaje cerrado es corregir', () => {
    assert.equal(P.esCorreccion({
      entradaAntes: entrada, salidaAntes: salida,
      entradaAhora: entrada, salidaAhora: '',
    }), true)
  })
})

// ===========================================================================
describe('ordenValido', () => {
  test('un fichaje sin salida vale: es quien sigue dentro', () => {
    assert.equal(P.ordenValido('2026-09-03 08:00:00.000Z', ''), true)
    assert.equal(P.ordenValido('2026-09-03 08:00:00.000Z', null), true)
  })

  test('la salida va despues de la entrada', () => {
    assert.equal(P.ordenValido('2026-09-03 08:00:00.000Z', '2026-09-03 16:00:00.000Z'), true)
    assert.equal(P.ordenValido('2026-09-03 08:00:00.000Z', '2026-09-03 07:00:00.000Z'), false)
  })

  test('una jornada de cero minutos es un error de tecleo', () => {
    assert.equal(P.ordenValido('2026-09-03 08:00:00.000Z', '2026-09-03 08:00:00.000Z'), false)
  })

  test('el turno de noche cruza la medianoche sin problema', () => {
    assert.equal(P.ordenValido('2026-09-03 19:00:00.000Z', '2026-09-04 02:30:00.000Z'), true)
  })

  test('una fecha ilegible no cuela', () => {
    assert.equal(P.ordenValido('ayer por la tarde', '2026-09-03 16:00:00.000Z'), false)
  })
})

// ===========================================================================
describe('minutosDeTurno', () => {
  test('un turno normal', () => {
    assert.equal(P.minutosDeTurno('08:00', '16:00'), 480)
    assert.equal(P.minutosDeTurno('12:00', '17:00'), 300)
  })

  test('EL TURNO DE NOCHE CRUZA LA MEDIANOCHE', () => {
    // Las horas del cuadrante son texto HH:MM, no fecha-hora: un turno es de un
    // dia. Que acabe "antes" de empezar no es un error, es el cierre.
    assert.equal(P.minutosDeTurno('19:00', '02:30'), 450)
    assert.equal(P.minutosDeTurno('16:00', '00:30'), 510)
  })

  test('empezar y acabar a la misma hora no es un turno', () => {
    assert.equal(P.minutosDeTurno('08:00', '08:00'), 0)
  })

  test('una hora que no encaja da cero, que es lo que se rechaza', () => {
    assert.equal(P.minutosDeTurno('25:00', '02:00'), 0)
    assert.equal(P.minutosDeTurno('8:00', '16:00'), 0)
    assert.equal(P.minutosDeTurno('', ''), 0)
  })
})

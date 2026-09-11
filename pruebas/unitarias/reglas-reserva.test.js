/**
 * Pruebas unitarias de las reglas de reserva
 * ===========================================================================
 * Seccion 14 del encargo: "Unitarias: reglas de aforo y disponibilidad [...] y
 * generacion del codigo de reserva".
 *
 * Se ejecutan con  ./pruebas/unitarias.sh  (node en contenedor, sin instalar
 * nada en el host y sin dependencias: solo node:test, que viene de serie).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const R = require('../../pb_hooks/lib/reglas-reserva.js')

// Ajustes de referencia: dos servicios de cocina, mesa de 90 minutos y aforos
// pequenos para que los casos limite se vean a simple vista.
const AJUSTES = {
  horario_cocina: '12:30-16:30,20:00-23:30',
  duracion_mesa_min: 90,
  antelacion_maxima_dias: 30,
  aforo_barra: 6,
  aforo_terraza: 20,
  aforo_salon: 24,
}

const reserva = (hora, comensales, zona, estado = 'confirmada') =>
  ({ hora, comensales, zona, estado })

// ===========================================================================
describe('horas', () => {
  test('convierte ida y vuelta', () => {
    assert.equal(R.aMinutos('21:30'), 1290)
    assert.equal(R.aMinutos('00:00'), 0)
    assert.equal(R.aHora(1290), '21:30')
    assert.equal(R.aHora(0), '00:00')
  })

  test('rechaza horas imposibles', () => {
    assert.equal(R.aMinutos('25:00'), null)
    assert.equal(R.aMinutos('12:75'), null)
    assert.equal(R.aMinutos('mediodia'), null)
    assert.equal(R.aMinutos(''), null)
  })
})

// ===========================================================================
describe('franjas de cocina', () => {
  test('un solo tramo, cada 30 minutos', () => {
    assert.deepEqual(R.franjasDelDia('13:00-15:00'), ['13:00', '13:30', '14:00', '14:30'])
  })

  test('no se sienta a nadie A LA HORA de cerrar la cocina', () => {
    // Cocina hasta las 15:00: a las 14:30 si se puede reservar (te sientas y
    // pides antes de que cierren), a las 15:00 ya no.
    const f = R.franjasDelDia('13:00-15:00')
    assert.ok(!f.includes('15:00'), 'no debe ofrecer la hora de cierre')
    assert.equal(f[f.length - 1], '14:30')
  })

  test('dos servicios: comida y cena, sin franjas en medio', () => {
    const f = R.franjasDelDia(AJUSTES.horario_cocina)
    assert.ok(f.includes('12:30') && f.includes('15:30'), 'debe cubrir la comida')
    assert.ok(f.includes('20:00') && f.includes('22:30'), 'debe cubrir la cena')
    assert.ok(!f.includes('18:00'), 'no debe ofrecer las 18:00, con la cocina cerrada')
  })

  test('un tramo que cruza medianoche se entiende', () => {
    const f = R.franjasDelDia('23:00-01:00')
    assert.deepEqual(f, ['23:00', '23:30', '00:00', '00:30'])
  })

  test('un horario ilegible no revienta: devuelve lista vacia', () => {
    assert.deepEqual(R.franjasDelDia('a ratos'), [])
    assert.deepEqual(R.franjasDelDia(''), [])
    assert.deepEqual(R.franjasDelDia(null), [])
  })
})

// ===========================================================================
describe('solapamiento', () => {
  test('dos mesas a la misma hora se pisan', () => {
    assert.equal(R.seSolapan(1260, 1260, 90), true)
  })

  test('una mesa que entra antes de que la anterior termine se pisa', () => {
    // 21:00 + 90 min = 22:30. Una a las 22:00 se pisa.
    assert.equal(R.seSolapan(1260, 1320, 90), true)
  })

  test('justo cuando termina la anterior, ya no se pisa', () => {
    // 21:00 + 90 = 22:30 exactas: la mesa queda libre.
    assert.equal(R.seSolapan(1260, 1350, 90), false)
  })
})

// ===========================================================================
describe('ocupacion', () => {
  const reservas = [
    reserva('21:00', 4, 'terraza'),
    reserva('21:30', 2, 'terraza'),
    reserva('21:00', 6, 'salon'),
    reserva('21:00', 3, 'indiferente'),
    reserva('13:00', 8, 'terraza'),          // otro servicio, no se pisa
    reserva('21:00', 10, 'terraza', 'cancelada'),  // no ocupa
    reserva('21:00', 10, 'terraza', 'no_vino'),    // no ocupa
  ]

  test('suma solo lo que se pisa y esta vivo', () => {
    const o = R.ocupacion(reservas, R.aMinutos('21:00'), 90)
    assert.equal(o.porZona.terraza, 6, '4 + 2, sin la cancelada ni el no_vino')
    assert.equal(o.porZona.salon, 6)
    assert.equal(o.total, 15, '6 terraza + 6 salon + 3 indiferente')
  })

  test('una cancelada libera la mesa', () => {
    const con = R.ocupacion([reserva('21:00', 8, 'salon', 'confirmada')], 1260, 90)
    const sin = R.ocupacion([reserva('21:00', 8, 'salon', 'cancelada')], 1260, 90)
    assert.equal(con.total, 8)
    assert.equal(sin.total, 0)
  })

  test('"indiferente" cuenta en el total pero no en ninguna zona', () => {
    const o = R.ocupacion([reserva('21:00', 5, 'indiferente')], 1260, 90)
    assert.equal(o.total, 5)
    assert.equal(o.porZona.terraza, 0)
    assert.equal(o.porZona.salon, 0)
  })

  test('el otro servicio no ocupa', () => {
    const o = R.ocupacion(reservas, R.aMinutos('13:00'), 90)
    assert.equal(o.porZona.terraza, 8)
  })
})

// ===========================================================================
describe('aforo', () => {
  const cabe = (opts) => R.cabe({ ajustes: AJUSTES, reservasDelDia: [], ...opts })

  test('en un bar vacio cabe todo el mundo', () => {
    assert.equal(cabe({ hora: '21:00', zona: 'terraza', comensales: 4 }).cabe, true)
  })

  test('justo hasta el aforo de la zona, si', () => {
    const r = cabe({
      hora: '21:00', zona: 'terraza', comensales: 4,
      reservasDelDia: [reserva('21:00', 16, 'terraza')],
    })
    assert.equal(r.cabe, true, '16 + 4 = 20, que es el aforo exacto de terraza')
  })

  test('una persona mas que el aforo de la zona, no', () => {
    const r = cabe({
      hora: '21:00', zona: 'terraza', comensales: 5,
      reservasDelDia: [reserva('21:00', 16, 'terraza')],
    })
    assert.equal(r.cabe, false)
    assert.equal(r.motivo, 'zona_llena')
  })

  test('la terraza llena no impide reservar en el salon', () => {
    const llena = [reserva('21:00', 20, 'terraza')]
    assert.equal(cabe({ hora: '21:00', zona: 'terraza', comensales: 2, reservasDelDia: llena }).cabe, false)
    assert.equal(cabe({ hora: '21:00', zona: 'salon', comensales: 2, reservasDelDia: llena }).cabe, true)
  })

  test('con el bar entero lleno no cabe ni en una zona con hueco', () => {
    // 6 + 20 + 24 = 50 de aforo total. 48 "indiferente" dejan 2.
    const r = cabe({
      hora: '21:00', zona: 'salon', comensales: 4,
      reservasDelDia: [reserva('21:00', 48, 'indiferente')],
    })
    assert.equal(r.cabe, false)
    assert.equal(r.motivo, 'bar_lleno')
  })

  test('una zona con aforo 0 no se ofrece', () => {
    const sinBarra = { ...AJUSTES, aforo_barra: 0 }
    const r = R.cabe({ ajustes: sinBarra, reservasDelDia: [], hora: '21:00', zona: 'barra', comensales: 2 })
    assert.equal(r.cabe, false)
    assert.equal(r.motivo, 'zona_no_disponible')
  })

  test('sin ningun aforo configurado no se acepta nada', () => {
    const recien = { ...AJUSTES, aforo_barra: 0, aforo_terraza: 0, aforo_salon: 0 }
    const r = R.cabe({ ajustes: recien, reservasDelDia: [], hora: '21:00', zona: 'indiferente', comensales: 2 })
    assert.equal(r.cabe, false)
    assert.equal(r.motivo, 'sin_aforo_configurado')
  })

  test('la mesa anterior sigue ocupando aunque la hora no coincida', () => {
    // Mesa de 90 min a las 21:00 ocupa hasta las 22:30.
    const r = cabe({
      hora: '22:00', zona: 'terraza', comensales: 4,
      reservasDelDia: [reserva('21:00', 18, 'terraza')],
    })
    assert.equal(r.cabe, false, '18 + 4 pasa de 20 y las mesas se pisan')
  })

  test('cuando la mesa anterior ya ha terminado, se libera', () => {
    const r = cabe({
      hora: '22:30', zona: 'terraza', comensales: 4,
      reservasDelDia: [reserva('21:00', 18, 'terraza')],
    })
    assert.equal(r.cabe, true)
  })

  test('la duracion de mesa es configurable y cambia el resultado', () => {
    const corta = { ...AJUSTES, duracion_mesa_min: 60 }
    const previa = [reserva('21:00', 18, 'terraza')]
    assert.equal(R.cabe({ ajustes: AJUSTES, reservasDelDia: previa, hora: '22:00', zona: 'terraza', comensales: 4 }).cabe, false)
    assert.equal(R.cabe({ ajustes: corta,   reservasDelDia: previa, hora: '22:00', zona: 'terraza', comensales: 4 }).cabe, true)
  })
})

// ===========================================================================
describe('franjas con estado', () => {
  // Una hora fija para que la prueba no dependa de cuando se ejecute.
  const AHORA = new Date(2026, 8, 1, 10, 0, 0)   // 1 sept 2026, 10:00
  const HOY = '2026-09-01'

  test('devuelve todas las franjas, las llenas TACHADAS y no escondidas', () => {
    const f = R.franjasConEstado({
      reservasDelDia: [reserva('21:00', 50, 'indiferente')],
      zona: 'terraza', comensales: 4, ajustes: AJUSTES, ahora: AHORA, fecha: HOY,
    })
    const todas = R.franjasDelDia(AJUSTES.horario_cocina)
    assert.equal(f.length, todas.length, 'no se pierde ninguna franja')

    const alas21 = f.find((x) => x.hora === '21:00')
    assert.equal(alas21.libre, false)
    assert.equal(alas21.motivo, 'bar_lleno')
  })

  test('las franjas ya pasadas salen marcadas', () => {
    const tarde = new Date(2026, 8, 1, 21, 15, 0)
    const f = R.franjasConEstado({
      reservasDelDia: [], zona: 'indiferente', comensales: 2,
      ajustes: AJUSTES, ahora: tarde, fecha: HOY,
    })
    assert.equal(f.find((x) => x.hora === '13:00').libre, false)
    assert.equal(f.find((x) => x.hora === '13:00').motivo, 'pasada')
    assert.equal(f.find((x) => x.hora === '22:30').libre, true)
  })
})

// ===========================================================================
describe('antelacion', () => {
  const AHORA = new Date(2026, 8, 1, 20, 0, 0)   // 1 sept 2026, 20:00

  test('menos de 30 minutos, no', () => {
    assert.equal(R.esDemasiadoTarde({ fecha: '2026-09-01', hora: '20:20', ahora: AHORA }), true)
  })

  test('justo 30 minutos, si', () => {
    assert.equal(R.esDemasiadoTarde({ fecha: '2026-09-01', hora: '20:30', ahora: AHORA }), false)
  })

  test('ayer, no', () => {
    assert.equal(R.esDemasiadoTarde({ fecha: '2026-08-31', hora: '21:00', ahora: AHORA }), true)
  })

  test('mas alla de la antelacion maxima, no', () => {
    const a = { ...AJUSTES, antelacion_maxima_dias: 7 }
    assert.equal(R.esDemasiadoPronto({ fecha: '2026-09-05', ajustes: a, ahora: AHORA }), false)
    assert.equal(R.esDemasiadoPronto({ fecha: '2026-09-20', ajustes: a, ahora: AHORA }), true)
  })

  test('el ultimo dia permitido entra', () => {
    const a = { ...AJUSTES, antelacion_maxima_dias: 7 }
    assert.equal(R.esDemasiadoPronto({ fecha: '2026-09-08', ajustes: a, ahora: AHORA }), false)
  })
})

// ===========================================================================
describe('telefono espanol', () => {
  test('acepta moviles y fijos, con o sin adornos', () => {
    assert.equal(R.normalizarTelefono('600123456'), '600123456')
    assert.equal(R.normalizarTelefono('912881027'), '912881027')
    assert.equal(R.normalizarTelefono('91 288 10 27'), '912881027')
    assert.equal(R.normalizarTelefono('+34 600 12 34 56'), '600123456')
    assert.equal(R.normalizarTelefono('0034600123456'), '600123456')
    assert.equal(R.normalizarTelefono('600-12-34-56'), '600123456')
    assert.equal(R.normalizarTelefono('700123456'), '700123456')
  })

  test('rechaza lo que no es un telefono espanol', () => {
    assert.equal(R.normalizarTelefono('12345'), null, 'demasiado corto')
    assert.equal(R.normalizarTelefono('500123456'), null, 'no empieza por 6,7,8 ni 9')
    assert.equal(R.normalizarTelefono('6001234567'), null, 'demasiado largo')
    assert.equal(R.normalizarTelefono('+33600123456'), null, 'prefijo frances')
    assert.equal(R.normalizarTelefono('no tengo'), null)
    assert.equal(R.normalizarTelefono(''), null)
  })
})

// ===========================================================================
describe('codigo de reserva', () => {
  test('tiene el formato RQ-XXXX', () => {
    for (let i = 0; i < 200; i++) {
      assert.match(R.generarCodigo(), /^RQ-[A-Z0-9]{4}$/)
    }
  })

  test('NO lleva caracteres ambiguos', () => {
    // Se dice por telefono y se apunta a mano: O/0, I/1/L y U/V se confunden.
    for (const malo of ['O', '0', 'I', '1', 'L', 'U', 'V']) {
      assert.ok(!R.ALFABETO_CODIGO.includes(malo), `el alfabeto no debe llevar "${malo}"`)
    }
    let todos = ''
    for (let i = 0; i < 500; i++) todos += R.generarCodigo().slice(3)
    for (const malo of ['O', '0', 'I', '1', 'L', 'U', 'V']) {
      assert.ok(!todos.includes(malo), `no debe salir "${malo}" en 500 codigos`)
    }
  })

  test('reparte: no siempre el mismo', () => {
    const vistos = new Set()
    for (let i = 0; i < 500; i++) vistos.add(R.generarCodigo())
    assert.ok(vistos.size > 450, `demasiadas repeticiones: ${vistos.size} de 500`)
  })

  test('con un azar controlado es reproducible', () => {
    const fijo = () => 0
    assert.equal(R.generarCodigo(fijo), 'RQ-AAAA')
  })

  test('el token de cancelacion es largo y no se repite', () => {
    const t = R.generarToken()
    assert.match(t, /^[a-z0-9]{32}$/)
    const vistos = new Set()
    for (let i = 0; i < 200; i++) vistos.add(R.generarToken())
    assert.equal(vistos.size, 200)
  })
})

// ===========================================================================
describe('zonas ofrecidas', () => {
  test('solo las que tienen aforo', () => {
    assert.deepEqual(R.zonasDisponibles(AJUSTES), ['barra', 'terraza', 'salon', 'indiferente'])
    assert.deepEqual(
      R.zonasDisponibles({ ...AJUSTES, aforo_barra: 0 }),
      ['terraza', 'salon', 'indiferente'])
  })

  test('sin ningun aforo, ninguna', () => {
    assert.deepEqual(
      R.zonasDisponibles({ aforo_barra: 0, aforo_terraza: 0, aforo_salon: 0 }), [])
  })
})

// ===========================================================================
describe('antibot: limite de intentos', () => {
  const AHORA = 1_000_000_000_000

  test('deja pasar hasta el maximo', () => {
    let marcas = []
    for (let i = 0; i < R.MAX_RESERVAS_POR_IP; i++) {
      const r = R.contarIntento(marcas, AHORA)
      marcas = r.marcas
      assert.equal(r.demasiados, false, `el intento ${i + 1} deberia pasar`)
    }
  })

  test('corta en el siguiente', () => {
    let marcas = []
    for (let i = 0; i < R.MAX_RESERVAS_POR_IP; i++) marcas = R.contarIntento(marcas, AHORA).marcas
    assert.equal(R.contarIntento(marcas, AHORA).demasiados, true)
  })

  test('los intentos viejos caducan', () => {
    let marcas = []
    for (let i = 0; i < R.MAX_RESERVAS_POR_IP; i++) marcas = R.contarIntento(marcas, AHORA).marcas
    // Una hora y un minuto despues, el contador esta limpio.
    const despues = R.contarIntento(marcas, AHORA + R.VENTANA_LIMITE_MS + 60000)
    assert.equal(despues.demasiados, false)
    assert.equal(despues.marcas.length, 1, 'solo queda el intento nuevo')
  })

  test('el maximo se puede ajustar', () => {
    let marcas = []
    for (let i = 0; i < 3; i++) marcas = R.contarIntento(marcas, AHORA, 3).marcas
    assert.equal(R.contarIntento(marcas, AHORA, 3).demasiados, true)
    assert.equal(R.contarIntento(marcas, AHORA, 99).demasiados, false)
  })
})

// ---------------------------------------------------------------------------
// El horario del bar recorta las franjas de reserva
// ---------------------------------------------------------------------------
// Es la COPIA de compartido/js/horario.js que vive en el hook (dos runtimes,
// dos modulos). Las dos tienen que decir lo mismo, y por eso se prueban las dos.
test('barAbierto: la apertura del bar, del lado del servidor', async (t) => {
  const ABRE = { abre: '08:00', cierra: '00:00' }
  const BAR = { horario_semanal: [ABRE, ABRE, ABRE, ABRE, ABRE, ABRE, ABRE] }

  await t.test('dentro del horario, si', () => {
    assert.equal(R.barAbierto(BAR, '2026-09-10', '14:00'), true)
    assert.equal(R.barAbierto(BAR, '2026-09-10', '23:30'), true)
  })

  await t.test('antes de abrir, no', () => {
    assert.equal(R.barAbierto(BAR, '2026-09-10', '07:00'), false)
  })

  await t.test('cerrar a las 00:00 son dieciseis horas, no cero', () => {
    assert.equal(R.barAbierto(BAR, '2026-09-10', '08:00'), true)
    assert.equal(R.barAbierto(BAR, '2026-09-10', '00:00'), false)
  })

  await t.test('un dia que el bar no abre', () => {
    const sinLunes = { horario_semanal: [ABRE, null, ABRE, ABRE, ABRE, ABRE, ABRE] }
    assert.equal(R.barAbierto(sinLunes, '2026-09-07', '14:00'), false)  // lunes
    assert.equal(R.barAbierto(sinLunes, '2026-09-08', '14:00'), true)   // martes
  })

  await t.test('un cierre puntual no deja ninguna franja', () => {
    const navidad = { ...BAR, cierre_desde: '2026-12-24 00:00:00.000Z', cierre_hasta: '2026-12-26 00:00:00.000Z' }
    assert.equal(R.barAbierto(navidad, '2026-12-25', '14:00'), false)
    assert.equal(R.barAbierto(navidad, '2026-12-27', '14:00'), true)
  })

  await t.test('sin horario configurado no se estorba a nadie', () => {
    assert.equal(R.barAbierto({}, '2026-09-10', '14:00'), true)
  })
})

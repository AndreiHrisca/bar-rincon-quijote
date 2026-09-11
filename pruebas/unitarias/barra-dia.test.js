/**
 * Pruebas de la barra de un dia — panel/js/horas.js (parte de tramos)
 * ===========================================================================
 * La pieza que pinta (panel/js/piezas/barra-dia.js) no hace cuentas: recibe
 * tramos ya calculados y los convierte en porcentajes. Todo lo que se puede
 * equivocar —la duracion, el cruce de medianoche, el turno partido, el turno
 * sin cerrar— vive aqui y se prueba aqui.
 *
 * LOS SEIS CASOS DEL ENCARGO estan al final, cada uno con su salida esperada
 * escrita al lado. Si alguno deja de pasar, es que la barra miente.
 *
 * Zona horaria fijada a Madrid ANTES de cargar el modulo: un fichaje es un
 * instante de verdad y en UTC las horas salen corridas.
 */

process.env.TZ = 'Europe/Madrid'

const test = require('node:test')
const assert = require('node:assert')

let H

test.before(async () => {
  H = await import('../../panel/js/horas.js')
})

/** Atajo: un fichaje de PocketBase, con las horas dichas en hora de Madrid. */
function fichaje(entradaLocal, salidaLocal) {
  const aPB = (s) => (s ? new Date(s).toISOString().replace('T', ' ').replace('Z', 'Z') : '')
  return { entrada: aPB(entradaLocal), salida: aPB(salidaLocal) }
}

// ---------------------------------------------------------------------------
test('tramoDeTurno: del cuadrante a tramo', async (t) => {
  await t.test('un turno de manana', () => {
    assert.deepEqual(H.tramoDeTurno({ hora_inicio: '08:00', hora_fin: '16:00' }),
      { inicio: 480, fin: 960 })
  })

  await t.test('el de cierre pasa de 1440 en vez de volver al principio', () => {
    assert.deepEqual(H.tramoDeTurno({ hora_inicio: '16:00', hora_fin: '00:30' }),
      { inicio: 960, fin: 1470 })
  })

  await t.test('una hora que no encaja no da un tramo', () => {
    assert.equal(H.tramoDeTurno({ hora_inicio: '', hora_fin: '16:00' }), null)
  })
})

// ---------------------------------------------------------------------------
test('tramoDeFichaje: de los instantes a tramo', async (t) => {
  await t.test('una jornada normal', () => {
    assert.deepEqual(H.tramoDeFichaje(fichaje('2026-09-01T09:00', '2026-09-01T17:00')),
      { inicio: 540, fin: 1020 })
  })

  await t.test('la salida de madrugada se imputa al dia de entrada', () => {
    assert.deepEqual(H.tramoDeFichaje(fichaje('2026-09-01T16:00', '2026-09-02T00:30')),
      { inicio: 960, fin: 1470 })
  })

  await t.test('sin salida, el final es null y no cero', () => {
    assert.deepEqual(H.tramoDeFichaje(fichaje('2026-09-01T09:00', null)),
      { inicio: 540, fin: null })
  })
})

// ---------------------------------------------------------------------------
test('haySolape: dos tramos que se pisan', async (t) => {
  await t.test('un turno partido de verdad no se pisa', () => {
    assert.equal(H.haySolape([{ inicio: 480, fin: 780 }, { inicio: 1020, fin: 1200 }]), false)
  })

  await t.test('pegados no es pisarse', () => {
    assert.equal(H.haySolape([{ inicio: 480, fin: 960 }, { inicio: 960, fin: 1200 }]), false)
  })

  await t.test('entrar otra vez sin haber salido si se pisa', () => {
    assert.equal(H.haySolape([{ inicio: 480, fin: null }, { inicio: 1020, fin: 1200 }]), true)
  })
})

// ---------------------------------------------------------------------------
test('colocarTramo: de minutos a porcentaje del eje', async (t) => {
  const dia = { inicioEje: 0, finEje: 24 }
  const casi = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`)

  await t.test('08:00–16:00 en el eje del dia entero', () => {
    const p = H.colocarTramo({ inicio: 480, fin: 960 }, dia)
    casi(p.izquierda, 33.33); casi(p.ancho, 33.33)
    assert.equal(p.cortaDerecha, false)
  })

  await t.test('el que cruza la medianoche se corta en el borde', () => {
    const p = H.colocarTramo({ inicio: 960, fin: 1470 }, dia)
    casi(p.izquierda, 66.67); casi(p.ancho, 33.33)
    assert.equal(p.cortaDerecha, true)
  })

  await t.test('el abierto llega al final del eje sin cortarlo', () => {
    const p = H.colocarTramo({ inicio: 540, fin: null }, dia)
    casi(p.izquierda, 37.5); casi(p.ancho, 62.5)
    assert.equal(p.cortaDerecha, false)
  })

  await t.test('con la ventana recortada a 08:00–24:00, lo mismo cae en otro sitio', () => {
    const p = H.colocarTramo({ inicio: 480, fin: 960 }, { inicioEje: 8, finEje: 24 })
    casi(p.izquierda, 0); casi(p.ancho, 50)
  })

  await t.test('lo que empieza antes de la ventana se corta por la izquierda', () => {
    const p = H.colocarTramo({ inicio: 300, fin: 600 }, { inicioEje: 8, finEje: 24 })
    casi(p.izquierda, 0); casi(p.ancho, 12.5)
    assert.equal(p.cortaIzquierda, true)
  })

  await t.test('el que acaba a las 00:00 clavadas tambien se corta en el borde', () => {
    const p = H.colocarTramo({ inicio: 1200, fin: 1440 }, dia)
    casi(p.izquierda, 83.33); casi(p.ancho, 16.67)
    assert.equal(p.cortaDerecha, true)
  })

  await t.test('el abierto NO se cuadra: ya se distingue por el rayado', () => {
    const p = H.colocarTramo({ inicio: 540, fin: null }, dia)
    assert.equal(p.cortaDerecha, false)
    assert.equal(p.cortaIzquierda, false)
  })

  await t.test('lo que cae entero fuera no se pinta', () => {
    assert.equal(H.colocarTramo({ inicio: 60, fin: 180 }, { inicioEje: 8, finEje: 24 }), null)
  })
})

// ---------------------------------------------------------------------------
test('huecosDeTramos: lo que no cubre nadie', async (t) => {
  // La franja del bar, de 08:00 a 00:00.
  const bar = { desde: 480, hasta: 1440 }

  await t.test('el dia cubierto de punta a punta no tiene huecos', () => {
    assert.deepEqual(H.huecosDeTramos([
      { inicio: 480, fin: 960 }, { inicio: 960, fin: 1440 },
    ], bar), [])
  })

  await t.test('los huecos del lunes de la maqueta', () => {
    assert.deepEqual(H.huecosDeTramos([
      { inicio: 480, fin: 960 },    // Santi   08:00–16:00
      { inicio: 720, fin: 960 },    // Génesis 12:00–16:00
      { inicio: 1020, fin: 1200 },  // Carmen  17:00–20:00
    ], bar), [
      { inicio: 960, fin: 1020 },   // 16:00–17:00
      { inicio: 1200, fin: 1440 },  // 20:00–00:00
    ])
  })

  await t.test('un turno abierto tapa hasta el final: no hay hueco que reclamar', () => {
    assert.deepEqual(H.huecosDeTramos([{ inicio: 480, fin: null }], bar), [])
  })

  await t.test('sin nadie, el hueco es la franja entera', () => {
    assert.deepEqual(H.huecosDeTramos([], bar), [{ inicio: 480, fin: 1440 }])
  })
})

// ---------------------------------------------------------------------------
test('huecosDelDia: los huecos del cuadrante, contra el horario de cocina', async (t) => {
  const COCINA = '12:30-16:30,20:00-23:30'

  await t.test('el dia cubierto no tiene huecos', () => {
    assert.deepEqual(H.huecosDelDia([
      { inicio: 480, fin: 960 },    // 08:00–16:00
      { inicio: 960, fin: 1470 },   // 16:00–00:30
    ], COCINA), [])
  })

  await t.test('sin nadie por la noche, la cena entera es un hueco', () => {
    assert.deepEqual(H.huecosDelDia([
      { inicio: 480, fin: 960 },    // 08:00–16:00
      { inicio: 1020, fin: 1200 },  // 17:00–20:00
    ], COCINA), [
      { inicio: 1200, fin: 1410 },  // 20:00–23:30
    ])
  })

  await t.test('irse a las 23:00 con la cocina hasta las 23:30 NO es un hueco', () => {
    // Media hora clavada al final del servicio es el final del servicio, no un
    // descubierto. Cantarlo todos los dias seria ruido.
    assert.deepEqual(H.huecosDelDia([{ inicio: 480, fin: 1380 }], COCINA), [])
  })

  await t.test('una hora en medio SI es un hueco', () => {
    assert.deepEqual(H.huecosDelDia([
      { inicio: 480, fin: 780 },    // 08:00–13:00
      { inicio: 1020, fin: 1440 },  // 17:00–00:00
    ], COCINA), [
      { inicio: 780, fin: 990 },    // 13:00–16:30
    ])
  })

  await t.test('sin nadie en todo el dia, un hueco por servicio', () => {
    assert.deepEqual(H.huecosDelDia([], COCINA), [
      { inicio: 750, fin: 990 },    // 12:30–16:30
      { inicio: 1200, fin: 1410 },  // 20:00–23:30
    ])
  })

  await t.test('sin horario de cocina no se inventa ningun hueco', () => {
    assert.deepEqual(H.huecosDelDia([], ''), [])
  })
})

// ===========================================================================
// LOS SEIS CASOS DEL ENCARGO
// ===========================================================================
test('los seis casos de la barra de un dia', async (t) => {

  await t.test('1. turno normal 08:00–16:00 -> 8 h 00, un tramo', () => {
    const r = H.resumenDeFila([H.tramoDeFichaje(fichaje('2026-09-01T08:00', '2026-09-01T16:00'))])
    assert.equal(r.tramos.length, 1)
    assert.equal(r.minutos, 480)
    assert.equal(H.enHoras(r.minutos), '8 h')
    assert.equal(r.abierta, false)
    assert.equal(r.cruza, false)
    assert.equal(H.rangoDeTramos(r.tramos), '08:00–16:00')
    assert.equal(H.etiquetaDeFila('Santi', r), 'Santi, de 08:00 a 16:00, 8 horas')
  })

  await t.test('2. nocturno 16:00–00:30 -> 8 h 30 al dia de entrada, marcado como cruce', () => {
    const r = H.resumenDeFila([H.tramoDeFichaje(fichaje('2026-09-01T16:00', '2026-09-02T00:30'))])
    assert.equal(r.tramos.length, 1)
    assert.equal(r.minutos, 510)
    assert.equal(H.enHoras(r.minutos), '8 h 30')
    assert.equal(r.cruza, true)
    assert.equal(r.abierta, false)
    // El fin pasa de 1440: la jornada NO se parte entre dos dias.
    assert.equal(r.tramos[0].fin, 1470)
    assert.equal(H.rangoDeTramos(r.tramos), '16:00–00:30')
    assert.equal(H.etiquetaDeFila('Kevin', r),
      'Kevin, de 16:00 a 00:30 del día siguiente, 8 horas y 30 minutos')
  })

  await t.test('3. turno abierto 09:00– -> sin duracion, marcado como abierto', () => {
    const r = H.resumenDeFila([H.tramoDeFichaje(fichaje('2026-09-01T09:00', null))])
    assert.equal(r.tramos.length, 1)
    assert.equal(r.abierta, true)
    assert.equal(r.minutos, 0)      // cero cerrado, no cero trabajado
    assert.equal(r.parcial, false)  // no hay nada que dar por parcial
    assert.equal(r.cruza, false)
    assert.equal(H.rangoDeTramos(r.tramos), '09:00 – sin salida')
    assert.equal(H.etiquetaDeFila('Marisa', r), 'Marisa, de 09:00, sin salida todavía')
  })

  await t.test('4. partido 08:00–13:00 + 17:00–20:00 -> 8 h 00 sumadas, dos tramos', () => {
    const r = H.resumenDeFila([
      H.tramoDeFichaje(fichaje('2026-09-01T08:00', '2026-09-01T13:00')),
      H.tramoDeFichaje(fichaje('2026-09-01T17:00', '2026-09-01T20:00')),
    ])
    assert.equal(r.tramos.length, 2)
    assert.equal(r.minutos, 480)
    assert.equal(H.enHoras(r.minutos), '8 h')
    assert.equal(r.abierta, false)
    assert.equal(r.solapa, false)
    assert.equal(H.rangoDeTramos(r.tramos), '08:00–13:00 · 17:00–20:00')
    assert.equal(H.etiquetaDeFila('Santi', r),
      'Santi, de 08:00 a 13:00 y de 17:00 a 20:00, 8 horas')
  })

  await t.test('5. partido con el segundo abierto -> 5 h 00 parciales, marcado como abierto', () => {
    const r = H.resumenDeFila([
      H.tramoDeFichaje(fichaje('2026-09-01T08:00', '2026-09-01T13:00')),
      H.tramoDeFichaje(fichaje('2026-09-01T17:00', null)),
    ])
    assert.equal(r.tramos.length, 2)
    assert.equal(r.minutos, 300)
    assert.equal(H.enHoras(r.minutos), '5 h')
    assert.equal(r.abierta, true)
    assert.equal(r.parcial, true)   // 5 h son las de HASTA AHORA
    assert.equal(H.rangoDeTramos(r.tramos), '08:00–13:00 · 17:00 – sin salida')
    assert.equal(H.etiquetaDeFila('Génesis', r),
      'Génesis, de 08:00 a 13:00 y de 17:00, sin salida todavía, 5 horas hasta ahora')
  })

  await t.test('6. partido con el segundo cruzando medianoche -> 9 h 00, marcado como cruce', () => {
    const r = H.resumenDeFila([
      H.tramoDeFichaje(fichaje('2026-09-01T10:00', '2026-09-01T14:00')),
      H.tramoDeFichaje(fichaje('2026-09-01T20:00', '2026-09-02T01:00')),
    ])
    assert.equal(r.tramos.length, 2)
    assert.equal(r.minutos, 540)
    assert.equal(H.enHoras(r.minutos), '9 h')
    assert.equal(r.cruza, true)
    assert.equal(r.abierta, false)
    assert.equal(r.tramos[1].fin, 1500)   // 01:00 del dia siguiente
    assert.equal(H.rangoDeTramos(r.tramos), '10:00–14:00 · 20:00–01:00')
    assert.equal(H.etiquetaDeFila('Carmen', r),
      'Carmen, de 10:00 a 14:00 y de 20:00 a 01:00 del día siguiente, 9 horas')
  })
})

// ---------------------------------------------------------------------------
test('casos de borde de la barra', async (t) => {
  await t.test('un tramo de menos de 30 min sigue siendo un tramo', () => {
    const r = H.resumenDeFila([{ inicio: 600, fin: 610 }])
    assert.equal(r.minutos, 10)
    // El ancho minimo de 4 px lo pone el CSS, no la cuenta: aqui el ancho es
    // el de verdad y en la pantalla nunca baja de 4 px.
    assert.ok(H.colocarTramo(r.tramos[0], {}).ancho < 1)
  })

  await t.test('una fila sin ningun tramo no suma cero: no suma nada', () => {
    const r = H.resumenDeFila([])
    assert.equal(r.minutos, null)
    assert.equal(H.enHoras(r.minutos), '—')
  })

  await t.test('los tramos salen ordenados aunque lleguen del reves', () => {
    const r = H.resumenDeFila([{ inicio: 1020, fin: 1200 }, { inicio: 480, fin: 780 }])
    assert.deepEqual(r.tramos.map((x) => x.inicio), [480, 1020])
  })
})

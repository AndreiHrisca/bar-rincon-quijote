/**
 * Pruebas de los textos de los avisos
 * ===========================================================================
 * La seccion 10 del encargo pide una interfaz de avisos con cinco puntos de
 * disparo. Lo que se prueba aqui es la parte que se puede probar sola: QUE DICE
 * cada aviso. El canal no —en la v1 escribe en el diario del servidor y eso ya
 * se ve en el log—, pero el texto si: es lo que leeria alguien en el movil, y
 * lo que se rompe sin que nadie se entere cuando se cambia un campo.
 *
 * Se ejecutan con  ./pruebas/unitarias.sh
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const A = require('../../pb_hooks/lib/avisos.js')

// ===========================================================================
describe('mensaje', () => {
  test('reserva creada: quien, cuando, cuantos y el telefono', () => {
    const m = A.mensaje('reserva_creada', {
      codigo: 'RQ-4B7K', nombre: 'Paco Delgado', telefono: '600111222',
      fecha: '2026-09-12', hora: '21:00', comensales: 4, zona: 'terraza',
      notas: 'Tarta de cumpleaños',
    })
    assert.match(m.asunto, /RQ-4B7K/)
    assert.match(m.asunto, /Paco Delgado/)
    assert.match(m.texto, /600111222/)
    assert.match(m.texto, /2026-09-12 a las 21:00/)
    assert.match(m.texto, /4 personas/)
    assert.match(m.texto, /terraza/)
    assert.match(m.texto, /Tarta de cumpleaños/)
  })

  test('una reserva sin notas no deja una linea vacia', () => {
    const m = A.mensaje('reserva_creada', {
      codigo: 'RQ-0001', nombre: 'Ana', telefono: '600000000',
      fecha: '2026-09-12', hora: '14:00', comensales: 2, zona: 'indiferente',
    })
    assert.equal(m.texto.includes('Nota:'), false)
    assert.equal(m.texto.includes('\n\n'), false)
    // «indiferente» se dice en cristiano.
    assert.match(m.texto, /donde haya sitio/)
  })

  test('reserva cancelada: dice que la mesa vuelve a estar libre', () => {
    const m = A.mensaje('reserva_cancelada', {
      codigo: 'RQ-4B7K', nombre: 'Paco', fecha: '2026-09-12', hora: '21:00', comensales: 4,
    })
    assert.match(m.asunto, /Cancelada la reserva RQ-4B7K/)
    assert.match(m.texto, /vuelve a estar libre/)
  })

  test('producto agotado: el producto, quien lo apunto y a cuantos platos afecta', () => {
    const m = A.mensaje('producto_agotado', {
      producto: 'Huevos', quien: 'Kevin', nota: 'Se acabó en las comidas', platos: '3 platos',
    })
    assert.match(m.asunto, /Se ha acabado: Huevos/)
    assert.match(m.texto, /Kevin/)
    assert.match(m.texto, /3 platos/)
    assert.match(m.texto, /quizá haya que ocultarlos/)
  })

  test('un agotado sin firma ni platos sigue diciendo lo importante', () => {
    const m = A.mensaje('producto_agotado', { producto: 'Harina' })
    assert.match(m.texto, /Harina está agotado/)
    assert.equal(m.texto.includes('undefined'), false)
    assert.equal(m.texto.includes('\n'), false)
  })

  test('recordatorio del recuento: dice cuando fue el ultimo', () => {
    const m = A.mensaje('recordatorio_recuento', { dia: 'domingo', ultimo: '2026-08-30' })
    assert.match(m.texto, /domingo/)
    assert.match(m.texto, /2026-08-30/)

    const sinPrevio = A.mensaje('recordatorio_recuento', { dia: 'domingo' })
    assert.match(sinPrevio.texto, /No consta ningún recuento anterior/)
  })

  test('cuadrante publicado: los huecos solo se nombran si los hay', () => {
    const con = A.mensaje('cuadrante_publicado', { semana: '7 al 13 de septiembre', turnos: 13, huecos: 2 })
    assert.match(con.texto, /13 turnos/)
    assert.match(con.texto, /quedan 2 sin cubrir/)

    const sin = A.mensaje('cuadrante_publicado', { semana: '7 al 13 de septiembre', turnos: 15, huecos: 0 })
    assert.equal(sin.texto.includes('sin cubrir'), false)
  })

  test('un tipo desconocido no revienta', () => {
    const m = A.mensaje('lo_que_sea', { a: 1 })
    assert.match(m.asunto, /lo_que_sea/)
  })
})

// ===========================================================================
describe('notificar', () => {
  // Un doble del `app` de PocketBase: solo hace falta logger().
  function appFalso() {
    const dicho = []
    return {
      dicho,
      logger: () => ({
        info: (...a) => dicho.push(['info', ...a]),
        warn: (...a) => dicho.push(['warn', ...a]),
      }),
    }
  }

  test('el canal de la v1 escribe en el diario y dice que si', () => {
    const app = appFalso()
    assert.equal(A.notificar(app, 'producto_agotado', { producto: 'Huevos' }, 'registro'), true)
    assert.equal(app.dicho[0][0], 'info')
    assert.ok(app.dicho[0].join(' ').includes('Huevos'))
  })

  test('SMS y WhatsApp estan definidos pero NO envian', () => {
    for (const canal of ['sms', 'whatsapp']) {
      const app = appFalso()
      assert.equal(A.notificar(app, 'reserva_creada', { codigo: 'RQ-1' }, canal), false,
        `${canal} no puede dar por enviado nada`)
      assert.equal(app.dicho[0][0], 'warn')
      assert.ok(app.dicho[0].join(' ').includes('no está configurado'))
    }
  })

  test('UN AVISO QUE FALLA NO PUEDE TUMBAR LA RESERVA QUE LO PROVOCO', () => {
    // Es la propiedad importante de todo esto: notificar() no lanza jamas.
    const roto = { logger: () => { throw new Error('sin diario') } }
    assert.doesNotThrow(() => A.notificar(roto, 'reserva_creada', {}, 'registro'))
    assert.equal(A.notificar(roto, 'reserva_creada', {}, 'registro'), false)
  })

  test('un canal que no existe cae en el de la v1, no en nada', () => {
    const app = appFalso()
    assert.equal(A.notificar(app, 'reserva_creada', { codigo: 'RQ-2' }, 'palomas'), true)
    assert.equal(app.dicho[0][0], 'info')
  })
})

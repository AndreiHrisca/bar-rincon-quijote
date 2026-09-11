/**
 * Pruebas del borrado automatico de reservas
 * ===========================================================================
 * La seccion 12 del encargo obliga a borrar las reservas pasadas transcurrido
 * un plazo configurable. Lo que se prueba aqui es la FECHA a partir de la cual
 * se borra, que es lo unico que puede salir mal de verdad: si la frontera se
 * corre un dia, se borra un dia de reservas que todavia tocaba guardar, y eso
 * no se deshace.
 *
 * Se ejecutan con  ./pruebas/unitarias.sh
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')

// La zona horaria importa: el calculo va en dias naturales de Madrid, y el
// contenedor de las pruebas va en UTC. Se fija ANTES de cargar nada.
process.env.TZ = 'Europe/Madrid'

const R = require('../../pb_hooks/lib/retencion.js')

// ===========================================================================
describe('fronteraDeRetencion', () => {
  test('doce meses atras, en el formato de los campos de fecha', () => {
    const ahora = new Date(2026, 8, 7, 4, 15)          // 7 de septiembre de 2026
    assert.equal(R.fronteraDeRetencion(12, ahora), '2025-09-07 00:00:00.000Z')
  })

  test('el plazo se puede configurar', () => {
    const ahora = new Date(2026, 8, 7, 4, 15)
    assert.equal(R.fronteraDeRetencion(6, ahora), '2026-03-07 00:00:00.000Z')
    assert.equal(R.fronteraDeRetencion(1, ahora), '2026-08-07 00:00:00.000Z')
  })

  test('sin plazo valido, el del encargo: doce meses', () => {
    const ahora = new Date(2026, 8, 7, 4, 15)
    for (const malo of [0, -3, null, undefined, 'doce', 1.5]) {
      assert.equal(R.fronteraDeRetencion(malo, ahora), '2025-09-07 00:00:00.000Z')
    }
  })

  test('un dia que no existe en el mes de destino no revienta', () => {
    // 31 de marzo menos un mes NO es el 31 de febrero. Lo unico que se exige es
    // que salga una fecha valida y de principios de marzo, no una barbaridad.
    const ahora = new Date(2026, 2, 31, 4, 15)         // 31 de marzo de 2026
    const frontera = R.fronteraDeRetencion(1, ahora)
    assert.match(frontera, /^2026-03-0[23] 00:00:00\.000Z$/)
  })

  test('EL CAMBIO DE HORA NO CORRE LA FRONTERA UN DIA', () => {
    // Es la trampa que se paga sola con toISOString(): la medianoche del 1 de
    // septiembre en Madrid es el 31 de agosto a las 22:00 en UTC. Si la fecha
    // se compusiera pasando por UTC, aqui saldria "2025-08-31" y se borraria un
    // dia de reservas de mas.
    const ahora = new Date(2026, 8, 1, 4, 15)          // 1 de septiembre (horario de verano)
    assert.equal(R.fronteraDeRetencion(12, ahora), '2025-09-01 00:00:00.000Z')

    // Y en invierno, con la otra hora, lo mismo.
    const enero = new Date(2026, 0, 1, 4, 15)
    assert.equal(R.fronteraDeRetencion(12, enero), '2025-01-01 00:00:00.000Z')
  })

  test('la frontera se compara bien con lo que guarda PocketBase', () => {
    // Las reservas se guardan como "AAAA-MM-DD 00:00:00.000Z" (D-19), y el
    // filtro del hook es `fecha < frontera`: texto contra texto. Que ordene
    // bien como cadena es justo lo que hace que el filtro funcione.
    const frontera = R.fronteraDeRetencion(12, new Date(2026, 8, 7))
    assert.ok('2025-09-06 00:00:00.000Z' < frontera)   // se borra
    assert.ok(!('2025-09-07 00:00:00.000Z' < frontera)) // se queda, es el limite
    assert.ok(!('2026-01-01 00:00:00.000Z' < frontera)) // se queda
  })
})

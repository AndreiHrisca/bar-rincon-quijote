/**
 * Pruebas unitarias de la logica del almacen
 * ===========================================================================
 * Lo que se prueba aqui es la regla que decide si un producto esta "sin
 * configurar", que es la que marca los que se dan de alta al vuelo en mitad del
 * servicio para que alguien los termine luego (seccion 9.3).
 *
 * Se ejecutan con  ./pruebas/unitarias.sh  (node en contenedor, sin instalar
 * nada en el host y sin dependencias: solo node:test, que viene de serie).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const A = require('../../pb_hooks/lib/almacen.js')

const completo = { unidad: 'kg', stock_minimo: 4, proveedor: 'abc123' }

// ===========================================================================
describe('sinPoner', () => {
  test('el vacio, el nulo y los espacios no cuentan', () => {
    assert.equal(A.sinPoner(''), true)
    assert.equal(A.sinPoner('   '), true)
    assert.equal(A.sinPoner(null), true)
    assert.equal(A.sinPoner(undefined), true)
  })

  test('EL CERO CUENTA COMO SIN PONER', () => {
    // Un campo numerico vacio se guarda como 0 en PocketBase: no hay forma de
    // distinguirlo de un cero escrito a mano. Y un minimo de cero no dispara
    // nunca la lista de pedido, asi que vale lo mismo que no haberlo puesto.
    assert.equal(A.sinPoner(0), true)
    assert.equal(A.sinPoner(-3), true)
  })

  test('un valor de verdad si cuenta', () => {
    assert.equal(A.sinPoner('kg'), false)
    assert.equal(A.sinPoner(0.5), false)
    assert.equal(A.sinPoner(4), false)
  })
})

// ===========================================================================
describe('camposQueFaltan', () => {
  test('un producto completo no tiene nada pendiente', () => {
    assert.deepEqual(A.camposQueFaltan(completo), [])
    assert.equal(A.estaSinConfigurar(completo), false)
  })

  test('el alta al vuelo, con solo el nombre, le falta todo', () => {
    const alVuelo = { nombre: 'Harina' }
    assert.deepEqual(A.camposQueFaltan(alVuelo), ['unidad', 'stock_minimo', 'proveedor'])
    assert.equal(A.estaSinConfigurar(alVuelo), true)
  })

  test('faltar uno solo ya lo deja sin configurar', () => {
    assert.deepEqual(A.camposQueFaltan({ ...completo, proveedor: '' }), ['proveedor'])
    assert.equal(A.estaSinConfigurar({ ...completo, proveedor: '' }), true)
  })

  test('la ubicacion NO entra en la cuenta', () => {
    // El importador pone "otros" cuando el CSV no la trae, asi que nunca falta
    // de verdad; y una ubicacion equivocada no impide pedir nada.
    assert.equal(A.estaSinConfigurar({ ...completo, ubicacion: '' }), false)
  })

  test('sin producto, no se rompe', () => {
    assert.equal(A.estaSinConfigurar(null), true)
    assert.equal(A.estaSinConfigurar(undefined), true)
  })
})

// ===========================================================================
describe('hayQuePedir', () => {
  test('por debajo del minimo, se pide', () => {
    assert.equal(A.hayQuePedir(2, 4), true)
    assert.equal(A.hayQuePedir(0, 4), true)
  })

  test('justo en el minimo NO se pide', () => {
    // Tener el minimo no es tener de menos: lo que dispara el pedido es haber
    // bajado de ahi.
    assert.equal(A.hayQuePedir(4, 4), false)
  })

  test('por encima, tampoco', () => {
    assert.equal(A.hayQuePedir(9, 4), false)
  })

  test('SIN MINIMO no se pide nunca', () => {
    // Un minimo a cero es "sin poner": de un producto del que no sabemos cuanto
    // tiene que haber, no podemos decir que falte.
    assert.equal(A.hayQuePedir(0, 0), false)
    assert.equal(A.hayQuePedir(0, null), false)
    assert.equal(A.hayQuePedir(0, ''), false)
  })
})

// ===========================================================================
describe('cantidadSugerida', () => {
  test('manda el pedido habitual', () => {
    assert.equal(A.cantidadSugerida(12, 4, 1), 12)
  })

  test('sin pedido habitual, lo justo para volver al minimo', () => {
    assert.equal(A.cantidadSugerida(0, 4, 1), 3)
    assert.equal(A.cantidadSugerida(null, 10, 2.5), 7.5)
  })

  test('y se redondea a un decimal', () => {
    // Las unidades del almacen son kg, cajas y bandejas: "3,7" se entiende.
    assert.equal(A.cantidadSugerida(0, 4, 0.31), 3.7)
  })

  test('sin habitual y sin minimo, cero', () => {
    assert.equal(A.cantidadSugerida(0, 0, 0), 0)
  })

  test('si ya hay de sobra, no sugiere negativos', () => {
    assert.equal(A.cantidadSugerida(0, 4, 9), 0)
  })
})

// ===========================================================================
describe('lineaDePedido', () => {
  const producto = { minimo: 4, pedidoHabitual: 12 }

  test('contada y por debajo del minimo: entra en el pedido', () => {
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 1 }, {})
    assert.deepEqual(r, { hayQuePedir: true, cantidadPedir: 12 })
  })

  test('contada y con existencias: no entra, y sin cantidad', () => {
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 9 }, {})
    assert.deepEqual(r, { hayQuePedir: false, cantidadPedir: 0 })
  })

  test('SIN CONTAR no pide nada, aunque el numero sea bajo', () => {
    // Una linea sin contar tiene cantidad 0 por defecto, y eso no significa que
    // no quede nada: significa que nadie ha mirado todavia.
    const r = A.lineaDePedido({ ...producto, contada: false, cantidad: 0 }, {})
    assert.deepEqual(r, { hayQuePedir: false, cantidadPedir: 0 })
  })

  test('lo que dice la peticion manda sobre el calculo', () => {
    // Quien esta delante de la estanteria sabe cosas que el minimo no recoge.
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 9 },
      { hay_que_pedir: true })
    assert.equal(r.hayQuePedir, true)
    assert.equal(r.cantidadPedir, 12)

    const q = A.lineaDePedido({ ...producto, contada: true, cantidad: 1 },
      { hay_que_pedir: false })
    assert.deepEqual(q, { hayQuePedir: false, cantidadPedir: 0 })
  })

  test('y una cantidad a pedir puesta a mano se respeta', () => {
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 1 },
      { cantidad_pedir: 5 })
    assert.deepEqual(r, { hayQuePedir: true, cantidadPedir: 5 })
  })

  test('un cero puesto a mano NO se confunde con "sin decir nada"', () => {
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 1 },
      { cantidad_pedir: 0 })
    assert.equal(r.cantidadPedir, 0)
  })

  test('sin cuerpo de peticion, decide el calculo', () => {
    const r = A.lineaDePedido({ ...producto, contada: true, cantidad: 1 }, undefined)
    assert.deepEqual(r, { hayQuePedir: true, cantidadPedir: 12 })
  })
})

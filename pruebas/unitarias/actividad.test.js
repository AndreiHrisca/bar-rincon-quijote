/**
 * Pruebas unitarias del diario del panel
 * ===========================================================================
 * Lo que se comprueba aqui es lo que hace que «Actividad» sirva para algo y no
 * sea un riesgo:
 *
 *   - QUE NO SE ESCAPA NADA SENSIBLE. Ni contrasenas, ni hashes, ni tokens, ni
 *     el telefono de una clienta. Es la prueba mas importante del fichero: un
 *     audit log con contrasenas dentro es peor que no tener audit log.
 *   - QUE UN GUARDADO SIN CAMBIOS NO ES UN CAMBIO. El panel manda el registro
 *     entero en cada PATCH; sin esto el diario se llena de lineas vacias y deja
 *     de servir para lo unico que esta.
 *   - QUE LAS FRASES SE ENTIENDEN. Son lo que se lee en pantalla, y las escribe
 *     el servidor una sola vez.
 *
 * Se ejecutan con  ./pruebas/unitarias.sh  (node en contenedor, sin instalar
 * nada en el host y sin dependencias: solo node:test, que viene de serie).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const A = require('../../pb_hooks/lib/actividad.js')

// ===========================================================================
describe('diferencias: lo que no se guarda', () => {
  test('NI CONTRASENAS NI TOKENS, vengan como vengan', () => {
    const cambios = A.diferencias(
      { password: 'vieja', passwordHash: 'abc', tokenKey: 'k1', nombre: 'Kevin' },
      { password: 'nueva', passwordHash: 'def', tokenKey: 'k2', nombre: 'Kevin Ruiz' })

    assert.deepEqual(Object.keys(cambios), ['nombre'])
    // Y que no aparezca el valor por ninguna otra puerta.
    assert.equal(JSON.stringify(cambios).includes('nueva'), false)
    assert.equal(JSON.stringify(cambios).includes('k2'), false)
  })

  test('el telefono de una clienta se dice que cambio, pero no a que', () => {
    const cambios = A.diferencias(
      { telefono: '600111222', comensales: 2 },
      { telefono: '600999888', comensales: 4 })

    assert.deepEqual(cambios.telefono, [A.TAPADO, A.TAPADO])
    assert.equal(JSON.stringify(cambios).includes('600999888'), false)
    // Lo que no es personal si se guarda entero: es para lo que esta el diario.
    assert.deepEqual(cambios.comensales, [2, 4])
  })

  test('un telefono que antes no habia se marca como vacio, no como tapado', () => {
    const cambios = A.diferencias({ telefono: '' }, { telefono: '600111222' })
    assert.deepEqual(cambios.telefono, ['', A.TAPADO])
  })

  test('las marcas de tiempo automaticas no son un cambio', () => {
    // Las colecciones del proyecto las llaman de cuatro formas distintas segun
    // el genero de la palabra, y las cuatro tienen que estar fuera.
    const cambios = A.diferencias(
      { creado: 'a', creada: 'a', actualizado: 'a', actualizada: 'a', hora: '20:00' },
      { creado: 'b', creada: 'b', actualizado: 'b', actualizada: 'b', hora: '21:00' })
    assert.deepEqual(cambios, { hora: ['20:00', '21:00'] })
  })

  test('los sellos que pone el servidor tampoco', () => {
    const cambios = A.diferencias(
      { oculto_desde: '', resuelto_en: '', visible: true },
      { oculto_desde: 'hoy', resuelto_en: 'hoy', visible: false })
    assert.deepEqual(Object.keys(cambios), ['visible'])
  })
})

// ===========================================================================
describe('diferencias: lo que si es un cambio', () => {
  test('GUARDAR SIN TOCAR NADA NO ES UN CAMBIO', () => {
    const igual = { nombre: 'Cachopo', precio_barra: 18, visible: true }
    assert.deepEqual(A.diferencias(igual, { ...igual }), {})
  })

  test('las tres formas del vacio son la misma', () => {
    // PocketBase devuelve '' donde el formulario mando null y donde no habia
    // nada. Sin esto, abrir un plato y cerrarlo escribiria una linea.
    assert.deepEqual(A.diferencias({ nota: null }, { nota: '' }), {})
    assert.deepEqual(A.diferencias({ nota: undefined }, { nota: '' }), {})
    assert.deepEqual(A.diferencias({}, { nota: '' }), {})
  })

  test('un cero NO es un vacio: un precio a cero es un dato', () => {
    assert.deepEqual(A.diferencias({ precio_barra: 0 }, { precio_barra: 18 }),
      { precio_barra: [0, 18] })
  })

  test('el campo que aparece de nuevo tambien cuenta', () => {
    assert.deepEqual(A.diferencias({}, { hora: '21:00' }), { hora: ['', '21:00'] })
  })

  test('una lista se compara por su contenido, no por identidad', () => {
    assert.deepEqual(A.diferencias({ alergenos: ['gluten'] }, { alergenos: ['gluten'] }), {})
    assert.equal(Object.keys(A.diferencias(
      { alergenos: ['gluten'] }, { alergenos: ['gluten', 'lactosa'] })).length, 1)
  })

  test('un texto larguisimo se recorta: el diario no es una copia de seguridad', () => {
    const largo = 'a'.repeat(400)
    const [, despues] = A.diferencias({ descripcion: '' }, { descripcion: largo }).descripcion
    assert.ok(despues.length < 130, `se guardaron ${despues.length} caracteres`)
    assert.ok(despues.endsWith('…'))
  })
})

// ===========================================================================
describe('etiquetaDe', () => {
  test('cada coleccion sabe de que campo sale su nombre', () => {
    assert.equal(A.etiquetaDe('reservas', { nombre: 'Marta García' }), 'Marta García')
    assert.equal(A.etiquetaDe('platos', { nombre: 'Cachopo' }), 'Cachopo')
    assert.equal(A.etiquetaDe('eventos', { titulo: 'Menú de Navidad' }), 'Menú de Navidad')
  })

  test('si no hay nombre, no se inventa ninguno', () => {
    assert.equal(A.etiquetaDe('fichajes', { id: 'x' }), '')
    assert.equal(A.etiquetaDe('reservas', {}), '')
    assert.equal(A.etiquetaDe('reservas', { nombre: '   ' }), '')
  })

  test('una cuenta se identifica por lo primero que tenga', () => {
    assert.equal(A.etiquetaDe('users', { nombre: 'Kevin', usuario: 'kevin' }), 'Kevin')
    assert.equal(A.etiquetaDe('users', { nombre: '', usuario: 'kevin' }), 'kevin')
  })
})

// ===========================================================================
describe('frase', () => {
  test('entrar, salir y el intento fallido', () => {
    assert.equal(A.frase({ actor: 'Santi', accion: 'entrar' }), 'Santi inició sesión')
    assert.equal(A.frase({ actor: 'Santi', accion: 'salir' }), 'Santi cerró la sesión')
    assert.equal(A.frase({ accion: 'entrar_fallido', extra: 'santi' }),
      'Intento de acceso fallido con el usuario santi')
  })

  test('crear, modificar y borrar', () => {
    assert.equal(
      A.frase({ actor: 'Santi', accion: 'crear', coleccion: 'reservas', etiqueta: 'Marta García' }),
      'Santi creó la reserva de Marta García')
    assert.equal(
      A.frase({ actor: 'Santi', accion: 'borrar', coleccion: 'platos', etiqueta: 'Cachopo' }),
      'Santi borró el plato Cachopo')
  })

  test('UN CAMBIO IMPORTANTE SE CUENTA EN LA PROPIA FRASE', () => {
    // Es lo que se viene a mirar: «modificó el plato Cachopo» obliga a abrir el
    // detalle para saber si tocó el precio o una coma de la descripción.
    assert.equal(A.frase({
      actor: 'María', accion: 'editar', coleccion: 'platos', etiqueta: 'Cachopo',
      cambios: { precio_barra: [18, 19.5] },
    }), 'María cambió el precio de Cachopo')

    assert.equal(A.frase({
      actor: 'Santi', accion: 'editar', coleccion: 'reservas', etiqueta: 'Laura Pérez',
      cambios: { estado: ['pendiente', 'anulada'] },
    }), 'Santi canceló la reserva de Laura Pérez')

    assert.equal(A.frase({
      actor: 'Kevin', accion: 'editar', coleccion: 'avisos_stock', etiqueta: 'Harina',
      cambios: { resuelto: [false, true] },
    }), 'Kevin resolvió la falta de Harina')
  })

  test('el estado de un plato se cuenta como lo ve el cliente', () => {
    assert.equal(A.frase({
      actor: 'María', accion: 'editar', coleccion: 'platos', etiqueta: 'Cachopo',
      cambios: { visible: [true, false] },
    }), 'María quitó Cachopo de la carta')
  })

  test('un cambio de rol dice a que rol', () => {
    assert.equal(A.frase({
      actor: 'Santi', accion: 'editar', coleccion: 'users', etiqueta: 'Kevin',
      cambios: { rol: ['empleado', 'admin'] },
    }), 'Santi cambió el rol de Kevin a administrador')
  })

  test('un cambio corriente se queda en la frase generica', () => {
    assert.equal(A.frase({
      actor: 'Santi', accion: 'editar', coleccion: 'reservas', etiqueta: 'Marta García',
      cambios: { hora: ['20:00', '21:00'] },
    }), 'Santi modificó la reserva de Marta García')
  })

  test('sin nombre del registro la frase sigue teniendo sentido', () => {
    assert.equal(A.frase({ actor: 'Lucía', accion: 'editar', coleccion: 'fichajes' }),
      'Lucía modificó el fichaje')
    // «la ficha de» se queda en «la ficha» cuando no hay nombre detras.
    assert.equal(A.frase({ actor: 'Santi', accion: 'crear', coleccion: 'empleados' }),
      'Santi creó la ficha')
  })
})

// ===========================================================================
describe('recursoDe y sanear', () => {
  test('el nombre de la coleccion se dice en singular', () => {
    assert.equal(A.recursoDe('reservas'), 'reserva')
    assert.equal(A.recursoDe('avisos_stock'), 'falta')
    assert.equal(A.recursoDe('users'), 'cuenta')
  })

  test('una coleccion que no conocemos se pinta tal cual, sin romperse', () => {
    assert.equal(A.recursoDe('inventada'), 'inventada')
    assert.equal(A.etiquetaDe('inventada', { nombre: 'X' }), '')
  })

  test('sanear quita lo sensible y tapa lo personal', () => {
    const limpio = A.sanear({ password: 'x', telefono: '600111222', motivo: 'duplicada' })
    assert.equal(limpio.password, undefined)
    assert.equal(limpio.telefono, A.TAPADO)
    assert.equal(limpio.motivo, 'duplicada')
  })
})

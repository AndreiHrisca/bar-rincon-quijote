import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puedeAcceder } from '../../panel/js/permisos.js'
import { seccionCategoria } from '../../compartido/js/secciones-carta.js'

test('empleado: lista cerrada de pantallas, sin rutas administrativas directas', () => {
  for (const ruta of ['/almacen', '/reservas', '/personal/fichajes', '/carta', '/almacen/recuento', '/almacen/pedido', '/mas']) {
    assert.equal(puedeAcceder('empleado', ruta), true, ruta)
  }
  for (const ruta of ['/', '/personal', '/personal/equipo', '/personal/cuentas', '/carta/nuevo', '/carta/abc123', '/actividad', '/eventos', '/estadisticas', '/desconocida']) {
    assert.equal(puedeAcceder('empleado', ruta), false, ruta)
    assert.equal(puedeAcceder('admin', ruta), true, ruta)
  }
  assert.equal(puedeAcceder('', '/carta'), false)
})
test('las seis categorías de bebidas y la comida conservan su agrupación', () => {
  for (const nombre of ['Cafés e infusiones', 'Cervezas', 'Combinados', 'Licores y coñac', 'Refrescos y aguas', 'Vinos y espumosos']) {
    assert.equal(seccionCategoria({ nombre }), 'bebidas', nombre)
  }
  for (const nombre of ['Raciones', 'Menú del día', 'Postres', 'Bocadillos']) {
    assert.equal(seccionCategoria({ nombre }), 'comida', nombre)
  }
})

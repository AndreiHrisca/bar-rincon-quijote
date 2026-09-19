/** Lista cerrada de rutas del empleado. La API autoriza de forma independiente. */
const RUTAS_EMPLEADO = new Set([
  '/almacen', '/almacen/proveedores', '/almacen/falta', '/almacen/recuento', '/almacen/pedido',
  '/reservas', '/personal/fichajes', '/carta',
  '/mas', // Cuenta y cierre de sesión, sin opciones administrativas.
])
export function puedeAcceder(rol, ruta) {
  return rol === 'admin' || (rol === 'empleado' && RUTAS_EMPLEADO.has(ruta))
}

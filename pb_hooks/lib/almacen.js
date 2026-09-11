/**
 * Almacen — logica pura
 * ===========================================================================
 * Aqui NO se toca la base de datos ni PocketBase. Solo funciones que reciben
 * datos y devuelven datos, para poder probarlas sueltas (pruebas/unitarias/) y
 * para que el hook quede en lo suyo: leer, aplicar esto y guardar.
 *
 * Se escribe en CommonJS porque tiene que poder cargarse desde dos sitios: el
 * require() del motor JS de PocketBase y el node de las pruebas.
 */

// Lo que hace falta para que un producto sirva de verdad, tal y como lo anuncia
// la migracion 1756700300_productos.js: "creado al vuelo desde cocina, le falta
// unidad, minimo y proveedor".
//
// La UBICACION no esta en la lista a proposito: el importador pone "otros"
// cuando el CSV no la trae, asi que nunca falta de verdad, y una ubicacion
// equivocada no rompe nada mas que el orden del recorrido.
const CAMPOS_CONFIGURACION = ['unidad', 'stock_minimo', 'proveedor']

/**
 * Un campo esta "sin poner" si viene vacio.
 *
 * OJO CON EL CERO (misma trampa que `precio_terraza`, DECISIONES.md D-41): un
 * campo numerico vacio se guarda como 0 en PocketBase, no como vacio. En
 * `stock_minimo` no hay forma de distinguir "cero de verdad" de "sin poner", y
 * un minimo de cero no dispara nunca la lista de pedido, asi que vale lo mismo
 * que no haberlo puesto.
 */
function sinPoner(valor) {
  if (valor === null || valor === undefined) return true
  if (typeof valor === 'number') return !Number.isFinite(valor) || valor <= 0
  return String(valor).trim() === ''
}

/** Los campos de configuracion que le faltan a un producto. */
function camposQueFaltan(producto) {
  const p = producto || {}
  return CAMPOS_CONFIGURACION.filter((campo) => sinPoner(p[campo]))
}

/** ¿Le falta algo para estar configurado? */
function estaSinConfigurar(producto) {
  return camposQueFaltan(producto).length > 0
}

// ---------------------------------------------------------------------------
// Recuento: de lo contado a la lista de pedido
// ---------------------------------------------------------------------------

/**
 * ¿Hay que pedir este producto?
 *
 * Sin minimo NO se pide nunca, y no es un descuido: un minimo a cero significa
 * "sin poner" (no hay forma de distinguirlo del vacio en PocketBase), y de un
 * producto del que no sabemos cuanto tiene que haber no podemos decir que
 * falte. Sale marcado como "sin configurar" en el almacen, que es donde se
 * arregla.
 *
 * La comparacion es ESTRICTA: tener justo el minimo no es tener de menos. Lo
 * que dispara el pedido es haber bajado de ahi.
 */
function hayQuePedir(cantidad, minimo) {
  if (sinPoner(minimo)) return false
  return Number(cantidad || 0) < Number(minimo)
}

/**
 * Cuanto pedir, como sugerencia. Se puede cambiar linea a linea en la lista.
 *
 * Primero lo que se pide siempre (`pedido_habitual`), que es lo que sabe quien
 * lleva el bar. Si no esta puesto, lo justo para volver al minimo: es la
 * respuesta menos mala, y ademas se nota que es un calculo y no un habito.
 *
 * Se redondea a un decimal porque las unidades del almacen son kg, cajas y
 * bandejas: "3,7 kg" se entiende, "3,6999999" no.
 */
function cantidadSugerida(pedidoHabitual, minimo, cantidad) {
  if (!sinPoner(pedidoHabitual)) return Number(pedidoHabitual)
  if (sinPoner(minimo)) return 0
  const falta = Number(minimo) - Number(cantidad || 0)
  return falta > 0 ? Math.round(falta * 10) / 10 : 0
}

/**
 * Que hacer con una linea de recuento: si entra en el pedido y con cuanto.
 *
 * `enviado` es el cuerpo de la peticion tal cual. Si trae el campo, MANDA EL
 * CAMPO: es lo que hace que la lista se pueda corregir a mano (seccion 5). Si no
 * lo trae, decide el calculo.
 *
 * La decision entera esta aqui, y no repartida por los hooks, porque cada
 * handler de PocketBase corre en un runtime aislado (DECISIONES.md, D-22) y lo
 * que se declare fuera del handler no le llega: sin esto, la misma regla
 * acabaria escrita dos veces, en crear y en actualizar, y con el tiempo
 * discreparian.
 */
function lineaDePedido({ contada, cantidad, minimo, pedidoHabitual }, enviado) {
  const dicho = enviado || {}

  const pedir = dicho.hay_que_pedir !== undefined
    ? !!dicho.hay_que_pedir
    : (!!contada && hayQuePedir(cantidad, minimo))

  const cuanto = dicho.cantidad_pedir !== undefined
    ? (Number(dicho.cantidad_pedir) || 0)
    : (pedir ? cantidadSugerida(pedidoHabitual, minimo, cantidad) : 0)

  return { hayQuePedir: pedir, cantidadPedir: cuanto }
}

module.exports = {
  CAMPOS_CONFIGURACION,
  sinPoner,
  camposQueFaltan,
  estaSinConfigurar,
  hayQuePedir,
  cantidadSugerida,
  lineaDePedido,
}

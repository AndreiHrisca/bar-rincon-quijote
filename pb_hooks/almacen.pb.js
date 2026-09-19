/// <reference path="../pb_data/types.d.ts" />
//
// Almacen — lo que escribe el servidor y no la persona
// ===========================================================================
// Tres cosas del almacen no se le pueden dejar al formulario, por el mismo
// motivo por el que "oculto desde" lo sella el servidor (D-36): se quedarian
// sin poner justo el dia que hay lio en la cocina, que es cuando hacen falta.
//
//   1. `productos.sin_configurar`  La seccion 9.1 pide que quien esta en la cocina
//      pueda dar de alta un producto AL VUELO, con solo el nombre. Ese producto
//      queda marcado para que alguien lo termine, y la marca se levanta sola en
//      cuanto no le falta nada.
//
//   2. `avisos_stock.creado_por`   Lo pone el servidor a partir de la sesion, no
//      el cliente. No es para medir a nadie (seccion 12: nada de rankings): es
//      para poder preguntar "oye, esto que apuntaste, ¿era de la camara o del
//      sotano?". Que lo mandara el navegador significaria que se puede firmar
//      un aviso con el nombre de otro.
//
//   3. `avisos_stock.resuelto_en`  La fecha en que se repuso. Se sella al
//      marcarlo y se limpia al desmarcarlo, para que un aviso que se reabre no
//      herede una fecha vieja.
//
//   4. `recuentos`                 Quien lo empieza, cuando, y sobre todo QUIEN
//      PUEDE CERRARLO: cerrar es lo que congela la lista de pedido, y eso solo
//      lo hace el administrador. Lo anuncia la migracion 1756700700.
//
//   5. `recuento_lineas`            Si hay que pedir y cuanto. Se calcula al
//      guardar cada linea —para que la lista este hecha cuando se acaba de
//      contar— pero se puede corregir a mano: quien esta delante de la
//      estanteria sabe cosas que el minimo no recoge.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado. Nada de lo que se declare en el nivel
// superior de este fichero llega al cuerpo de los handlers, asi que el
// require() de la logica compartida va DENTRO de cada uno.
//
// Los cuatro son hooks de PETICION (…Request): el importador de CSV guarda con
// $app.save() desde la linea de ordenes y no pasa por aqui, que es lo que se
// quiere. El CSV trae los productos ya configurados y decide el.
// ===========================================================================

// ---------------------------------------------------------------------------
// Un producto nuevo se marca solo si le falta algo
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  const A = require(`${__hooks}/lib/almacen.js`)

  e.record.set('sin_configurar', A.estaSinConfigurar({
    unidad: e.record.getString('unidad'),
    stock_minimo: e.record.getFloat('stock_minimo'),
    proveedor: e.record.getString('proveedor'),
  }))

  e.next()
}, 'productos')

// ---------------------------------------------------------------------------
// Y se desmarca solo en cuanto se termina de configurar
// ---------------------------------------------------------------------------
// Solo se LEVANTA la marca, nunca se vuelve a poner: si alguien deja a proposito
// un producto sin proveedor —porque se compra en el supermercado de la esquina—
// no tiene por que salirle el aviso de "sin configurar" cada vez que lo toca.
// La marca dice "esto lo creo alguien con prisa", no "esto esta incompleto".
onRecordUpdateRequest((e) => {
  const A = require(`${__hooks}/lib/almacen.js`)

  if (!e.record.getBool('sin_configurar')) return e.next()

  const faltan = A.camposQueFaltan({
    unidad: e.record.getString('unidad'),
    stock_minimo: e.record.getFloat('stock_minimo'),
    proveedor: e.record.getString('proveedor'),
  })
  if (!faltan.length) e.record.set('sin_configurar', false)

  e.next()
}, 'productos')

// ---------------------------------------------------------------------------
// Quien apunta la falta lo dice la sesion, no el navegador
// ---------------------------------------------------------------------------
onRecordCreateRequest((e) => {
  // El superusuario queda fuera: es la valvula de escape para arreglar la base
  // a mano, igual que en roles.pb.js.
  if (e.hasSuperuserAuth()) return e.next()

  const quien = e.auth
  let empleado = ''
  if (quien) {
    try {
      // Puede no haber ficha de empleado: hay cuentas de acceso que no estan en
      // el cuadrante. Entonces el aviso se queda sin firmar, que es mejor que
      // rechazarlo: lo que importa es que quede apuntado que falta harina.
      empleado = e.app.findFirstRecordByFilter(
        'empleados', 'usuario = {:u}', { u: quien.id }).id
    } catch (err) {
      empleado = ''
    }
  }
  e.record.set('creado_por', empleado)

  // Un aviso nace sin resolver. Si el cliente manda otra cosa, se ignora.
  e.record.set('resuelto', false)
  e.record.set('resuelto_en', '')

  e.next()
}, 'avisos_stock')

// ---------------------------------------------------------------------------
// Aviso de que algo se ha acabado (seccion 10)
// ---------------------------------------------------------------------------
// Solo cuando el nivel es "agotado". «Queda poco» es un recado; «se acabó» es
// que un plato de la carta ya no se puede servir, y eso quiere enterarse quien
// no esta en la cocina.
//
// Va en un hook de EXITO: si el aviso no llega a guardarse, no hay nada que
// contar. Y notificar() no lanza nunca, asi que apuntar una falta no se puede
// romper por culpa de esto.
onRecordAfterCreateSuccess((e) => {
  if (e.record.getString('nivel') !== 'agotado') return e.next()

  let producto = ''
  let platos = 0
  try {
    const p = e.app.findRecordById('productos', e.record.getString('producto'))
    producto = p.getString('nombre')
    // Cuantos platos de la carta lo llevan entre sus ingredientes. Es el mismo
    // dato con el que el panel propone ocultarlos (D-45): aqui solo se cuenta,
    // no se oculta nada. La carta la decide Santi.
    platos = e.app.findRecordsByFilter('platos',
      'ingredientes ~ {:id} && visible = true', '', 50, 0, { id: p.id }).length
  } catch (err) {
    producto = ''
  }

  let quien = ''
  try {
    if (e.record.getString('creado_por')) {
      quien = e.app.findRecordById('empleados', e.record.getString('creado_por')).getString('nombre')
    }
  } catch (err) {
    quien = ''
  }

  require(`${__hooks}/lib/avisos.js`).notificar(e.app, 'producto_agotado', {
    producto,
    quien,
    nota: e.record.getString('nota'),
    platos: platos ? `${platos} ${platos === 1 ? 'plato' : 'platos'}` : '',
  })

  e.next()
}, 'avisos_stock')

// ---------------------------------------------------------------------------
// Sello de "resuelto en"
// ---------------------------------------------------------------------------
onRecordUpdateRequest((e) => {
  const antes = e.record.original()
  if (antes.getBool('resuelto') === e.record.getBool('resuelto')) return e.next()

  // Aqui SI es un instante, no un dia del calendario: interesa la hora a la que
  // se repuso, no solo el dia. Por eso va la fecha entera y no la medianoche
  // UTC del convenio de los campos sin hora.
  e.record.set('resuelto_en',
    e.record.getBool('resuelto') ? new Date().toISOString().replace('T', ' ') : '')

  e.next()
}, 'avisos_stock')

// ---------------------------------------------------------------------------
// Un recuento nuevo lo abre quien baja al almacen
// ---------------------------------------------------------------------------
// Empezar un recuento no es una decision: es bajar al sotano con el movil. Lo
// puede hacer cualquiera del equipo (lo dice la regla de la coleccion) y lo que
// no se le deja al navegador es el estado, la fecha y la firma.
//
// Que no haya DOS a la vez lo impide el indice unico parcial de la migracion
// (D-13). Aqui solo se traduce el choque a un mensaje que se entiende, porque
// el de la base habla de indices.
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  // findFirstRecordByFilter LANZA cuando no encuentra nada, que aqui es el caso
  // normal. De ahi el try en dos pasos: primero se busca, y el error se decide
  // fuera del catch. Lanzarlo dentro obligaria a distinguir "no hay ninguno" de
  // "ya hay uno" mirando el tipo de la excepcion, y los errores de PocketBase
  // vienen de Go: no son clases de JavaScript con las que se pueda comparar.
  let abierto = null
  try {
    abierto = e.app.findFirstRecordByFilter('recuentos', 'estado = "en_curso"')
  } catch (err) {
    abierto = null
  }
  if (abierto) {
    throw new BadRequestError('Ya hay un recuento empezado. Ábrelo y sigue por donde ibas.')
  }

  // Un recuento nace en curso. Lo unico que lo cierra es el hook de abajo.
  e.record.set('estado', 'en_curso')
  e.record.set('cerrado_en', '')

  // Convenio del proyecto para las fechas SIN hora: medianoche UTC del dia del
  // calendario. La medianoche local de Madrid pasada por toISOString() cae en el
  // dia anterior, y el recuento del domingo saldria hecho el sabado.
  const ahora = new Date()
  const a = ahora.getFullYear()
  const m = String(ahora.getMonth() + 1).padStart(2, '0')
  const d = String(ahora.getDate()).padStart(2, '0')
  e.record.set('fecha', `${a}-${m}-${d} 00:00:00.000Z`)

  const quien = e.auth
  let empleado = ''
  if (quien) {
    try {
      empleado = e.app.findFirstRecordByFilter(
        'empleados', 'usuario = {:u}', { u: quien.id }).id
    } catch (err) {
      empleado = ''
    }
  }
  e.record.set('hecho_por', empleado)

  e.next()
}, 'recuentos')

// ---------------------------------------------------------------------------
// Cerrar un recuento: solo el administrador
// ---------------------------------------------------------------------------
// Cerrar es lo que congela la lista de pedido y da el recuento por bueno. No es
// lo mismo que contar: contar lo hace quien baja al almacen, cerrar lo hace
// quien pide (seccion 7, y lo anuncia la migracion 1756700700_almacen.js).
//
// Reabrir esta permitido a los mismos, y a proposito: es la unica forma de
// corregir una cantidad mal tecleada sin reescribir a mano la base. Si ya hay
// otro recuento en curso, el indice unico lo impide y se dice por que.
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next()

  const antes = e.record.original()
  const estadoAntes = antes.getString('estado')
  const estadoAhora = e.record.getString('estado')
  if (estadoAntes === estadoAhora) return e.next()

  const quien = e.auth
  const rol = quien ? quien.getString('rol') : ''
  if (rol !== 'admin') {
    throw new ForbiddenError(estadoAhora === 'cerrado'
      ? 'El recuento lo cierra un administrador.'
      : 'El recuento lo vuelve a abrir un administrador.')
  }

  // Aqui SI es un instante, no un dia del calendario: interesa a que hora se
  // cerro. Y se limpia al reabrir, para que no herede una fecha vieja.
  e.record.set('cerrado_en',
    estadoAhora === 'cerrado' ? new Date().toISOString().replace('T', ' ') : '')

  e.app.logger().info('Recuento ' + (estadoAhora === 'cerrado' ? 'cerrado' : 'reabierto'),
    'recuento', e.record.id, 'por', quien ? quien.getString('email') : '?')

  e.next()
}, 'recuentos')

// ---------------------------------------------------------------------------
// Cada linea sale ya con "hay que pedir" y con cuanto
// ---------------------------------------------------------------------------
// Se calcula AL GUARDAR y no al cerrar, para que la lista de pedido este hecha
// en el momento en que se cuenta la ultima estanteria. Contar el almacen entero
// y luego esperar a que algo lo procese es justo lo que hace que la gente se
// vaya a casa sin pedir.
//
// PERO SE PUEDE CORREGIR A MANO (seccion 5 del encargo): si la peticion trae el
// campo, manda la peticion. Quien esta delante de la estanteria sabe cosas que
// el minimo no recoge —que el sabado hay bautizo, que la caja de arriba esta
// abierta— y el servidor no se las va a discutir.
//
// Los dos handlers de abajo repiten estas diez lineas de leer y escribir a
// proposito: lo que NO se repite es la decision, que vive entera en
// lib/almacen.js. Un handler no puede llamar a una funcion declarada en el
// nivel superior de este fichero (D-22).
onRecordCreateRequest((e) => {
  const A = require(`${__hooks}/lib/almacen.js`)

  let producto = null
  try {
    producto = e.app.findRecordById('productos', e.record.getString('producto'))
  } catch (err) {
    // Producto borrado entre que se descargo la lista y se envio la linea. No
    // hay con que comparar: se deja lo que venga y que la linea se guarde.
    return e.next()
  }

  const calculo = A.lineaDePedido({
    contada: e.record.getBool('contada'),
    cantidad: e.record.getFloat('cantidad'),
    minimo: producto.getFloat('stock_minimo'),
    pedidoHabitual: producto.getFloat('pedido_habitual'),
  }, e.requestInfo().body)

  e.record.set('hay_que_pedir', calculo.hayQuePedir)
  e.record.set('cantidad_pedir', calculo.cantidadPedir)

  e.next()
}, 'recuento_lineas')

// ---------------------------------------------------------------------------
// Un recuento cerrado no se vuelve a contar
// ---------------------------------------------------------------------------
// En la lista de pedido SI se tocan las lineas de un recuento cerrado: se sube
// una cantidad a pedir, se quita algo que ya trae el del pescado. Lo que no se
// puede es cambiar LO CONTADO, porque un recuento cerrado es el documento de lo
// que habia ese dia; si se pudiera reescribir, los recuentos viejos empezarian
// a mentir poco a poco y nadie sabria desde cuando.
//
// Para corregir una cantidad mal tecleada se reabre el recuento, que es una
// accion con nombre y con responsable.
onRecordUpdateRequest((e) => {
  const A = require(`${__hooks}/lib/almacen.js`)

  if (!e.hasSuperuserAuth()) {
    const antes = e.record.original()
    const cambiaLoContado =
      antes.getFloat('cantidad') !== e.record.getFloat('cantidad') ||
      antes.getBool('contada') !== e.record.getBool('contada')

    if (cambiaLoContado) {
      let cerrado = false
      try {
        cerrado = e.app.findRecordById('recuentos', e.record.getString('recuento'))
          .getString('estado') === 'cerrado'
      } catch (err) {
        cerrado = false
      }
      if (cerrado) {
        throw new ForbiddenError(
          'Ese recuento está cerrado. Para corregir lo contado hay que volver a abrirlo.')
      }
    }
  }

  let producto = null
  try {
    producto = e.app.findRecordById('productos', e.record.getString('producto'))
  } catch (err) {
    return e.next()
  }

  const calculo = A.lineaDePedido({
    contada: e.record.getBool('contada'),
    cantidad: e.record.getFloat('cantidad'),
    minimo: producto.getFloat('stock_minimo'),
    pedidoHabitual: producto.getFloat('pedido_habitual'),
  }, e.requestInfo().body)

  e.record.set('hay_que_pedir', calculo.hayQuePedir)
  e.record.set('cantidad_pedir', calculo.cantidadPedir)

  e.next()
}, 'recuento_lineas')

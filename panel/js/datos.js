/**
 * Consultas del panel
 * ---------------------------------------------------------------------------
 * Todo lo que el panel le pide a PocketBase, en un sitio. Las vistas se ocupan
 * de pintar; aqui esta el que se pregunta y como.
 *
 * Los filtros se escriben SIEMPRE con pb.filter(...) y parametros, nunca
 * pegando texto: un nombre con comillas dentro romperia la consulta, y el
 * buscador de reservas recibe texto tecleado.
 */

import { pb } from './pb.js'
import { aFechaPB, inicioDelDiaPB, finDelDiaPB, ahoraPB } from './fechas.js'

/** El registro unico de configuracion del bar. */
export async function ajustes() {
  const r = await pb.collection('ajustes').getList(1, 1)
  return r.items[0] || null
}

export async function guardarAjustes(id, datos) {
  return pb.collection('ajustes').update(id, datos)
}

/**
 * Reservas de un rango de dias, los dos extremos incluidos.
 *
 * Se pide el rango entero de una vez y se reparte por dias en el cliente: son
 * dos semanas de un bar de barrio, unos pocos cientos de filas como mucho, y
 * asi el selector de dia puede pintar el punto de "aqui hay reservas" sin una
 * peticion por dia.
 */
export async function reservasEntre(desdeISO, hastaISO) {
  return pb.collection('reservas').getFullList({
    // Por hora, que es como se leen. El desempate por comensales pone primero
    // las mesas grandes de cada franja, que son las que hay que montar antes.
    sort: 'hora,-comensales',
    filter: pb.filter('fecha >= {:desde} && fecha <= {:hasta}', {
      desde: aFechaPB(desdeISO),
      hasta: `${hastaISO} 23:59:59.999Z`,
    }),
  })
}

/** Busca por nombre, telefono o codigo. El indice de reservas cubre los tres. */
export async function buscarReservas(texto) {
  const t = String(texto || '').trim()
  if (t.length < 2) return []
  return pb.collection('reservas').getList(1, 50, {
    sort: '-fecha,hora',
    filter: pb.filter(
      'nombre ~ {:t} || telefono ~ {:t} || codigo ~ {:c}',
      { t, c: t.toUpperCase() }),
  }).then((r) => r.items)
}

export async function cambiarEstado(id, estado) {
  return pb.collection('reservas').update(id, { estado })
}

export async function crearReserva(datos) {
  return pb.collection('reservas').create(datos)
}

/**
 * Franjas de un dia con su estado, tal y como las calcula el servidor.
 *
 * Es la MISMA ruta que usa el formulario publico. Se reutiliza a proposito: el
 * aforo lo decide pb_hooks/lib/reglas-reserva.js y no se reescribe aqui una
 * segunda version que acabaria discrepando. Con sesion, la ruta responde
 * tambien con las reservas por la web apagadas y marca las franjas llenas, que
 * es justo lo que el panel necesita para avisar antes de guardar.
 */
export async function disponibilidad({ fecha, comensales, zona }) {
  return pb.send('/api/quijote/disponibilidad', {
    method: 'GET',
    query: { fecha, comensales: String(comensales), zona },
  })
}

// --- Carta ------------------------------------------------------------------

/**
 * La carta entera: categorias y platos, visibles y ocultos.
 *
 * Con sesion, las reglas de `categorias` y `platos` dejan ver tambien lo
 * apagado, que es justo lo que el panel tiene que poder volver a encender.
 *
 * Se piden las dos listas de una vez y se cruzan aqui, igual que en la carta
 * publica: son dos listas cortas y asi buscar y agrupar no vuelve al servidor.
 */
export async function cargarCarta() {
  const [categorias, platos] = await Promise.all([
    pb.collection('categorias').getFullList({ sort: 'orden,nombre' }),
    pb.collection('platos').getFullList({ sort: 'orden,nombre' }),
  ])
  return { categorias, platos }
}

export async function guardarPlato(id, datos) {
  return id
    ? pb.collection('platos').update(id, datos)
    : pb.collection('platos').create(datos)
}

export async function borrarPlato(id) {
  return pb.collection('platos').delete(id)
}

/**
 * Reordena una categoria.
 *
 * Se renumera de diez en diez (10, 20, 30...) y se guardan SOLO las filas cuyo
 * numero ha cambiado de verdad. Mover un plato de sitio suele tocar dos o tres,
 * no los veintidos de la categoria.
 *
 * Van una detras de otra y no en paralelo a proposito: son pocas y asi, si una
 * falla, las anteriores ya estan guardadas y la lista queda en un estado que se
 * entiende, en vez de a medias en cualquier orden.
 */
export async function guardarOrden(platosOrdenados) {
  let guardados = 0
  for (let i = 0; i < platosOrdenados.length; i++) {
    const plato = platosOrdenados[i]
    const nuevo = (i + 1) * 10
    if (plato.orden === nuevo) continue
    await pb.collection('platos').update(plato.id, { orden: nuevo })
    plato.orden = nuevo
    guardados++
  }
  return guardados
}

/** URL de la foto de un plato, en la miniatura que toque. */
export function urlFoto(plato, miniatura = '400x0') {
  if (!plato?.foto) return null
  return pb.files.getURL(plato, plato.foto, { thumb: miniatura })
}

/**
 * Escaneos del QR de un dia.
 *
 * Devuelve null —no cero— cuando no hay ninguna fila de ese dia. La diferencia
 * importa: "0 escaneos" es una afirmacion, y sin fila no la podemos hacer. Un
 * guion dice "no hay dato", que es la verdad. Un dia con visitas si escribe su
 * fila, asi que el guion solo sale cuando de verdad no ha pasado nadie o el
 * contador no ha llegado a escribir todavia.
 *
 * SE SUMAN VARIAS FILAS, y no es un detalle: el escaneo se guarda con el idioma
 * en que se vio la carta (una fila "es" y otra "en" el mismo dia), que es de
 * donde sale el reparto por idioma de las estadisticas. Quedarse con la primera
 * fila daria de menos.
 */
export async function escaneosDe(diaISO) {
  const r = await pb.collection('metricas').getList(1, 10, {
    filter: pb.filter('dia = {:d} && tipo = "escaneo"', { d: diaISO }),
  })
  if (!r.items.length) return null
  return r.items.reduce((suma, fila) => suma + (fila.contador || 0), 0)
}

/**
 * El resumen de la carta en numeros, ya agregado por el servidor.
 *
 * No se pide la coleccion `metricas` en crudo: un mes de carta son miles de
 * filas y esto se abre en un movil. La ruta suma en SQLite y devuelve 2 KB.
 * Ver pb_hooks/metricas.pb.js.
 */
export async function estadisticas(dias = 7) {
  return pb.send('/api/quijote/estadisticas', { method: 'GET', query: { dias: String(dias) } })
}

/**
 * Deja constancia de que el cuadrante de una semana se le ha pasado al equipo
 * (seccion 10 del encargo, punto de disparo «cuadrante publicado»).
 *
 * HOY NO MANDA NINGUN MENSAJE: en la v1 el unico canal de avisos es el diario
 * del servidor (pb_hooks/lib/avisos.js). El cuadrante se sigue pasando copiando
 * y pegando en el grupo de WhatsApp, que es como se hace de verdad (D-60).
 * Esto es el gancho que usaria una pasarela el dia que se contrate, sin tocar
 * esta pantalla.
 *
 * No devuelve error hacia arriba: que el aviso no llegue no puede estropear un
 * boton que lo unico que hace es copiar texto.
 */
export async function avisarDelCuadrante({ semana, turnos, huecos }) {
  try {
    await pb.send('/api/quijote/aviso-cuadrante', {
      method: 'POST',
      body: { semana, turnos, huecos },
    })
    return true
  } catch (err) {
    return false
  }
}

// --- Eventos ----------------------------------------------------------------

/**
 * Todos los eventos, tambien los ocultos y los que ya pasaron.
 *
 * Al reves que la carta publica, que solo pide los visibles y recientes: el
 * panel tiene que poder volver a encender lo que alguien apago y copiar el menu
 * navideno del ano pasado en vez de escribirlo otra vez.
 */
export async function cargarEventos() {
  return pb.collection('eventos').getFullList({ sort: '-fecha_inicio' })
}

export async function guardarEvento(id, datos) {
  return id
    ? pb.collection('eventos').update(id, datos)
    : pb.collection('eventos').create(datos)
}

export async function borrarEvento(id) {
  return pb.collection('eventos').delete(id)
}

/** URL de la imagen de un evento, en la miniatura que toque. */
export function urlImagenEvento(evento, miniatura = '400x0') {
  if (!evento?.imagen) return null
  return pb.files.getURL(evento, evento.imagen, { thumb: miniatura })
}

/** Los platos apagados, con la fecha en que se apagaron. */
export async function platosOcultos() {
  return pb.collection('platos').getFullList({
    filter: 'visible = false',
    sort: 'oculto_desde,nombre',
    fields: 'id,nombre,oculto_desde',
  })
}

/**
 * Quien esta dentro ahora mismo: fichajes empezados y sin cerrar.
 *
 * Un campo de fecha vacio se filtra con = "" en PocketBase. Ojo, esta lista la
 * recorta ademas la regla de acceso de "fichajes": un empleado solo ve los
 * suyos, asi que a el la tarjeta le sale con una sola linea. Es lo
 * correcto: las horas de los demas no son asunto suyo (seccion 12).
 */
export async function enTurnoAhora() {
  return pb.collection('fichajes').getFullList({
    filter: 'salida = ""',
    sort: 'entrada',
    expand: 'empleado',
  })
}

// --- Almacén ----------------------------------------------------------------

/**
 * El almacen entero: productos y proveedores.
 *
 * Se piden las dos listas de una vez y se cruzan aqui, igual que la carta. Son
 * unas decenas de filas —el almacen de un bar de barrio, no un supermercado— y
 * asi buscar, agrupar por ubicacion y pintar el nombre del proveedor en cada
 * linea no vuelve al servidor.
 *
 * Se piden TODOS, tambien los desactivados: el panel tiene que poder volver a
 * encender lo que alguien apago. Quien filtra es la pantalla.
 */
export async function cargarAlmacen() {
  const [productos, proveedores] = await Promise.all([
    // El mismo orden con el que se camina el almacen: por ubicacion y, dentro,
    // por estanteria. De aqui sale el recorrido del recuento (fase 8).
    pb.collection('productos').getFullList({ sort: 'ubicacion,orden,nombre' }),
    pb.collection('proveedores').getFullList({ sort: 'nombre' }),
  ])
  return { productos, proveedores }
}

export async function guardarProducto(id, datos) {
  return id
    ? pb.collection('productos').update(id, datos)
    : pb.collection('productos').create(datos)
}

export async function borrarProducto(id) {
  return pb.collection('productos').delete(id)
}

export async function guardarProveedor(id, datos) {
  return id
    ? pb.collection('proveedores').update(id, datos)
    : pb.collection('proveedores').create(datos)
}

export async function borrarProveedor(id) {
  return pb.collection('proveedores').delete(id)
}

/**
 * Las faltas sin resolver, las mas graves primero.
 *
 * El orden sale gratis del alfabeto: "agotado" va antes que "queda_poco". Y
 * dentro de cada nivel, las mas viejas arriba, que son las que llevan mas
 * tiempo esperando. Es el indice idx_avisos_pendientes de la migracion.
 */
export async function avisosPendientes() {
  return pb.collection('avisos_stock').getFullList({
    filter: 'resuelto = false',
    sort: 'nivel,creado',
    expand: 'producto,creado_por',
  })
}

/**
 * Cuantas veces se ha apuntado cada producto, para poner arriba lo que mas se
 * acaba (seccion 9.1).
 *
 * Se miran los ultimos 200 avisos y no todos: con menos no se nota la
 * diferencia y con todos la peticion crece sin parar segun pasan los meses.
 * Devuelve un Map de id de producto -> cuantas veces.
 */
export async function usoDeProductos() {
  const r = await pb.collection('avisos_stock').getList(1, 200, {
    sort: '-creado',
    fields: 'producto',
  })
  const cuenta = new Map()
  for (const a of r.items) cuenta.set(a.producto, (cuenta.get(a.producto) || 0) + 1)
  return cuenta
}

/**
 * Apunta una falta.
 *
 * `creado_por` NO se manda: lo pone el servidor a partir de la sesion
 * (pb_hooks/almacen.pb.js). Si lo mandara el navegador, se podria firmar un
 * aviso con el nombre de otro.
 */
export async function crearAviso({ producto, nivel, nota = '' }) {
  return pb.collection('avisos_stock').create({ producto, nivel, nota })
}

/** Sube (o baja) el nivel de un aviso que ya existe, sin crear otro. */
export async function cambiarNivelAviso(id, nivel) {
  return pb.collection('avisos_stock').update(id, { nivel })
}

/**
 * Resuelto o vuelto a abrir. La fecha la sella el servidor: aqui solo se dice
 * que si o que no.
 */
export async function resolverAviso(id, resuelto = true) {
  return pb.collection('avisos_stock').update(id, { resuelto })
}

// --- Recuento y lista de pedido ---------------------------------------------

/**
 * El recuento abierto, si lo hay.
 *
 * Solo puede haber uno (indice unico de la migracion, D-13), y es lo que
 * permite que «Empezar recuento» CONTINUE el que ya estaba en vez de abrir otro
 * y perder lo tecleado.
 */
export async function recuentoEnCurso() {
  const r = await pb.collection('recuentos').getList(1, 1, {
    filter: 'estado = "en_curso"',
  })
  return r.items[0] || null
}

/** El ultimo que se cerro: de ahi sale la lista de pedido. */
export async function ultimoRecuentoCerrado() {
  const r = await pb.collection('recuentos').getList(1, 1, {
    filter: 'estado = "cerrado"',
    sort: '-fecha,-cerrado_en',
    expand: 'hecho_por',
  })
  return r.items[0] || null
}

/**
 * Empieza uno. La fecha, el estado y la firma los pone el servidor
 * (pb_hooks/almacen.pb.js): aqui no se manda nada.
 */
export async function empezarRecuento() {
  return pb.collection('recuentos').create({})
}

export async function lineasDeRecuento(recuentoId) {
  return pb.collection('recuento_lineas').getFullList({
    filter: pb.filter('recuento = {:r}', { r: recuentoId }),
  })
}

export async function guardarLinea(id, datos) {
  return id
    ? pb.collection('recuento_lineas').update(id, datos)
    : pb.collection('recuento_lineas').create(datos)
}

/**
 * Busca la linea de un producto dentro de un recuento.
 *
 * Hace falta para la cola sin conexion: si al recuperar la red una linea se
 * envia dos veces, la segunda choca contra el indice unico (recuento, producto)
 * y hay que averiguar el id de la que ya esta para actualizarla en vez de
 * insistir.
 */
export async function lineaDe(recuentoId, productoId) {
  const r = await pb.collection('recuento_lineas').getList(1, 1, {
    filter: pb.filter('recuento = {:r} && producto = {:p}', { r: recuentoId, p: productoId }),
  })
  return r.items[0] || null
}

/** Cerrar y reabrir. El hook comprueba el rol y sella la fecha. */
export async function cambiarEstadoRecuento(id, estado, notas = null) {
  const datos = { estado }
  if (notas !== null) datos.notas = notas
  return pb.collection('recuentos').update(id, datos)
}

// --- Personal: equipo, cuadrante y fichajes ---------------------------------

/**
 * Las fichas del equipo, activos primero y por nombre.
 *
 * Se piden TODAS, tambien las de quien ya no trabaja aqui: sus turnos y sus
 * fichajes viejos siguen existiendo y hay que poder pintar su nombre. Quien
 * filtra es la pantalla.
 */
export async function cargarEquipo() {
  return pb.collection('empleados').getFullList({ sort: '-activo,nombre' })
}

export async function guardarEmpleado(id, datos) {
  return id
    ? pb.collection('empleados').update(id, datos)
    : pb.collection('empleados').create(datos)
}

export async function borrarEmpleado(id) {
  return pb.collection('empleados').delete(id)
}

/**
 * Las cuentas de acceso: las de la pantalla de Cuentas y las que se enlazan a
 * una ficha del equipo.
 *
 * Solo las ve el administrador (regla de `users`); a un empleado le sale solo
 * su propia fila y la ficha no ensena el selector. OJO CON EL CORREO: PocketBase tapa
 * el de una cuenta ajena salvo que este marcada `emailVisibility`, y ademas no
 * deja filtrar por el. Por eso las cuentas que crea el panel nacen con el
 * correo visible: si no, la lista de cuentas no podria decir de quien es cada
 * una. Solo lo ven quienes ya pueden listar cuentas (D-73).
 */
export async function cargarCuentas() {
  return pb.collection('users').getFullList({
    sort: 'nombre', fields: 'id,nombre,usuario,rol,email,created',
  })
}

/**
 * Crea una cuenta de acceso. Solo el administrador (createRule de `users`).
 *
 * `verified` NO se manda: PocketBase no deja ponerlo a nadie que no sea
 * superusuario, y aqui no sirve para nada —no hay correo saliente que
 * verificar— porque la coleccion no exige cuenta verificada para entrar.
 */
export async function crearCuenta({ usuario, nombre, rol, clave, correo = '' }) {
  return pb.collection('users').create({
    usuario,
    nombre,
    rol,
    email: correo || '',
    emailVisibility: true,
    password: clave,
    passwordConfirm: clave,
  })
}

/** Nombre, nombre de usuario y rol. El correo y la contrasena van aparte. */
export async function guardarCuenta(id, datos) {
  return pb.collection('users').update(id, datos)
}

export async function borrarCuenta(id) {
  return pb.collection('users').delete(id)
}

/**
 * Cambia la contrasena o el correo de una cuenta del equipo. Solo el administrador.
 *
 * Va por una ruta propia y no por un PATCH a `users` porque la API de
 * PocketBase no deja ninguna de las dos cosas: la contrasena exige
 * `oldPassword` —y el administrador justamente no la sabe, la persona la ha perdido— y
 * el correo exige el circuito de confirmacion por correo, que aqui no existe.
 * Lo hace el servidor (pb_hooks/cuentas.pb.js), que comprueba el rol y lo deja
 * escrito en el diario.
 *
 * `correo` solo se manda si se pide cambiarlo: sin la clave en el cuerpo, el
 * servidor no lo toca.
 */
export async function cambiarCuenta(usuario, { clave = '', correo = null } = {}) {
  const cuerpo = { usuario }
  if (clave) cuerpo.clave = clave
  if (correo !== null) cuerpo.correo = correo
  return pb.send('/api/quijote/cuenta', { method: 'POST', body: cuerpo })
}

/**
 * Los turnos de un rango de dias, los dos extremos incluidos.
 *
 * `fecha` es un dia del calendario (medianoche UTC), asi que se filtra con
 * aFechaPB() igual que las reservas y NO con el instante local.
 */
export async function turnosEntre(desdeISO, hastaISO) {
  return pb.collection('turnos').getFullList({
    sort: 'fecha,hora_inicio',
    filter: pb.filter('fecha >= {:desde} && fecha <= {:hasta}', {
      desde: aFechaPB(desdeISO),
      hasta: `${hastaISO} 23:59:59.999Z`,
    }),
  })
}

export async function guardarTurno(id, datos) {
  return id
    ? pb.collection('turnos').update(id, datos)
    : pb.collection('turnos').create(datos)
}

export async function borrarTurno(id) {
  return pb.collection('turnos').delete(id)
}

/**
 * Los fichajes de un rango de dias naturales DE AQUI.
 *
 * `entrada` es un instante de verdad, no un dia del calendario: se filtra con
 * inicioDelDiaPB/finDelDiaPB, que traducen el dia de aqui al instante UTC que
 * guarda PocketBase. Con medianoche UTC, el turno de noche que entra a las
 * 00:30 caeria en el dia anterior y el informe del mes no cuadraria.
 *
 * La lista la recorta ademas la regla de acceso: un empleado solo ve los suyos
 * (seccion 12).
 */
export async function fichajesEntre(desdeISO, hastaISO) {
  return pb.collection('fichajes').getFullList({
    sort: '-entrada',
    filter: pb.filter('entrada >= {:desde} && entrada <= {:hasta}', {
      desde: inicioDelDiaPB(desdeISO),
      hasta: finDelDiaPB(hastaISO),
    }),
  })
}

/** Los fichajes sin cerrar, sean de cuando sean. Son el aviso de la pantalla. */
export async function fichajesAbiertos() {
  return pb.collection('fichajes').getFullList({ filter: 'salida = ""', sort: 'entrada' })
}

/**
 * La ficha de empleado ligada a la cuenta con la que se ha entrado, si la hay.
 *
 * Es lo que decide si sale el boton de fichar: una cuenta sin ficha —la del
 * gestor, o la del administrador que no esta en el cuadrante— no ficha, y el servidor
 * se lo rechazaria. Devuelve null si no la tiene.
 */
export async function miFichaDeEmpleado() {
  const yo = pb.authStore.record
  if (!yo) return null
  const r = await pb.collection('empleados').getList(1, 1, {
    filter: pb.filter('usuario = {:u}', { u: yo.id }),
  })
  return r.items[0] || null
}

/**
 * Apunta un fichaje con la hora escrita. Solo el administrador: es como se
 * arregla el olvido de quien se dejo el movil en casa. Al resto, el servidor le
 * pone su hora (ficharEntrada).
 */
export async function crearFichaje(datos) {
  return pb.collection('fichajes').create(datos)
}

/**
 * Ficha la entrada.
 *
 * NO se manda la hora ni, si es de uno mismo, el empleado: los pone el servidor
 * (pb_hooks/fichajes.pb.js). El reloj del movil se cambia en dos toques y un
 * registro de jornada que se fia de el no vale para nada. `empleado` solo se
 * manda cuando el administrador ficha por otro.
 */
export async function ficharEntrada(empleado = null) {
  return pb.collection('fichajes').create(empleado ? { empleado } : {})
}

/**
 * Cierra un fichaje abierto.
 *
 * La hora que se manda es la del navegador, pero al servidor solo le sirve de
 * pista: a quien no es administrador se la sustituye por la suya. Se manda
 * igualmente para que el administrador pueda cerrar a una hora concreta el
 * turno que alguien se dejo abierto ayer.
 */
export async function cerrarFichaje(id, salida = null) {
  return pb.collection('fichajes').update(id, { salida: salida || ahoraPB() })
}

/**
 * Corrige un fichaje ya cerrado (o reabre uno). Solo el administrador; el
 * servidor firma quien lo hizo en `corregido_por`.
 */
export async function corregirFichaje(id, datos) {
  return pb.collection('fichajes').update(id, datos)
}

export async function borrarFichaje(id) {
  return pb.collection('fichajes').delete(id)
}

// --- Actividad --------------------------------------------------------------

/**
 * Una pagina del diario del panel, lo ultimo primero.
 *
 * SE PIDE POR PAGINAS Y NO ENTERO, al reves que la carta o el almacen: esta
 * tabla crece con cada gesto del turno y en un ano son decenas de miles de
 * filas. La pantalla pide 40 y va trayendo mas segun se baja.
 *
 * Los tres filtros son los de la pantalla y se combinan con Y: empleado, tipo
 * de cosa y dia. Se escriben con pb.filter() y parametros, como todo lo demas
 * de este fichero.
 *
 * `expand` no se usa: el nombre de quien lo hizo ya va escrito en la propia
 * fila (`actor_nombre`), que es lo que permite seguir leyendo el diario cuando
 * la cuenta ya no existe.
 */
export async function cargarActividad({ pagina = 1, porPagina = 40, actor = '', recurso = '', dia = '' } = {}) {
  const condiciones = []
  const valores = {}

  if (actor) { condiciones.push('actor = {:actor}'); valores.actor = actor }
  if (recurso) { condiciones.push('recurso = {:recurso}'); valores.recurso = recurso }
  if (dia) {
    // `creado` es un instante, no un dia del calendario: se acota el dia de
    // AQUI traducido a UTC, igual que los fichajes. Con medianoche UTC, lo que
    // se hizo a las 00:30 caeria en el dia anterior.
    condiciones.push('creado >= {:desde} && creado <= {:hasta}')
    valores.desde = inicioDelDiaPB(dia)
    valores.hasta = finDelDiaPB(dia)
  }

  return pb.collection('actividad').getList(pagina, porPagina, {
    sort: '-creado',
    filter: condiciones.length ? pb.filter(condiciones.join(' && '), valores) : '',
  })
}

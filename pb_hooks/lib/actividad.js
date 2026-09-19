/**
 * Actividad — como se escribe una linea del diario del panel
 * ===========================================================================
 * Aqui esta TODO lo que decide que se guarda y como se cuenta, y esta separado
 * de los hooks a proposito: es la parte que se puede probar suelta
 * (pruebas/unitarias/actividad.test.js) y la que hay que leer para saber si un
 * dato sensible puede acabar en la tabla.
 *
 * TRES REGLAS QUE NO SE NEGOCIAN:
 *
 *   1. EL ACTOR SALE DE LA SESION. Nunca del cuerpo de la peticion. Un diario
 *      en el que el navegador dice quien firma no es un diario, es un cuaderno
 *      de recados. Eso se cumple en actividad.pb.js, que solo lee `e.auth`;
 *      aqui se cumple no ofreciendo ninguna forma de pasar un nombre a mano.
 *
 *   2. NO SE GUARDA NADA SENSIBLE. Ni contrasenas, ni hashes, ni tokens, ni
 *      claves. La lista esta abajo y se aplica ANTES de escribir. Y los datos
 *      personales de un CLIENTE (su telefono, su correo) se marcan como
 *      cambiados pero no se copian: el diario diria que Marta ceno aqui y con
 *      que telefono mucho despues de que su reserva se haya borrado sola
 *      (seccion 12 del encargo).
 *
 *   3. LA FRASE SE ESCRIBE UNA VEZ Y SE GUARDA HECHA. No se compone al pintar.
 *      Dentro de un ano el plato se llamara de otra forma, o no existira, y la
 *      linea tiene que seguir diciendo lo que paso: «María cambió el precio de
 *      Cachopo», aunque hoy el cachopo se llame otra cosa.
 *
 * Se escribe en CommonJS porque lo cargan dos sitios: el require() del motor JS
 * de PocketBase y el node de las pruebas.
 */

// ---------------------------------------------------------------------------
// Lo que no se copia jamas
// ---------------------------------------------------------------------------

/**
 * Se quitan enteros: ni el valor viejo ni el nuevo, ni siquiera la mencion.
 *
 * `tokenKey` merece una nota: es el secreto con el que PocketBase firma los
 * tokens de esa cuenta. Cambia cada vez que alguien cambia su contrasena, asi
 * que sin esta lista aparecerian solos en cada linea de cambio de clave.
 */
const SENSIBLES = [
  'password', 'passwordConfirm', 'oldPassword', 'passwordHash',
  'tokenKey', 'token', 'clave', 'secret', 'authToken',
]

/**
 * Se dice QUE cambiaron, pero no a que. Son datos de una persona que no
 * trabaja aqui: quien reserva una mesa no ha dado su telefono para acabar en un
 * registro de auditoria que dura mas que su propia reserva.
 */
const PERSONALES = ['telefono', 'email', 'correo', 'notas_cliente']

/**
 * Los pone el servidor solo; contarlos seria ruido en cada linea.
 *
 * Las cuatro primeras filas son los campos `autodate` de las colecciones del
 * proyecto, que NO se llaman igual en todas: `creado`, `creada`, `actualizado`
 * y `actualizada` conviven segun el genero de la palabra. Sin la lista entera,
 * cada cambio de reserva se apunta diciendo que ha cambiado `actualizada` de
 * una marca de tiempo a otra tres milisegundos despues, y el «20:00 → 21:00»
 * que importa se pierde entre medias.
 *
 * Las demas son sellos que ponen los hooks del proyecto (D-36): el dia que se
 * oculto un plato, cuando se repuso una falta, quien corrigio un fichaje.
 * Cuentan lo mismo que la propia linea, pero en bruto.
 */
const AUTOMATICOS = [
  'created', 'updated',
  'creado', 'creada',
  'actualizado', 'actualizada',
  'oculto_desde', 'resuelto_en', 'cerrado_en', 'corregido_por',
  'expand', 'collectionId', 'collectionName',
]

/** Lo que se pinta en lugar de un dato personal. */
const TAPADO = '···'

// ---------------------------------------------------------------------------
// De que coleccion estamos hablando
// ---------------------------------------------------------------------------

/**
 * Nombre de la coleccion -> como se llama esa cosa en una frase.
 *
 *   articulo   el que le toca a la palabra ("la reserva", "el plato")
 *   nombre     en singular y en el idioma del bar, no en el de la base
 *   de         true si la etiqueta va detras de un "de": "la reserva DE Marta"
 *   etiquetas  campos de los que sacar el nombre legible del registro, en
 *              orden de preferencia
 */
const RECURSOS = {
  reservas:        { recurso: 'reserva',   articulo: 'la', nombre: 'reserva',           de: true,  etiquetas: ['nombre'] },
  platos:          { recurso: 'plato',     articulo: 'el', nombre: 'plato',             de: false, etiquetas: ['nombre'] },
  categorias:      { recurso: 'categoria', articulo: 'la', nombre: 'categoría',         de: false, etiquetas: ['nombre'] },
  eventos:         { recurso: 'evento',    articulo: 'el', nombre: 'evento',            de: false, etiquetas: ['titulo', 'nombre'] },
  productos:       { recurso: 'producto',  articulo: 'el', nombre: 'producto',          de: false, etiquetas: ['nombre'] },
  proveedores:     { recurso: 'proveedor', articulo: 'el', nombre: 'proveedor',         de: false, etiquetas: ['nombre'] },
  avisos_stock:    { recurso: 'falta',     articulo: 'la', nombre: 'falta',             de: true,  etiquetas: [] },
  recuentos:       { recurso: 'recuento',  articulo: 'el', nombre: 'recuento',          de: false, etiquetas: [] },
  recuento_lineas: { recurso: 'recuento',  articulo: 'la', nombre: 'línea de recuento', de: false, etiquetas: [] },
  empleados:       { recurso: 'empleado',  articulo: 'la', nombre: 'ficha de',          de: true,  etiquetas: ['nombre'] },
  users:           { recurso: 'cuenta',    articulo: 'la', nombre: 'cuenta de',         de: true,  etiquetas: ['nombre', 'usuario', 'email'] },
  turnos:          { recurso: 'turno',     articulo: 'el', nombre: 'turno',             de: false, etiquetas: [] },
  fichajes:        { recurso: 'fichaje',   articulo: 'el', nombre: 'fichaje',           de: false, etiquetas: [] },
  ajustes:         { recurso: 'ajustes',   articulo: 'los', nombre: 'ajustes del bar',  de: false, etiquetas: [] },
}

/** Las colecciones que NO se auditan, y por que. */
const NO_SE_AUDITA = [
  // Las escribe la web publica sin sesion: son visitas, no acciones del equipo.
  'metricas',
  // El propio diario. Auditar la auditoria es una carrera sin final.
  'actividad',
]

function recursoDe(coleccion) {
  const r = RECURSOS[coleccion]
  return r ? r.recurso : String(coleccion || '')
}

// ---------------------------------------------------------------------------
// Saneado y diferencias
// ---------------------------------------------------------------------------

function esSensible(campo) {
  return SENSIBLES.indexOf(campo) !== -1
}

function esPersonal(campo) {
  return PERSONALES.indexOf(campo) !== -1
}

function seIgnora(campo) {
  return AUTOMATICOS.indexOf(campo) !== -1 || esSensible(campo)
}

/**
 * Deja un valor en condiciones de guardarse: recorta lo larguisimo y convierte
 * a algo que quepa en un JSON.
 *
 * El recorte no es cosmetico. La descripcion de un plato puede tener 600
 * caracteres y un diario con el texto entero por duplicado (antes y despues) en
 * cada retoque crece a lo tonto. Con 120 se ve lo que cambio.
 */
function valorLegible(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'boolean' || typeof v === 'number') return v
  if (typeof v === 'object') {
    let texto
    try { texto = JSON.stringify(v) } catch (err) { texto = String(v) }
    return texto.length > 200 ? texto.slice(0, 200) + '…' : texto
  }
  const s = String(v)
  return s.length > 120 ? s.slice(0, 120) + '…' : s
}

/**
 * Que ha cambiado entre dos estados del mismo registro.
 *
 * Devuelve `{ campo: [antes, despues] }` y SOLO con los campos que de verdad
 * han cambiado: un PATCH del panel manda el registro entero, asi que sin este
 * filtro cada retoque guardaria veinte campos iguales y el «18,00 € → 19,50 €»
 * de la pantalla se perderia entre ellos.
 *
 * FUNCION PURA: no toca la base ni sabe nada de PocketBase.
 */
function diferencias(antes, despues) {
  const cambios = {}
  const vistos = {}
  const campos = Object.keys(antes || {}).concat(Object.keys(despues || {}))

  for (const campo of campos) {
    if (vistos[campo]) continue
    vistos[campo] = true
    if (seIgnora(campo)) continue

    const a = (antes || {})[campo]
    const b = (despues || {})[campo]
    if (mismoValor(a, b)) continue

    cambios[campo] = esPersonal(campo)
      ? [a === '' || a === undefined ? '' : TAPADO, b === '' || b === undefined ? '' : TAPADO]
      : [valorLegible(a), valorLegible(b)]
  }
  return cambios
}

/**
 * Comparacion con la manga ancha justa.
 *
 * El vacio tiene tres formas en este proyecto —'', null y undefined— y las tres
 * significan lo mismo. Sin esto, abrir un formulario y guardarlo sin tocar nada
 * escribiria una linea diciendo que cambio `nota` de null a ''.
 */
function mismoValor(a, b) {
  const vacioA = a === null || a === undefined || a === ''
  const vacioB = b === null || b === undefined || b === ''
  if (vacioA && vacioB) return true
  if (typeof a === 'object' || typeof b === 'object') {
    return valorLegible(a) === valorLegible(b)
  }
  return String(a) === String(b)
}

/**
 * Quita de un objeto suelto lo que no se puede guardar. Se usa para la metadata
 * que no viene de un diff (el motivo de un borrado, por ejemplo).
 */
function sanear(objeto) {
  const limpio = {}
  for (const campo of Object.keys(objeto || {})) {
    if (esSensible(campo)) continue
    limpio[campo] = esPersonal(campo) ? TAPADO : valorLegible(objeto[campo])
  }
  return limpio
}

// ---------------------------------------------------------------------------
// La frase
// ---------------------------------------------------------------------------

/**
 * Como se llama en una frase el registro afectado: «Marta García», «Cachopo».
 *
 * Si no hay ningun campo del que sacarlo se devuelve cadena vacia y la frase se
 * queda en «Santi modificó un fichaje», que es verdad y se entiende.
 */
function etiquetaDe(coleccion, datos) {
  const r = RECURSOS[coleccion]
  if (!r) return ''
  for (const campo of r.etiquetas) {
    const v = (datos || {})[campo]
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      const s = String(v).trim()
      return s.length > 60 ? s.slice(0, 60) + '…' : s
    }
  }
  return ''
}

/**
 * Los cambios que merecen contarse EN LA PROPIA FRASE, en vez de dejarlos solo
 * en el detalle. Son los que alguien buscaria a simple vista en la lista.
 *
 * El orden importa: un PATCH puede cambiar el precio Y la descripcion a la vez,
 * y la frase se queda con el primero que encuentre, que es el mas gordo.
 */
const CAMBIOS_CONTADOS = [
  { coleccion: 'reservas', campo: 'estado', frase: estadoDeReserva },
  { coleccion: 'platos', campo: 'visible',
    frase: (a, etiqueta, cambio) => cambio[1] === true || cambio[1] === 'true'
      ? `${a} volvió a poner ${etiqueta} en la carta`
      : `${a} quitó ${etiqueta} de la carta` },
  { coleccion: 'platos', campo: 'precio_barra',
    frase: (a, etiqueta) => `${a} cambió el precio de ${etiqueta}` },
  { coleccion: 'platos', campo: 'precio_terraza',
    frase: (a, etiqueta) => `${a} cambió el precio de terraza de ${etiqueta}` },
  { coleccion: 'platos', campo: 'descripcion',
    frase: (a, etiqueta) => `${a} cambió la descripción de ${etiqueta}` },
  { coleccion: 'platos', campo: 'categoria',
    frase: (a, etiqueta) => `${a} cambió de categoría ${etiqueta}` },
  { coleccion: 'platos', campo: 'foto',
    frase: (a, etiqueta) => `${a} cambió la foto de ${etiqueta}` },
  { coleccion: 'platos', campo: 'alergenos',
    frase: (a, etiqueta) => `${a} cambió los alérgenos de ${etiqueta}` },
  { coleccion: 'eventos', campo: 'visible',
    frase: (a, etiqueta, cambio) => cambio[1] === true || cambio[1] === 'true'
      ? `${a} publicó el evento ${etiqueta}`
      : `${a} dejó de publicar el evento ${etiqueta}` },
  { coleccion: 'avisos_stock', campo: 'resuelto',
    frase: (a, etiqueta, cambio) => cambio[1] === true || cambio[1] === 'true'
      ? `${a} resolvió la falta de ${etiqueta}`
      : `${a} volvió a abrir la falta de ${etiqueta}` },
  { coleccion: 'avisos_stock', campo: 'nivel',
    frase: (a, etiqueta, cambio) => `${a} cambió la falta de ${etiqueta} a «${nivelEnPalabras(cambio[1])}»` },
  { coleccion: 'recuentos', campo: 'estado',
    frase: (a, etiqueta, cambio) => cambio[1] === 'cerrado'
      ? `${a} cerró el recuento del almacén`
      : `${a} volvió a abrir el recuento del almacén` },
  { coleccion: 'users', campo: 'rol',
    frase: (a, etiqueta, cambio) => `${a} cambió el rol de ${etiqueta} a ${rolEnPalabras(cambio[1])}` },
]

const ESTADOS_RESERVA = {
  pendiente: 'dejó pendiente',
  confirmada: 'confirmó',
  sentada: 'sentó',
  cumplida: 'dio por cumplida',
  anulada: 'canceló',
  no_presentada: 'marcó como no presentada',
}

function estadoDeReserva(actor, etiqueta, cambio) {
  const verbo = ESTADOS_RESERVA[cambio[1]] || 'cambió el estado de'
  return `${actor} ${verbo} la reserva${etiqueta ? ` de ${etiqueta}` : ''}`
}

const NIVELES = { agotado: 'agotado', queda_poco: 'queda poco' }
function nivelEnPalabras(nivel) { return NIVELES[nivel] || String(nivel || '') }

const ROLES = { admin: 'administrador', empleado: 'empleado' }
function rolEnPalabras(rol) { return ROLES[rol] || String(rol || '') }

/**
 * La frase que se lee en la pantalla de Actividad.
 *
 *   frase({ actor: 'Santi', accion: 'editar', coleccion: 'reservas',
 *           etiqueta: 'Marta García', cambios: { hora: ['20:00', '21:00'] } })
 *   -> «Santi modificó la reserva de Marta García»
 *
 * FUNCION PURA.
 */
function frase({ actor, accion, coleccion, etiqueta = '', cambios = {}, extra = '' }) {
  const a = actor || 'Alguien'

  if (accion === 'entrar') return `${a} inició sesión`
  if (accion === 'salir') return `${a} cerró la sesión`
  if (accion === 'entrar_fallido') {
    return `Intento de acceso fallido${extra ? ` con el usuario ${extra}` : ''}`
  }

  const r = RECURSOS[coleccion]
  if (!r) return `${a} ${accion === 'crear' ? 'creó' : accion === 'borrar' ? 'borró' : 'modificó'} algo`

  // Un cambio contado gana a la frase generica: dice lo mismo pero util.
  if (accion === 'editar') {
    for (const c of CAMBIOS_CONTADOS) {
      if (c.coleccion === coleccion && cambios[c.campo]) {
        return c.frase(a, etiqueta || nombrePelado(r), cambios[c.campo])
      }
    }
  }

  const verbo = accion === 'crear' ? 'creó' : accion === 'borrar' ? 'borró' : 'modificó'
  const cosa = etiqueta
    ? `${r.articulo} ${r.nombre}${r.de ? ' de' : ''} ${etiqueta}`
    : `${r.articulo} ${nombrePelado(r)}`

  return `${a} ${verbo} ${cosa}`
}

/** «ficha de» -> «ficha» cuando no hay nombre detras al que engancharla. */
function nombrePelado(r) {
  return r.nombre.replace(/ de$/, '')
}


// ===========================================================================
// La parte que SI toca la base
// ===========================================================================
// Todo lo de arriba son funciones puras y se prueban sueltas. Lo de aqui abajo
// necesita PocketBase, y vive en este mismo fichero por un motivo muy concreto:
// el alcance de los hooks (DECISIONES.md, D-22). Cada handler corre en un
// runtime aislado y NO ve lo que se declare en el nivel superior de su propio
// fichero, asi que la unica forma de compartir codigo entre handlers es un
// require() dentro de cada uno. Un ayudante suelto en actividad.pb.js seria
// invisible justo donde hace falta.

/**
 * Quien firma la linea. SALE DE LA SESION Y DE NINGUN OTRO SITIO.
 *
 * Devuelve null —y entonces no se apunta nada— en los dos casos que no son una
 * accion del equipo: sin sesion (la web publica) y con sesion de superusuario
 * (el panel de PocketBase, las migraciones y las pruebas).
 */
function actorDe(e) {
  try {
    if (e.hasSuperuserAuth()) return null
    const quien = e.auth
    if (!quien) return null
    if (quien.collection().name !== 'users') return null
    return {
      id: quien.id,
      nombre: quien.getString('nombre') || quien.getString('usuario') || 'Sin nombre',
    }
  } catch (err) {
    return null
  }
}

/**
 * El registro como objeto de JavaScript corriente.
 *
 * Se usa publicExport() y no un recorrido campo a campo porque es lo que ya
 * deja fuera los campos ocultos de PocketBase —`password` y `tokenKey` de las
 * cuentas— sin tener que acordarse de ellos. La lista negra de arriba se aplica
 * igualmente encima: dos cierres para la misma puerta, que es lo que toca
 * cuando detras hay contrasenas.
 */
function instantanea(registro) {
  if (!registro) return {}
  try {
    return JSON.parse(JSON.stringify(registro.publicExport()))
  } catch (err) {
    return {}
  }
}

/**
 * La UNICA funcion que escribe en `actividad`.
 *
 * Entra por app.save() y no por la API, asi que no pasa por las reglas de la
 * coleccion: por eso las cuatro de escritura pueden quedarse en null y nadie
 * puede fabricarse una linea desde fuera diciendo que fue otro quien borro la
 * reserva.
 *
 * NO LANZA NUNCA. Que la auditoria se atragante no puede impedir que alguien
 * confirme una reserva en mitad de un servicio: si falla, queda el aviso en el
 * diario del servidor y la operacion sigue su camino.
 */
function anotar(app, { actor, coleccion, accion, recursoId, etiqueta, cambios, extra }) {
  try {
    const fila = new Record(app.findCollectionByNameOrId('actividad'))
    fila.set('actor', actor && actor.id ? actor.id : '')
    fila.set('actor_nombre', (actor && actor.nombre) || 'desconocido')
    fila.set('accion', accion)
    fila.set('recurso', coleccion ? recursoDe(coleccion) : 'sesion')
    fila.set('recurso_id', recursoId || '')
    fila.set('descripcion', frase({
      actor: actor ? actor.nombre : '',
      accion: accion,
      coleccion: coleccion,
      etiqueta: etiqueta || '',
      cambios: cambios || {},
      extra: extra || '',
    }))

    const datos = {}
    if (cambios && Object.keys(cambios).length) datos.cambios = cambios
    if (extra) datos.identidad = extra
    if (Object.keys(datos).length) fila.set('datos', datos)

    app.save(fila)
    return true
  } catch (err) {
    try {
      app.logger().warn('Actividad: no se ha podido apuntar una acción',
        'accion', accion, 'coleccion', String(coleccion || ''), 'error', String(err))
    } catch (ni) { /* ni eso */ }
    return false
  }
}

module.exports = {
  SENSIBLES,
  PERSONALES,
  AUTOMATICOS,
  TAPADO,
  RECURSOS,
  NO_SE_AUDITA,
  recursoDe,
  esSensible,
  esPersonal,
  diferencias,
  sanear,
  valorLegible,
  etiquetaDe,
  frase,
  actorDe,
  instantanea,
  anotar,
  rolEnPalabras,
  nivelEnPalabras,
}

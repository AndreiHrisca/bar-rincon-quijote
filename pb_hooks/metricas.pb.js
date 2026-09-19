/// <reference path="../pb_data/types.d.ts" />
//
// Metricas sin espiar — El Rincon del Quijote
// ===========================================================================
// Esto NO es analitica web. Es un contador de tres cosas, y la seccion 13 del
// encargo es explicita en lo que NO puede hacer:
//
//   - Sin cookies, sin identificador de visitante, sin IP guardada, sin
//     user-agent, sin referente, sin hora. Solo el DIA.
//   - Agregado por dia EN EL SERVIDOR. Nunca una fila por visita: la fila del
//     dia se suma, no se anade.
//   - Solo tres tipos: escaneo de carta, busqueda sin resultado y vista de
//     plato. Ni uno mas.
//
// Con lo que se guarda es IMPOSIBLE reconstruir el recorrido de una persona, y
// eso es justo lo que se busca. Va escrito tambien en la politica de privacidad
// (web/js/vistas/legal.js), que es donde lo lee el cliente.
//
// Dos rutas:
//   POST /api/quijote/metrica       cuenta una. Publica, la llama la carta.
//   GET  /api/quijote/estadisticas  el resumen del panel. Con sesion.
//
// POR QUE UNA RUTA Y NO ESCRIBIR EN LA COLECCION: `metricas` tiene las cuatro
// reglas de escritura a null (nadie escribe por la API). Si el publico pudiera
// crear registros podria inventarse tipos, dias y contadores. Aqui solo entra
// lo que este codigo acepta.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): cada handler corre en
// un runtime de JavaScript aislado. Todo lo que necesitan se declara DENTRO.
// ===========================================================================

// ---------------------------------------------------------------------------
// POST /api/quijote/metrica   { tipo, valor }
// ---------------------------------------------------------------------------
// Responde 204 y sin cuerpo: la carta la llama con sendBeacon y no espera nada.
// Si algo va mal tambien responde 204. Un contador roto NO puede romper la
// carta de un bar.
routerAdd('POST', '/api/quijote/metrica', (e) => {
  const TIPOS = ['escaneo', 'busqueda_sin_resultado', 'vista_plato']

  // --- Freno por IP --------------------------------------------------------
  // Cada valor distinto crea una fila. Sin freno, cualquiera llena la tabla de
  // busquedas inventadas. El contador vive en memoria ($app.store(), comun a
  // todos los runtimes) y se pierde al reiniciar: LA IP NO SE ESCRIBE EN DISCO
  // EN NINGUN MOMENTO, que es lo que promete la seccion 13.
  const MAXIMO_POR_MINUTO = 40
  const ahora = Date.now()
  const clave = `metricas_${e.realIP || 'desconocida'}`
  const previas = e.app.store().get(clave) || []
  const marcas = previas.filter((t) => ahora - t < 60000)
  if (marcas.length >= MAXIMO_POR_MINUTO) return e.noContent(204)
  marcas.push(ahora)
  e.app.store().set(clave, marcas)

  // --- Que se cuenta -------------------------------------------------------
  const datos = new DynamicModel({ tipo: '', valor: '' })
  try {
    e.bindBody(datos)
  } catch (err) {
    return e.noContent(204)
  }

  const tipo = String(datos.tipo || '')
  if (TIPOS.indexOf(tipo) === -1) return e.noContent(204)

  let valor = String(datos.valor || '').trim().replace(/\s+/g, ' ')

  if (tipo === 'escaneo') {
    // El unico "valor" del escaneo es el idioma en que se vio la carta, y de
    // ahi sale el reparto por idioma que pide la seccion 7. No hace falta
    // contar nada mas para saberlo, asi que no se cuenta nada mas.
    valor = valor === 'en' ? 'en' : 'es'

  } else if (tipo === 'vista_plato') {
    // Se comprueba que el plato EXISTE antes de contarlo. Si no, cualquiera
    // podria inventarse nombres y ensuciar la lista de "platos mas mirados"
    // con una fila nueva por cada disparate.
    //
    // SE CUENTA POR NOMBRE, no por identificador, y tiene una consecuencia
    // conocida: los dos platos que se llaman igual en categorias distintas
    // («Casera», «Pincho de tortilla», D-77) suman en la misma fila. Se acepta a
    // proposito: el nombre es lo que se lee en la lista del panel y lo que
    // sigue diciendo algo el dia que el plato se borre de la carta, y para
    // «que se mira mas» dos cañas del mismo nombre son la misma cosa.
    if (!valor) return e.noContent(204)
    let plato = null
    try {
      plato = e.app.findFirstRecordByFilter('platos', 'nombre = {:n}', { n: valor })
    } catch (err) {
      plato = null
    }
    if (!plato) return e.noContent(204)

  } else {
    // Busqueda sin resultado: texto libre, que es justo lo que tiene valor
    // ("menu del dia", "paella"). Se guarda en minusculas y recortado para que
    // «Paella», «paella» y «paella  » sean la misma fila.
    valor = valor.toLowerCase().slice(0, 60)
    if (valor.length < 3) return e.noContent(204)
  }

  // --- El dia natural de Madrid -------------------------------------------
  // El contenedor va en Europe/Madrid (docker-compose.yml), asi que la fecha
  // local ES la del bar. Se compone a mano y no con toISOString(), que daria el
  // dia anterior para todo lo que pasa despues de medianoche, que en un bar
  // abierto hasta las 02:00 es media noche de trabajo.
  const hoy = new Date()
  const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`

  sumarUna(e.app, dia, tipo, valor)
  return e.noContent(204)

  /**
   * Suma uno a la fila del dia, o la crea. El indice unico (dia, tipo, valor)
   * es lo que convierte la tabla en un contador: la segunda visita del dia no
   * anade fila, suma en la que ya hay.
   *
   * findFirstRecordByFilter LANZA cuando no encuentra nada (no devuelve null),
   * y los errores vienen de Go: no se pueden distinguir por su clase. Por eso
   * se busca dentro del try y se decide fuera.
   */
  function sumarUna(app, d, t, v, reintento) {
    let fila = null
    try {
      fila = app.findFirstRecordByFilter('metricas',
        'dia = {:d} && tipo = {:t} && valor = {:v}', { d, t, v })
    } catch (err) {
      fila = null
    }

    try {
      if (fila) {
        fila.set('contador', fila.getInt('contador') + 1)
        app.save(fila)
      } else {
        const nueva = new Record(app.findCollectionByNameOrId('metricas'))
        nueva.set('dia', d)
        nueva.set('tipo', t)
        nueva.set('valor', v)
        nueva.set('contador', 1)
        app.save(nueva)
      }
    } catch (err) {
      // Dos visitas a la vez con la misma clave: una crea la fila y la otra
      // choca contra el indice unico. Se vuelve a intentar UNA vez, que ya
      // encontrara la fila recien creada. Si vuelve a fallar, se pierde una
      // visita y no pasa nada: es un contador, no una reserva.
      if (!reintento) return sumarUna(app, d, t, v, true)
      app.logger().warn('Metrica no guardada', 'tipo', t, 'error', String(err))
    }
  }
})

// ---------------------------------------------------------------------------
// GET /api/quijote/estadisticas?dias=7
// ---------------------------------------------------------------------------
// El resumen que pinta el panel, agregado en SQLite. Se hace aqui y no en el
// navegador porque un mes de carta son miles de filas: sumarlas en el servidor
// son 2 KB de JSON en vez de bajarse la tabla entera a un movil.
routerAdd('GET', '/api/quijote/estadisticas', (e) => {
  const quien = e.auth
  if (!quien) return e.json(401, { error: 'Hace falta iniciar sesión.' })

  // El superusuario entra: es la valvula de escape para mirar la base cuando
  // algo se tuerce, y no tiene campo `rol` que comprobar. Mismo criterio que en
  // pb_hooks/roles.pb.js.
  const rol = e.hasSuperuserAuth() ? 'admin' : quien.getString('rol')
  if (rol !== 'admin') {
    return e.json(403, { error: 'Las estadísticas de la carta son del administrador.' })
  }

  const pedidos = parseInt(String(e.request.url.query().get('dias') || ''), 10)
  const dias = [7, 30, 90].indexOf(pedidos) !== -1 ? pedidos : 7

  // El rango, en dias naturales de Madrid. Se calcula restando dias a una fecha
  // local: asi el cambio de hora de octubre no descuadra el ultimo dia.
  const aClave = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
  const hoy = new Date()
  const desdeFecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1))
  const desde = aClave(desdeFecha)
  const hasta = aClave(hoy)

  const filas = arrayOf(new DynamicModel({ dia: '', tipo: '', valor: '', total: 0 }))
  e.app.db()
    .newQuery(`
      SELECT dia, tipo, valor, SUM(contador) AS total
      FROM metricas
      WHERE dia >= {:desde} AND dia <= {:hasta}
      GROUP BY dia, tipo, valor`)
    .bind({ desde, hasta })
    .all(filas)

  // --- Escaneos: total, reparto por idioma y serie por dia -----------------
  const porDia = {}
  for (let i = 0; i < dias; i++) {
    const f = new Date(desdeFecha.getFullYear(), desdeFecha.getMonth(), desdeFecha.getDate() + i)
    porDia[aClave(f)] = 0
  }

  let escaneos = 0
  let enIngles = 0
  let vistas = 0
  let busquedasTotal = 0
  const platos = {}
  const busquedas = {}

  for (const f of filas) {
    if (f.tipo === 'escaneo') {
      escaneos += f.total
      if (f.valor === 'en') enIngles += f.total
      if (porDia[f.dia] !== undefined) porDia[f.dia] += f.total
    } else if (f.tipo === 'vista_plato') {
      vistas += f.total
      platos[f.valor] = (platos[f.valor] || 0) + f.total
    } else if (f.tipo === 'busqueda_sin_resultado') {
      busquedasTotal += f.total
      busquedas[f.valor] = (busquedas[f.valor] || 0) + f.total
    }
  }

  const masMirados = (obj, cuantos) => Object.keys(obj)
    .map((valor) => ({ valor, total: obj[valor] }))
    .sort((a, b) => b.total - a.total || a.valor.localeCompare(b.valor))
    .slice(0, cuantos)

  return e.json(200, {
    dias,
    desde,
    hasta,
    escaneos: {
      total: escaneos,
      en_ingles: enIngles,
      // Se manda ya calculado: es el mismo numero para todos y no tiene sentido
      // que cada movil lo divida por su cuenta.
      pct_ingles: escaneos ? Math.round((enIngles / escaneos) * 100) : 0,
    },
    por_dia: Object.keys(porDia).sort().map((dia) => ({ dia, total: porDia[dia] })),
    // Los totales van aparte de las listas: las listas son los ocho primeros
    // (lo que cabe en una pantalla de movil) y sumarlas daria de menos.
    vistas_plato: vistas,
    busquedas_sin_resultado: busquedasTotal,
    platos: masMirados(platos, 8),
    busquedas: masMirados(busquedas, 8),
  })
})

/// <reference path="../pb_data/types.d.ts" />
//
// Importadores de CSV — El Rincon del Quijote
// ---------------------------------------------------------------------------
// Anade dos subcomandos a PocketBase:
//
//   docker exec quijote-pocketbase pocketbase importar-carta     seed/carta.csv
//   docker exec quijote-pocketbase pocketbase importar-productos seed/productos.csv
//
// Van como subcomando y no como script aparte por dos motivos: no hay Node en
// el servidor, y asi el importador usa las MISMAS validaciones que la API (si
// un precio esta mal, falla igual que fallaria por el panel).
//
// Los dos son IDEMPOTENTES: se identifican por nombre, asi que volver a
// importar el mismo fichero actualiza en vez de duplicar. Se puede corregir un
// precio en el CSV y reimportar sin limpiar nada.
// ---------------------------------------------------------------------------

// --- Lector de CSV ---------------------------------------------------------
// Suficiente para estos ficheros: separador coma, comillas dobles opcionales
// con "" para escaparlas, y lineas que empiezan por # que se ignoran.
// No usamos una libreria por una sola funcion de veinte lineas.
function leerCsv(texto) {
  const filas = []
  let campo = ''
  let fila = []
  let entreComillas = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]

    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ }
        else entreComillas = false
      } else campo += c
      continue
    }

    if (c === '"') { entreComillas = true }
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
    } else campo += c
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila) }

  // Fuera comentarios y lineas en blanco.
  const utiles = filas.filter((f) => {
    const primera = (f[0] || '').trim()
    return primera !== '' && !primera.startsWith('#')
  })
  if (!utiles.length) return []

  const cabecera = utiles[0].map((h) => h.trim())
  return utiles.slice(1).map((f) => {
    const o = {}
    cabecera.forEach((h, i) => { o[h] = (f[i] || '').trim() })
    return o
  })
}

// Acepta "14,00" y "14.00". En un bar espanol el CSV va a salir de una hoja de
// calculo con coma decimal tarde o temprano.
function aNumero(texto) {
  if (texto === undefined || texto === null || texto === '') return null
  const n = parseFloat(String(texto).replace(',', '.'))
  return isNaN(n) ? null : n
}

function aSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // fuera acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Busca un registro por un campo de texto, o devuelve null.
function buscarPor(app, coleccion, campo, valor) {
  try {
    return app.findFirstRecordByFilter(coleccion, `${campo} = {:v}`, { v: valor })
  } catch (e) {
    return null
  }
}

// ---------------------------------------------------------------------------
// importar-carta
// ---------------------------------------------------------------------------
$app.rootCmd.addCommand(new Command({
  use: 'importar-carta [fichero.csv]',
  short: 'Importa categorias y platos desde un CSV',
  run: (cmd, args) => {
    const ruta = args[0] || 'seed/carta.csv'
    // $os.readFile devuelve bytes; toString() es el ayudante de PocketBase para
    // pasarlos a texto. String() daria "72,101,..." y el CSV saldria vacio.
    const texto = toString($os.readFile(ruta))
    const filas = leerCsv(texto)

    if (!filas.length) {
      console.log(`No hay ninguna fila util en ${ruta}.`)
      return
    }

    const ALERGENOS = ['gluten', 'crustaceos', 'huevos', 'pescado', 'cacahuetes',
      'soja', 'lacteos', 'frutos_cascara', 'apio', 'mostaza', 'sesamo',
      'sulfitos', 'altramuces', 'moluscos']

    const colCategorias = $app.findCollectionByNameOrId('categorias')
    const colPlatos = $app.findCollectionByNameOrId('platos')

    let nuevasCat = 0, nuevos = 0, actualizados = 0, sinPrecio = 0
    const problemas = []
    const ordenPorCategoria = {}

    filas.forEach((f, indice) => {
      const linea = indice + 1
      if (!f.categoria || !f.nombre) {
        problemas.push(`fila ${linea}: falta la categoria o el nombre`)
        return
      }

      // --- Categoria: se crea si no existe ---
      let categoria = buscarPor($app, 'categorias', 'nombre', f.categoria)
      if (!categoria) {
        categoria = new Record(colCategorias)
        categoria.set('nombre', f.categoria)
        categoria.set('slug', aSlug(f.categoria))
        categoria.set('orden', nuevasCat * 10)
        categoria.set('visible', true)
        $app.save(categoria)
        nuevasCat++
      }

      // --- Precios ---
      // El precio de barra PUEDE VENIR VACIO: significa que ese plato todavia
      // no tiene precio. Se guarda igual —el nombre, la descripcion y los
      // alergenos ya son trabajo hecho— pero no sale en la carta publica: lo
      // impide la regla de la coleccion (D-76). Lo que si es un error es
      // escribir algo que no sea un numero.
      const barra = aNumero(f.precio_barra)
      if (barra === null && (f.precio_barra || '').trim() !== '') {
        problemas.push(`fila ${linea} (${f.nombre}): el precio de barra no es un numero`)
        return
      }
      if (barra === null) sinPrecio++
      // Vacio a proposito: se muestra un unico precio, no se calcula recargo.
      const terraza = aNumero(f.precio_terraza)

      // --- Alergenos ---
      const alergenos = (f.alergenos || '')
        .split('|').map((a) => a.trim().toLowerCase()).filter(Boolean)
      const desconocidos = alergenos.filter((a) => ALERGENOS.indexOf(a) === -1)
      if (desconocidos.length) {
        problemas.push(`fila ${linea} (${f.nombre}): alergeno desconocido: ${desconocidos.join(', ')}`)
        return
      }

      // --- Plato: por nombre Y CATEGORIA, para poder reimportar ---
      // Por nombre a secas no vale: la carta real tiene «Casera» en cervezas y
      // en refrescos, y «Pincho de tortilla» en raciones y en sandwiches. Con
      // la busqueda por nombre suelto, la segunda fila movia la primera de
      // categoria en vez de crear la suya, y la carta perdia platos.
      let plato = null
      try {
        plato = $app.findFirstRecordByFilter('platos',
          'nombre = {:n} && categoria = {:c}', { n: f.nombre, c: categoria.id })
      } catch (e) {
        plato = null
      }
      const esNuevo = !plato
      if (esNuevo) {
        plato = new Record(colPlatos)
        plato.set('visible', true)
        const cid = categoria.id
        ordenPorCategoria[cid] = (ordenPorCategoria[cid] || 0) + 10
        plato.set('orden', ordenPorCategoria[cid])
      }

      plato.set('categoria', categoria.id)
      plato.set('nombre', f.nombre)
      plato.set('descripcion', f.descripcion || '')
      plato.set('precio_barra', barra === null ? 0 : barra)
      plato.set('precio_terraza', terraza)
      plato.set('alergenos', alergenos)

      try {
        $app.save(plato)
        esNuevo ? nuevos++ : actualizados++
      } catch (e) {
        problemas.push(`fila ${linea} (${f.nombre}): ${e}`)
      }
    })

    console.log('')
    console.log(`Carta importada desde ${ruta}:`)
    console.log(`  ${nuevasCat} categorias nuevas`)
    console.log(`  ${nuevos} platos nuevos`)
    console.log(`  ${actualizados} platos actualizados`)
    if (sinPrecio) {
      console.log(`  ${sinPrecio} SIN PRECIO todavia: estan guardados pero NO salen en la carta publica`)
    }
    if (problemas.length) {
      console.log(`\n  ${problemas.length} filas NO importadas:`)
      problemas.forEach((p) => console.log(`    - ${p}`))
    }
    console.log('')
  },
}))

// ---------------------------------------------------------------------------
// importar-productos
// ---------------------------------------------------------------------------
$app.rootCmd.addCommand(new Command({
  use: 'importar-productos [fichero.csv]',
  short: 'Importa productos y proveedores del almacen desde un CSV',
  run: (cmd, args) => {
    const ruta = args[0] || 'seed/productos.csv'
    // $os.readFile devuelve bytes; toString() es el ayudante de PocketBase para
    // pasarlos a texto. String() daria "72,101,..." y el CSV saldria vacio.
    const texto = toString($os.readFile(ruta))
    const filas = leerCsv(texto)

    if (!filas.length) {
      console.log(`No hay ninguna fila util en ${ruta}.`)
      return
    }

    const CATEGORIAS = ['carne', 'pescado', 'verdura', 'lacteos', 'bebidas',
      'congelados', 'seco', 'limpieza', 'desechables', 'otros']
    const UBICACIONES = ['camara', 'congelador', 'sotano', 'barra', 'cocina', 'otros']

    const colProveedores = $app.findCollectionByNameOrId('proveedores')
    const colProductos = $app.findCollectionByNameOrId('productos')

    let nuevosProv = 0, nuevos = 0, actualizados = 0
    const problemas = []
    const ordenPorUbicacion = {}

    filas.forEach((f, indice) => {
      const linea = indice + 1
      if (!f.nombre) {
        problemas.push(`fila ${linea}: falta el nombre`)
        return
      }

      // --- Proveedor: se crea si no existe ---
      let proveedor = null
      if (f.proveedor) {
        proveedor = buscarPor($app, 'proveedores', 'nombre', f.proveedor)
        if (!proveedor) {
          proveedor = new Record(colProveedores)
          proveedor.set('nombre', f.proveedor)
          proveedor.set('activo', true)
          $app.save(proveedor)
          nuevosProv++
        }
      }

      const categoria = (f.categoria_almacen || 'otros').toLowerCase()
      if (CATEGORIAS.indexOf(categoria) === -1) {
        problemas.push(`fila ${linea} (${f.nombre}): categoria de almacen desconocida: ${categoria}`)
        return
      }
      const ubicacion = (f.ubicacion || 'otros').toLowerCase()
      if (UBICACIONES.indexOf(ubicacion) === -1) {
        problemas.push(`fila ${linea} (${f.nombre}): ubicacion desconocida: ${ubicacion}`)
        return
      }

      let producto = buscarPor($app, 'productos', 'nombre', f.nombre)
      const esNuevo = !producto
      if (esNuevo) {
        producto = new Record(colProductos)
        producto.set('activo', true)
        ordenPorUbicacion[ubicacion] = (ordenPorUbicacion[ubicacion] || 0) + 10
        producto.set('orden', ordenPorUbicacion[ubicacion])
      }

      producto.set('nombre', f.nombre)
      producto.set('categoria_almacen', categoria)
      producto.set('unidad', f.unidad || '')
      producto.set('stock_minimo', aNumero(f.stock_minimo) || 0)
      producto.set('pedido_habitual', aNumero(f.pedido_habitual) || 0)
      producto.set('proveedor', proveedor ? proveedor.id : '')
      producto.set('ubicacion', ubicacion)
      // Viene del CSV con todo relleno, asi que NO esta "sin configurar": esa
      // marca es solo para los que se crean al vuelo desde cocina.
      producto.set('sin_configurar', false)

      try {
        $app.save(producto)
        esNuevo ? nuevos++ : actualizados++
      } catch (e) {
        problemas.push(`fila ${linea} (${f.nombre}): ${e}`)
      }
    })

    console.log('')
    console.log(`Almacen importado desde ${ruta}:`)
    console.log(`  ${nuevosProv} proveedores nuevos`)
    console.log(`  ${nuevos} productos nuevos`)
    console.log(`  ${actualizados} productos actualizados`)
    if (problemas.length) {
      console.log(`\n  ${problemas.length} filas NO importadas:`)
      problemas.forEach((p) => console.log(`    - ${p}`))
    }
    console.log('')
  },
}))

/// <reference path="../pb_data/types.d.ts" />
//
// Colecciones "eventos" y "metricas" — El Rincon del Quijote
// ---------------------------------------------------------------------------

migrate((app) => {

  // --- Eventos -------------------------------------------------------------
  // Celebraciones (bautizos, comuniones, bodas, comidas de empresa) y el menu
  // navideno cerrado, que hoy se imprime en papel cada ano.
  const eventos = new Collection({
    type: 'base',
    name: 'eventos',

    listRule: 'visible = true || @request.auth.id != ""',
    viewRule: 'visible = true || @request.auth.id != ""',

    createRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    updateRule: '@request.auth.rol = "dueno" || @request.auth.rol = "encargado"',
    deleteRule: '@request.auth.rol = "dueno"',

    fields: [
      { name: 'titulo',      type: 'text', required: true, max: 120 },
      { name: 'descripcion', type: 'text', max: 2000 },

      { name: 'fecha_inicio', type: 'date', required: true },
      // Vacia si el evento es de un solo dia.
      { name: 'fecha_fin',    type: 'date' },

      { name: 'hora', type: 'text', max: 5,
        pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },

      // Numero, no texto: el menu navideno son 40 EUR por persona y hay que
      // poder formatearlo igual que los precios de la carta.
      { name: 'precio', type: 'number', min: 0 },

      { name: 'visible', type: 'bool' },

      { name: 'imagen', type: 'file', maxSelect: 1, maxSize: 8388608,
        mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        thumbs: ['400x0', '800x0'] },

      { name: 'titulo_en',      type: 'text', max: 120 },
      { name: 'descripcion_en', type: 'text', max: 2000 },

      { name: 'creado', type: 'autodate', onCreate: true },
    ],

    indexes: [
      'CREATE INDEX idx_eventos_fecha ON eventos (visible, fecha_inicio)',
    ],
  })
  app.save(eventos)

  // --- Metricas ------------------------------------------------------------
  // METRICAS SIN ESPIAR (seccion 13). Esto no es analitica web: es un contador.
  //
  //   - Se AGREGA POR DIA en el servidor. Nunca una fila por evento.
  //   - Sin cookies, sin identificador de usuario, sin IP, sin user-agent.
  //   - Solo tres cosas: escaneo de carta, busqueda sin resultado y vista de
  //     plato. Nada mas.
  //
  // Con estos campos es IMPOSIBLE reconstruir el recorrido de una persona, que
  // es exactamente lo que se pretende. Documentado en la politica de privacidad.
  const metricas = new Collection({
    type: 'base',
    name: 'metricas',

    // Solo el equipo ve las estadisticas.
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',

    // Nadie escribe aqui por la API: ni el publico ni el panel. Las filas las
    // crea y suma el hook del servidor (pb_hooks/metricas.pb.js) a traves de
    // una ruta propia que no acepta mas que el tipo y el valor.
    createRule: null,
    updateRule: null,
    deleteRule: null,

    fields: [
      { name: 'tipo', type: 'select', maxSelect: 1, required: true,
        values: ['escaneo', 'busqueda_sin_resultado', 'vista_plato'] },

      // Que se conto: el slug del plato, el texto buscado, o vacio para el
      // escaneo. Nunca datos de la persona.
      { name: 'valor', type: 'text', max: 120 },

      // Dia en formato AAAA-MM-DD. Texto y no fecha: la clave de agregacion es
      // el dia natural de Madrid, no un instante.
      { name: 'dia', type: 'text', required: true, max: 10,
        pattern: '^\\d{4}-\\d{2}-\\d{2}$' },

      { name: 'contador', type: 'number', required: true, min: 1, onlyInt: true },
    ],

    indexes: [
      // La clave de agregacion. El indice unico es lo que convierte esto en un
      // contador: la segunda visita del dia suma 1 en la fila que ya existe en
      // vez de crear otra.
      'CREATE UNIQUE INDEX idx_metricas_clave ON metricas (dia, tipo, valor)',
      'CREATE INDEX idx_metricas_dia ON metricas (dia, tipo)',
    ],
  })
  app.save(metricas)

}, (app) => {
  app.delete(app.findCollectionByNameOrId('metricas'))
  app.delete(app.findCollectionByNameOrId('eventos'))
})

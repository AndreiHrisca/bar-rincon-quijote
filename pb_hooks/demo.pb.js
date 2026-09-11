/// <reference path="../pb_data/types.d.ts" />
//
// Subcomando de datos de demostracion — El Rincon del Quijote
// ---------------------------------------------------------------------------
//   docker exec quijote-pocketbase pocketbase demo --dir=/pb/pb_data
//
// La logica vive en seed/demo.js; esto solo la engancha como subcomando. Ver
// alli la advertencia: SON DATOS FICTICIOS Y NO SE EJECUTA EN PRODUCCION.
// ---------------------------------------------------------------------------

$app.rootCmd.addCommand(new Command({
  use: 'demo',
  short: 'Genera datos ficticios para ver el panel lleno (NUNCA en produccion)',
  run: (cmd, args) => {
    // require() del JSVM resuelve relativo a pb_hooks/, de ahi el ../seed.
    const demo = require(`${__hooks}/../seed/demo.js`)
    demo.generar($app)
  },
}))

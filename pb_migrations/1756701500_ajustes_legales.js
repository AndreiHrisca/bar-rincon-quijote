/// <reference path="../pb_data/types.d.ts" />
//
// Datos del titular para los textos legales — El Rincon del Quijote
// ---------------------------------------------------------------------------
// La seccion 12 del encargo pide aviso legal, politica de privacidad y politica
// de cookies accesibles desde la web. Los tres se han escrito en la fase 10
// (web/js/vistas/legal.js), pero un aviso legal tiene que decir QUIEN esta
// detras de la web, y eso son cuatro datos que este proyecto no puede
// inventarse:
//
//   titular_legal      la persona o sociedad que responde (no el nombre
//                      comercial: «El Rincon del Quijote» es el rotulo).
//   nif                NIF o CIF de esa persona o sociedad.
//   direccion_fiscal   domicilio a efectos de notificaciones. Distinto de
//                      `direccion`, que es donde se come.
//   correo_contacto    una via escrita para ejercer los derechos de proteccion
//                      de datos. El telefono no basta: la ley pide poder
//                      dirigirse al responsable de forma directa y efectiva.
//
// NACEN VACIOS A PROPOSITO. Un NIF inventado en un aviso legal es peor que un
// aviso legal incompleto: el primero es falso y el segundo esta a medias. La
// pagina publica omite la linea que no tenga dato, y el panel se lo recuerda al
// dueno en «Más» hasta que los rellene. Ver DECISIONES.md, D-92.
//
// Los campos son de LECTURA PUBLICA como el resto de `ajustes`: tienen que
// poder pintarse en el aviso legal sin sesion, y son exactamente los datos que
// la ley obliga a publicar.
// ---------------------------------------------------------------------------

migrate((app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')

  ajustes.fields.add(new Field({ name: 'titular_legal',    type: 'text', max: 200 }))
  ajustes.fields.add(new Field({ name: 'nif',              type: 'text', max: 20 }))
  ajustes.fields.add(new Field({ name: 'direccion_fiscal', type: 'text', max: 200 }))
  ajustes.fields.add(new Field({ name: 'correo_contacto',  type: 'email' }))

  app.save(ajustes)

}, (app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')
  ajustes.fields.removeByName('titular_legal')
  ajustes.fields.removeByName('nif')
  ajustes.fields.removeByName('direccion_fiscal')
  ajustes.fields.removeByName('correo_contacto')
  app.save(ajustes)
})

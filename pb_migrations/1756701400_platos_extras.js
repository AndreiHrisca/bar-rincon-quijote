/// <reference path="../pb_data/types.d.ts" />
//
// Un plato puede admitir ingredientes extra
// ---------------------------------------------------------------------------
// En la barra se ofrece «¿le pongo huevo?» sobre un bocadillo o una
// hamburguesa. Eso NO es un plato del catalogo: es una alternativa que se
// ofrece DENTRO de ciertos platos, a un precio fijo que no depende del plato ni
// de la categoria.
//
// Por eso aqui solo se anade un interruptor, y no un precio:
//
//   - EL IMPORTE ES UNO SOLO PARA TODO EL BAR y vive en el codigo, en
//     compartido/js/extras.js. No es un dato del plato: si fuese un campo,
//     habria 278 copias del mismo 0,50 y subirlo a 0,60 seria tocar 278 filas.
//     Ademas el sistema no cobra nada —no hay comandas ni caja—, asi que el
//     importe solo se PINTA: es un texto, no una operacion.
//
//   - EL INTERRUPTOR VA EN EL PLATO Y NO EN LA CATEGORIA. Se ha mirado la carta
//     real: las 15 categorias son gruesas («Raciones», «Platos combinados») y
//     dentro de una misma categoria conviven cosas que admiten extra y cosas
//     que no. Y hay una razon de manejo mas fuerte: las categorias NO se editan
//     desde el panel —no existe esa pantalla, solo se tocan por la interfaz de
//     administracion de PocketBase—, asi que un interruptor por categoria no lo
//     podria usar Santi. En el plato cae justo al lado de los precios, que es
//     donde se decide.
//
// ADITIVA Y APAGADA. El campo nace en false para los 278 platos que ya estan:
// hasta que alguien lo encienda, la carta publica se ve exactamente igual que
// antes. No se toca ningun precio ni ningun otro dato.
//
// Ver DECISIONES.md, D-79.
// ---------------------------------------------------------------------------

migrate((app) => {
  const platos = app.findCollectionByNameOrId('platos')

  // Nombre corto a proposito. El nombre de un campo viaja en el JSON de CADA
  // uno de los 278 platos de la carta publica: `admite_ingredientes_extra`
  // costaba unos 3 KB mas de primera carga que `admite_extras`, sobre un
  // presupuesto de 150 KB (D-20, D-78). Dice lo mismo.
  platos.fields.add(new Field({
    name: 'admite_extras',
    type: 'bool',
  }))

  app.save(platos)

}, (app) => {
  const platos = app.findCollectionByNameOrId('platos')
  platos.fields.removeByName('admite_extras')
  app.save(platos)
})

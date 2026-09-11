/// <reference path="../pb_data/types.d.ts" />
//
// Un plato puede no tener precio todavia — y sin precio NO sale en la carta
// ---------------------------------------------------------------------------
// La carta real del bar llego sin precios (278 platos, el 2026-09-04). Cargarla
// es lo que hay que hacer —los nombres, las descripciones y los alergenos ya
// son trabajo hecho— pero `precio_barra` era obligatorio y en PocketBase un
// campo numerico obligatorio RECHAZA EL VALOR 0: no habia forma de guardar un
// plato sin precio, ni por el panel ni por el importador.
//
// Se cambian dos cosas, y la segunda es la que importa:
//
//   1. `precio_barra` deja de ser obligatorio. Un cero significa «todavia no
//      tiene precio», igual que en `productos.stock_minimo` (D-53).
//
//   2. LA REGLA DE LECTURA PUBLICA EXIGE PRECIO. Un plato sin precio no se
//      descarga siquiera sin sesion, exactamente igual que uno apagado. Una
//      carta con platos sin precio no es una carta a medias: es un problema,
//      porque el precio es obligatorio en una lista de precios y porque el
//      cliente que lo ve pregunta «¿y esto cuanto vale?» a alguien que esta
//      sirviendo mesas.
//
// Esto NO se deja en manos de la pantalla. Es el mismo criterio de toda la
// fase 2: lo que no puede salir, no sale del servidor (DECISIONES.md, D-76).
// ---------------------------------------------------------------------------

migrate((app) => {
  const platos = app.findCollectionByNameOrId('platos')

  const precio = platos.fields.getByName('precio_barra')
  precio.required = false

  // Con sesion se ve todo: el panel tiene que poder ensenar lo que le falta a
  // cada plato para poder salir.
  const visibleYConPrecio = '(visible = true && precio_barra > 0) || @request.auth.id != ""'
  platos.listRule = visibleYConPrecio
  platos.viewRule = visibleYConPrecio

  app.save(platos)

}, (app) => {
  const platos = app.findCollectionByNameOrId('platos')
  platos.fields.getByName('precio_barra').required = true
  const anterior = 'visible = true || @request.auth.id != ""'
  platos.listRule = anterior
  platos.viewRule = anterior
  app.save(platos)
})

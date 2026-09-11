/// <reference path="../pb_data/types.d.ts" />
//
// Ajustes que necesitan las reglas de reserva
// ---------------------------------------------------------------------------
// Dos huecos del modelo original que salen a la luz al construir las reservas:
//
// 1. HORARIO DE COCINA CON DOS SERVICIOS. El campo aceptaba un unico tramo
//    ("13:00-23:30"), pero este bar tiene dos: la propia maqueta de la portada
//    dice "Cocina de 12:30 a 16:30 y de 20:00 a 23:30", y la pantalla de reserva
//    dibuja la rejilla de horas partida en comida y cena. Con un solo tramo se
//    ofrecerian franjas a las 18:00, con la cocina cerrada.
//
//    Ahora se admiten varios tramos separados por coma:
//      "12:30-16:30,20:00-23:30"
//    Un solo tramo sigue siendo valido, asi que lo que ya estaba guardado no se
//    rompe.
//
// 2. AFORO DE BARRA. El encargo pide "aforo por zona" y la reserva ofrece cuatro
//    zonas, pero ajustes solo traia aforo_terraza y aforo_salon. Sin el de barra
//    esa zona no se puede limitar. Se anade con el mismo criterio que las otras:
//    arranca a 0, y una zona con aforo 0 NO se ofrece en el formulario (no se
//    ensena como "siempre llena", que seria enganoso).
//    Ver DECISIONES.md, D-21.
// ---------------------------------------------------------------------------

migrate((app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')

  // --- Horario de cocina: uno o varios tramos separados por coma ---
  const horario = ajustes.fields.getByName('horario_cocina')
  horario.pattern = '^([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d(,([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d)*$'

  // --- Aforo de barra ---
  ajustes.fields.add(new Field({
    name: 'aforo_barra',
    type: 'number',
    min: 0,
    onlyInt: true,
  }))

  app.save(ajustes)

  // Se pone el horario real del bar, el de la maqueta de la portada.
  try {
    const fila = app.findFirstRecordByFilter('ajustes', 'id != ""')
    fila.set('horario_cocina', '12:30-16:30,20:00-23:30')
    app.save(fila)
  } catch (e) {
    // Base recien creada sin la fila todavia: la crea la migracion anterior.
  }

}, (app) => {
  const ajustes = app.findCollectionByNameOrId('ajustes')
  const horario = ajustes.fields.getByName('horario_cocina')
  horario.pattern = '^([01]\\d|2[0-3]):[0-5]\\d-([01]\\d|2[0-3]):[0-5]\\d$'
  ajustes.fields.removeByName('aforo_barra')
  app.save(ajustes)
})

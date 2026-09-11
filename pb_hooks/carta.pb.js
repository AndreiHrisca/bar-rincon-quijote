/// <reference path="../pb_data/types.d.ts" />
//
// Carta — sello de "oculto desde"
// ===========================================================================
// Cuando un plato se apaga, se anota CUANDO se apago. De ahi sale el aviso de
// la pantalla "Hoy": «Croquetas de boletus y sepia están ocultos en la carta
// desde el sábado». Sin la fecha el aviso no dice nada util: lo que preocupa no
// es que un plato este agotado hoy, es que lleve una semana agotado y nadie se
// haya acordado de volver a encenderlo.
//
// Lo escribe el servidor y no la persona (asi lo anuncia la migracion
// 1756700400_carta.js): si fuese un campo del formulario, se quedaria sin poner
// justo el dia que hay lio en la cocina, que es cuando hace falta.
//
// El campo se limpia al volver a encender el plato, para que el proximo apagon
// no herede una fecha vieja.
//
// Cada handler corre en un runtime aislado (DECISIONES.md, D-22): todo lo que
// necesita se declara dentro.
// ===========================================================================

onRecordUpdateRequest((e) => {
  const antes = e.record.original()
  const visibleAntes = antes.getBool('visible')
  const visibleAhora = e.record.getBool('visible')

  if (visibleAntes === visibleAhora) return e.next()

  if (visibleAhora) {
    e.record.set('oculto_desde', '')
  } else {
    // Convenio del proyecto para los campos de fecha SIN hora: medianoche UTC
    // del dia del calendario. La medianoche LOCAL de Madrid pasada por
    // toISOString() cae en el dia anterior y el aviso diria "desde el viernes"
    // de un plato apagado el sabado a las 00:30.
    const ahora = new Date()
    const a = ahora.getFullYear()
    const m = String(ahora.getMonth() + 1).padStart(2, '0')
    const d = String(ahora.getDate()).padStart(2, '0')
    e.record.set('oculto_desde', `${a}-${m}-${d} 00:00:00.000Z`)
  }

  e.next()
}, 'platos')

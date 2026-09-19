/// <reference path="../pb_data/types.d.ts" />
//
// Borrado automatico de reservas pasadas — El Rincon del Quijote
// ===========================================================================
// Seccion 12 del encargo: las reservas se borran solas pasado un plazo
// configurable, por defecto 12 meses (`ajustes.meses_retencion_reservas`).
//
// POR QUE ESTO NO ES OPCIONAL: una reserva es el nombre y el TELEFONO de una
// persona que ceno aqui una noche. Guardarlo para siempre no le sirve al bar
// —nadie mira las reservas del ano pasado— y convierte una libreta en un
// fichero de datos personales que hay que justificar. El plazo se lo prometemos
// al cliente en la casilla de consentimiento del formulario y en la politica de
// privacidad; esto es lo que hace que sea verdad.
//
// Se borra la fila ENTERA, no se anonimiza: sin nombre ni telefono la reserva
// no le sirve a nadie, y una fila «anonima» sigue diciendo que alguien ceno
// aqui el 3 de marzo a las 22:00 con siete personas.
//
// Corre una vez al dia a las 04:15, con el bar ya cerrado y antes de la copia
// de seguridad de las 04:30: asi la copia del dia no arrastra lo que acaba de
// caducar.
//
// OJO CON EL ALCANCE DE LOS HOOKS (DECISIONES.md, D-22): el cuerpo del cron
// corre en un runtime aislado igual que un handler. Todo se declara dentro.
// ===========================================================================

cronAdd('borrar_reservas_caducadas', '15 4 * * *', () => {
  // El require va DENTRO: cada handler corre en un runtime aislado y lo que se
  // declare fuera no llega aqui (D-22).
  const R = require(`${__hooks}/lib/retencion.js`)

  let meses = R.MESES_POR_DEFECTO
  try {
    const ajustes = $app.findFirstRecordByFilter('ajustes', 'id != ""')
    const guardado = ajustes.getInt('meses_retencion_reservas')
    if (guardado > 0) meses = guardado
  } catch (err) {
    // Base sin configurar todavia: se usa el plazo por defecto del encargo.
  }

  // Todo lo anterior a esta fecha se va. El calculo esta en lib/ y tiene sus
  // pruebas: es fecha, y las fechas se tuercen solas.
  const frontera = R.fronteraDeRetencion(meses)

  // Por tandas, y no todo de golpe, por el dia que esto se estrene sobre una
  // base con anos de reservas dentro: 500 borrados seguidos bloquean SQLite un
  // rato, y a las 04:15 puede haber alguien reservando desde la web.
  let borradas = 0
  for (let tanda = 0; tanda < 20; tanda++) {
    const viejas = $app.findRecordsByFilter('reservas', 'fecha < {:frontera}', '', 500, 0, { frontera })
    if (!viejas.length) break

    for (const reserva of viejas) {
      try {
        $app.delete(reserva)
        borradas++
      } catch (err) {
        $app.logger().warn('Reserva caducada que no se ha podido borrar',
          'codigo', reserva.getString('codigo'), 'error', String(err))
      }
    }
  }

  if (!borradas) return

  // Queda en el diario del servidor SIN nombres ni telefonos: cuantas y de
  // antes de cuando. Es lo que hace falta para demostrar que el borrado
  // funciona sin volver a escribir en otro sitio lo que se acaba de borrar.
  $app.logger().info('Reservas caducadas borradas',
    'cuantas', borradas, 'anteriores_a', frontera.slice(0, 10), 'meses', meses)
})

// ===========================================================================
// Lo mismo para el diario del panel
// ===========================================================================
// «Actividad» crece con cada gesto del turno y nadie la va a limpiar a mano.
// Sin esto, en cinco anos son cientos de miles de filas que solo hacen lenta la
// pantalla que venian a servir.
//
// SE USA EL MISMO PLAZO QUE LAS RESERVAS, y no es por comodidad: una linea del
// diario dice «Santi modificó la reserva de Marta García». Ahi esta el nombre
// de una clienta. Si el diario durase mas que la reserva, borrar la reserva a
// los doce meses no serviria de nada —el nombre seguiria aqui— y la promesa de
// la politica de privacidad seria mentira por la puerta de atras.
//
// Corre a las 04:20, cinco minutos despues del borrado de reservas y diez antes
// de la copia de seguridad, por el mismo motivo: que la copia del dia no
// arrastre lo que acaba de caducar.
cronAdd('borrar_actividad_caducada', '20 4 * * *', () => {
  const R = require(`${__hooks}/lib/retencion.js`)

  let meses = R.MESES_POR_DEFECTO
  try {
    const ajustes = $app.findFirstRecordByFilter('ajustes', 'id != ""')
    const guardado = ajustes.getInt('meses_retencion_reservas')
    if (guardado > 0) meses = guardado
  } catch (err) {
    // Base sin configurar todavia: se usa el plazo por defecto del encargo.
  }

  const frontera = R.fronteraDeRetencion(meses)

  let borradas = 0
  for (let tanda = 0; tanda < 20; tanda++) {
    const viejas = $app.findRecordsByFilter('actividad', 'creado < {:frontera}', '', 500, 0, { frontera })
    if (!viejas.length) break
    for (const linea of viejas) {
      try {
        $app.delete(linea)
        borradas++
      } catch (err) {
        $app.logger().warn('Línea de actividad que no se ha podido borrar',
          'id', linea.id, 'error', String(err))
      }
    }
  }

  if (!borradas) return
  $app.logger().info('Actividad caducada borrada',
    'cuantas', borradas, 'anterior_a', frontera.slice(0, 10), 'meses', meses)
})

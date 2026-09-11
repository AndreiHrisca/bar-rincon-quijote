/**
 * Avisos — la interfaz de la seccion 10 del encargo
 * ===========================================================================
 * UNA SOLA PUERTA para todo lo que el sistema tiene que «contar» fuera:
 *
 *   reserva_creada        alguien ha reservado por la web
 *   reserva_cancelada     alguien ha cancelado con su enlace
 *   cuadrante_publicado   se ha pasado el cuadrante de la semana al equipo
 *   recordatorio_recuento hoy toca bajar al almacen a contar
 *   producto_agotado      se ha marcado algo como agotado en cocina
 *
 * EN LA V1 EL UNICO CANAL ES EL DIARIO DEL SERVIDOR, y esta encendido. Los de
 * SMS y WhatsApp estan definidos y NO se activan: no hay credenciales, no hay
 * cuenta de Meta y nadie ha dicho quien paga los mensajes (seccion 2). Lo que
 * hacen si se les llama es dejar constancia de que no estan configurados. Como
 * activarlos —y que hace falta— esta en docs/README.md.
 *
 * POR QUE UNA INTERFAZ Y NO LLAMAR AL PROVEEDOR DESDE CADA SITIO: para que el
 * dia que se contrate una pasarela haya que tocar UN fichero y no cinco, y para
 * que ninguna dependencia de un proveedor se meta en la logica del bar. Esa es
 * literalmente la peticion del encargo: «no metas dependencias de proveedores
 * en el resto del codigo».
 *
 * Se escribe en CommonJS porque lo cargan dos sitios: el require() del motor JS
 * de PocketBase y el node de las pruebas.
 */

/** El canal activo. Se cambia con la variable de entorno QUIJOTE_AVISOS. */
const CANAL_POR_DEFECTO = 'registro'

/**
 * Compone el texto de un aviso. FUNCION PURA: no toca la base ni la red, y por
 * eso se puede probar suelta (pruebas/unitarias/avisos.test.js).
 *
 * Devuelve { asunto, texto }. El asunto es una linea, para un SMS o el titulo
 * de una notificacion; el texto es lo que se leeria entero.
 *
 * Los textos estan escritos para que se entiendan tal cual en el movil de
 * Santi, sin jerga y sin identificadores.
 */
function mensaje(tipo, d = {}) {
  switch (tipo) {
    case 'reserva_creada':
      return {
        asunto: `Reserva ${d.codigo || ''}: ${d.nombre || 'sin nombre'}, ${d.comensales || '?'} personas`.trim(),
        texto: [
          `Nueva reserva por la web (${d.codigo || 'sin código'}).`,
          `${d.nombre || 'Sin nombre'} · ${d.telefono || 'sin teléfono'}`,
          `${d.fecha || '?'} a las ${d.hora || '?'} · ${d.comensales || '?'} personas · ${zona(d.zona)}`,
          d.notas ? `Nota: ${d.notas}` : '',
        ].filter(Boolean).join('\n'),
      }

    case 'reserva_cancelada':
      return {
        asunto: `Cancelada la reserva ${d.codigo || ''}`.trim(),
        texto: [
          `Se ha cancelado una reserva (${d.codigo || 'sin código'}).`,
          `${d.nombre || 'Sin nombre'} · ${d.fecha || '?'} a las ${d.hora || '?'} · ${d.comensales || '?'} personas`,
          'La mesa vuelve a estar libre.',
        ].join('\n'),
      }

    case 'cuadrante_publicado':
      return {
        asunto: `Cuadrante de la semana del ${d.semana || '?'}`,
        texto: [
          `Ya está el cuadrante de la semana del ${d.semana || '?'}.`,
          d.turnos ? `${d.turnos} turnos puestos.` : '',
          d.huecos ? `Ojo: quedan ${d.huecos} sin cubrir.` : '',
        ].filter(Boolean).join('\n'),
      }

    case 'recordatorio_recuento':
      return {
        asunto: 'Hoy toca recuento del almacén',
        texto: [
          `Hoy es ${d.dia || 'el día'} de recuento: hay que bajar al almacén y contar.`,
          d.ultimo ? `El último fue el ${d.ultimo}.` : 'No consta ningún recuento anterior.',
        ].join('\n'),
      }

    case 'producto_agotado':
      return {
        asunto: `Se ha acabado: ${d.producto || 'un producto'}`,
        texto: [
          `${d.producto || 'Un producto'} está agotado.`,
          d.quien ? `Lo ha apuntado ${d.quien}.` : '',
          d.nota ? `Nota: ${d.nota}` : '',
          d.platos ? `Lleva ${d.platos} en la carta: quizá haya que ocultarlos.` : '',
        ].filter(Boolean).join('\n'),
      }

    default:
      return { asunto: `Aviso: ${tipo}`, texto: JSON.stringify(d) }
  }
}

function zona(z) {
  return ({ barra: 'barra', terraza: 'terraza', salon: 'salón', indiferente: 'donde haya sitio' })[z] || 'sin zona'
}

// ---------------------------------------------------------------------------
// Los canales
// ---------------------------------------------------------------------------
// Cada uno recibe el mismo { asunto, texto } y hace lo suyo. Añadir uno nuevo es
// añadir una entrada aqui, y nada mas.

const CANALES = {
  /**
   * El de la v1: al diario del servidor, que ya rota a fichero
   * (deploy/logs). No cuesta un céntimo y deja rastro de todo lo que se
   * habria mandado el dia que se enchufe una pasarela de verdad.
   */
  registro(app, tipo, { asunto, texto }) {
    app.logger().info('Aviso', 'tipo', tipo, 'asunto', asunto, 'texto', texto)
    return true
  },

  /**
   * SMS. PREPARADO Y SIN ACTIVAR (seccion 2 del encargo).
   *
   * Para encenderlo hacen falta tres cosas que hoy no existen: una pasarela
   * contratada (Twilio, MessageBird, Labsmobile...), sus credenciales en el
   * entorno, y que alguien diga quien paga los mensajes. El unico cambio de
   * codigo seria el cuerpo de esta funcion.
   */
  sms(app, tipo, { asunto }) {
    app.logger().warn('Aviso NO enviado: el canal de SMS no está configurado',
      'tipo', tipo, 'asunto', asunto)
    return false
  },

  /**
   * WhatsApp. PREPARADO Y SIN ACTIVAR.
   *
   * La API de WhatsApp Business exige cuenta de Meta, numero verificado y
   * PLANTILLAS APROBADAS por Meta para poder escribir el primero. Eso no es una
   * tarde de trabajo: es un tramite. Hoy el bar avisa al equipo copiando y
   * pegando en su grupo, que es como se hace de verdad (D-60).
   */
  whatsapp(app, tipo, { asunto }) {
    app.logger().warn('Aviso NO enviado: el canal de WhatsApp no está configurado',
      'tipo', tipo, 'asunto', asunto)
    return false
  },
}

/**
 * Manda un aviso por el canal activo.
 *
 * NUNCA LANZA. Un aviso que falla no puede tumbar la reserva que lo provoco:
 * primero se guarda lo que importa y despues se avisa, y si el aviso se pierde,
 * se pierde. Por eso todo va dentro de un try.
 */
function notificar(app, tipo, datos, canalPedido) {
  try {
    // typeof: $os solo existe dentro de PocketBase. Asi este modulo se puede
    // cargar tambien desde las pruebas, que le pasan el canal a mano.
    const delEntorno = typeof $os !== 'undefined' ? $os.getenv('QUIJOTE_AVISOS') : ''
    const nombre = canalPedido || delEntorno || CANAL_POR_DEFECTO
    const canal = CANALES[nombre] || CANALES[CANAL_POR_DEFECTO]
    return canal(app, tipo, mensaje(tipo, datos))
  } catch (err) {
    try { app.logger().warn('Aviso fallido', 'tipo', tipo, 'error', String(err)) } catch (e) { /* ni eso */ }
    return false
  }
}

module.exports = { mensaje, notificar, CANALES, CANAL_POR_DEFECTO }

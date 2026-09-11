/**
 * PWA: instalación y copia sin conexión
 * ---------------------------------------------------------------------------
 * El panel se instala en la pantalla de inicio del móvil y sigue abriéndose sin
 * cobertura (sección 7 del encargo). Toda la lógica de qué se guarda y qué no
 * está en panel/sw.js; aquí solo está el enchufe.
 *
 * DOS DETALLES QUE NO SON ADORNO:
 *
 *  - Se registra DESPUÉS de que cargue la página (`load`). Registrar antes hace
 *    que la instalación del service worker compita por la red con el propio
 *    panel, y lo que importa es que la pantalla salga cuanto antes.
 *
 *  - Al salir de la sesión se le pide que tire la copia de datos. Dentro hay
 *    nombres y teléfonos de reservas, y el móvil del panel se queda en la barra
 *    del bar (sección 12).
 */

const RUTA_SW = '/panel/sw.js'

export function registrarPWA() {
  // El aviso de «sin conexión» va siempre, haya service worker o no: un
  // navegador viejo tampoco tiene red cuando no la hay.
  avisoSinRed()

  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(RUTA_SW, { scope: '/panel/' }).catch((err) => {
      // Sin service worker el panel funciona igual: lo único que se pierde es
      // poder abrirlo sin cobertura. No es motivo para molestar a nadie.
      console.warn('El panel no ha podido instalarse para trabajar sin conexión:', err?.message)
    })
  })
}

/**
 * Aviso de que no hay red.
 * ---------------------------------------------------------------------------
 * SIN ESTO, EL PANEL MIENTE. Sin conexión las pantallas se pintan igual, con lo
 * último que se guardó en el móvil: las reservas de hoy, el recuento, las
 * faltas. Eso es lo que se quería, pero quien lo mira tiene que saber que está
 * viendo una foto de antes y no lo de ahora mismo; si no, da por bueno que no
 * hay ninguna reserva nueva cuando lo que pasa es que el sótano no tiene
 * cobertura.
 *
 * Es una banda fina y quieta, encima de la barra inferior. No tapa nada, no
 * pide que se cierre y desaparece sola en cuanto vuelve la red.
 */
function avisoSinRed() {
  const banda = document.createElement('div')
  banda.className = 'sin-red'
  banda.setAttribute('role', 'status')
  banda.textContent = 'Sin conexión · estás viendo lo último que se guardó'
  banda.hidden = navigator.onLine

  document.body.appendChild(banda)
  window.addEventListener('offline', () => { banda.hidden = false })
  window.addEventListener('online', () => { banda.hidden = true })
}

/** Al cerrar sesión: fuera la copia de reservas y recuentos guardada en el móvil. */
export function olvidarDatosGuardados() {
  try {
    navigator.serviceWorker?.controller?.postMessage('limpiar-datos')
  } catch (e) { /* sin service worker no hay nada que tirar */ }
}

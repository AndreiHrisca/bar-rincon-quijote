/**
 * Metricas sin espiar
 * ---------------------------------------------------------------------------
 * Tres contadores, y ni uno mas (seccion 13 del encargo):
 *
 *   escaneo                 una visita a la carta, con el idioma en que se vio.
 *   vista_plato             se ha abierto la ficha de un plato.
 *   busqueda_sin_resultado  alguien busco algo que no esta en la carta.
 *
 * LO QUE NO SE MANDA, que es lo importante: ni cookie, ni identificador de
 * visitante, ni hora, ni pantalla, ni de donde viene. El servidor tampoco
 * guarda la IP: la usa para frenar abusos en memoria y la olvida. Con lo que
 * llega aqui es imposible reconstruir el recorrido de una persona.
 *
 * Se manda con `sendBeacon`, que esta hecho justo para esto: entrega el dato en
 * segundo plano, sin bloquear nada y sin importar que la pagina se cierre a
 * continuacion. Si falla, no pasa nada: es un contador, no una reserva.
 */

const RUTA = '/api/quijote/metrica'
const CLAVE_ESCANEO = 'quijote.escaneo'

function enviar(tipo, valor) {
  try {
    const cuerpo = JSON.stringify({ tipo, valor: valor || '' })
    if (navigator.sendBeacon) {
      navigator.sendBeacon(RUTA, new Blob([cuerpo], { type: 'application/json' }))
    } else {
      // Navegadores viejos. `keepalive` para que sobreviva al cierre de la
      // pestana, igual que sendBeacon.
      fetch(RUTA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        keepalive: true,
      }).catch(() => {})
    }
  } catch (e) { /* modo privado, sin red: da igual */ }
}

// ---------------------------------------------------------------------------
// Escaneo: UNA por visita, al final de la visita
// ---------------------------------------------------------------------------
// Se manda cuando la pagina se oculta (se cierra, se cambia de aplicacion, se
// bloquea el movil), no al abrirla, Y NO ES UN CAPRICHO: la web abre siempre en
// castellano (no se detecta el idioma del navegador), asi que contar el idioma
// al entrar diria "castellano" hasta de quien lo primero que hace es pulsar EN.
// Esperando al final, el idioma que se cuenta es el que de verdad se uso.
//
// El aviso de sessionStorage evita contar dos veces si se cambia de aplicacion
// y se vuelve. Si el navegador no lo tiene (modo privado), se cuenta una sola
// vez igualmente gracias a la variable de memoria.
let contada = false

export function contarVisita(idiomaActual) {
  const alOcultarse = () => {
    if (document.visibilityState !== 'hidden') return
    if (contada) return
    try {
      if (sessionStorage.getItem(CLAVE_ESCANEO)) { contada = true; return }
      sessionStorage.setItem(CLAVE_ESCANEO, '1')
    } catch (e) { /* modo privado */ }
    contada = true
    enviar('escaneo', idiomaActual())
  }

  document.addEventListener('visibilitychange', alOcultarse)
  // Safari en iOS no siempre dispara visibilitychange al cerrar la pestana.
  window.addEventListener('pagehide', alOcultarse)
}

// ---------------------------------------------------------------------------
// Plato mirado
// ---------------------------------------------------------------------------
// Va el NOMBRE del plato, no su identificador: es lo que se lee en la lista de
// "platos mas mirados" del panel, y asi el dato sigue diciendo algo aunque el
// plato se borre de la carta. El servidor comprueba que ese plato existe antes
// de contarlo.
export function contarPlato(nombre) {
  if (nombre) enviar('vista_plato', String(nombre).slice(0, 120))
}

// ---------------------------------------------------------------------------
// Buscado y no encontrado
// ---------------------------------------------------------------------------
// Es la metrica que de verdad le sirve a Santi: le dice que le piden y no
// tiene. Por eso hay que contarla BIEN, y contarla bien es esperar a que la
// persona termine de escribir: sin la espera, buscar "paella" contaria seis
// veces ("p", "pa", "pae"...) y la lista del panel se llenaria de trozos de
// palabra.
let reloj = null
let ultima = ''

export function contarBusquedaSinResultado(texto) {
  const limpio = String(texto || '').trim()
  clearTimeout(reloj)
  if (limpio.length < 3) return

  reloj = setTimeout(() => {
    // Lo mismo dos veces seguidas (se borra el filtro y se vuelve) no se cuenta
    // dos veces.
    if (limpio.toLowerCase() === ultima) return
    ultima = limpio.toLowerCase()
    enviar('busqueda_sin_resultado', limpio)
  }, 1400)
}

/** Se llama al encontrar resultados: cancela el envio pendiente. */
export function cancelarBusqueda() {
  clearTimeout(reloj)
}

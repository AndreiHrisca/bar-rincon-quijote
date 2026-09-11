/**
 * Cola del recuento sin conexión
 * ---------------------------------------------------------------------------
 * EL PROBLEMA, TAL CUAL: el recuento se hace en el sótano y en la cámara, que
 * es donde no hay cobertura. Quien cuenta no va a mirar si el móvil tiene
 * señal, ni debe: teclea veinte cantidades andando entre estanterías y sube.
 *
 * Así que aquí NADA espera al servidor. Lo tecleado se guarda al momento en el
 * navegador y se manda cuando se puede:
 *
 *   1. Se apunta en memoria y en `localStorage`. La pantalla ya lo da por
 *      bueno: no hay ruedas girando ni líneas en gris.
 *   2. Se intenta enviar. Si no hay red, se queda pendiente y se dice cuántas
 *      quedan por mandar, sin alarmismo y sin bloquear nada.
 *   3. Se reintenta solo: cuando el navegador avisa de que ha vuelto la red,
 *      cada pocos segundos mientras queden pendientes, y al volver a abrir la
 *      pantalla.
 *
 * POR QUÉ ESTO ES SEGURO, y no una forma elegante de perder datos:
 *
 *   - `recuento_lineas` tiene índice único por `(recuento, producto)`. Si una
 *     línea se envía dos veces —porque la respuesta se perdió pero el servidor
 *     sí la guardó—, la segunda **choca contra el índice** en vez de duplicar.
 *     Cuando eso pasa se busca la línea que ya existe y se actualiza. Ver
 *     DECISIONES.md, D-13.
 *   - Lo pendiente se guarda en `localStorage`, así que sobrevive a cerrar el
 *     navegador y a que se apague el móvil en mitad del sótano.
 *   - Cada línea es independiente: una que falle no atasca a las demás.
 *
 * LO QUE ESTO RESUELVE Y LO QUE RESUELVE LA PWA. Esto es la parte de ESCRIBIR:
 * lo tecleado no se pierde aunque no haya red. Poder ABRIR el panel sin
 * cobertura —recargar la página en el sótano y que cargue— es el service worker
 * de la fase 10 (`panel/sw.js`, D-93). Son dos cosas distintas y las dos hacen
 * falta: el service worker sirve la pantalla y esta cola manda lo apuntado.
 */

import { guardarLinea, lineaDe } from './datos.js'

const CLAVE = 'quijote.recuento'
const REINTENTO_MS = 8000

let estado = null          // { recuento, lineas: { [productoId]: apunte } }
let temporizador = null
let sincronizando = false
const oyentes = new Set()

/**
 * Un apunte:
 *   { cantidad, nota, contada, id, pendiente }
 *
 * `contada` es un campo aparte y no "cantidad > 0" a propósito: **el cero es una
 * cantidad válida**. «No queda nada» es la respuesta más importante de un
 * recuento, y confundirla con «no lo he mirado» dejaría fuera de la lista de
 * pedido justo lo que hay que pedir.
 */

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Prepara la cola para un recuento, cruzando lo que hay en el servidor con lo
 * que quedara pendiente aquí.
 *
 * MANDA LO PENDIENTE. Si una línea está sin enviar, su valor local gana sobre
 * el del servidor: es lo que se acaba de teclear en el sótano, y el del
 * servidor es de antes. Para las demás manda el servidor, que puede traer lo
 * que haya contado otra persona desde otro móvil.
 */
export function abrir(recuentoId, lineasServidor = []) {
  const guardado = leer()
  const previo = guardado && guardado.recuento === recuentoId ? guardado.lineas : {}

  const lineas = {}
  for (const l of lineasServidor) {
    lineas[l.producto] = {
      id: l.id,
      cantidad: l.cantidad,
      nota: l.nota || '',
      contada: !!l.contada,
      pendiente: false,
    }
  }
  for (const [productoId, sinEnviar] of Object.entries(previo)) {
    if (!sinEnviar.pendiente) continue
    lineas[productoId] = { ...sinEnviar, id: sinEnviar.id || lineas[productoId]?.id || null }
  }

  estado = { recuento: recuentoId, lineas }
  escribir()
  avisar()
  sincronizar()
  return estado
}

/** Se llama al salir de la pantalla: deja de reintentar, no borra nada. */
export function parar() {
  if (temporizador) { clearInterval(temporizador); temporizador = null }
}

/** Al cerrar el recuento ya no hay nada pendiente que guardar. */
export function olvidar() {
  parar()
  estado = null
  try { localStorage.removeItem(CLAVE) } catch (err) { /* modo privado */ }
  avisar()
}

// ---------------------------------------------------------------------------
// Apuntar
// ---------------------------------------------------------------------------

/** Lo contado de un producto, o null si todavía no se ha mirado. */
export function apunte(productoId) {
  return estado?.lineas[productoId] || null
}

export function apuntes() {
  return estado ? estado.lineas : {}
}

/**
 * Apunta una cantidad. `cantidad = null` deshace la cuenta (vuelve a "sin
 * contar"), que es lo que pasa al borrar el campo.
 */
export function apuntar(productoId, { cantidad, nota = null }) {
  if (!estado) return
  const previo = estado.lineas[productoId] || {}

  // Salir de un campo sin haber cambiado nada no es apuntar. Sin esto, pasar el
  // dedo por la lista volviendo a tocar campos ya contados manda otra vez cada
  // linea, que sin cobertura es justo lo que no hace falta.
  const igual = previo.contada === (cantidad !== null)
    && Number(previo.cantidad) === Number(cantidad === null ? 0 : cantidad)
    && (nota === null || (previo.nota || '') === nota)
  if (igual && !previo.pendiente) return

  estado.lineas[productoId] = {
    id: previo.id || null,
    cantidad: cantidad === null ? 0 : Number(cantidad),
    nota: nota === null ? (previo.nota || '') : nota,
    contada: cantidad !== null,
    pendiente: true,
  }
  escribir()
  avisar()
  sincronizar()
}

/** Cuántas líneas quedan por mandar. Es lo que se enseña en la banda de aviso. */
export function pendientes() {
  if (!estado) return 0
  return Object.values(estado.lineas).filter((l) => l.pendiente).length
}

export function contadas() {
  if (!estado) return 0
  return Object.values(estado.lineas).filter((l) => l.contada).length
}

/** Avisa cada vez que cambia algo: lo contado o lo que queda por mandar. */
export function alCambiar(fn) {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

// ---------------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------------

/**
 * Intenta mandar lo pendiente, una línea detrás de otra.
 *
 * En serie y no en paralelo: son pocas y, sobre todo, la conexión del sótano al
 * recuperarse es mala. Veinte peticiones a la vez por una red que va y viene
 * fallan más que veinte seguidas.
 */
export async function sincronizar() {
  if (!estado || sincronizando) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return programar()

  sincronizando = true
  try {
    for (const [productoId, linea] of Object.entries(estado.lineas)) {
      if (!linea.pendiente) continue
      try {
        await enviar(productoId, linea)
      } catch (err) {
        // Sin red o servidor caído: se deja pendiente y se reintenta luego. Un
        // fallo corta el resto del envío a propósito: si no hay red para una,
        // no la hay para las siguientes, y no tiene sentido gastar diecinueve
        // intentos más.
        //
        // Si el servidor SÍ ha contestado (hay código), no es falta de red: es
        // otra cosa, y esa sí conviene poder verla al depurar. En pantalla no
        // cambia nada, que quien está contando no tiene que enterarse.
        if (err?.status) {
          console.warn('Línea de recuento rechazada:', err.status, err?.response?.message || '')
        }
        break
      }
    }
  } finally {
    sincronizando = false
    escribir()
    avisar()
    programar()
  }
}

async function enviar(productoId, linea) {
  const campos = {
    recuento: estado.recuento,
    producto: productoId,
    cantidad: linea.cantidad,
    contada: linea.contada,
    nota: linea.nota,
  }

  let guardada
  if (linea.id) {
    guardada = await guardarLinea(linea.id, campos)
  } else {
    try {
      guardada = await guardarLinea(null, campos)
    } catch (err) {
      // 400 al crear = casi siempre el índice único: la línea ya está, porque
      // se envió antes y la respuesta se perdió. Se busca y se actualiza.
      if (err?.status !== 400) throw err
      const existente = await lineaDe(estado.recuento, productoId)
      if (!existente) throw err
      guardada = await guardarLinea(existente.id, campos)
    }
  }

  // Ojo: mientras se enviaba, alguien ha podido teclear otra cantidad. Solo se
  // da por enviado si lo que hay ahora es lo que se mandó.
  const ahora = estado.lineas[productoId]
  if (ahora && ahora.cantidad === linea.cantidad && ahora.contada === linea.contada) {
    ahora.pendiente = false
  }
  if (ahora) ahora.id = guardada.id
}

function programar() {
  if (temporizador) { clearInterval(temporizador); temporizador = null }
  if (!pendientes()) return
  temporizador = setInterval(() => sincronizar(), REINTENTO_MS)
}

// El navegador avisa cuando vuelve la red. No es infalible —dice que hay red en
// cuanto hay wifi, aunque el router no llegue a ninguna parte—, pero cuando
// acierta ahorra los ocho segundos del reintento.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sincronizar())
}

// ---------------------------------------------------------------------------
// Guardar en el navegador
// ---------------------------------------------------------------------------

function leer() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) || 'null')
  } catch (err) {
    return null
  }
}

function escribir() {
  if (!estado) return
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado))
  } catch (err) {
    // Modo privado o almacenamiento lleno. No se puede hacer nada mejor que
    // seguir: lo tecleado sigue en memoria y se manda igual mientras no se
    // cierre la pestaña.
    console.warn('No se ha podido guardar el recuento en el navegador:', err?.message)
  }
}

function avisar() {
  for (const fn of oyentes) fn()
}

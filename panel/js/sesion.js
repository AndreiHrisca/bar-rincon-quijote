/**
 * Sesion y roles
 * ---------------------------------------------------------------------------
 * Quien ha entrado y que puede hacer.
 *
 * LO QUE DECIDE DE VERDAD ES EL SERVIDOR. Todo lo de aqui sirve para no
 * ensenar botones que van a dar un 403: las reglas de las colecciones y los
 * hooks de pb_hooks/roles.pb.js son los que mandan. Si alguien esconde una
 * pantalla tocando el JavaScript del navegador, no consigue nada.
 *
 * DOS ROLES Y NADA MAS (migracion 1757200000_rol_administrador.js):
 *
 *   admin     Todo. Es quien administra el negocio.
 *   empleado  El trabajo del turno: reservas y carta enteras, apuntar y
 *             resolver faltas, fichar y ver SUS horas.
 *
 * Antes habia cuatro —dueno, encargado, cocina y empleado— y no los usaba
 * nadie: en la base solo habia cuentas de «dueno» y una de «empleado». Cuatro
 * roles para tres personas no son un modelo de permisos, son cuatro sitios
 * donde equivocarse.
 */

import { pb } from './pb.js'

export const NOMBRE_ROL = {
  admin: 'Administrador',
  empleado: 'Empleado',
}

export function haySesion() {
  return pb.authStore.isValid
}

export function usuario() {
  return pb.authStore.record || null
}

export function rol() {
  return usuario()?.rol || ''
}

/** El nombre de pila con el que saludar. Si no hay nombre, el correo. */
export function nombreCorto() {
  const u = usuario()
  if (!u) return ''
  const n = (u.nombre || '').trim()
  return n ? n.split(/\s+/)[0] : (u.email || '')
}

/**
 * Quien administra el negocio: ajustes, datos legales, cuentas y roles, fichas
 * del equipo, cuadrante, eventos, estadisticas, almacen (el catalogo) y la
 * pantalla de Actividad. Y todos los borrados.
 */
export function esAdmin() {
  return rol() === 'admin'
}

/**
 * Quien puede confirmar, sentar y apuntar reservas (seccion 7).
 *
 * AHORA ES TODO EL EQUIPO, y por eso la funcion sigue existiendo en vez de
 * borrarse: dice POR QUE una pantalla esta abierta, no solo que lo esta. La
 * regla de la coleccion es la misma («con sesion basta»), asi que esto no
 * esconde ningun boton; lo que hace es que, el dia que haya que volver a
 * cerrarla, haya un unico sitio donde tocar.
 */
export function gestionaReservas() {
  return haySesion()
}

/** Quien puede editar la carta: ver los platos, cambiarlos y ocultarlos. */
export function gestionaCarta() {
  return haySesion()
}

/**
 * Quien pone el cuadrante y corrige las horas ya fichadas (seccion 7).
 *
 * OJO, no es quien FICHA. Fichar la entrada y la salida lo hace todo el equipo
 * —es justo para lo que esta el control horario— y cada cual ve las suyas. Lo
 * que esto guarda es poner turnos, arreglar el fichaje que alguien se dejo
 * abierto ayer y tocar las fichas del equipo.
 */
export function gestionaPersonal() {
  return esAdmin()
}

/**
 * Quien mantiene el almacen: productos y proveedores (seccion 7).
 *
 * OJO, no es quien USA el almacen. Apuntar que falta algo lo hace cualquiera
 * del equipo —es justo la funcion principal de cocina en el sistema— y
 * resolverlo tambien: si alguien repone la harina, la repone quien pasa por
 * ahi. Lo que esto guarda es el CATALOGO: dar de alta un proveedor, poner el
 * minimo, cambiar la unidad.
 */
export function mantieneAlmacen() {
  return esAdmin()
}

/**
 * Entra con usuario y contrasena.
 *
 * PocketBase autentica por "identity", que aqui puede ser el NOMBRE DE USUARIO
 * o el correo: la migracion 1756701200_equipo.js anadio el campo `usuario` y lo
 * puso en `identityFields`. Hasta entonces solo valia el correo, y la pantalla
 * de acceso prometia un "Usuario" que no existia.
 *
 * Se admiten los dos y no se obliga a nadie a escribir un correo entero en un
 * movil: la maqueta pone "santi" en el campo, y ahora eso entra de verdad.
 */
export async function entrar(identidad, clave) {
  return pb.collection('users').authWithPassword(String(identidad).trim(), clave)
}

/**
 * Cierra la sesion.
 *
 * PRIMERO SE AVISA AL SERVIDOR y despues se tira el token, porque el aviso va
 * firmado con ese token: al reves no llegaria. Es lo que deja la salida
 * apuntada en «Actividad» (pb_hooks/actividad.pb.js), ya que PocketBase no
 * tiene cierre de sesion propio —el token es un JWT y el navegador simplemente
 * lo olvida—.
 *
 * NO SE ESPERA A QUE CONTESTE NI SE MIRA SI FALLA. Quien pulsa «Salir» tiene
 * que salir, haya red o no: el panel se usa en un sotano sin cobertura. Lo peor
 * que pasa sin red es que falte una linea en el diario.
 */
export function salir() {
  try {
    pb.send('/api/quijote/salir', { method: 'POST', body: {} }).catch(() => {})
  } catch (err) {
    // Ni eso puede impedir el cierre de sesion.
  }
  pb.authStore.clear()
}

/**
 * Comprueba con el servidor que la sesion guardada sigue valiendo y trae el rol
 * actualizado. Si a alguien le han cambiado el rol o le han borrado la cuenta,
 * es aqui donde se entera; sin esto seguiria viendo botones que ya no le tocan
 * hasta que caducara el token.
 */
export async function refrescar() {
  if (!pb.authStore.isValid) return false
  try {
    await pb.collection('users').authRefresh()
    return true
  } catch (err) {
    // 401/403: la sesion ya no vale. Cualquier otro error (el servidor no
    // responde) no debe echar a nadie: se sigue con lo que hay guardado.
    if (err?.status === 401 || err?.status === 403) {
      pb.authStore.clear()
      return false
    }
    return true
  }
}

/** Avisa cada vez que la sesion cambia (entrar, salir, caducar). */
export function alCambiarSesion(fn) {
  return pb.authStore.onChange(fn, false)
}

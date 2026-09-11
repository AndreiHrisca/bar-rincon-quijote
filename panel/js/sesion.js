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
 * Los roles se escriben sin enye ("dueno") porque viajan dentro de reglas de
 * acceso y de URLs; en pantalla se escriben bien.
 */

import { pb } from './pb.js'

export const NOMBRE_ROL = {
  dueno: 'Dueño',
  encargado: 'Encargado',
  cocina: 'Cocina',
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

export function esDueno() {
  return rol() === 'dueno'
}

/** Quien puede confirmar, sentar y apuntar reservas (seccion 7). */
export function gestionaReservas() {
  return rol() === 'dueno' || rol() === 'encargado'
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
  return rol() === 'dueno' || rol() === 'encargado'
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
  return rol() === 'dueno' || rol() === 'encargado'
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

export function salir() {
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

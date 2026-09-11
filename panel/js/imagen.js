/**
 * Encoger una foto antes de subirla
 * ---------------------------------------------------------------------------
 * La foto de un plato la hace Santi con el movil, ahi mismo, con el plato
 * delante. Eso son entre 3 y 12 MB, y el campo `foto` de la coleccion admite
 * 8 MB: la mitad de las veces la subida fallaria con un error que no dice nada
 * util, y la otra mitad tardaria un minuto en la conexion del bar.
 *
 * Aqui se redibuja en un lienzo a 1600 px de lado mayor y se vuelve a codificar
 * en JPEG. Queda en unos pocos cientos de kB y sigue sobrando: la web publica
 * pide las miniaturas de 400 y 800 px, no el original.
 *
 * DE PASO SE ARREGLA LO DEL HEIC. Un iPhone entrega las fotos en HEIC, que no
 * esta entre los tipos que acepta la coleccion (jpeg, png, webp). Safari SI
 * sabe dibujar un HEIC en un lienzo, asi que al volver a codificarlo sale un
 * JPEG normal y la foto entra. Sin este paso, a Santi le fallaria la mitad de
 * las fotos y no habria forma de explicarle por que.
 *
 * Se hace en el navegador y no en el servidor a proposito: lo que no se sube,
 * no ocupa la conexion del bar.
 */

export const MAX_LADO = 1600
const CALIDAD = 0.82

/** Devuelve un File listo para subir. Lanza si el navegador no sabe leerla. */
export async function encogerImagen(fichero, { maxLado = MAX_LADO, calidad = CALIDAD } = {}) {
  const imagen = await leer(fichero)

  const escala = Math.min(1, maxLado / Math.max(imagen.width, imagen.height))
  const ancho = Math.round(imagen.width * escala)
  const alto = Math.round(imagen.height * escala)

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  ctx.drawImage(imagen, 0, 0, ancho, alto)

  if (imagen.close) imagen.close()

  const trozo = await new Promise((listo) => lienzo.toBlob(listo, 'image/jpeg', calidad))
  if (!trozo) throw new Error('El navegador no ha podido convertir la imagen.')

  // Nombre con extension correcta: PocketBase se guia por el tipo, pero un
  // fichero llamado "IMG_1234.heic" que por dentro es JPEG despista a cualquiera
  // que luego mire la carpeta de subidas.
  const base = (fichero.name || 'foto').replace(/\.[^.]+$/, '')
  return new File([trozo], `${base}.jpg`, { type: 'image/jpeg' })
}

/**
 * createImageBitmap respeta la orientacion EXIF con imageOrientation:'from-image',
 * que es lo que evita que una foto hecha en vertical salga tumbada. Si el
 * navegador no lo tiene, se cae a <img>, que en los navegadores actuales ya
 * aplica la orientacion por su cuenta.
 */
async function leer(fichero) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(fichero, { imageOrientation: 'from-image' })
    } catch (e) {
      // Formato que este navegador no sabe decodificar por esta via: se prueba
      // con <img>, que a veces si puede.
    }
  }

  const url = URL.createObjectURL(fichero)
  try {
    return await new Promise((listo, falla) => {
      const img = new Image()
      img.onload = () => listo(img)
      img.onerror = () => falla(new Error('No se ha podido leer la imagen.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

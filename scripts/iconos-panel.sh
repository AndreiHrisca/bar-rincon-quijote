#!/usr/bin/env sh
# ---------------------------------------------------------------------------
# Iconos de la PWA del panel — El Rincon del Quijote
# ---------------------------------------------------------------------------
# Compone el icono (logo crema sobre cuadrado granate) a partir de
# compartido/img/logo.svg y lo rasteriza a los PNG que pide el manifiesto.
#
# Se ejecuta a mano y solo cuando cambie el logo. Los PNG resultantes SI se
# versionan: el servidor no tiene con que generarlos y no hay paso de
# compilacion en este proyecto (seccion 4 del encargo).
#
# Todo por Docker: este host no tiene ni Node ni Python ni librsvg instalados.
#
#   ./scripts/iconos-panel.sh
#
# OJO: el logo sigue siendo el MARCADOR DE POSICION redibujado a ojo desde una
# foto del menu impreso. Cuando llegue el original vectorizado hay que volver a
# pasar esto.
# ---------------------------------------------------------------------------
set -eu

cd "$(dirname "$0")/.."
mkdir -p panel/img

# --- 1. Los dos SVG cuadrados ----------------------------------------------
# Dos margenes distintos y no uno:
#   icono.svg             10 % — el que se ve tal cual (escritorio, iOS).
#   icono-recortable.svg  22 % — el "maskable" de Android, al que el sistema le
#                         recorta un circulo. Con el margen del otro, al Quijote
#                         le cortaria la lanza y los pies.
docker run --rm -i -v "$PWD":/w -w /w -u "$(id -u):$(id -g)" python:3.12-slim python - <<'PY'
src = open('compartido/img/logo.svg', encoding='utf-8').read()
cuerpo = src.split('-->', 1)[1].rsplit('</svg>', 1)[0].strip()

def icono(margen, nota):
    ancho = 512 * (1 - 2 * margen)
    factor = ancho / 200          # el logo mide 200x150 en su viewBox
    alto = 150 * factor
    x, y = (512 - ancho) / 2, (512 - alto) / 2
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <title>El Rincón del Quijote — panel</title>
  <!-- {nota}
       Generado por scripts/iconos-panel.sh a partir de compartido/img/logo.svg.
       El logo sigue siendo el MARCADOR DE POSICIÓN redibujado a ojo: cuando
       llegue el original vectorizado, hay que volver a generar los PNG. -->
  <rect width="512" height="512" fill="#93202A"/>
  <g transform="translate({x:.1f} {y:.1f}) scale({factor:.4f})" color="#FBF3E3">
    {cuerpo}
  </g>
</svg>
'''

open('panel/img/icono.svg', 'w', encoding='utf-8').write(
    icono(0.10, 'Icono normal: el logo casi a sangre sobre el granate.'))
open('panel/img/icono-recortable.svg', 'w', encoding='utf-8').write(
    icono(0.22, 'Icono «maskable»: Android le recorta un círculo, así que el logo va más dentro (zona segura del 80%).'))
PY

# --- 2. Los PNG -------------------------------------------------------------
# El contenedor escribe como root y despues devuelve la propiedad: sin eso, los
# ficheros quedan de root en la carpeta del usuario.
docker run --rm -v "$PWD/panel/img":/img alpine:3.20 sh -c "
  apk add --no-cache rsvg-convert >/dev/null 2>&1
  cd /img
  rsvg-convert -w 512 -h 512 icono.svg            -o icono-512.png
  rsvg-convert -w 192 -h 192 icono.svg            -o icono-192.png
  rsvg-convert -w 180 -h 180 icono.svg            -o icono-apple-180.png
  rsvg-convert -w 512 -h 512 icono-recortable.svg -o icono-recortable-512.png
  chown -R $(id -u):$(id -g) /img
"

ls -l panel/img

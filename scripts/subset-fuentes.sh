#!/usr/bin/env bash
#
# Genera las tipografias autoalojadas de compartido/fuentes/ a partir de los
# originales descargados en assets/tipografias/woff2/.
#
# Por que existe este script:
#   - El encargo prohibe CDNs: las fuentes se sirven desde nuestro dominio.
#   - Los ficheros de Google traen cirilico, griego y vietnamita. Recortados a
#     castellano + ingles el conjunto pasa de ~730 KB a ~155 KB, que es lo que
#     permite cumplir el presupuesto de 150 KB de primera carga.
#
# Por que en contenedor: este host no tiene fonttools ni pip y no queremos
# ensuciarlo. Los .woff2 resultantes se versionan en el repositorio, asi que
# este script solo hace falta para regenerarlos.
#
# Uso:  ./scripts/subset-fuentes.sh
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"

# Repertorio: castellano + ingles, puntuacion tipografica y simbolo de euro.
UNICODES='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2013-2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2039-203A,U+2044,U+20AC,U+2122,U+2212'

docker run --rm -i -u "$(id -u):$(id -g)" -e HOME=/tmp -e UNICODES="$UNICODES" \
  -v "$raiz:/w" -w /w python:3.12-slim bash -s <<'DENTRO'
set -euo pipefail
export PATH=/tmp/.local/bin:$PATH
pip install --quiet --no-cache-dir --user 'fonttools[woff]>=4.53' brotli

orig=assets/tipografias/woff2
dest=compartido/fuentes
rm -rf "$dest"; mkdir -p "$dest"

recorta() {  # recorta <fichero-origen> <fichero-destino>
  pyftsubset "$1" \
    --output-file="$2" \
    --flavor=woff2 \
    --layout-features='kern,liga,clig,calt' \
    --unicodes="$UNICODES" \
    --no-hinting
}

# Alegreya SC y Alegreya Sans: un fichero estatico por peso.
for peso in 400 500 700;     do recorta "$orig/alegreya-sc-$peso-latin.woff2"   "$dest/alegreya-sc-$peso.woff2";   done
for peso in 400 500 700 800; do recorta "$orig/alegreya-sans-$peso-latin.woff2" "$dest/alegreya-sans-$peso.woff2"; done

# Cormorant Garamond es una fuente VARIABLE (eje wght 300-700): Google sirve el
# mismo fichero para todos los pesos. Un unico fichero por estilo, y el peso lo
# resuelve el navegador por el eje. No se instancia: se pierde el eje y no se
# gana tamano.
recorta "$orig/cormorant-garamond-600-latin.woff2"        "$dest/cormorant-garamond.woff2"
recorta "$orig/cormorant-garamond-600-italic-latin.woff2" "$dest/cormorant-garamond-italica.woff2"
DENTRO

echo
echo "Tipografias generadas en compartido/fuentes/:"
ls -l "$raiz/compartido/fuentes" | awk 'NR>1 {s+=$5; printf "  %7d B  %s\n", $5, $9} END {printf "  -------\n  %7d B  total en %d ficheros\n", s, NR-1}'

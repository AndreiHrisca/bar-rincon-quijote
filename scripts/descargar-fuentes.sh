#!/usr/bin/env bash
#
# Descarga los ficheros originales de las tres familias desde Google Fonts a
# assets/tipografias/woff2/. Es el paso previo a scripts/subset-fuentes.sh.
#
# Solo hace falta ejecutarlo para regenerar las tipografias desde cero: lo que
# se versiona y se sirve es el resultado recortado de compartido/fuentes/.
#
# Uso:  ./scripts/descargar-fuentes.sh
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
dest="$raiz/assets/tipografias"
mkdir -p "$dest/woff2"

# Google devuelve woff2 solo si el agente de usuario lo soporta; con el de curl
# devuelve ttf, que pesa el triple.
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
URL='https://fonts.googleapis.com/css2?family=Alegreya+SC:wght@400;500;700&family=Alegreya+Sans:wght@400;500;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;1,400;1,500;1,600&display=swap'

echo "Descargando la hoja de estilos de Google Fonts..."
curl -fsS --max-time 30 -A "$UA" "$URL" -o "$dest/gf.css"

python3 - "$dest" <<'PY'
import re, sys, pathlib, urllib.request

dest = pathlib.Path(sys.argv[1])
css = (dest / 'gf.css').read_text(encoding='utf-8')

# Cada @font-face va precedido de un comentario con el subconjunto. Solo
# interesan latin y latin-ext: cirilico, griego y vietnamita se descartan.
bloques = re.findall(r'/\* ([a-z-]+) \*/\s*(@font-face\s*\{.*?\})', css, re.S)
vistos = set()
for subset, bloque in bloques:
    if subset not in ('latin', 'latin-ext'):
        continue
    fam    = re.search(r"font-family:\s*'([^']+)'", bloque).group(1)
    peso   = re.search(r'font-weight:\s*(\d+)', bloque).group(1)
    estilo = re.search(r'font-style:\s*(\w+)', bloque).group(1)
    url    = re.search(r'url\((https://[^)]+\.woff2)\)', bloque).group(1)
    slug   = fam.lower().replace(' ', '-')
    nombre = f"{slug}-{peso}{'-italic' if estilo == 'italic' else ''}-{subset}.woff2"
    if nombre in vistos:
        continue
    vistos.add(nombre)
    destino = dest / 'woff2' / nombre
    if not destino.exists():
        urllib.request.urlretrieve(url, destino)
    print(f"  {destino.stat().st_size:7,d} B  {nombre}")

print(f"\n{len(vistos)} ficheros en {dest / 'woff2'}")
print("Siguiente paso: ./scripts/subset-fuentes.sh")
PY

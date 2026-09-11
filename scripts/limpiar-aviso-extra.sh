#!/usr/bin/env bash
#
# Saca el aviso del ingrediente extra de las DESCRIPCIONES de los platos.
#
#   ./scripts/limpiar-aviso-extra.sh              # en seco: solo enseña
#   ./scripts/limpiar-aviso-extra.sh --aplicar    # escribe de verdad
#
# Por que existe:
#   Al cargar la carta, a algunos platos se les metio el recargo dentro del
#   texto («Bocadillo de jamon serrano. 0,50€ por ingrediente extra.»). Desde
#   D-79 ese aviso lo pone el sistema a partir del interruptor `admite_extras`,
#   asi que el texto sobra: el cliente lo lee dos veces, y el dia que el importe
#   cambie la etiqueta dira 0,60 y la descripcion seguira diciendo 0,50.
#
#   Este script quita la frase y enciende el interruptor. La informacion no se
#   pierde: cambia de sitio.
#
# EN SECO POR DEFECTO. Sin --aplicar no escribe nada, solo enseña plato a plato
# lo que dice ahora y lo que diria despues. ES UN CAMBIO DE DATOS, asi que se
# mira antes de lanzarlo.
#
# ANTES DE LANZARLO CONTRA PRODUCCION, una copia:
#   docker exec quijote-copias /opt/copias/copia.sh   # o esperar a la de las 4:30
#
# La contrasena del superusuario NO se pasa como argumento (mismo motivo que en
# crear-cuenta.sh): va por el entorno.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
red="$(basename "$raiz")_interna"

export PB_SUPER_ID="${PB_SUPER_ID:-dev@barrinconquijote.es}"
export PB_SUPER_PW="${PB_SUPER_PW:-desarrollo-2026-quijote}"

docker run --rm -i --network "$red" \
  -e PB_SUPER_ID -e PB_SUPER_PW -e BASE="${BASE:-http://quijote-web:8080}" \
  -v "$raiz/scripts:/scripts:ro" \
  python:3.12-slim python /scripts/limpiar_aviso_extra.py "$@"

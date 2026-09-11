#!/usr/bin/env bash
#
# Ejecuta las pruebas de reglas de acceso contra el stack levantado.
#
#   ./pruebas/reglas-acceso.sh
#
# No hace falta nada instalado en el host: se ejecuta en un contenedor de python
# enganchado a la red interna del proyecto.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
red="$(basename "$raiz")_interna"

export PB_SUPER_ID="${PB_SUPER_ID:-dev@barrinconquijote.es}"
export PB_SUPER_PW="${PB_SUPER_PW:-desarrollo-2026-quijote}"

docker run --rm -i --network "$red" \
  -e PB_SUPER_ID -e PB_SUPER_PW -e BASE="${BASE:-http://quijote-web:8080}" \
  -v "$raiz/pruebas:/pruebas:ro" \
  python:3.12-slim python /pruebas/reglas_acceso.py

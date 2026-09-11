#!/usr/bin/env bash
#
# Pruebas de las reglas de reserva contra el servidor levantado.
#
#   ./pruebas/reservas.sh
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
red="$(basename "$raiz")_interna"

# Esta prueba hace decenas de reservas seguidas desde la misma IP a proposito,
# asi que sube el freno antibot. El limite en si se prueba aparte, en las
# unitarias (contarIntento).
export QUIJOTE_MAX_RESERVAS_IP="${QUIJOTE_MAX_RESERVAS_IP:-500}"

export PB_SUPER_ID="${PB_SUPER_ID:-dev@barrinconquijote.es}"
export PB_SUPER_PW="${PB_SUPER_PW:-desarrollo-2026-quijote}"

docker run --rm -i --network "$red" \
  -e PB_SUPER_ID -e PB_SUPER_PW -e BASE="${BASE:-http://quijote-web:8080}" \
  -v "$raiz/pruebas:/pruebas:ro" \
  python:3.12-slim python /pruebas/reservas.py

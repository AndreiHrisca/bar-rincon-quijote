#!/usr/bin/env bash
#
# Pruebas unitarias de la logica pura (reglas de aforo, disponibilidad, codigo
# de reserva, telefono...).
#
#   ./pruebas/unitarias.sh
#
# Se ejecutan con el node de un contenedor: el host no tiene Node, y estas
# pruebas no necesitan ni base de datos ni el stack levantado. Sin dependencias:
# solo el node:test que viene de serie.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"

docker run --rm -u "$(id -u):$(id -g)" \
  -v "$raiz:/proyecto:ro" -w /proyecto \
  node:22-alpine node --test "pruebas/unitarias/*.test.js"

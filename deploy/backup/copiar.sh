#!/bin/sh
# ---------------------------------------------------------------------------
# Una copia de seguridad — El Rincon del Quijote
# ---------------------------------------------------------------------------
# Copia la base SQLite y los ficheros subidos (fotos de plato) a un unico
# .tar.gz con fecha, y borra los que pasen de DIAS_RETENCION.
#
# Por que la base se copia con "VACUUM INTO" y no con un simple cp: PocketBase
# escribe en modo WAL. Un cp del fichero .db mientras hay escrituras puede dar
# una copia rota justo cuando mas falta hace. VACUUM INTO deja un fichero
# consistente sin parar el servicio.
# ---------------------------------------------------------------------------
set -eu

DIAS_RETENCION="${DIAS_RETENCION:-14}"
marca=$(date +%Y%m%d-%H%M)
destino="/destino/quijote-${marca}.tar.gz"

mkdir -p /destino
trabajo=$(mktemp -d)
limpiar() { rm -rf "$trabajo"; }
trap limpiar EXIT
mkdir -p "$trabajo/base"

# --- Base de datos ---------------------------------------------------------
# data.db      = contenido (carta, reservas, almacen, personal)
# auxiliary.db = registros y metricas internas de PocketBase
copiadas=0
for base in data auxiliary; do
  if [ -f "/origen/pb_data/${base}.db" ]; then
    # El volumen esta montado de solo lectura, de ahi el "mode=ro". Sin el,
    # SQLite intenta crear el -wal y falla con "unable to open database file".
    sqlite3 "file:/origen/pb_data/${base}.db?mode=ro&immutable=0" \
      "VACUUM INTO '$trabajo/base/${base}.db';"
    copiadas=$((copiadas + 1))
  fi
done

if [ "$copiadas" -eq 0 ]; then
  echo "[copias] no hay ninguna base en /origen/pb_data todavia; nada que copiar."
  exit 0
fi

# --- Ficheros subidos ------------------------------------------------------
if [ -d /origen/pb_data/storage ]; then
  cp -a /origen/pb_data/storage "$trabajo/storage"
fi

tar -czf "$destino" -C "$trabajo" .

echo "[copias] $(date '+%F %T')  copia hecha: $destino ($(du -h "$destino" | cut -f1))"

# --- Rotacion --------------------------------------------------------------
borradas=$(find /destino -maxdepth 1 -name 'quijote-*.tar.gz' -mtime "+$DIAS_RETENCION" -print -delete 2>/dev/null | wc -l)
[ "$borradas" -gt 0 ] && echo "[copias] rotacion: $borradas copias de mas de $DIAS_RETENCION dias borradas."

echo "[copias] $(find /destino -maxdepth 1 -name 'quijote-*.tar.gz' | wc -l) copias guardadas."

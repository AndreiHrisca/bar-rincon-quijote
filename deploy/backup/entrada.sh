#!/bin/sh
# ---------------------------------------------------------------------------
# Bucle de copia de seguridad — El Rincon del Quijote
# ---------------------------------------------------------------------------
# Duerme hasta HORA_COPIA, hace la copia y vuelve a dormir. Sin cron ni
# paquetes extra: un bucle en sh sobre alpine pesa nada y se lee de un vistazo,
# que es lo que hace falta cuando algo falle dentro de dos anos.
#
# Ojo con el "date" de BusyBox: no entiende las fechas relativas de GNU
# ("tomorrow 04:30"). La espera se calcula con aritmetica sobre la hora actual.
# ---------------------------------------------------------------------------
set -eu

HORA_COPIA="${HORA_COPIA:-04:30}"
DIAS_RETENCION="${DIAS_RETENCION:-14}"

# sin_cero quita los ceros a la izquierda: en aritmetica de shell "08" es un
# octal invalido y revienta con "arithmetic syntax error" a las 8 y a las 9.
sin_cero() { n=${1#0}; echo "${n:-0}"; }

hora_objetivo=$(sin_cero "${HORA_COPIA%%:*}")
min_objetivo=$(sin_cero "${HORA_COPIA##*:}")

echo "[copias] en marcha. Copia diaria a las $HORA_COPIA, se guardan $DIAS_RETENCION dias."

# Una copia nada mas arrancar si hoy todavia no hay ninguna: asi un servidor
# recien levantado no pasa su primer dia sin respaldo.
if [ -z "$(find /destino -maxdepth 1 -name "quijote-$(date +%Y%m%d)-*.tar.gz" 2>/dev/null)" ]; then
  /bin/sh /opt/copias/copiar.sh || echo "[copias] la copia inicial ha fallado"
fi

while true; do
  # Segundos transcurridos hoy y segundos hasta la hora de la copia. Si ya ha
  # pasado, se suma un dia.
  ahora=$(( $(sin_cero "$(date +%H)") * 3600 + $(sin_cero "$(date +%M)") * 60 + $(sin_cero "$(date +%S)") ))
  objetivo=$(( hora_objetivo * 3600 + min_objetivo * 60 ))
  espera=$(( objetivo - ahora ))
  [ "$espera" -le 0 ] && espera=$(( espera + 86400 ))

  echo "[copias] siguiente copia en $((espera / 3600)) h $(((espera % 3600) / 60)) min."
  sleep "$espera"
  /bin/sh /opt/copias/copiar.sh || echo "[copias] ATENCION: la copia ha fallado"
done

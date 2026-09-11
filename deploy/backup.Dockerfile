# ---------------------------------------------------------------------------
# Copias de seguridad — El Rincon del Quijote
# ---------------------------------------------------------------------------
# alpine + sqlite, y nada mas. Existe como imagen propia por dos motivos:
#
#   1. Instalar sqlite en cada arranque con "apk add" exige ser root dentro del
#      contenedor, y entonces los .tar.gz aparecen en la carpeta del proyecto
#      como root: no se pueden borrar ni mover sin sudo. Aqui sqlite viene ya
#      dentro y el proceso corre como usuario normal.
#   2. Sin "apk add" en tiempo de ejecucion, la copia sigue funcionando aunque
#      el servidor se quede sin internet.
# ---------------------------------------------------------------------------
FROM alpine:3.21

RUN apk add --no-cache sqlite tzdata

ENV TZ=Europe/Madrid

COPY backup/entrada.sh backup/copiar.sh /opt/copias/
RUN chmod +x /opt/copias/*.sh

ENTRYPOINT ["/bin/sh", "/opt/copias/entrada.sh"]

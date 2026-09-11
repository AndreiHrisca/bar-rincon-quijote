# ---------------------------------------------------------------------------
# PocketBase — El Rincon del Quijote
# ---------------------------------------------------------------------------
# Se construye desde el binario oficial en vez de usar una imagen de terceros:
# no hay imagen oficial de PocketBase en Docker Hub y las de la comunidad no se
# auditan. Asi sabemos exactamente que se ejecuta, y la version se fija abajo.
# ---------------------------------------------------------------------------
FROM alpine:3.21 AS descarga

ARG PB_VERSION=0.40.1
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates unzip wget \
 && wget -q -O /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${TARGETARCH}.zip" \
 && unzip -q /tmp/pb.zip -d /tmp/pb \
 && chmod +x /tmp/pb/pocketbase

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata \
 && addgroup -g 1000 -S pb \
 && adduser  -u 1000 -S pb -G pb

ENV TZ=Europe/Madrid

COPY --from=descarga /tmp/pb/pocketbase /usr/local/bin/pocketbase

# pb_data (base y ficheros subidos) va en volumen; hooks y migraciones se montan
# desde el repositorio para poder desplegarlos sin reconstruir la imagen.
RUN mkdir -p /pb/pb_data /pb/pb_hooks /pb/pb_migrations /pb/pb_public \
 && chown -R pb:pb /pb

USER pb
WORKDIR /pb

EXPOSE 8090

# --dir, --hooksDir y --migrationsDir explicitos: si algun dia cambia el layout
# por defecto de PocketBase, esto sigue apuntando donde toca.
CMD ["pocketbase", "serve", \
     "--http=0.0.0.0:8090", \
     "--dir=/pb/pb_data", \
     "--hooksDir=/pb/pb_hooks", \
     "--migrationsDir=/pb/pb_migrations", \
     "--publicDir=/pb/pb_public"]

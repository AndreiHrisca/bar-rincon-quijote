#!/usr/bin/env bash
#
# Crea (o actualiza) una cuenta de acceso al panel.
#
#   ./scripts/crear-cuenta.sh santi@barrinconquijote.es admin "Santi"
#
# Por que existe este script:
#   Hasta la fase 9 no hay pantalla de Personal, asi que la primera cuenta de
#   verdad —la de administrador, la unica que despues puede crear a las demas—
#   habria que hacerla a mano desde el panel de administracion de PocketBase.
#   Eso son ocho campos y es facil dejarse "rol" sin poner, que es justo el que
#   gobierna todas las reglas de acceso.
#
# LA CONTRASENA NO SE PASA COMO ARGUMENTO, y no es un capricho:
#   - en la linea de ordenes quedaria en el historial de la shell (~/.zsh_history)
#   - y seria visible en "ps" para cualquier otro usuario de la maquina
#   - y en "docker run -e CLAVE=..." tambien, porque va en los argumentos
# Se pide por teclado sin eco y se le pasa al contenedor por el ENTORNO
# (-e NOMBRE, sin valor), que es lo unico que no aparece en los argumentos.
#
# Tampoco se escribe en ningun log: el script no imprime la clave nunca.
#
# Uso:  ./scripts/crear-cuenta.sh CORREO ROL [NOMBRE]
#       roles: admin | empleado
set -euo pipefail

raiz="$(cd "$(dirname "$0")/.." && pwd)"
red="$(basename "$raiz")_interna"

correo="${1:-}"
rol="${2:-}"
nombre="${3:-}"

if [ -z "$correo" ] || [ -z "$rol" ]; then
  echo "Uso: $0 CORREO ROL [NOMBRE]" >&2
  echo "     roles: admin | empleado" >&2
  exit 1
fi

case "$rol" in
  admin|empleado) ;;
  *) echo "Rol no valido: $rol (admin | empleado)" >&2; exit 1 ;;
esac

[ -n "$nombre" ] || nombre="${correo%%@*}"

# --- Credenciales del superusuario -----------------------------------------
# Hace falta uno para poder crear cuentas: users.createRule solo deja al rol
# "admin", y la primera cuenta de administrador todavia no existe.
SUPER_ID="${PB_SUPER_ID:-}"
if [ -z "$SUPER_ID" ]; then
  printf 'Correo del superusuario de PocketBase (/_/): ' >&2
  read -r SUPER_ID
fi

SUPER_PW="${PB_SUPER_PW:-}"
if [ -z "$SUPER_PW" ]; then
  printf 'Contrasena del superusuario: ' >&2
  read -rs SUPER_PW; echo >&2
fi

# --- Contrasena de la cuenta nueva -----------------------------------------
printf 'Contrasena para %s (minimo 8): ' "$correo" >&2
read -rs CLAVE; echo >&2
printf 'Reptela: ' >&2
read -rs CLAVE2; echo >&2

if [ "$CLAVE" != "$CLAVE2" ]; then
  echo 'Las dos contrasenas no coinciden. No se ha tocado nada.' >&2
  exit 1
fi
if [ "${#CLAVE}" -lt 8 ]; then
  echo 'PocketBase exige al menos 8 caracteres. No se ha tocado nada.' >&2
  exit 1
fi

export SUPER_ID SUPER_PW CLAVE
export CORREO="$correo" ROL="$rol" NOMBRE="$nombre"
export BASE="${BASE:-http://quijote-web:8080}"

# Se ejecuta dentro de un contenedor en la red interna: el stack no publica
# puertos en el host. Las variables van con "-e NOMBRE" (sin valor), asi que se
# heredan del entorno y NO aparecen en los argumentos del proceso.
docker run --rm -i --network "$red" \
  -e SUPER_ID -e SUPER_PW -e CLAVE -e CORREO -e ROL -e NOMBRE -e BASE \
  python:3.12-slim python - <<'DENTRO'
import json, os, sys, urllib.error, urllib.parse, urllib.request

BASE = os.environ['BASE']

def pet(metodo, ruta, cuerpo=None, token=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    if '?' in ruta:
        camino, consulta = ruta.split('?', 1)
        ruta = camino + '?' + urllib.parse.quote(consulta, safe='=&')
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', token)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}

correo = os.environ['CORREO']
clave = os.environ['CLAVE']

cod, r = pet('POST', '/api/collections/_superusers/auth-with-password',
             {'identity': os.environ['SUPER_ID'], 'password': os.environ['SUPER_PW']})
if cod != 200:
    print('No se ha podido entrar como superusuario. Revisa el correo y la '
          'contrasena de /_/.', file=sys.stderr)
    sys.exit(1)
raiz = r['token']

cod, r = pet('GET', f'/api/collections/users/records?filter=(email="{correo}")', token=raiz)
existe = r.get('items', [])

campos = {
    'password': clave,
    'passwordConfirm': clave,
    'rol': os.environ['ROL'],
    'nombre': os.environ['NOMBRE'],
    'verified': True,
    'emailVisibility': False,
}

if existe:
    cod, r = pet('PATCH', f'/api/collections/users/records/{existe[0]["id"]}', campos, token=raiz)
    accion = 'actualizada'
else:
    cod, r = pet('POST', '/api/collections/users/records', {'email': correo, **campos}, token=raiz)
    accion = 'creada'

if cod != 200:
    detalle = r.get('data') or r.get('message') or r
    print(f'No se ha podido guardar la cuenta: {cod} {detalle}', file=sys.stderr)
    sys.exit(1)

# Se comprueba que la cuenta entra de verdad. Sin esto, un fallo silencioso en
# el campo de la contrasena dejaria a alguien fuera de su propio panel.
cod, _ = pet('POST', '/api/collections/users/auth-with-password',
             {'identity': correo, 'password': clave})

print(f'Cuenta {accion}: {correo}  ({r.get("rol")})')
print('Comprobado: entra correctamente en el panel.' if cod == 200
      else f'AVISO: la cuenta se ha guardado pero el acceso devuelve {cod}.')
DENTRO

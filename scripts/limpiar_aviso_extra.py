"""
Saca el aviso del ingrediente extra de las DESCRIPCIONES de los platos.

Lo lanza scripts/limpiar-aviso-extra.sh; no se ejecuta suelto.

Por que existe
--------------
Cuando se cargo la carta del bar, a algunos platos se les metio el recargo
dentro del texto de la descripcion: «Bocadillo de jamon serrano. 0,50€ por
ingrediente extra.». Desde D-79 ese aviso lo pone el sistema, con su etiqueta,
a partir del interruptor `admite_extras`. Si el texto se queda donde estaba, el
cliente lee lo mismo dos veces y —peor— el dia que el importe cambie habra dos
verdades distintas en la misma pantalla: la etiqueta dira 0,60 y la descripcion
seguira diciendo 0,50.

Que hace
--------
1. Busca los platos cuya descripcion menciona el recargo.
2. Quita esa frase de la descripcion, dejando el resto tal cual.
3. Enciende `admite_extras` en esos platos: la informacion no se pierde, cambia
   de sitio.

EN SECO POR DEFECTO. Sin --aplicar no escribe nada: solo enseña, plato a plato,
lo que dice ahora y lo que diria despues. Se mira, y si convence se repite con
--aplicar.
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get('BASE', 'http://quijote-web:8080')
SUPER_ID = os.environ.get('PB_SUPER_ID', '')
SUPER_PW = os.environ.get('PB_SUPER_PW', '')
APLICAR = '--aplicar' in sys.argv

VERDE, ROJO, GRIS, FUERTE, FIN = '\033[32m', '\033[31m', '\033[90m', '\033[1m', '\033[0m'

# La frase del recargo, escrita como se escribe de verdad en una carta:
# «0,50€ por ingrediente extra», «0.50 EUR por ingrediente extra», «+0,50 € por
# cada ingrediente extra»... Se admite el signo, el simbolo pegado o separado, el
# punto o la coma decimal, y el punto final. Se exige el IMPORTE: sin numero no
# se toca nada, porque «con ingredientes extra a elegir» es descripcion de
# verdad y no un recargo.
AVISO = re.compile(
    r'\s*[+]?\s*\d+[.,]\d{1,2}\s*(?:€|eur(?:os)?)?\s*'
    r'por\s+(?:cada\s+)?ingrediente\s+extra\s*\.?',
    re.IGNORECASE,
)


def peticion(metodo, ruta, datos=None, token=None):
    req = urllib.request.Request(
        BASE + ruta, method=metodo,
        data=json.dumps(datos).encode() if datos is not None else None,
        headers={'Content-Type': 'application/json',
                 **({'Authorization': token} if token else {})})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def limpia(texto):
    """Quita la frase del recargo y deja el resto presentable."""
    nuevo = AVISO.sub('', texto or '')
    # Un salto de linea que solo estaba ahi para separar la frase que se ha ido.
    nuevo = re.sub(r'\n{2,}', '\n', nuevo).strip()
    # Si al quitarla queda una coma o un punto y coma colgando («X, 0,50€ por
    # ingrediente extra.» -> «X,»), se recoge. EL PUNTO FINAL NO SE TOCA: es de
    # la frase que se queda, no de la que se va, y quitarlo seria cambiar un
    # texto que nadie ha pedido cambiar.
    nuevo = re.sub(r'[\s,;]+$', '', nuevo).strip()
    return nuevo


def main():
    if not SUPER_ID or not SUPER_PW:
        sys.exit('Faltan PB_SUPER_ID y PB_SUPER_PW.')

    cod, r = peticion('POST', '/api/collections/_superusers/auth-with-password',
                      {'identity': SUPER_ID, 'password': SUPER_PW})
    if cod != 200:
        sys.exit(f'No se ha podido entrar: {cod} {r}')
    raiz = r['token']

    cod, r = peticion('GET', '/api/collections/platos/records?perPage=500', token=raiz)
    if cod != 200:
        sys.exit(f'No se ha podido leer la carta: {cod} {r}')

    afectados = []
    for p in r['items']:
        if AVISO.search(p.get('descripcion') or ''):
            afectados.append(p)

    if not afectados:
        print('Ninguna descripción menciona el recargo. No hay nada que hacer.')
        return

    print(f'{FUERTE}{len(afectados)} plato(s) con el aviso metido en la descripción{FIN}\n')
    for p in afectados:
        antes = p['descripcion']
        despues = limpia(antes)
        ya = ' (el interruptor ya estaba encendido)' if p.get('admite_extras') else ''
        print(f'{FUERTE}{p["nombre"]}{FIN}{GRIS}{ya}{FIN}')
        print(f'  {ROJO}- {antes!r}{FIN}')
        print(f'  {VERDE}+ {despues!r}{FIN}')
        print(f'  {GRIS}  admite_extras: {bool(p.get("admite_extras"))} -> True{FIN}\n')

    if not APLICAR:
        print(f'{FUERTE}EN SECO: no se ha escrito nada.{FIN}')
        print('Si el resultado convence, vuelve a lanzarlo con --aplicar.')
        return

    fallos = 0
    for p in afectados:
        cod, r = peticion('PATCH', f'/api/collections/platos/records/{p["id"]}',
                          {'descripcion': limpia(p['descripcion']), 'admite_extras': True},
                          token=raiz)
        if cod != 200:
            fallos += 1
            print(f'{ROJO}FALLO en {p["nombre"]}: {cod} {r}{FIN}')

    hechos = len(afectados) - fallos
    print(f'{VERDE}{hechos} plato(s) actualizados.{FIN}'
          + (f' {ROJO}{fallos} con fallo.{FIN}' if fallos else ''))


main()

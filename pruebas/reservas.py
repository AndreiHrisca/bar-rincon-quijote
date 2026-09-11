#!/usr/bin/env python3
"""
Pruebas de las reglas de reserva contra el servidor de verdad
===============================================================================
Las unitarias (pruebas/unitarias/) comprueban la logica pura. Estas comprueban
que el HOOK la aplica: que quien manda una peticion a mano, saltandose el
formulario, no se salta ni una regla.

Es lo que exige la seccion 8: "El cliente puede ayudar, pero decide el servidor".

Se ejecuta con  ./pruebas/reservas.sh
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta

BASE = os.environ.get('BASE', 'http://quijote-web:8080')


def peticion(metodo, ruta, cuerpo=None, token=None):
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


fallos, pasadas = [], 0


def comprueba(desc, cond, detalle=''):
    global pasadas
    if cond:
        pasadas += 1
        print(f'  \033[32mok\033[0m   {desc}')
    else:
        fallos.append(desc)
        print(f'  \033[31mFALLA\033[0m {desc}' + (f'\n         {detalle}' if detalle else ''))


def seccion(t):
    print(f'\n\033[1m{t}\033[0m')


# --- Preparacion -----------------------------------------------------------
cod, r = peticion('POST', '/api/collections/_superusers/auth-with-password',
                  {'identity': os.environ['PB_SUPER_ID'], 'password': os.environ['PB_SUPER_PW']})
assert cod == 200, f'no se pudo autenticar: {cod} {r}'
raiz = r['token']

_, r = peticion('GET', '/api/collections/ajustes/records')
ajustes = r['items'][0]
AJ_ID = ajustes['id']


def config(**cambios):
    peticion('PATCH', f'/api/collections/ajustes/records/{AJ_ID}', cambios, token=raiz)


def limpia():
    """Borra las reservas que ha dejado esta prueba."""
    _, r = peticion('GET', '/api/collections/reservas/records?perPage=500&filter=(nombre~"PRUEBA")', token=raiz)
    for x in r.get('items', []):
        peticion('DELETE', f'/api/collections/reservas/records/{x["id"]}', token=raiz)


# Un dia de la semana que viene, para no chocar con los datos de demostracion.
DIA = (date.today() + timedelta(days=8)).isoformat()

config(aforo_barra=6, aforo_terraza=20, aforo_salon=24, reservas_activas=True,
       horario_cocina='12:30-16:30,20:00-23:30', duracion_mesa_min=90,
       antelacion_maxima_dias=30)
limpia()

BASE_RESERVA = {
    'fecha': f'{DIA} 00:00:00.000Z', 'hora': '21:00', 'comensales': 4,
    'zona': 'terraza', 'motivo': 'normal', 'nombre': 'PRUEBA Cliente',
    'telefono': '600111222',
}


def reservar(**cambios):
    return peticion('POST', '/api/collections/reservas/records', {**BASE_RESERVA, **cambios})


# ===========================================================================
seccion('1. Una reserva normal, de principio a fin')
cod, r = reservar()
comprueba('se puede reservar sin sesion', cod == 200, f'{cod} {r}')
if cod == 200:
    comprueba('el servidor genera un codigo RQ-XXXX',
              r.get('codigo', '').startswith('RQ-') and len(r['codigo']) == 7, r.get('codigo'))
    comprueba('sin caracteres ambiguos en el codigo',
              not (set(r['codigo'][3:]) & set('O0I1LUV')), r.get('codigo'))
    comprueba('el estado de partida es "pendiente"', r.get('estado') == 'pendiente', r.get('estado'))
    comprueba('el origen se marca como "web"', r.get('origen') == 'web', r.get('origen'))
    comprueba('genera token de cancelacion', len(r.get('token_cancelacion', '')) == 32)
    primera = r

# ===========================================================================
seccion('2. El cliente NO decide el estado ni el origen')
cod, r = reservar(hora='20:00', estado='confirmada', origen='telefono')
comprueba('mandar estado="confirmada" no cuela', r.get('estado') == 'pendiente', r.get('estado'))
comprueba('mandar origen="telefono" no cuela', r.get('origen') == 'web', r.get('origen'))

cod, r = reservar(hora='20:30', codigo='RQ-0000')
comprueba('un codigo inventado por el cliente se ignora',
          r.get('codigo') != 'RQ-0000', r.get('codigo'))

# ===========================================================================
seccion('3. Horario de cocina')
for hora, debe in [('18:00', False), ('12:00', False), ('23:30', False),
                   ('12:30', True), ('23:00', True)]:
    cod, r = reservar(hora=hora, zona='salon')
    ok = (cod == 200) == debe
    comprueba(f'a las {hora}: {"se acepta" if debe else "se rechaza"}', ok,
              f'devolvio {cod} {r.get("message", "")}')

# ===========================================================================
seccion('4. Antelacion')
ayer = (date.today() - timedelta(days=1)).isoformat()
cod, r = reservar(fecha=f'{ayer} 00:00:00.000Z')
comprueba('para ayer, no', cod != 200, f'devolvio {cod}')

lejos = (date.today() + timedelta(days=90)).isoformat()
cod, r = reservar(fecha=f'{lejos} 00:00:00.000Z')
comprueba('mas alla de la antelacion maxima, no', cod != 200, f'devolvio {cod}')

# Dentro de menos de 30 minutos: se busca una franja de hoy que ya haya pasado
hoy = date.today().isoformat()
cod, r = reservar(fecha=f'{hoy} 00:00:00.000Z', hora='12:30')
if datetime.now().hour >= 13:
    comprueba('una franja de hoy ya pasada, no', cod != 200, f'devolvio {cod}')
else:
    print('  --   (se omite: todavia no ha pasado la franja de las 12:30)')

# ===========================================================================
seccion('5. Maximo 10 personas por la web')
cod, r = reservar(hora='22:00', comensales=11, zona='salon')
comprueba('11 personas no se envian', cod != 200, f'devolvio {cod}')
comprueba('el error da el telefono del bar', '288' in str(r.get('message', '')), r.get('message'))
cod, r = reservar(hora='22:00', comensales=10, zona='salon')
comprueba('10 personas si', cod == 200, f'devolvio {cod} {r.get("message","")}')

# ===========================================================================
seccion('6. Aforo: decide el servidor')
limpia()
# Terraza tiene 20. Se llenan 16 y se intenta meter 6 mas.
cod, _ = reservar(hora='21:00', comensales=8, zona='terraza')
cod2, _ = reservar(hora='21:00', comensales=8, zona='terraza')
comprueba('caben 16 en la terraza', cod == 200 and cod2 == 200)

cod, r = reservar(hora='21:00', comensales=6, zona='terraza')
comprueba('16 + 6 pasa del aforo de terraza (20): NO', cod != 200, f'devolvio {cod}')
comprueba('el mensaje propone otra zona u hora',
          'zona' in str(r.get('message', '')).lower() or 'franja' in str(r.get('message', '')).lower(),
          r.get('message'))

cod, r = reservar(hora='21:00', comensales=4, zona='terraza')
comprueba('16 + 4 llega justo al aforo: SI', cod == 200, f'devolvio {cod} {r.get("message","")}')

cod, r = reservar(hora='21:00', comensales=2, zona='terraza')
comprueba('una persona mas, ya no', cod != 200, f'devolvio {cod}')

cod, r = reservar(hora='21:00', comensales=6, zona='salon')
comprueba('con la terraza llena, el salon sigue libre', cod == 200, f'devolvio {cod} {r.get("message","")}')

# La mesa dura 90 min: a las 22:00 la de las 21:00 sigue ocupando
cod, r = reservar(hora='22:00', comensales=6, zona='terraza')
comprueba('a las 22:00 la mesa de las 21:00 sigue ocupando (mesa de 90 min)',
          cod != 200, f'devolvio {cod}')
cod, r = reservar(hora='22:30', comensales=6, zona='terraza')
comprueba('a las 22:30 ya se ha liberado', cod == 200, f'devolvio {cod} {r.get("message","")}')

# ===========================================================================
seccion('7. La disponibilidad que ve el cliente coincide con lo que decide el servidor')
cod, d = peticion('GET', f'/api/quijote/disponibilidad?fecha={DIA}&comensales=6&zona=terraza')
porHora = {f['hora']: f for f in d['franjas']}
comprueba('las franjas llenas se devuelven TACHADAS, no escondidas',
          '21:00' in porHora, 'la franja llena ha desaparecido de la respuesta')
comprueba('la de las 21:00 sale como no libre', porHora.get('21:00', {}).get('libre') is False,
          porHora.get('21:00'))
comprueba('la de las 22:30 sale como libre', porHora.get('22:30', {}).get('libre') is True,
          porHora.get('22:30'))
# El telefono DEL BAR si viene (hace falta para el mensaje de "llamanos"); lo
# que no puede venir es ni un dato de ninguna reserva.
comprueba('la disponibilidad NO filtra datos de ninguna reserva',
          not any(k in json.dumps(d) for k in ['nombre', 'PRUEBA', '600111222', 'codigo']),
          'la respuesta contiene datos personales')

# ===========================================================================
seccion('8. Cancelacion por enlace')
limpia()
cod, res = reservar(hora='20:00', comensales=2, zona='salon')
codigo, token = res['codigo'], res['token_cancelacion']

cod, r = peticion('POST', '/api/quijote/cancelar', {'codigo': codigo, 'token': 'inventado'})
comprueba('con un token falso, no se cancela', cod == 404, f'devolvio {cod}')

cod, r = peticion('POST', '/api/quijote/cancelar', {'codigo': codigo})
comprueba('sin token, no se cancela', cod == 400, f'devolvio {cod}')

cod, r = peticion('POST', '/api/quijote/cancelar', {'codigo': 'RQ-XXXX', 'token': token})
comprueba('un codigo que no existe da el MISMO error que un token malo (no confirma si existe)',
          cod == 404, f'devolvio {cod}')

cod, r = peticion('POST', '/api/quijote/cancelar', {'codigo': codigo, 'token': token})
comprueba('con codigo y token correctos, si', cod == 200 and r.get('ok'), f'{cod} {r}')

_, comprobacion = peticion('GET', f'/api/collections/reservas/records/{res["id"]}', token=raiz)
comprueba('queda en estado "cancelada"', comprobacion.get('estado') == 'cancelada',
          comprobacion.get('estado'))

cod, r = peticion('POST', '/api/quijote/cancelar', {'codigo': codigo, 'token': token})
comprueba('cancelarla dos veces no da error', cod == 200 and r.get('yaEstaba'), f'{cod} {r}')

# Una cancelada libera la mesa
_, d = peticion('GET', f'/api/quijote/disponibilidad?fecha={DIA}&comensales=10&zona=salon')
porHora = {f['hora']: f for f in d['franjas']}
comprueba('una reserva cancelada libera su franja', porHora['20:00']['libre'] is True)

# ===========================================================================
seccion('9. Antibot')
limpia()
cod, r = reservar(hora='20:00', web='soy-un-robot')
comprueba('el honeypot rechaza la reserva', cod != 200, f'devolvio {cod}')
comprueba('el mensaje NO delata cual era el campo trampa',
          'web' not in str(r.get('message', '')).lower()
          and 'honeypot' not in str(r.get('message', '')).lower(), r.get('message'))

# ===========================================================================
seccion('10. Validaciones de datos')
for tel, debe, nota in [
    ('600123456', True, 'movil'),
    ('91 288 10 27', True, 'fijo con espacios'),
    ('+34600123456', True, 'con prefijo'),
    ('12345', False, 'demasiado corto'),
    ('500123456', False, 'no empieza por 6,7,8 ni 9'),
    ('no tengo', False, 'no es un numero'),
]:
    cod, r = reservar(hora='15:00', zona='salon', comensales=2, telefono=tel)
    ok = (cod == 200) == debe
    comprueba(f'telefono "{tel}" ({nota}): {"vale" if debe else "no vale"}', ok, f'devolvio {cod}')

cod, r = reservar(hora='15:30', zona='salon', nombre='')
comprueba('sin nombre, no', cod != 200, f'devolvio {cod}')

# ===========================================================================
seccion('11. Con las reservas desactivadas')
config(reservas_activas=False)
cod, r = reservar(hora='16:00', zona='salon')
comprueba('no se aceptan reservas por la web', cod != 200, f'devolvio {cod}')
comprueba('el error lleva el mensaje configurado por Santi',
          '288' in str(r.get('message', '')), r.get('message'))

cod, d = peticion('GET', f'/api/quijote/disponibilidad?fecha={DIA}')
comprueba('la disponibilidad avisa de que estan cerradas', d.get('activas') is False)
comprueba('y devuelve el mensaje y el telefono',
          d.get('mensaje') and d.get('telefono'), d)

config(reservas_activas=True)

# ===========================================================================
seccion('12. Desde el panel: se avisa, no se prohibe')
# ===========================================================================
# Las reglas del formulario publico (horario de cocina, media hora de
# antelacion, antelacion maxima, aforo, maximo de 10 personas) existen para que
# un desconocido no reserve a las cuatro de la manana. Al telefono manda quien
# coge el telefono: el panel avisa en pantalla y guarda igual.
# Ver DECISIONES.md, D-27.
CORREO_PANEL = 'prueba-panel@ejemplo.invalid'
CLAVE_PANEL = 'prueba-panel-2026'

_, r = peticion('GET', f'/api/collections/users/records?filter=(email="{CORREO_PANEL}")', token=raiz)
for viejo_u in r.get('items', []):
    peticion('DELETE', f'/api/collections/users/records/{viejo_u["id"]}', token=raiz)

cod, r = peticion('POST', '/api/collections/users/records', {
    'email': CORREO_PANEL, 'password': CLAVE_PANEL, 'passwordConfirm': CLAVE_PANEL,
    'rol': 'dueno', 'nombre': 'Prueba Panel', 'emailVisibility': False, 'verified': True,
}, token=raiz)
assert cod == 200, f'no se pudo crear la cuenta del panel: {cod} {r}'
UID_PANEL = r['id']

cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                  {'identity': CORREO_PANEL, 'password': CLAVE_PANEL})
assert cod == 200, f'no se pudo autenticar la cuenta del panel: {cod} {r}'
panel = r['token']


def reservar_panel(**cambios):
    return peticion('POST', '/api/collections/reservas/records',
                    {**BASE_RESERVA, **cambios}, token=panel)


cod, r = reservar_panel(hora='20:00', zona='salon', nombre='PRUEBA Panel normal')
comprueba('el panel puede apuntar una reserva', cod == 200, f'{cod} {r}')
comprueba('nace confirmada, no pendiente', r.get('estado') == 'confirmada', r.get('estado'))
comprueba('y con origen "telefono"', r.get('origen') == 'telefono', r.get('origen'))

# Fuera del horario de cocina: una merienda apuntada por telefono.
cod, r = reservar_panel(hora='18:00', zona='terraza', nombre='PRUEBA Panel merienda')
comprueba('el panel puede apuntar fuera del horario de cocina', cod == 200, f'{cod} {r}')

# Para hoy dentro de un rato: la web pide media hora de antelacion, el panel no.
cod, r = reservar_panel(fecha=f'{date.today().isoformat()} 00:00:00.000Z',
                        hora='00:30', zona='salon', nombre='PRUEBA Panel de hoy')
comprueba('el panel puede apuntar para hoy aunque ya haya pasado la hora',
          cod == 200, f'{cod} {r}')

# Mas alla de la antelacion maxima: el menu de Navidad se reserva en octubre.
lejos = (date.today() + timedelta(days=90)).isoformat()
cod, r = reservar_panel(fecha=f'{lejos} 00:00:00.000Z', hora='21:00', zona='salon',
                        nombre='PRUEBA Panel Navidad')
comprueba('el panel puede apuntar mas alla de la antelacion maxima', cod == 200, f'{cod} {r}')

# Grupo grande: por la web se corta en 10, por telefono es justo lo normal.
cod, r = reservar_panel(hora='20:30', zona='salon', comensales=24,
                        nombre='PRUEBA Panel grupo grande')
comprueba('el panel puede apuntar un grupo de mas de 10', cod == 200, f'{cod} {r}')

# Por encima del aforo: el salon son 24 y ya estan cogidas.
cod, r = reservar_panel(hora='20:30', zona='salon', comensales=10,
                        nombre='PRUEBA Panel por encima del aforo')
comprueba('el panel puede pasarse del aforo', cod == 200, f'{cod} {r}')

# Lo que SI se sigue comprobando: los datos.
cod, r = reservar_panel(hora='21:30', zona='salon', telefono='12345',
                        nombre='PRUEBA Panel telefono malo')
comprueba('pero el telefono se sigue comprobando', cod != 200, f'devolvio {cod}')

cod, r = reservar_panel(hora='21:30', zona='salon', nombre='')
comprueba('y el nombre tambien', cod != 200, f'devolvio {cod}')

# La disponibilidad responde al panel aunque las reservas por la web esten
# apagadas: el interruptor cierra el formulario del cliente, no la libreta.
config(reservas_activas=False)
cod, d = peticion('GET', f'/api/quijote/disponibilidad?fecha={DIA}', token=panel)
comprueba('con sesion, la disponibilidad responde con las reservas apagadas',
          cod == 200 and len(d.get('franjas', [])) > 0, f'{cod} {len(d.get("franjas", []))} franjas')
comprueba('y dice que por la web estan cerradas', d.get('activas') is False, d.get('activas'))

cod, r = reservar_panel(hora='22:00', zona='salon', nombre='PRUEBA Panel con web cerrada')
comprueba('y el panel sigue pudiendo apuntar', cod == 200, f'{cod} {r}')
config(reservas_activas=True)

peticion('DELETE', f'/api/collections/users/records/{UID_PANEL}', token=raiz)

# --- Limpieza --------------------------------------------------------------
limpia()
config(aforo_barra=0, aforo_terraza=0, aforo_salon=0, reservas_activas=False)

print()
if fallos:
    print(f'\033[31m{len(fallos)} FALLOS\033[0m de {pasadas + len(fallos)}:')
    for f in fallos:
        print(f'  - {f}')
    sys.exit(1)
print(f'\033[32m{pasadas} comprobaciones, todas correctas.\033[0m')

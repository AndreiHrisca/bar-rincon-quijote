#!/usr/bin/env python3
"""
Pruebas de las reglas de acceso — El Rincon del Quijote
===============================================================================
La seccion 5 del encargo pide escribir las reglas explicitamente Y PROBARLAS.
Esto es esa prueba. Comprueba lo que de verdad importa:

  - La carta, los eventos y los ajustes se leen sin sesion.
  - Una reserva se puede CREAR sin sesion, pero NO leer, ni listar, ni
    modificar. Ni siquiera conociendo su ID.
  - Productos, recuentos y avisos de stock NO son publicos jamas.
  - Cada rol puede lo que le toca y nada mas.

Se ejecuta con  ./pruebas/reglas-acceso.sh  (levanta un contenedor en la red
interna; no hace falta nada instalado en el host).
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('BASE', 'http://quijote-web:8080')

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def peticion(metodo, ruta, cuerpo=None, token=None):
    """Devuelve (codigo, datos). Nunca lanza excepcion por un 4xx."""
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    # Los filtros llevan espacios y comillas; hay que escapar la parte de
    # consulta o urllib rechaza la URL antes de enviarla.
    if '?' in ruta:
        camino, consulta = ruta.split('?', 1)
        ruta = camino + '?' + urllib.parse.quote(consulta, safe='=&')
    req = urllib.request.Request(BASE + ruta, data=datos, method=metodo)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', token)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}


fallos = []
pasadas = 0

def comprueba(descripcion, condicion, detalle=''):
    global pasadas
    if condicion:
        pasadas += 1
        print(f'  \033[32mok\033[0m   {descripcion}')
    else:
        fallos.append(descripcion)
        print(f'  \033[31mFALLA\033[0m {descripcion}' + (f'\n         {detalle}' if detalle else ''))


def seccion(titulo):
    print(f'\n\033[1m{titulo}\033[0m')


def no_expone(col, token=None, ids_prohibidos=()):
    """Comprueba que una coleccion no suelta nada a quien no le corresponde.

    OJO CON LA SEMANTICA DE POCKETBASE: una regla de lista NO es un permiso,
    es un FILTRO. Con listRule = '@request.auth.id != ""', una peticion sin
    sesion no recibe un 403: recibe un 200 con CERO registros, porque la
    condicion excluye todas las filas. Eso es seguro (no se filtra ni un dato)
    y ademas no confirma si la coleccion tiene contenido.

    Por eso aqui NO se comprueba el codigo de estado, que seria enganoso, sino
    la propiedad que de verdad importa: que no vuelve ni una fila. Y aparte se
    comprueba el acceso directo por ID, que ahi si responde 404.
    """
    cod, r = peticion('GET', f'/api/collections/{col}/records?perPage=200', token=token)
    vacia = cod in (400, 403, 404) or (cod == 200 and r.get('totalItems', -1) == 0)
    comprueba(f'«{col}» no devuelve ni un registro',
              vacia, f'devolvio {cod} con {r.get("totalItems")} registros')
    for rid in ids_prohibidos:
        cod, _ = peticion('GET', f'/api/collections/{col}/records/{rid}', token=token)
        comprueba(f'«{col}»: no se puede abrir un registro por su ID',
                  cod == 404, f'devolvio {cod}')


# ---------------------------------------------------------------------------
# Preparacion: un usuario por rol
# ---------------------------------------------------------------------------
SUPER_ID = os.environ['PB_SUPER_ID']
SUPER_PW = os.environ['PB_SUPER_PW']

cod, r = peticion('POST', '/api/collections/_superusers/auth-with-password',
                  {'identity': SUPER_ID, 'password': SUPER_PW})
assert cod == 200, f'no se pudo autenticar el superusuario: {cod} {r}'
raiz = r['token']

# Desde la migracion 1757200000_rol_administrador.js solo hay dos roles. Pero
# hacen falta TRES cuentas: dos empleados distintos, porque varias
# comprobaciones son justamente «lo mio si, lo de mi companero no». La clave del
# diccionario es el apodo de la cuenta dentro de la prueba; el valor, su rol.
CUENTAS = {'admin': 'admin', 'empleado': 'empleado', 'otro': 'empleado'}
CLAVE = 'prueba-reglas-2026'
# Marca de lo que crea esta prueba. Sirve para limpiar restos de una ejecucion
# anterior sin tocar nunca datos de verdad.
MARCA_PRUEBA = '[PRUEBA reglas de acceso]'
tokens = {}

# Se borran las cuentas de la ejecucion anterior para que la prueba sea
# repetible. Se buscan POR PATRON y no una por una: la seccion 11 le cambia el
# correo a una de ellas, asi que buscar los cuatro correos exactos dejaria esa
# cuenta viva y la siguiente pasada chocaria contra ella al reutilizar el correo.
_, r = peticion('GET', '/api/collections/users/records?filter=(email~"prueba-")&perPage=100', token=raiz)
for viejo in r.get('items', []):
    peticion('DELETE', f'/api/collections/users/records/{viejo["id"]}', token=raiz)
_, r = peticion('GET', '/api/collections/users/records?filter=(usuario~"pruebacrud")&perPage=100', token=raiz)
for viejo in r.get('items', []):
    peticion('DELETE', f'/api/collections/users/records/{viejo["id"]}', token=raiz)

for quien, rol in CUENTAS.items():
    correo = f'prueba-{quien}@ejemplo.invalid'

    cod, r = peticion('POST', '/api/collections/users/records', {
        'email': correo, 'password': CLAVE, 'passwordConfirm': CLAVE,
        'rol': rol, 'nombre': f'Prueba {quien}', 'emailVisibility': False,
        'verified': True,
    }, token=raiz)
    assert cod == 200, f'no se pudo crear el usuario {quien}: {cod} {r}'

    cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                      {'identity': correo, 'password': CLAVE})
    assert cod == 200, f'no se pudo autenticar {quien}: {cod} {r}'
    tokens[quien] = r['token']

print(f'Preparados {len(tokens)} usuarios de prueba: un administrador y dos empleados.')

# Datos minimos con los que probar.
cod, cat = peticion('POST', '/api/collections/categorias/records',
                    {'nombre': 'Prueba', 'slug': 'prueba-reglas', 'orden': 99, 'visible': True},
                    token=raiz)
if cod != 200:  # ya existia
    _, r = peticion('GET', '/api/collections/categorias/records?filter=(slug="prueba-reglas")', token=raiz)
    cat = r['items'][0]

cod, prov = peticion('POST', '/api/collections/proveedores/records',
                     {'nombre': 'Proveedor de prueba', 'activo': True}, token=raiz)
if cod != 200:
    _, r = peticion('GET', '/api/collections/proveedores/records?filter=(nombre="Proveedor de prueba")', token=raiz)
    prov = r['items'][0]

cod, prod = peticion('POST', '/api/collections/productos/records',
                     {'nombre': 'Producto de prueba', 'categoria_almacen': 'otros',
                      'unidad': 'unidades', 'stock_minimo': 2, 'activo': True}, token=raiz)
if cod != 200:
    _, r = peticion('GET', '/api/collections/productos/records?filter=(nombre="Producto de prueba")', token=raiz)
    prod = r['items'][0]

# Se limpian los restos de ejecuciones anteriores para que la prueba sea
# repetible y no deje basura en la carta.
for nombre in ['Plato visible de prueba', 'Plato oculto de prueba', 'Plato de rol']:
    _, r = peticion('GET', f'/api/collections/platos/records?filter=(nombre="{nombre}")&perPage=200', token=raiz)
    for viejo in r.get('items', []):
        peticion('DELETE', f'/api/collections/platos/records/{viejo["id"]}', token=raiz)

cod, plato_vis = peticion('POST', '/api/collections/platos/records',
                          {'categoria': cat['id'], 'nombre': 'Plato visible de prueba',
                           'precio_barra': 10, 'precio_terraza': 12, 'visible': True}, token=raiz)
cod2, plato_oculto = peticion('POST', '/api/collections/platos/records',
                              {'categoria': cat['id'], 'nombre': 'Plato oculto de prueba',
                               'precio_barra': 10, 'visible': False}, token=raiz)
# Encendido pero SIN PRECIO: la carta del bar se cargo asi, sin precios, y un
# plato sin precio no puede salir a la calle (D-76).
cod3, plato_sin_precio = peticion('POST', '/api/collections/platos/records',
                                  {'categoria': cat['id'], 'nombre': 'Plato sin precio de prueba',
                                   'precio_barra': 0, 'visible': True}, token=raiz)

# ===========================================================================
seccion('1. Lectura publica: la carta, los eventos y los ajustes')
# ===========================================================================
for col in ['categorias', 'platos', 'eventos', 'ajustes']:
    cod, r = peticion('GET', f'/api/collections/{col}/records')
    comprueba(f'sin sesion se puede listar «{col}»', cod == 200, f'devolvio {cod}')

# Se filtra por nombre en vez de listar y buscar en la pagina: desde que esta
# cargada la carta real del bar hay casi trescientos platos y los de prueba
# caian fuera de la primera pagina.
def busca_plato(nombre, token=None):
    _, r = peticion('GET', f'/api/collections/platos/records?perPage=5&filter=(nombre="{nombre}")',
                    token=token)
    return [p['nombre'] for p in r.get('items', [])]

comprueba('sin sesion se ve el plato visible',
          'Plato visible de prueba' in busca_plato('Plato visible de prueba'))
comprueba('sin sesion NO se descarga el plato oculto',
          'Plato oculto de prueba' not in busca_plato('Plato oculto de prueba'))

if cod2 == 200:
    cod, r = peticion('GET', f'/api/collections/platos/records/{plato_oculto["id"]}')
    comprueba('sin sesion NO se puede abrir un plato oculto por su ID', cod == 404, f'devolvio {cod}')

comprueba('con sesion SI se ven los platos ocultos (el panel los necesita)',
          'Plato oculto de prueba' in busca_plato('Plato oculto de prueba', tokens['otro']))

# --- Un plato sin precio no sale a la calle ---------------------------------
# La carta real se cargo sin precios (278 platos). Que no salgan NO se deja a
# la pantalla: lo tapa la regla de la coleccion, aunque el plato este encendido.
comprueba('un plato se puede guardar sin precio', cod3 == 200, f'devolvio {cod3} {plato_sin_precio}')

comprueba('sin sesion NO se descarga un plato sin precio, aunque este encendido',
          'Plato sin precio de prueba' not in busca_plato('Plato sin precio de prueba'))

cod, r = peticion('GET', f'/api/collections/platos/records/{plato_sin_precio["id"]}')
comprueba('ni se puede abrir por su ID', cod == 404, f'devolvio {cod}')

comprueba('pero el panel SI lo ve: es lo que hay que terminar',
          'Plato sin precio de prueba' in busca_plato('Plato sin precio de prueba', tokens['otro']))

peticion('PATCH', f'/api/collections/platos/records/{plato_sin_precio["id"]}',
         {'precio_barra': 3.5}, token=raiz)
cod, r = peticion('GET', f'/api/collections/platos/records/{plato_sin_precio["id"]}')
comprueba('en cuanto tiene precio, sale', cod == 200, f'devolvio {cod}')

# ===========================================================================
seccion('2. Reservas: se crean sin sesion, no se leen sin sesion')
# ===========================================================================
# Esta prueba es de REGLAS DE ACCESO, no de reglas de reserva (esas van en
# pruebas/reservas.py). Pero desde la fase 4 hay un hook que rechaza las
# reservas si estan desactivadas o si no hay aforo, asi que hay que dejar el bar
# en condiciones de aceptar una. Se guarda la configuracion y se restaura al
# final, para no dejar el sistema tocado.
_, r = peticion('GET', '/api/collections/ajustes/records')
ajustes_previos = r['items'][0]
AJ_ID = ajustes_previos['id']
CLAVES_AJUSTES = ['aforo_barra', 'aforo_terraza', 'aforo_salon', 'reservas_activas']
copia_ajustes = {k: ajustes_previos.get(k) for k in CLAVES_AJUSTES}

# Se fija tambien la antelacion maxima, y no es un detalle: esta prueba reserva
# para dentro de seis dias, y si la base que se esta probando es una copia de la
# de verdad, ahi el bar puede tener puesto un limite mas corto (hoy, cinco dias).
# Sin esto, la comprobacion falla por la configuracion del bar y no por la regla
# que se quiere probar.
peticion('PATCH', f'/api/collections/ajustes/records/{AJ_ID}',
         {'aforo_barra': 6, 'aforo_terraza': 20, 'aforo_salon': 24,
          'antelacion_maxima_dias': 30, 'reservas_activas': True}, token=raiz)

# Una fecha de la semana que viene y una hora dentro del horario de cocina.
from datetime import date, timedelta
DIA_RESERVA = (date.today() + timedelta(days=6)).isoformat()

cod, reserva = peticion('POST', '/api/collections/reservas/records', {
    'fecha': f'{DIA_RESERVA} 00:00:00.000Z', 'hora': '21:00', 'comensales': 4,
    'zona': 'salon', 'motivo': 'normal', 'nombre': 'Cliente de prueba',
    'telefono': '600111222', 'estado': 'pendiente', 'codigo': 'RQ-TST1',
    'origen': 'web',
})
comprueba('sin sesion se PUEDE crear una reserva', cod == 200, f'devolvio {cod} {reserva}')

if cod == 200:
    rid = reserva['id']
    cod, r = peticion('GET', f'/api/collections/reservas/records/{rid}')
    comprueba('sin sesion NO se puede leer esa reserva conociendo su ID', cod == 404,
              f'devolvio {cod} — FUGA DE DATOS PERSONALES')

    no_expone('reservas')

    cod, r = peticion('PATCH', f'/api/collections/reservas/records/{rid}', {'estado': 'confirmada'})
    comprueba('sin sesion NO se puede modificar una reserva', cod in (400, 403, 404),
              f'devolvio {cod}')

    cod, r = peticion('DELETE', f'/api/collections/reservas/records/{rid}')
    comprueba('sin sesion NO se puede borrar una reserva', cod in (400, 403, 404),
              f'devolvio {cod}')

    cod, r = peticion('GET', f'/api/collections/reservas/records/{rid}', token=tokens['admin'])
    comprueba('el administrador SI lee la reserva', cod == 200, f'devolvio {cod}')

    # LAS RESERVAS SON DEL TURNO. Desde la migracion
    # 1757200000_rol_administrador.js cualquiera con sesion las gestiona: es
    # quien coge el telefono y quien sienta a la gente.
    cod, r = peticion('PATCH', f'/api/collections/reservas/records/{rid}',
                      {'estado': 'sentada'}, token=tokens['empleado'])
    comprueba('un empleado SI puede sentar una reserva', cod == 200, f'devolvio {cod} {r}')

    cod, r = peticion('PATCH', f'/api/collections/reservas/records/{rid}',
                      {'hora': '21:00', 'comensales': 4}, token=tokens['otro'])
    comprueba('y cambiarle la hora y las personas', cod == 200, f'devolvio {cod} {r}')

    # Borrar NO: una reserva borrada por error es un cliente que se presenta y
    # no tiene mesa. Para quitarla de en medio esta el estado «anulada».
    cod, r = peticion('DELETE', f'/api/collections/reservas/records/{rid}',
                      token=tokens['empleado'])
    comprueba('pero NO puede borrarla', cod in (400, 403, 404), f'devolvio {cod}')

    cod, r = peticion('DELETE', f'/api/collections/reservas/records/{rid}',
                      token=tokens['admin'])
    comprueba('el administrador SI puede borrarla', cod == 204, f'devolvio {cod}')

# ===========================================================================
seccion('3. El almacen no es publico jamas')
# ===========================================================================
print('  (sin sesion)')
for col in ['proveedores', 'recuentos', 'recuento_lineas', 'avisos_stock']:
    no_expone(col)
no_expone('productos', ids_prohibidos=[prod['id']])

# ===========================================================================
seccion('4. Personal: horas y fichajes solo para el administrador y uno mismo')
# ===========================================================================
print('  (sin sesion)')
for col in ['empleados', 'turnos', 'fichajes', 'users', 'metricas']:
    no_expone(col)

# Empleado ligado a la cuenta de "empleado", y un fichaje suyo.
cod, r = peticion('GET', '/api/collections/users/records?filter=(email="prueba-empleado@ejemplo.invalid")', token=raiz)
uid_empleado = r['items'][0]['id']
cod, r = peticion('GET', '/api/collections/users/records?filter=(email="prueba-otro@ejemplo.invalid")', token=raiz)
uid_otro = r['items'][0]['id']

_, r = peticion('GET', '/api/collections/empleados/records?filter=(alias="PE")', token=raiz)
if r.get('items'):
    # Se reengancha a la cuenta de ESTA ejecucion: los usuarios de prueba se
    # borran y se recrean cada vez, asi que la ficha guardada apunta a un id
    # que ya no existe y la regla empleado.usuario = @request.auth.id no casa.
    emp = r['items'][0]
    _, emp = peticion('PATCH', f'/api/collections/empleados/records/{emp["id"]}',
                      {'usuario': uid_empleado}, token=raiz)
else:
    _, emp = peticion('POST', '/api/collections/empleados/records',
                      {'nombre': 'Prueba Empleado', 'alias': 'PE', 'color': '#93202A',
                       'activo': True, 'usuario': uid_empleado}, token=raiz)

_, fichaje = peticion('POST', '/api/collections/fichajes/records',
                      {'empleado': emp['id'], 'entrada': '2026-09-01 09:00:00.000Z'}, token=raiz)

cod, r = peticion('GET', f'/api/collections/fichajes/records/{fichaje["id"]}', token=tokens['empleado'])
comprueba('un empleado ve SU propio fichaje', cod == 200, f'devolvio {cod}')

cod, r = peticion('GET', f'/api/collections/fichajes/records/{fichaje["id"]}', token=tokens['otro'])
comprueba('otro compañero NO ve el fichaje ajeno', cod == 404, f'devolvio {cod}')

cod, r = peticion('GET', f'/api/collections/fichajes/records/{fichaje["id"]}', token=tokens['admin'])
comprueba('el administrador SI ve los fichajes del equipo', cod == 200, f'devolvio {cod}')

# Un companero no solo no puede abrirlo: tampoco le sale al listar.
no_expone('fichajes', token=tokens['otro'], ids_prohibidos=[fichaje['id']])

# --- REGRESION: el fichaje de un empleado SIN cuenta de acceso ---------------
# Esta es la comprobacion que destapo el agujero, y hay que conservarla.
#
# La regla original comparaba `empleado.usuario = @request.auth.id`. Sin sesion,
# @request.auth.id vale cadena vacia; y un empleado sin cuenta ligada tiene
# `usuario` tambien vacio. La condicion se convertia en "" = "", que es CIERTO,
# y los fichajes de toda persona sin cuenta quedaban publicos. En un bar de tres
# o cuatro personas, donde lo normal es no tener cuenta, eso es casi todo.
#
# Si alguien vuelve a quitar el `@request.auth.id != ""` de la regla, esto falla.
_, r = peticion('GET', '/api/collections/empleados/records?filter=(alias="SC")', token=raiz)
if r.get('items'):
    emp_sin_cuenta = r['items'][0]
else:
    _, emp_sin_cuenta = peticion('POST', '/api/collections/empleados/records',
                                 {'nombre': 'Sin Cuenta', 'alias': 'SC',
                                  'color': '#A8672F', 'activo': True}, token=raiz)

_, fich_huerfano = peticion('POST', '/api/collections/fichajes/records',
                            {'empleado': emp_sin_cuenta['id'],
                             'entrada': '2026-09-01 09:00:00.000Z'}, token=raiz)

no_expone('fichajes', ids_prohibidos=[fich_huerfano['id']])
comprueba('el fichaje de un empleado SIN cuenta tampoco es publico',
          peticion('GET', f'/api/collections/fichajes/records/{fich_huerfano["id"]}')[0] == 404)

peticion('DELETE', f'/api/collections/fichajes/records/{fich_huerfano["id"]}', token=raiz)
peticion('DELETE', f'/api/collections/empleados/records/{emp_sin_cuenta["id"]}', token=raiz)

peticion('DELETE', f'/api/collections/fichajes/records/{fichaje["id"]}', token=raiz)

# ===========================================================================
seccion('5. Roles: quien puede tocar la carta')
# ===========================================================================
# LA CARTA ES DEL TURNO. Desde la migracion 1757200000_rol_administrador.js, un
# empleado la mantiene entera: crea platos, los edita y les cambia el precio.
# Es lo que hace todo el dia, y antes no podia ni corregir una descripcion.
#
# Lo que NO puede es BORRAR: un plato borrado se lleva su foto, su sitio y su
# historia. Para quitar algo de la carta esta el interruptor de «visible», que
# se deshace.
nuevo = {'categoria': cat['id'], 'nombre': 'Plato de rol', 'precio_barra': 9, 'visible': True}

cod, creado = peticion('POST', '/api/collections/platos/records', nuevo, token=tokens['empleado'])
comprueba('un empleado SI puede crear platos', cod == 200, f'devolvio {cod} {creado}')

if cod == 200:
    cod, r = peticion('DELETE', f'/api/collections/platos/records/{creado["id"]}',
                      token=tokens['empleado'])
    comprueba('pero NO puede borrarlos', cod in (400, 403, 404), f'devolvio {cod}')

    cod, r = peticion('DELETE', f'/api/collections/platos/records/{creado["id"]}',
                      token=tokens['admin'])
    comprueba('el administrador SI puede borrarlos', cod == 204, f'devolvio {cod} {r}')

cod, r = peticion('PATCH', f'/api/collections/ajustes/records/{AJ_ID}',
                  {'aforo_salon': 40}, token=tokens['empleado'])
comprueba('un empleado NO puede tocar los ajustes', cod in (400, 403, 404), f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/ajustes/records/{AJ_ID}',
                  {'aforo_salon': 24}, token=tokens['admin'])
comprueba('el administrador SI puede tocar los ajustes', cod == 200, f'devolvio {cod} {r}')

# --- El precio lo cambia el turno, y queda apuntado --------------------------
# Hasta la migracion 1757200000 habia un hook que le impedia al «encargado»
# tocar los precios. Ese rol ya no existe y la restriccion se levanto a
# proposito: un plato que se puede editar entero menos el numero mas importante
# es una regla que no se sostiene en una pantalla. La garantia ahora es otra, y
# mejor: el cambio queda en «Actividad» con el antes y el despues.
cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'precio_barra': 99}, token=tokens['empleado'])
comprueba('un empleado SI puede cambiar el precio de un plato', cod == 200, f'devolvio {cod} {r}')

cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'descripcion': 'Cambiada por un empleado'}, token=tokens['empleado'])
comprueba('y lo demas del plato tambien', cod == 200, f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'precio_barra': 11}, token=tokens['admin'])
comprueba('el administrador tambien, claro', cod == 200, f'devolvio {cod}')

# --- Los ingredientes extra ------------------------------------------------
# `admite_extras` enciende el «+0,50 € por ingrediente» sobre ese plato. Iba con
# los precios por el mismo candado (D-79) y sigue yendo con ellos: ahora eso
# significa que tambien lo toca el turno.
cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'admite_extras': True}, token=tokens['empleado'])
comprueba('un empleado SI puede encender los ingredientes extra',
          cod == 200 and r.get('admite_extras') is True, f'devolvio {cod} {r.get("admite_extras")!r}')

cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'admite_extras': True, 'descripcion': 'Con el extra ya encendido'},
                  token=tokens['empleado'])
comprueba('y guardar el plato entero con el ya encendido', cod == 200, f'devolvio {cod} {r}')

# El campo viaja a la carta publica: si no, el aviso no se podria pintar. Va
# ANTES de apagarlo: es lo unico que hay encendido en este momento.
cod, r = peticion('GET', '/api/collections/platos/records'
                  '?perPage=5&filter=(nombre="Plato visible de prueba")&fields=nombre,admite_extras')
comprueba('la carta publica recibe admite_extras',
          cod == 200 and r['items'] and r['items'][0].get('admite_extras') is True,
          f'devolvio {cod} {r}')

cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'admite_extras': False}, token=tokens['empleado'])
comprueba('y un empleado puede volver a apagarlo', cod == 200, f'devolvio {cod} {r}')

# --- «Oculto desde» lo escribe el servidor -----------------------------------
cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'visible': False}, token=tokens['admin'])
comprueba('al apagar un plato, el servidor anota desde cuando',
          cod == 200 and bool(r.get('oculto_desde')), f'devolvio {cod} {r.get("oculto_desde")!r}')
comprueba('y lo anota como medianoche UTC del dia natural',
          str(r.get('oculto_desde', '')).endswith('00:00:00.000Z'), r.get('oculto_desde'))

cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'visible': True}, token=tokens['admin'])
comprueba('al volver a encenderlo, la fecha se borra',
          cod == 200 and not r.get('oculto_desde'), f'devolvio {cod} {r.get("oculto_desde")!r}')

# ===========================================================================
seccion('6. Roles: quien cambia el rol de quien')
# ===========================================================================
# Esto NO lo puede decir una regla de coleccion: users.updateRule deja que cada
# cual edite su propia ficha (para cambiarse el nombre o la contrasena), y sin
# el hook de pb_hooks/roles.pb.js un empleado se asciende a administrador con un
# PATCH de una linea.
ids = {}
for quien in CUENTAS:
    _, r = peticion('GET', f'/api/collections/users/records?filter=(email="prueba-{quien}@ejemplo.invalid")', token=raiz)
    ids[quien] = r['items'][0]['id']

cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["empleado"]}',
                  {'rol': 'admin'}, token=tokens['empleado'])
comprueba('un empleado NO se asciende a si mismo', cod == 403,
          f'devolvio {cod} — ESCALADA DE PRIVILEGIOS')

cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["admin"]}',
                  {'rol': 'empleado'}, token=tokens['admin'])
comprueba('el administrador tampoco se cambia el rol a si mismo', cod == 403, f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
                  {'rol': 'admin'}, token=tokens['empleado'])
comprueba('un empleado NO asciende a un companero', cod in (400, 403, 404), f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["empleado"]}',
                  {'nombre': 'Prueba empleado con otro nombre'}, token=tokens['empleado'])
comprueba('pero cada cual SI puede cambiarse el nombre', cod == 200, f'devolvio {cod} {r}')

# El rol viejo no se puede volver a poner ni a mano: el campo solo admite dos.
cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
                  {'rol': 'dueno'}, token=tokens['admin'])
comprueba('«dueno» ya no es un rol que se pueda poner', cod in (400, 403), f'devolvio {cod} {r}')

cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
                  {'rol': 'admin'}, token=tokens['admin'])
comprueba('el administrador SI cambia el rol de otra cuenta', cod == 200 and r.get('rol') == 'admin',
          f'devolvio {cod} {r.get("rol")}')

# ===========================================================================
seccion('7. Metricas: nadie escribe por la API')
# ===========================================================================
# ANTES DE NADA, igual que en la seccion 8: la 6 ascendio a administrador la
# segunda cuenta de empleado, y el rol se lee de la base en CADA peticion. Sin
# devolverla a su sitio, esta seccion daria por bueno que un empleado lee las
# estadisticas.
peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
         {'rol': 'empleado'}, token=raiz)

for quien, tok in [('sin sesion', None), ('el administrador', tokens['admin'])]:
    cod, r = peticion('POST', '/api/collections/metricas/records',
                      {'tipo': 'escaneo', 'dia': '2026-09-01', 'contador': 1}, token=tok)
    comprueba(f'{quien} NO puede escribir metricas a mano', cod in (400, 403), f'devolvio {cod}')

no_expone('metricas')

# --- La ruta que SI cuenta (fase 10) ---------------------------------------
# Es publica a proposito: la llama la carta de cualquiera que escanee el QR. Lo
# que la hace segura es que solo acepta tres tipos y que el valor se comprueba.
def fila_metrica(tipo, valor):
    # Con UNA sola condicion y el resto filtrado aqui: peticion() no escapa el
    # «&» de la consulta, asi que un filtro con «&&» se parte en dos parametros
    # y PocketBase lo ignora. Se paga una vez y se aprende.
    hoy = date.today().isoformat()
    _, r = peticion('GET', f'/api/collections/metricas/records?perPage=500&filter=(dia="{hoy}")',
                    token=raiz)
    for fila in r.get('items', []):
        if fila['tipo'] == tipo and fila['valor'] == valor:
            return fila
    return None

antes = fila_metrica('escaneo', 'es')
cod, _ = peticion('POST', '/api/quijote/metrica', {'tipo': 'escaneo', 'valor': 'es'})
comprueba('sin sesion SI se puede contar una visita', cod == 204, f'devolvio {cod}')

despues = fila_metrica('escaneo', 'es')
comprueba('y se SUMA en la fila del dia, no crea otra',
          despues is not None
          and despues['contador'] == (antes['contador'] + 1 if antes else 1)
          and (antes is None or despues['id'] == antes['id']),
          f'antes={antes} despues={despues}')

peticion('POST', '/api/quijote/metrica', {'tipo': 'inventado', 'valor': 'x'})
comprueba('un tipo que no existe no deja rastro', fila_metrica('inventado', 'x') is None)

peticion('POST', '/api/quijote/metrica',
         {'tipo': 'vista_plato', 'valor': 'Plato que no existe en la carta'})
comprueba('no se cuenta la vista de un plato que no existe',
          fila_metrica('vista_plato', 'Plato que no existe en la carta') is None)

peticion('POST', '/api/quijote/metrica', {'tipo': 'busqueda_sin_resultado', 'valor': '  PAELLA  '})
comprueba('una busqueda se guarda recortada y en minusculas',
          fila_metrica('busqueda_sin_resultado', 'paella') is not None)

# --- El resumen del panel ---------------------------------------------------
cod, _ = peticion('GET', '/api/quijote/estadisticas?dias=7')
comprueba('sin sesion NO se leen las estadisticas', cod == 401, f'devolvio {cod}')

cod, _ = peticion('GET', '/api/quijote/estadisticas?dias=7', token=tokens['empleado'])
comprueba('un empleado tampoco: son de administracion del negocio', cod == 403, f'devolvio {cod}')

cod, r = peticion('GET', '/api/quijote/estadisticas?dias=7', token=tokens['admin'])
comprueba('el administrador SI', cod == 200 and 'escaneos' in r and 'por_dia' in r, f'devolvio {cod}')

# ===========================================================================
seccion('7b. Eventos: los publica el bar, los lee cualquiera')
# ===========================================================================
# «Que se cuece» es publico y sale del mismo sitio que la carta: si un evento se
# apaga tiene que dejar de verse desde la calle, igual que un plato.
cod, ev_oculto = peticion('POST', '/api/collections/eventos/records', {
    'titulo': 'Evento apagado de prueba',
    'fecha_inicio': f'{date.today().isoformat()} 00:00:00.000Z',
    'visible': False,
}, token=raiz)

cod, r = peticion('GET', '/api/collections/eventos/records'
                  '?filter=(titulo="Evento apagado de prueba")')
comprueba('sin sesion NO se ve un evento apagado', r.get('totalItems') == 0, f'devolvio {r}')

cod, _ = peticion('GET', f'/api/collections/eventos/records/{ev_oculto["id"]}')
comprueba('ni se puede abrir por su ID', cod == 404, f'devolvio {cod}')

cod, r = peticion('GET', '/api/collections/eventos/records'
                  '?filter=(titulo="Evento apagado de prueba")', token=tokens['otro'])
comprueba('con sesion SI se ve: el panel tiene que poder encenderlo',
          r.get('totalItems') == 1, f'devolvio {r}')

# Anunciar algo en la web es administrar el negocio, no trabajo del turno: los
# eventos son del administrador de punta a punta.
cod, _ = peticion('POST', '/api/collections/eventos/records', {
    'titulo': 'Evento de un empleado', 'fecha_inicio': f'{date.today().isoformat()} 00:00:00.000Z',
}, token=tokens['empleado'])
comprueba('un empleado NO crea eventos', cod in (400, 403), f'devolvio {cod}')

cod, ev_adm = peticion('POST', '/api/collections/eventos/records', {
    'titulo': 'Evento del administrador de prueba',
    'fecha_inicio': f'{date.today().isoformat()} 00:00:00.000Z', 'visible': True,
}, token=tokens['admin'])
comprueba('el administrador SI', cod == 200, f'devolvio {cod}')

cod, _ = peticion('PATCH', f'/api/collections/eventos/records/{ev_adm["id"]}',
                  {'visible': False}, token=tokens['empleado'])
# Ojo con el codigo: cuando una regla deniega por registro, PocketBase contesta
# 404 («no existe tal registro para ti»), no 403.
comprueba('ni los despublica', cod in (400, 403, 404), f'devolvio {cod}')

cod, _ = peticion('DELETE', f'/api/collections/eventos/records/{ev_adm["id"]}',
                  token=tokens['empleado'])
comprueba('ni los borra', cod in (400, 403, 404), f'devolvio {cod}')

cod, _ = peticion('DELETE', f'/api/collections/eventos/records/{ev_adm["id"]}', token=tokens['admin'])
comprueba('el administrador SI los borra', cod == 204, f'devolvio {cod}')

# ===========================================================================
seccion('8. Almacen: quien apunta faltas y quien mantiene el catalogo')
# ===========================================================================
# La seccion 9.1 pide que quien esta en la cocina pueda dar de alta un producto
# AL VUELO, con solo el nombre, sin esperar a nadie. Y el catalogo en si
# —unidades, minimos, proveedores— es administracion del negocio. Son dos cosas
# distintas y la prueba las separa.
#
# ANTES DE NADA: la seccion 6 ascendio a administrador la segunda cuenta de
# empleado para probar el cambio de rol, y el rol se lee de la base en CADA
# peticion, no del token. Sin devolverla a su sitio, esta seccion daria por
# bueno que un empleado toca el catalogo.
peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
         {'rol': 'empleado'}, token=raiz)

cod, al_vuelo = peticion('POST', '/api/collections/productos/records',
                         {'nombre': 'Harina de prueba al vuelo', 'activo': True},
                         token=tokens['otro'])
comprueba('un empleado SI puede dar de alta un producto con solo el nombre',
          cod == 200, f'devolvio {cod} {al_vuelo}')
comprueba('y el servidor lo marca como «sin configurar»',
          al_vuelo.get('sin_configurar') is True, f'sin_configurar={al_vuelo.get("sin_configurar")!r}')

# La marca la pone el SERVIDOR: mandarla a false al crear no sirve de nada.
cod, colado = peticion('POST', '/api/collections/productos/records',
                       {'nombre': 'Producto que se cuela', 'sin_configurar': False},
                       token=tokens['otro'])
comprueba('la marca no se puede quitar desde el navegador al crear',
          cod == 200 and colado.get('sin_configurar') is True,
          f'devolvio {cod} sin_configurar={colado.get("sin_configurar")!r}')
if cod == 200:
    peticion('DELETE', f'/api/collections/productos/records/{colado["id"]}', token=raiz)

cod, r = peticion('PATCH', f'/api/collections/productos/records/{al_vuelo["id"]}',
                  {'unidad': 'kg'}, token=tokens['otro'])
comprueba('pero NO puede cambiar el catalogo', cod in (400, 403, 404), f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/productos/records/{al_vuelo["id"]}',
                  {'unidad': 'kg'}, token=tokens['empleado'])
comprueba('ningun empleado puede', cod in (400, 403, 404), f'devolvio {cod}')

# Al terminar de configurarlo, la marca se levanta SOLA (pb_hooks/almacen.pb.js).
cod, r = peticion('PATCH', f'/api/collections/productos/records/{al_vuelo["id"]}',
                  {'unidad': 'kg', 'stock_minimo': 3, 'proveedor': prov['id']},
                  token=tokens['admin'])
comprueba('el administrador SI mantiene el catalogo', cod == 200, f'devolvio {cod} {r}')
comprueba('y al completarlo se le quita sola la marca de «sin configurar»',
          r.get('sin_configurar') is False, f'sin_configurar={r.get("sin_configurar")!r}')

# Faltando uno de los tres, la marca se queda puesta.
cod, medias = peticion('POST', '/api/collections/productos/records',
                       {'nombre': 'Producto a medias', 'unidad': 'cajas', 'stock_minimo': 2},
                       token=tokens['admin'])
comprueba('un producto sin proveedor sigue marcado',
          cod == 200 and medias.get('sin_configurar') is True,
          f'devolvio {cod} sin_configurar={medias.get("sin_configurar")!r}')
if cod == 200:
    peticion('DELETE', f'/api/collections/productos/records/{medias["id"]}', token=raiz)

cod, r = peticion('POST', '/api/collections/proveedores/records',
                  {'nombre': 'Proveedor de un empleado', 'activo': True}, token=tokens['otro'])
comprueba('un empleado NO puede crear proveedores', cod in (400, 403), f'devolvio {cod}')
if cod == 200:
    peticion('DELETE', f'/api/collections/proveedores/records/{r["id"]}', token=raiz)

cod, r = peticion('DELETE', f'/api/collections/productos/records/{al_vuelo["id"]}',
                  token=tokens['empleado'])
comprueba('un empleado NO puede borrar un producto', cod in (400, 403, 404), f'devolvio {cod}')

# --- Los avisos de falta: los apunta todo el equipo ---------------------------
cod, aviso_otro = peticion('POST', '/api/collections/avisos_stock/records',
                             {'producto': prod['id'], 'nivel': 'agotado',
                              # Se manda a proposito una firma que no le toca:
                              # el servidor la ignora y pone la de la sesion.
                              'creado_por': emp['id'], 'resuelto': True},
                             token=tokens['otro'])
comprueba('un empleado SI puede apuntar una falta', cod == 200, f'devolvio {cod} {aviso_otro}')
comprueba('un aviso nace SIN resolver, diga lo que diga el navegador',
          aviso_otro.get('resuelto') is False, f'resuelto={aviso_otro.get("resuelto")!r}')
comprueba('no se puede firmar un aviso con el nombre de otro',
          aviso_otro.get('creado_por') in ('', None),
          f'creado_por={aviso_otro.get("creado_por")!r}')

cod, aviso_empleado = peticion('POST', '/api/collections/avisos_stock/records',
                               {'producto': prod['id'], 'nivel': 'queda_poco'},
                               token=tokens['empleado'])
comprueba('la firma la pone el servidor desde la sesion',
          cod == 200 and aviso_empleado.get('creado_por') == emp['id'],
          f'devolvio {cod} creado_por={aviso_empleado.get("creado_por")!r}')

# Resolver lo puede hacer cualquiera: si alguien repone la harina, la marca
# quien pasa por ahi.
cod, r = peticion('PATCH', f'/api/collections/avisos_stock/records/{aviso_otro["id"]}',
                  {'resuelto': True}, token=tokens['empleado'])
comprueba('cualquiera del equipo puede dar una falta por repuesta',
          cod == 200, f'devolvio {cod} {r}')
comprueba('y el servidor sella cuando se repuso',
          bool(r.get('resuelto_en')), f'resuelto_en={r.get("resuelto_en")!r}')

cod, r = peticion('PATCH', f'/api/collections/avisos_stock/records/{aviso_otro["id"]}',
                  {'resuelto': False}, token=tokens['empleado'])
comprueba('al reabrirla, la fecha se borra: no hereda una vieja',
          cod == 200 and not r.get('resuelto_en'), f'resuelto_en={r.get("resuelto_en")!r}')

for a in [aviso_otro, aviso_empleado]:
    if a.get('id'):
        peticion('DELETE', f'/api/collections/avisos_stock/records/{a["id"]}', token=raiz)
peticion('DELETE', f'/api/collections/productos/records/{al_vuelo["id"]}', token=raiz)

# ===========================================================================
seccion('9. Recuento: cuenta quien baja al almacen, cierra quien pide')
# ===========================================================================
# Contar lo hace cualquiera del equipo (baja al sotano quien baja). CERRAR es lo
# que congela la lista de pedido, y eso solo el administrador (lo anuncia la
# migracion 1756700700_almacen.js y lo comprueba pb_hooks/almacen.pb.js).

# Restos de una ejecucion anterior que se quedara a medias. Solo se borran los
# de la prueba: un recuento de verdad a medio hacer no se toca.
_, r = peticion('GET', '/api/collections/recuentos/records?filter=(estado="en_curso")', token=raiz)
for viejo in r.get('items', []):
    if MARCA_PRUEBA in (viejo.get('notas') or ''):
        peticion('DELETE', f'/api/collections/recuentos/records/{viejo["id"]}', token=raiz)

_, r = peticion('GET', '/api/collections/recuentos/records?filter=(estado="en_curso")', token=raiz)
hay_uno_de_verdad = bool(r.get('items'))

if hay_uno_de_verdad:
    print('  (saltada: hay un recuento de verdad en curso y no se toca)')
else:
    cod, rec = peticion('POST', '/api/collections/recuentos/records',
                        # Se manda a proposito lo que NO le toca decidir al
                        # navegador: el estado y la firma.
                        {'notas': MARCA_PRUEBA, 'estado': 'cerrado', 'hecho_por': emp['id']},
                        token=tokens['empleado'])
    comprueba('un empleado SI puede empezar un recuento', cod == 200, f'devolvio {cod} {rec}')
    comprueba('nace en curso, diga lo que diga el navegador',
              rec.get('estado') == 'en_curso', f'estado={rec.get("estado")!r}')
    comprueba('la firma la pone el servidor desde la sesion',
              rec.get('hecho_por') == emp['id'], f'hecho_por={rec.get("hecho_por")!r}')
    comprueba('y la fecha es la medianoche UTC del dia natural',
              str(rec.get('fecha', '')).endswith('00:00:00.000Z'), rec.get('fecha'))

    # D-13: solo puede haber uno abierto. Lo impide el indice unico; el hook lo
    # traduce a un mensaje que se entiende.
    cod, r = peticion('POST', '/api/collections/recuentos/records',
                      {'notas': MARCA_PRUEBA}, token=tokens['admin'])
    comprueba('no se puede abrir un segundo recuento a la vez', cod == 400, f'devolvio {cod}')

    # --- Las lineas: el servidor decide si entran en el pedido ---------------
    # El producto de prueba tiene minimo 2 y no tiene pedido habitual.
    cod, l_falta = peticion('POST', '/api/collections/recuento_lineas/records',
                            {'recuento': rec['id'], 'producto': prod['id'],
                             'cantidad': 0, 'contada': True}, token=tokens['empleado'])
    comprueba('un empleado SI puede contar una linea', cod == 200, f'devolvio {cod} {l_falta}')
    comprueba('contar CERO entra en la lista de pedido',
              l_falta.get('hay_que_pedir') is True, f'hay_que_pedir={l_falta.get("hay_que_pedir")!r}')
    comprueba('y sin pedido habitual sugiere lo justo para volver al minimo',
              l_falta.get('cantidad_pedir') == 2, f'cantidad_pedir={l_falta.get("cantidad_pedir")!r}')

    cod, r = peticion('PATCH', f'/api/collections/recuento_lineas/records/{l_falta["id"]}',
                      {'cantidad': 5, 'contada': True}, token=tokens['empleado'])
    comprueba('con existencias de sobra, la linea sale de la lista',
              r.get('hay_que_pedir') is False and r.get('cantidad_pedir') == 0,
              f'hay_que_pedir={r.get("hay_que_pedir")!r} cantidad_pedir={r.get("cantidad_pedir")!r}')

    # Pero quien esta delante de la estanteria manda sobre el minimo.
    cod, r = peticion('PATCH', f'/api/collections/recuento_lineas/records/{l_falta["id"]}',
                      {'hay_que_pedir': True, 'cantidad_pedir': 7}, token=tokens['empleado'])
    comprueba('lo que dice la peticion manda sobre el calculo',
              r.get('hay_que_pedir') is True and r.get('cantidad_pedir') == 7,
              f'devolvio {cod} {r.get("hay_que_pedir")!r}/{r.get("cantidad_pedir")!r}')

    # --- Cerrar --------------------------------------------------------------
    cod, r = peticion('PATCH', f'/api/collections/recuentos/records/{rec["id"]}',
                      {'estado': 'cerrado'}, token=tokens['empleado'])
    comprueba('un empleado NO puede cerrar el recuento', cod == 403, f'devolvio {cod} {r}')

    cod, r = peticion('PATCH', f'/api/collections/recuentos/records/{rec["id"]}',
                      {'estado': 'cerrado'}, token=tokens['admin'])
    comprueba('el administrador SI puede cerrarlo', cod == 200, f'devolvio {cod} {r}')
    comprueba('y el servidor sella cuando se cerro', bool(r.get('cerrado_en')),
              f'cerrado_en={r.get("cerrado_en")!r}')

    # --- Un recuento cerrado no se vuelve a contar ---------------------------
    cod, r = peticion('PATCH', f'/api/collections/recuento_lineas/records/{l_falta["id"]}',
                      {'cantidad': 99}, token=tokens['admin'])
    comprueba('lo CONTADO de un recuento cerrado ya no se cambia', cod == 403, f'devolvio {cod} {r}')

    # Pero la lista de pedido si se ajusta: es lo que se hace al llamar.
    cod, r = peticion('PATCH', f'/api/collections/recuento_lineas/records/{l_falta["id"]}',
                      {'cantidad_pedir': 4}, token=tokens['admin'])
    comprueba('la cantidad a pedir SI se ajusta con el recuento cerrado',
              cod == 200 and r.get('cantidad_pedir') == 4, f'devolvio {cod} {r.get("cantidad_pedir")!r}')

    # --- Reabrir -------------------------------------------------------------
    cod, r = peticion('PATCH', f'/api/collections/recuentos/records/{rec["id"]}',
                      {'estado': 'en_curso'}, token=tokens['otro'])
    comprueba('un empleado NO puede reabrir un recuento', cod == 403, f'devolvio {cod}')

    cod, r = peticion('PATCH', f'/api/collections/recuentos/records/{rec["id"]}',
                      {'estado': 'en_curso'}, token=tokens['admin'])
    comprueba('el administrador SI puede reabrirlo para corregir', cod == 200, f'devolvio {cod} {r}')
    comprueba('y al reabrirlo se borra la fecha de cierre', not r.get('cerrado_en'),
              f'cerrado_en={r.get("cerrado_en")!r}')

    cod, r = peticion('PATCH', f'/api/collections/recuento_lineas/records/{l_falta["id"]}',
                      {'cantidad': 1, 'contada': True}, token=tokens['admin'])
    comprueba('y ya se puede corregir lo contado', cod == 200, f'devolvio {cod} {r}')

    # Borrar el recuento arrastra sus lineas (cascadeDelete).
    peticion('DELETE', f'/api/collections/recuentos/records/{rec["id"]}', token=raiz)
    cod, r = peticion('GET', f'/api/collections/recuento_lineas/records/{l_falta["id"]}', token=raiz)
    comprueba('al borrar un recuento se van sus lineas', cod == 404, f'devolvio {cod}')

# ===========================================================================
seccion('10. Fichajes: quien ficha por quien, y quien corrige lo fichado')
# ===========================================================================
# Un registro de jornada solo vale si no se puede falsear. Lo que se comprueba
# aqui es lo que NO puede decir una regla de coleccion y por eso vive en
# pb_hooks/fichajes.pb.js: de quien es el fichaje, quien pone la hora, que no
# haya dos abiertos a la vez y que corregir deje rastro.
#
# ANTES DE NADA, otra vez: el rol se lee de la base en cada peticion, no del
# token. La seccion 6 ascendio la segunda cuenta de empleado y la 8 la devolvio;
# aqui se vuelve a asegurar, porque si llegara como administrador esta seccion
# daria por buenos permisos que no tiene.
peticion('PATCH', f'/api/collections/users/records/{ids["otro"]}',
         {'rol': 'empleado'}, token=raiz)

# Se limpia lo que hubiera quedado de una ejecucion anterior: la ficha "emp" es
# la misma de la seccion 4 y sus fichajes se arrastran con ella.
_, r = peticion('GET', f'/api/collections/fichajes/records?filter=(empleado="{emp["id"]}")&perPage=200',
                token=raiz)
for viejo in r.get('items', []):
    peticion('DELETE', f'/api/collections/fichajes/records/{viejo["id"]}', token=raiz)

# Una segunda ficha, sin cuenta de acceso: es "el companero" por el que nadie
# debe poder fichar.
_, r = peticion('GET', '/api/collections/empleados/records?filter=(alias="OT")', token=raiz)
if r.get('items'):
    otro = r['items'][0]
else:
    _, otro = peticion('POST', '/api/collections/empleados/records',
                       {'nombre': 'Prueba Compañero', 'alias': 'OT',
                        'color': '#A8672F', 'activo': True}, token=raiz)

# --- De quien es el fichaje lo dice la sesion --------------------------------
cod, mio = peticion('POST', '/api/collections/fichajes/records',
                    # Se manda a proposito lo que NO le toca decidir al
                    # navegador: la hora y la firma de correccion.
                    {'entrada': '2020-01-01 00:00:00.000Z', 'corregido_por': ids['admin']},
                    token=tokens['empleado'])
comprueba('un empleado SI puede fichar su entrada', cod == 200, f'devolvio {cod} {mio}')
comprueba('el fichaje sale a nombre de su ficha, no del que diga el navegador',
          mio.get('empleado') == emp['id'], f'empleado={mio.get("empleado")!r}')
comprueba('la hora de entrada la pone el servidor, no el reloj del movil',
          not str(mio.get('entrada', '')).startswith('2020'), f'entrada={mio.get("entrada")!r}')
comprueba('un fichaje nace sin firma de correccion',
          not mio.get('corregido_por'), f'corregido_por={mio.get("corregido_por")!r}')

cod, r = peticion('POST', '/api/collections/fichajes/records',
                  {'empleado': otro['id']}, token=tokens['empleado'])
comprueba('un empleado NO puede fichar por un companero', cod == 403,
          f'devolvio {cod} — FRAUDE DE FICHAJE')

cod, r = peticion('POST', '/api/collections/fichajes/records', {}, token=tokens['empleado'])
comprueba('no se ficha dos veces sin cerrar la anterior', cod == 400, f'devolvio {cod} {r}')

# --- Cerrar el turno propio no es corregir, pero la hora sigue siendo del
#     servidor --------------------------------------------------------------
cod, cerrado = peticion('PATCH', f'/api/collections/fichajes/records/{mio["id"]}',
                        {'salida': '2035-01-01 00:00:00.000Z'}, token=tokens['empleado'])
comprueba('cada cual cierra su propio turno', cod == 200, f'devolvio {cod} {cerrado}')
comprueba('y la hora de salida tambien la pone el servidor',
          not str(cerrado.get('salida', '')).startswith('2035'), f'salida={cerrado.get("salida")!r}')
comprueba('cerrar el turno no cuenta como correccion',
          not cerrado.get('corregido_por'), f'corregido_por={cerrado.get("corregido_por")!r}')

cod, r = peticion('PATCH', f'/api/collections/fichajes/records/{mio["id"]}',
                  {'entrada': '2026-09-01 06:00:00.000Z'}, token=tokens['empleado'])
comprueba('un empleado NO mueve una hora ya fichada', cod == 403, f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/fichajes/records/{mio["id"]}',
                  {'entrada': '2026-09-01 06:00:00.000Z', 'nota_correccion': 'Se dejo el movil'},
                  token=tokens['admin'])
comprueba('el administrador SI corrige las horas', cod == 200, f'devolvio {cod} {r}')
comprueba('y la correccion queda firmada con quien la hizo',
          r.get('corregido_por') == ids['admin'], f'corregido_por={r.get("corregido_por")!r}')

cod, r = peticion('PATCH', f'/api/collections/fichajes/records/{mio["id"]}',
                  {'salida': '2026-09-01 05:00:00.000Z'}, token=tokens['admin'])
comprueba('ni el administrador puede poner una salida anterior a la entrada',
          cod == 400, f'devolvio {cod}')

# --- El administrador SI ficha por otro: es como se arregla el olvido de ayer -
cod, ajeno = peticion('POST', '/api/collections/fichajes/records',
                      {'empleado': otro['id'], 'entrada': '2026-09-01 07:00:00.000Z'},
                      token=tokens['admin'])
comprueba('el administrador SI ficha por otro', cod == 200, f'devolvio {cod} {ajeno}')
comprueba('y a el si se le respeta la hora escrita',
          str(ajeno.get('entrada', '')).startswith('2026-09-01 07:00'), f'entrada={ajeno.get("entrada")!r}')

# --- El cuadrante -----------------------------------------------------------
cod, r = peticion('POST', '/api/collections/turnos/records',
                  {'empleado': emp['id'], 'fecha': '2026-09-01 00:00:00.000Z',
                   'hora_inicio': '19:00', 'hora_fin': '19:00'}, token=tokens['admin'])
comprueba('un turno de cero minutos no es un turno', cod == 400, f'devolvio {cod}')

cod, turno = peticion('POST', '/api/collections/turnos/records',
                      {'empleado': emp['id'], 'fecha': '2026-09-01 00:00:00.000Z',
                       'hora_inicio': '19:00', 'hora_fin': '02:30'}, token=tokens['admin'])
comprueba('el turno de noche SI vale: cruza la medianoche', cod == 200, f'devolvio {cod} {turno}')

cod, r = peticion('POST', '/api/collections/turnos/records',
                  {'empleado': emp['id'], 'fecha': '2026-09-01 00:00:00.000Z',
                   'hora_inicio': '12:00', 'hora_fin': '17:00'}, token=tokens['otro'])
# PocketBase contesta 400 «Failed to create record» cuando la regla de creacion
# no deja pasar, no 403; igual que con los platos en la seccion 5.
comprueba('un empleado NO pone turnos en el cuadrante', cod in (400, 403), f'devolvio {cod}')

cod, r = peticion('GET', '/api/collections/turnos/records?perPage=5', token=tokens['otro'])
comprueba('pero SI ve el cuadrante entero: para eso esta',
          cod == 200 and r.get('totalItems', 0) > 0, f'devolvio {cod} {r.get("totalItems")}')

if turno.get('id'):
    peticion('DELETE', f'/api/collections/turnos/records/{turno["id"]}', token=raiz)
for f in [mio.get('id'), ajeno.get('id')]:
    if f:
        peticion('DELETE', f'/api/collections/fichajes/records/{f}', token=raiz)
peticion('DELETE', f'/api/collections/empleados/records/{otro["id"]}', token=raiz)

# ===========================================================================
seccion('11. Contraseña y correo: solo el administrador los cambia, y por su ruta')
# ===========================================================================
# La ruta /api/quijote/cuenta existe porque la API de PocketBase no deja hacer
# estas dos cosas: la contrasena exige la anterior —y quien la ha perdido
# justamente no la sabe (D-29)— y el correo exige el circuito de confirmacion,
# que aqui no existe porque no hay correo saliente. Como el hook se las salta
# con permisos de servidor, quien puede llamarlo es LO UNICO que separa esto de
# un agujero (pb_hooks/cuentas.pb.js).
CLAVE_NUEVA = 'prueba-clave-nueva-2026'

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'clave': CLAVE_NUEVA})
comprueba('sin sesion no se cambia ninguna contraseña', cod == 403, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'clave': CLAVE_NUEVA}, token=tokens['empleado'])
comprueba('un empleado tampoco, ni la suya propia por esta puerta', cod == 403, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'clave': 'corta'}, token=tokens['admin'])
comprueba('una contraseña de menos de 8 caracteres se rechaza', cod == 400, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado']}, token=tokens['admin'])
comprueba('una peticion que no pide ningun cambio se rechaza', cod == 400, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['admin'], 'clave': CLAVE_NUEVA}, token=tokens['admin'])
comprueba('el administrador no se cambia asi la suya: eso pide la actual',
          cod == 400, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'clave': CLAVE_NUEVA}, token=tokens['admin'])
comprueba('el administrador SI restablece la de otra cuenta', cod == 200, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                  {'identity': 'prueba-empleado@ejemplo.invalid', 'password': CLAVE_NUEVA})
comprueba('y con la nueva se entra', cod == 200, f'devolvio {cod}')

cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                  {'identity': 'prueba-empleado@ejemplo.invalid', 'password': CLAVE})
comprueba('con la vieja ya no', cod == 400, f'devolvio {cod}')

# --- El correo: por PATCH no, por la ruta si --------------------------------
cod, r = peticion('PATCH', f'/api/collections/users/records/{ids["empleado"]}',
                  {'email': 'prueba-otro-correo@ejemplo.invalid'}, token=tokens['admin'])
comprueba('el correo NO se cambia con un PATCH, ni siendo administrador',
          cod == 400, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'correo': 'prueba-empleado2@ejemplo.invalid'},
                  token=tokens['admin'])
comprueba('por la ruta SI, y solo el administrador', cod == 200, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                  {'identity': 'prueba-empleado2@ejemplo.invalid', 'password': CLAVE_NUEVA})
comprueba('y con el correo nuevo se entra', cod == 200, f'devolvio {cod}')

cod, r = peticion('POST', '/api/quijote/cuenta',
                  {'usuario': ids['empleado'], 'correo': 'prueba-admin@ejemplo.invalid'},
                  token=tokens['admin'])
comprueba('un correo que ya tiene otra cuenta se rechaza', cod == 400, f'devolvio {cod} {r}')

# Se le devuelve su correo: la limpieza del final busca las cuentas de prueba
# por correo, y sin esto esta se quedaria en la base para siempre.
peticion('POST', '/api/quijote/cuenta',
         {'usuario': ids['empleado'], 'correo': 'prueba-empleado@ejemplo.invalid'},
         token=tokens['admin'])

# ===========================================================================
seccion('12. Cuentas y fichas: quien las crea, quien las borra y que arrastran')
# ===========================================================================
# Desde la fase 9 las cuentas se crean desde el panel, asi que hay que probar lo
# que pasa cuando se crean mal (pb_hooks/equipo.pb.js y las reglas de `users`).

# --- Crear ------------------------------------------------------------------
nueva = {'usuario': 'PruebaCRUD', 'nombre': 'Prueba CRUD', 'rol': 'empleado',
         'password': CLAVE, 'passwordConfirm': CLAVE, 'emailVisibility': True}

cod, r = peticion('POST', '/api/collections/users/records', nueva, token=tokens['empleado'])
comprueba('un empleado NO crea cuentas', cod in (400, 403), f'devolvio {cod}')

cod, r = peticion('POST', '/api/collections/users/records', nueva, token=tokens['otro'])
comprueba('ninguno', cod in (400, 403), f'devolvio {cod}')

cod, creada = peticion('POST', '/api/collections/users/records', nueva, token=tokens['admin'])
comprueba('el administrador SI crea una cuenta, y sin correo', cod == 200, f'devolvio {cod} {creada}')
comprueba('el nombre de usuario se guarda en minusculas',
          creada.get('usuario') == 'pruebacrud', f'usuario={creada.get("usuario")!r}')

cod, r = peticion('POST', '/api/collections/users/auth-with-password',
                  {'identity': 'pruebacrud', 'password': CLAVE})
comprueba('y se entra con el nombre de usuario, sin correo', cod == 200, f'devolvio {cod} {r}')

cod, r = peticion('POST', '/api/collections/users/records',
                  dict(nueva, usuario='pruebacrud'), token=tokens['admin'])
comprueba('dos cuentas no pueden tener el mismo nombre de usuario',
          cod in (400, 403), f'devolvio {cod}')

# --- Borrar -----------------------------------------------------------------
# (La ultima cuenta de administrador tampoco se puede borrar, pero eso no se
# prueba aqui: en esta base hay varias y la comprobacion no llegaria a saltar.)
cod, r = peticion('DELETE', f'/api/collections/users/records/{ids["admin"]}', token=tokens['admin'])
comprueba('nadie borra su propia cuenta', cod == 403, f'devolvio {cod}')

cod, r = peticion('DELETE', f'/api/collections/users/records/{creada["id"]}', token=tokens['empleado'])
comprueba('un empleado no borra cuentas', cod in (400, 403, 404), f'devolvio {cod}')

cod, r = peticion('DELETE', f'/api/collections/users/records/{creada["id"]}', token=tokens['admin'])
comprueba('el administrador SI borra una cuenta ajena', cod == 204, f'devolvio {cod}')

# --- La ficha del equipo: la baja la fecha el servidor -----------------------
# Y antes: un empleado no toca las fichas del equipo, ni la suya.
cod, r = peticion('PATCH', f'/api/collections/empleados/records/{emp["id"]}',
                  {'puesto': 'Jefe de todo'}, token=tokens['empleado'])
comprueba('un empleado NO edita las fichas del equipo', cod in (400, 403, 404), f'devolvio {cod}')

cod, r = peticion('PATCH', f'/api/collections/empleados/records/{emp["id"]}',
                  {'activo': False, 'fecha_baja': '2001-01-01 00:00:00.000Z'},
                  token=tokens['admin'])
comprueba('apagar «trabaja aqui» apunta la fecha de baja', cod == 200 and r.get('fecha_baja'),
          f'devolvio {cod} fecha_baja={r.get("fecha_baja")!r}')
comprueba('y la pone el servidor, no la que mande el navegador',
          not str(r.get('fecha_baja', '')).startswith('2001'), f'fecha_baja={r.get("fecha_baja")!r}')
comprueba('con la medianoche UTC del dia natural',
          str(r.get('fecha_baja', '')).endswith('00:00:00.000Z'), r.get('fecha_baja'))

cod, r = peticion('PATCH', f'/api/collections/empleados/records/{emp["id"]}',
                  {'activo': True}, token=tokens['admin'])
comprueba('al volver a encenderla, la fecha de baja se borra',
          cod == 200 and not r.get('fecha_baja'), f'devolvio {cod} {r.get("fecha_baja")!r}')

cod, r = peticion('PATCH', f'/api/collections/empleados/records/{emp["id"]}',
                  {'telefono': '600111222', 'fecha_baja': '2001-01-01 00:00:00.000Z'},
                  token=tokens['admin'])
comprueba('y no se puede colar una baja editando otra cosa',
          cod == 200 and not r.get('fecha_baja'), f'devolvio {cod} {r.get("fecha_baja")!r}')

# --- Una ficha con horas fichadas no se borra -------------------------------
_, fich_guardia = peticion('POST', '/api/collections/fichajes/records',
                           {'empleado': emp['id'], 'entrada': '2026-09-01 09:00:00.000Z',
                            'salida': '2026-09-01 17:00:00.000Z'}, token=raiz)

cod, r = peticion('DELETE', f'/api/collections/empleados/records/{emp["id"]}', token=tokens['admin'])
comprueba('una ficha con horas fichadas NO se borra ni siendo administrador',
          cod == 400, f'devolvio {cod} — SE LLEVARIA EL REGISTRO DE JORNADA')

peticion('DELETE', f'/api/collections/fichajes/records/{fich_guardia["id"]}', token=raiz)

# ===========================================================================
seccion('13. Actividad: el diario del panel')
# ===========================================================================
# Lo que se comprueba aqui es lo que hace fiable un audit log:
#
#   1. QUE NADIE PUEDA ESCRIBIRLO. Si un empleado puede fabricarse una linea,
#      el diario no prueba nada: diria lo que quiera quien lo toco.
#   2. QUE NADIE PUEDA BORRARLO NI CORREGIRLO, por lo mismo.
#   3. QUE SOLO LO LEA EL ADMINISTRADOR. Dice quien hizo que y cuando: es
#      informacion sobre las personas que trabajan aqui.
#   4. QUE EL ACTOR SALGA DE LA SESION y no del cuerpo de la peticion.
#   5. QUE NO GUARDE CONTRASENAS NI TELEFONOS DE CLIENTES.

# OJO: la seccion 11 le cambio la contrasena a la cuenta de empleado, y
# PocketBase rota `tokenKey` al cambiarla, asi que su token viejo ya no vale.
# Hay que volver a entrar antes de usarlo o el PATCH de abajo daria un 401 y la
# prueba estaria comprobando que no se apunta lo que ni siquiera ha pasado.
_, r = peticion('POST', '/api/collections/users/auth-with-password',
                {'identity': 'prueba-empleado@ejemplo.invalid', 'password': CLAVE_NUEVA})
tokens['empleado'] = r['token']

# Una accion trazable: un empleado le cambia el precio a un plato. Deja linea, y
# con el antes y el despues dentro.
cod, r = peticion('PATCH', f'/api/collections/platos/records/{plato_vis["id"]}',
                  {'precio_barra': 12.5}, token=tokens['empleado'])
comprueba('la accion que se va a rastrear ha ocurrido de verdad', cod == 200,
          f'devolvio {cod} {r}')

cod, r = peticion('GET', '/api/collections/actividad/records'
                  '?perPage=20&sort=-creado&filter=(recurso="plato")', token=tokens['admin'])
comprueba('el administrador SI lee la actividad', cod == 200, f'devolvio {cod} {r}')

mias = [f for f in r.get('items', [])
        if 'precio_barra' in (f.get('datos') or {}).get('cambios', {})]
comprueba('el cambio de precio queda apuntado', bool(mias),
          f'{r.get("totalItems")} lineas de plato, ninguna con precio')

if mias:
    linea = mias[0]
    comprueba('con el nombre de quien lo hizo, sacado de la sesion',
              linea.get('actor_nombre', '').startswith('Prueba'),
              f'actor_nombre={linea.get("actor_nombre")!r}')
    comprueba('y con el antes y el despues',
              'precio_barra' in (linea.get('datos') or {}).get('cambios', {}),
              f'datos={linea.get("datos")!r}')

# --- Nadie escribe, edita ni borra el diario --------------------------------
inventada = {'actor_nombre': 'Santi', 'accion': 'borrar', 'recurso': 'reserva',
             'descripcion': 'Santi borró algo que no borró'}

for quien, tok in [('sin sesion', None), ('un empleado', tokens['empleado']),
                   ('el administrador', tokens['admin'])]:
    cod, _ = peticion('POST', '/api/collections/actividad/records', inventada, token=tok)
    comprueba(f'{quien} NO puede fabricarse una linea de actividad',
              cod in (400, 403, 404), f'devolvio {cod} — EL DIARIO SERIA INVENTABLE')

if mias:
    cod, _ = peticion('PATCH', f'/api/collections/actividad/records/{mias[0]["id"]}',
                      {'descripcion': 'No fui yo'}, token=tokens['admin'])
    comprueba('ni el administrador puede corregir una linea', cod in (400, 403, 404),
              f'devolvio {cod}')

    cod, _ = peticion('DELETE', f'/api/collections/actividad/records/{mias[0]["id"]}',
                      token=tokens['admin'])
    comprueba('ni borrarla: para eso esta la retencion automatica',
              cod in (400, 403, 404), f'devolvio {cod}')

# --- Un empleado no lo lee ---------------------------------------------------
# Ojo con la semantica: una listRule no es un permiso, es un FILTRO, asi que la
# respuesta es un 200 con cero filas, no un 403. Lo que importa es que no sale
# ni un dato.
no_expone('actividad', token=tokens['empleado'])
no_expone('actividad')

# --- Ni contrasenas ni telefonos --------------------------------------------
# Se provoca lo peor de los dos casos: un cambio de contrasena y un cambio de
# telefono de una clienta, y se mira que no aparezcan por ningun lado.
peticion('POST', '/api/quijote/cuenta',
         {'usuario': ids['otro'], 'clave': 'prueba-clave-secreta-2026'}, token=tokens['admin'])

cod, todo = peticion('GET', '/api/collections/actividad/records?perPage=200&sort=-creado',
                     token=tokens['admin'])
crudo = json.dumps(todo, ensure_ascii=False)
for prohibido in ['prueba-clave-secreta-2026', CLAVE, CLAVE_NUEVA, 'password', 'tokenKey']:
    comprueba(f'el diario NO contiene «{prohibido[:24]}»', prohibido not in crudo,
              'APARECE UN DATO QUE NO SE PUEDE GUARDAR')

# --- El acceso fallido se apunta, y el correcto tambien ----------------------
peticion('POST', '/api/collections/users/auth-with-password',
         {'identity': 'prueba-empleado@ejemplo.invalid', 'password': 'no-es-esta'})

cod, r = peticion('GET', '/api/collections/actividad/records'
                  '?perPage=5&sort=-creado&filter=(accion="entrar_fallido")',
                  token=tokens['admin'])
comprueba('un acceso fallido con usuario conocido queda apuntado',
          cod == 200 and r.get('totalItems', 0) > 0, f'devolvio {cod} {r.get("totalItems")}')

cod, r = peticion('GET', '/api/collections/actividad/records'
                  '?perPage=5&sort=-creado&filter=(accion="entrar")', token=tokens['admin'])
comprueba('y un acceso correcto tambien',
          cod == 200 and r.get('totalItems', 0) > 0, f'devolvio {cod} {r.get("totalItems")}')

# --- La web publica NO entra al diario --------------------------------------
# Es la linea que separa un audit log del equipo de un registro de visitas. Una
# reserva hecha desde la calle no la ha hecho nadie de aqui.
_, antes_publicas = peticion('GET', '/api/collections/actividad/records?perPage=1',
                             token=tokens['admin'])
peticion('POST', '/api/quijote/metrica', {'tipo': 'escaneo', 'valor': 'es'})
_, despues_publicas = peticion('GET', '/api/collections/actividad/records?perPage=1',
                               token=tokens['admin'])
comprueba('lo que hace la web publica no deja linea en el diario',
          antes_publicas.get('totalItems') == despues_publicas.get('totalItems'),
          f'{antes_publicas.get("totalItems")} -> {despues_publicas.get("totalItems")}')

# --- La salida de sesion ----------------------------------------------------
cod, _ = peticion('POST', '/api/quijote/salir', {}, token=tokens['empleado'])
comprueba('el panel puede avisar de que alguien cierra la sesion', cod == 200, f'devolvio {cod}')

cod, r = peticion('GET', '/api/collections/actividad/records'
                  '?perPage=5&sort=-creado&filter=(accion="salir")', token=tokens['admin'])
comprueba('y queda apuntado', cod == 200 and r.get('totalItems', 0) > 0,
          f'devolvio {cod} {r.get("totalItems")}')

cod, _ = peticion('POST', '/api/quijote/salir', {})
comprueba('sin sesion, avisar de una salida no escribe nada', cod == 200, f'devolvio {cod}')

# ---------------------------------------------------------------------------
# Limpieza: la prueba no deja rastro en la base.
# ---------------------------------------------------------------------------
peticion('PATCH', f'/api/collections/ajustes/records/{AJ_ID}', copia_ajustes, token=raiz)

for pid in [plato_vis.get('id'), plato_oculto.get('id'), plato_sin_precio.get('id')]:
    if pid:
        peticion('DELETE', f'/api/collections/platos/records/{pid}', token=raiz)
peticion('DELETE', f'/api/collections/productos/records/{prod["id"]}', token=raiz)
peticion('DELETE', f'/api/collections/proveedores/records/{prov["id"]}', token=raiz)
peticion('DELETE', f'/api/collections/empleados/records/{emp["id"]}', token=raiz)
peticion('DELETE', f'/api/collections/categorias/records/{cat["id"]}', token=raiz)
if ev_oculto.get('id'):
    peticion('DELETE', f'/api/collections/eventos/records/{ev_oculto["id"]}', token=raiz)
# Las cuentas de prueba, por patron: la seccion 11 le cambia el correo a una y
# la 12 crea otra con nombre de usuario propio.
for filtro in ['(email~"prueba-")', '(usuario~"pruebacrud")']:
    _, r = peticion('GET', f'/api/collections/users/records?filter={filtro}&perPage=100', token=raiz)
    for u in r.get('items', []):
        peticion('DELETE', f'/api/collections/users/records/{u["id"]}', token=raiz)

print()
if fallos:
    print(f'\033[31m{len(fallos)} FALLOS\033[0m de {pasadas + len(fallos)} comprobaciones:')
    for f in fallos:
        print(f'  - {f}')
    sys.exit(1)
print(f'\033[32m{pasadas} comprobaciones, todas correctas.\033[0m')

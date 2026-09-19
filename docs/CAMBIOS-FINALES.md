# Cambios finales: carta, permisos y responsive

## Accesos públicos

La portada presenta «Ver comida» a la izquierda y «Ver bebidas» a la derecha,
con igual ancho, separación, foco visible y «Reservar mesa» debajo. En menos
de 320 px se apilan. Se mantienen colores y tipografías.

Se emplean `/carta#comida` y `/carta#bebidas`. La primera categoría visible de
cada grupo recibe el ID correspondiente. Tras pintar la carta (también después
de recibir datos o recuperar la copia local) se desplaza hasta esa categoría,
con margen para la cabecera. Se limpian los filtros anteriores al abrir el
acceso directo. Los enlaces, las URL directas, el cambio de hash y el historial
usan el mismo mecanismo. Las categorías y su orden no cambian.

`compartido/js/secciones-carta.js` identifica las seis categorías actuales de
bebidas por su nombre español normalizado. El resto son comida. Si se crea o
renombra una categoría de bebidas hay que actualizar esta lista; no se ha
introducido un campo ni un editor de categorías nuevo.

## Permisos

Se conservan los roles `admin` y `empleado`. `panel/js/permisos.js` centraliza
la lista cerrada de rutas permitidas al empleado; todas las vistas pasan por
el guardián de `app.js`. `gestionaCarta()` exige administrador y controla las
acciones del listado. Los empleados no entran al editor, tampoco por URL.

«Cuenta» solo proporciona la sesión y su cierre. Los proveedores se consultan
como parte del almacén, respetando las restricciones existentes del catálogo.
No se amplían permisos de almacén, reservas o fichaje.

La migración `1757300000_permisos_empleado.js` utiliza reglas de PocketBase
basadas en `@request.auth` (usuario autenticado por el servidor):

| Endpoint de colección `/api/collections/{colección}/records[/{id}]` | Restricción |
| --- | --- |
| `platos`, `categorias` | POST, PATCH y DELETE solo administrador; lectura conservada |
| `turnos`, `metricas` | GET solo administrador |
| `empleados` | Empleado lee únicamente su ficha; administración solo admin |
| `eventos` | Ocultos solo admin; eventos públicos siguen accesibles |

Se conservan las protecciones de `users`, `ajustes`, `actividad`, `proveedores`,
`productos`, `reservas`, `fichajes`, `recuentos`, `recuento_lineas` y
`avisos_stock`. También las comprobaciones de `/api/quijote/cuenta`,
`/api/quijote/estadisticas` y `/api/quijote/aviso-cuadrante`.

PocketBase responde a operaciones prohibidas con 400/403/404 según la operación;
las reglas de listado filtran registros y pueden devolver 200 con lista vacía.
Se prueba la denegación y la ausencia de datos, no solo un código HTTP concreto.
Los superusuarios mantienen su acceso de mantenimiento.

## Responsive

Portada centrada con máximo de 1280 px desde 900 px, cabecera y acciones en dos
columnas, información y celebraciones aprovechando el ancho horizontal. Se
reducen espacios verticales y se mantienen los separadores. La carta pública,
los formularios públicos y los diálogos conservan anchuras cómodas de lectura.

Panel de hasta 1280 px desde 1000 px, márgenes de 32 px y navegación horizontal
compacta. Formularios limitados a 960 px, acceso a 640 px y hojas a 720 px.
Se refuerza la flexibilidad de títulos y campos para evitar desbordamientos.

## Archivos

- `web/js/vistas/portada.js`, `web/js/vistas/carta.js`, `web/js/enrutador.js`,
  `web/js/idioma.js`, `web/css/web.css`.
- `compartido/js/secciones-carta.js` (nuevo).
- `panel/js/permisos.js` (nuevo), `panel/js/app.js`, `panel/js/sesion.js`,
  `panel/js/piezas/nav.js`, `panel/sw.js`, `panel/css/panel.css`.
- `panel/js/vistas/carta.js`, `almacen.js`, `proveedores.js`, `fichajes.js`,
  `mas.js`, `cuentas.js`.
- `pb_migrations/1757300000_permisos_empleado.js` (nueva),
  `pb_hooks/roles.pb.js` (comentarios actualizados).
- `pruebas/reglas_acceso.py`, `pruebas/unitarias/permisos.test.js` (nuevo).
- `docs/README.md`, este informe.

## Verificación

- `docker compose build`: correcto, imágenes PocketBase y copias.
- Unitarias: 284/284.
- Integración API/permisos: 202/202, incluida creación, edición y borrado de
  platos/categorías como admin y denegación como empleado.
- Integración reservas: 65/65.
- No hay comando lint ni compilación de frontend: son módulos estáticos sin
  package.json. Se valida sintaxis con `node --check` y `git diff --check`.
- Chromium/Playwright sobre Caddy y PocketBase aislados: enlaces y URL directas,
  login/logout real, menú por rol, rutas prohibidas, consola y desbordamientos.
  Web: 320, 390, 1366×768, 1440×900, 1920×1080 y 2560×1440.
  Panel: 390, 1280, 1366, 1440 y 1920 px, con ambos roles.
- Datos de prueba independientes de producción. Los precios ficticios usados
  para visualizar la carta solo se escriben en esa base de pruebas.

La migración se aplica al arrancar PocketBase; no es necesario reconstruir el
frontend. La versión del service worker pasa a v3 para renovar su caché.

Comprobación final del servicio activo: la migración figura en `_migrations` y
las reglas de `platos`, `categorias`, `empleados`, `turnos`, `eventos` y
`metricas` coinciden con las nuevas restricciones. No se observaron errores
internos en los logs recientes del backend activo ni del backend de pruebas.

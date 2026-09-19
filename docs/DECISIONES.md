# Decisiones técnicas

Cada decisión que se ha tomado sin preguntar, y por qué. Sección 14 del encargo.
Las que afectan al presupuesto, al aspecto o a algo legal **no** están aquí:
esas se preguntan antes (sección 15).

Al final del documento hay un apartado de **propuestas**: ideas que se han
descartado a propósito porque no están en el encargo, anotadas para no perderlas.

---

## Fase 1 — esqueleto

### D-01 · PocketBase se construye desde el binario oficial

**Decisión:** imagen propia (`deploy/pocketbase.Dockerfile`) que descarga el
binario del repositorio oficial de PocketBase, en vez de usar una imagen de
Docker Hub.

**Por qué:** no existe imagen oficial de PocketBase y las de la comunidad no se
auditan. Un bar no tiene a quién llamar si una imagen de terceros cambia de
manos. Así sabemos exactamente qué se ejecuta y la versión queda fijada en un
único sitio (`PB_VERSION`, hoy `0.40.1`).

**Coste:** hay que actualizar la versión a mano. Es un `docker compose build`.

---

### D-02 · El Caddy del proyecto no termina TLS en este servidor

**Decisión:** hay **dos** configuraciones de Caddy.

| Fichero | Cuándo se usa |
|---|---|
| `deploy/Caddyfile` | Servidor actual. Escucha en el 8080 de la red interna, sin puertos publicados. El proxy central le entrega el tráfico ya descifrado. |
| `deploy/standalone/Caddyfile` + `deploy/standalone/compose.yml` | Servidor limpio. Es literalmente lo que pide la sección 4: puertos 80/443, TLS automático y `www` redirigiendo a la raíz. |

**Por qué:** el servidor donde se ha montado esto ya tiene un Caddy central
(`~/stacks/webs/_proxy`) ocupando los puertos 80 y 443 y sirviendo una docena de
dominios (importacionleon.com, nndrei.dev y demás). Un segundo Caddy reclamando
esos puertos no arranca, y tumbaría todos los demás sitios.

**Consecuencia:** para publicar `barrinconquijote.es` hay que añadir un bloque al
Caddyfile del proxy central. Está preparado en `deploy/vhost-proxy-central.txt`
y **todavía no se ha aplicado**: toca un fichero compartido con otros sitios en
producción y eso se aprueba antes.

**Pendiente además:** `barrinconquijote.es` no resuelve todavía a ninguna IP. Hay
que apuntar los registros A/AAAA en OVH antes de que Let's Encrypt pueda emitir
el certificado.

---

### D-03 · Las tipografías se recortan a castellano e inglés

**Decisión:** los `.woff2` de Google se recortan con `pyftsubset` a Latin básico +
Latin-1 + puntuación tipográfica + €. Script: `scripts/subset-fuentes.sh`.

**Por qué:** la sección 4 prohíbe CDNs y la 6 pone un techo de **150 KB** en la
primera carga. Los ficheros de Google traen cirílico, griego y vietnamita: 730 KB
para un bar de Madrid. Recortados quedan en **150 KB el sistema tipográfico
entero**, y una pantalla concreta carga solo las variantes que usa (la portada,
unos 86 KB).

**Comprobado:** el texto recortado mide exactamente lo mismo que el de Google
(492 px y 296 px en la prueba de referencia) y se ve idéntico. El kerning no se
ha perdido.

**Coste:** si algún día hay carta en otro idioma con alfabeto distinto, hay que
ampliar el repertorio en el script y regenerar.

---

### D-04 · Cormorant Garamond se declara con rango de peso, no con pesos sueltos

**Decisión:** un único fichero por estilo (`cormorant-garamond.woff2` y
`cormorant-garamond-italica.woff2`) declarado con `font-weight: 300 700`.

**Por qué:** Cormorant Garamond es una **fuente variable** con eje de peso
300-700. Google sirve el mismo fichero para todos los pesos y deja que el
navegador interpole. Copiar la maqueta declarando `font-weight: 500` y
`font-weight: 600` por separado, apuntando al mismo fichero, haría que el
navegador se quedara en el peso por defecto (300) y las cifras grandes y el
nombre del bar saldrían más finos que en la maqueta.

**Efecto secundario bueno:** dos ficheros en vez de cinco, sin perder ni un peso.

---

### D-05 · Las copias de seguridad usan `VACUUM INTO`, no `cp`

**Decisión:** la copia diaria genera la base con
`sqlite3 "file:...?mode=ro" "VACUUM INTO ..."` en vez de copiar el fichero.

**Por qué:** PocketBase escribe en modo WAL. Copiar el `.db` mientras hay
escrituras puede dar un fichero roto justo el día que haga falta restaurarlo.
`VACUUM INTO` produce un fichero consistente sin parar el servicio.

**Comprobado:** se restaura una copia real, `PRAGMA integrity_check` responde
`ok` y los ajustes se leen enteros.

---

### D-06 · El contenedor de copias corre como usuario normal

**Decisión:** imagen propia (`deploy/backup.Dockerfile`) con `sqlite` ya dentro,
ejecutada con `user: "1000:1000"`.

**Por qué:** instalar sqlite en cada arranque con `apk add` exige ser root, y
entonces los `.tar.gz` aparecen en `./backups/` con propietario root: no se
pueden consultar ni borrar sin permisos de administrador. Con sqlite dentro de la
imagen, además, la copia sigue funcionando aunque el servidor se quede sin
internet.

---

### D-07 · Los aforos arrancan a cero y las reservas, desactivadas

**Decisión:** en la colección `ajustes`, `aforo_terraza` y `aforo_salon` valen 0
y `reservas_activas` es `false` al instalar.

**Por qué:** la sección 15 dice que nada de datos inventados en producción. Un
aforo inventado aceptaría reservas para mesas que no existen. A cero y con las
reservas cerradas, la web enseña el teléfono hasta que Santi ponga los números
reales.

**Detalle técnico:** esos dos campos no llevan `required`, porque PocketBase
considera vacío el número 0 y la migración fallaba al instalar.

---

---

## Fase 2 — modelo de datos

### D-08 · Las horas van como texto, no como fecha-hora

**Decisión:** `reservas.hora`, `turnos.hora_inicio`, `turnos.hora_fin` y
`eventos.hora` son texto `HH:MM` con patrón de validación. Los fichajes
(`entrada`, `salida`) y `recuentos.cerrado_en` sí son fecha-hora.

**Por qué:** una reserva es «a las 21:00 del día 24», no un instante en la línea
del tiempo. Guardarla como fecha-hora obliga a arrastrar zona horaria por todo
el código y falla el último domingo de octubre, cuando hay dos veces las 02:30.
Un fichaje, en cambio, sí es un instante real y ahí la fecha-hora es lo correcto.

---

### D-09 · Los días del calendario se guardan como medianoche UTC

**Decisión:** los campos de fecha sin hora (`reservas.fecha`, `turnos.fecha`,
`recuentos.fecha`, `eventos.fecha_inicio`) se guardan como **medianoche UTC del
día del calendario**, nunca como medianoche local convertida.

**Por qué:** Madrid es UTC+2 en verano. La medianoche local pasada por
`toISOString()` sale como las 22:00 del día **anterior**, y entonces todo se corre
un día. Se detectó porque el recuento del domingo aparecía hecho el sábado.

**Dónde importa:** cualquier sitio que construya una fecha para guardar. En
`seed/demo.js` está la función `pbDia()` con el convenio; el resto del código
debe usar el mismo criterio.

---

### D-10 · Una regla de lista de PocketBase es un filtro, no un permiso

**No es una decisión, es un hecho del que depende cómo se leen las pruebas**, y
conviene tenerlo escrito porque despista.

Con `listRule = '@request.auth.id != ""'`, una petición sin sesión **no recibe un
403**: recibe un **200 con cero registros**, porque la condición excluye todas las
filas. El acceso directo por ID (`viewRule`) sí responde 404.

Es seguro —no se filtra ni un dato, y además no confirma si la colección tiene
contenido—, pero significa que una prueba que espere un 403 falla sin que haya
nada roto. Por eso `pruebas/reglas_acceso.py` comprueba **que no vuelve ni una
fila**, no el código de estado.

---

### D-11 · Los roles se escriben sin eñe

**Decisión:** el valor almacenado es `dueno`, no `dueño`. En pantalla se muestra
«dueño».

**Por qué:** el valor va dentro de reglas de acceso que se comparan como texto y
viaja en URLs de la API. Una eñe ahí es una fuente de fallos tontos de
codificación que no aporta nada.

---

### D-12 · Los importadores son subcomandos de PocketBase

**Decisión:** `pocketbase importar-carta` y `pocketbase importar-productos`,
registrados desde `pb_hooks/importar.pb.js`.

**Por qué:** no hay Node en el servidor, así que un script aparte necesitaría otro
tiempo de ejecución. Como subcomando, el importador usa **las mismas validaciones
que la API**: si un precio está mal, falla igual que fallaría por el panel.

**Los dos son idempotentes:** identifican por nombre, así que reimportar el mismo
fichero actualiza en vez de duplicar. Se puede corregir un precio en el CSV y
volver a lanzarlo.

---

### D-13 · Solo puede haber un recuento en curso

**Decisión:** índice único parcial
`CREATE UNIQUE INDEX ... ON recuentos (estado) WHERE estado = "en_curso"`.

**Por qué:** la sección 9.2 exige que «Empezar recuento» continúe el que ya está
abierto y que **nunca se pierda lo tecleado**. Si eso se deja solo en el cliente,
dos móviles en el sótano abren dos recuentos y se pierde uno. El índice lo impide
en la base.

En la misma línea, `recuento_lineas` tiene índice único por `(recuento,
producto)`: es lo que hace segura la cola de sincronización sin conexión. Si una
línea se envía dos veces al recuperar la red, la segunda choca contra el índice
en vez de duplicar la fila.

---

### D-14 · Las métricas no se pueden escribir por la API

**Decisión:** `metricas` tiene `createRule`, `updateRule` y `deleteRule` a `null`.
Ni el público ni el panel pueden escribir ahí.

**Por qué:** la sección 13 exige agregación **por día en el servidor**, sin
cookies, sin identificador y sin IP. Si la colección aceptara escrituras
directas, cualquiera podría inflar el contador, y sobre todo sería fácil acabar
metiendo una fila por evento —que es justo lo que no se quiere—. Las filas las
creará y sumará un hook por una ruta propia que solo acepta el tipo y el valor.

El índice único `(dia, tipo, valor)` es lo que convierte la colección en un
contador: la segunda visita del día suma 1 en la fila que ya existe.

---

### D-15 · La cadena vacía de `@request.auth.id` (agujero encontrado y cerrado)

**Esto no es una decisión de estilo: era un fallo de seguridad real, lo encontró
la prueba, y conviene que quede escrito para no repetirlo.**

La regla original de `fichajes` era:

```
@request.auth.rol = "dueno" || @request.auth.rol = "encargado"
|| empleado.usuario = @request.auth.id
```

En una petición **sin autenticar**, `@request.auth.id` vale **cadena vacía**. Y un
empleado que todavía no tiene cuenta de acceso ligada tiene `usuario` **también
vacío**. La tercera condición se convertía en `"" = ""`, que es **cierto**.

Resultado: **los fichajes de toda persona sin cuenta eran públicos**. En un bar de
tres o cuatro empleados, donde lo normal es no tener cuenta de panel, eso era
prácticamente la plantilla entera — y son datos de jornada laboral, que la
sección 12 restringe expresamente a `dueño`, `encargado` y el propio empleado.

**La corrección** (`pb_migrations/1756700900_fichajes_regla.js`) es exigir sesión
antes de evaluar nada más:

```
@request.auth.id != "" && (
  @request.auth.rol = "dueno" || @request.auth.rol = "encargado"
  || empleado.usuario = @request.auth.id
)
```

**La regla general:** en cuanto una regla compare un campo contra
`@request.auth.id`, hay que anteponer `@request.auth.id != ""`. Se auditaron las
15 colecciones y `fichajes` era la única afectada (en `users` la comparación es
contra `id`, que nunca está vacío).

`pruebas/reglas_acceso.py` vigila ahora este caso concreto, con un empleado *sin*
cuenta ligada: la prueba anterior no lo habría detectado, porque su empleado sí
tenía cuenta.

---

## Fase 3 — web pública

### D-16 · La carta pública no usa el SDK de PocketBase

**Decisión:** `web/js/api.js` hace tres `fetch` a pelo. El SDK se reserva para
`panel/`.

**Por qué:** la carta pública solo necesita tres GET sin autenticar. El SDK son
unos 35 KB para eso, y el presupuesto de primera carga es de 150 KB **con las
tipografías dentro**. En el panel sí se usará: allí aporta sesión, tiempo real
para el interruptor de disponibilidad y subida de ficheros, que sí compensan.

---

### D-17 · `--apagado` se ha oscurecido respecto a la maqueta

**Decisión:** `#7E6F63` → `#786A5E`.

**Por qué:** el valor de la maqueta da **4,38:1** sobre crema, por debajo del
mínimo de 4,5:1 que exige WCAG AA para texto normal. Y no es un color
decorativo: es el de las **descripciones de plato** y el de la cabecera
`Barra / Terraza`, o sea lo que más se lee de la carta, a menudo en una terraza
con sol. El nuevo da **4,73:1** sobre crema y **5,22:1** sobre blanco.

Se ha elegido manteniendo el tono y la saturación exactos del original y bajando
solo la luminosidad: es el gris cálido **más claro** que cumple sobre los dos
fondos. A simple vista no se distingue del de la maqueta.

**Es un cambio sobre el diseño aprobado**, así que queda anotado aquí para que el
cliente lo sepa. Los dos pares que el encargo señala como críticos (granate sobre
crema, blanco sobre granate) ya cumplían de sobra: 7,67:1 y 11,80:1.

---

### D-18 · La web abre siempre en castellano

**Decisión:** sin preferencia guardada, castellano. **No** se mira el idioma del
navegador.

**Por qué:** el QR está en las mesas de un bar de barrio de Madrid. Y sobre todo:
la traducción de la carta es opcional plato a plato, así que un móvil configurado
en inglés vería la interfaz en inglés pero los platos sin traducir en castellano
—media pantalla en cada idioma, que es peor que una entera en castellano—. El
encargo pide conmutador y preferencia en `localStorage`, no detección automática.

---

### D-19 · La barra «Reservar mesa» es fija, no pegada al final

**Decisión:** `position: fixed` al hueco visible.

**Por qué:** la maqueta la dibuja al fondo de una pantalla de 844 px, pero la
carta real mide varios metros. Pegada al final del documento habría que
recorrerla entera para reservar. Fija, «Reservar mesa» está siempre a un pulgar
de distancia, que es lo que la maqueta quería decir.

---

### D-20 · El presupuesto de 150 KB queda muy justo

**No es una decisión: es un aviso.** La portada carga hoy **152,4 KB** contra un
techo de 153,6 KB. Margen: **1,2 KB**.

El reparto: **95,8 KB de tipografías** (6 ficheros), 24,4 KB de CSS, 22,0 KB de
JavaScript, 8,9 KB de datos de la carta y 1,2 KB de HTML. Cero peticiones a
dominios externos.

Las tipografías son el 63 % y no hay más grasa que quitar sin tocar el diseño: son
las tres familias de la maqueta en los pesos que la maqueta usa, ya recortadas a
castellano e inglés (D-03) y sin precargas de más.

**Si en algún momento hace falta sitio**, la palanca más barata es fundir
**Alegreya Sans 800 en 700**: ahorra 12 KB de golpe y a 16,5 px, que es el tamaño
del botón donde se usa, la diferencia es casi imperceptible. **No se ha hecho
porque cambia el diseño aprobado**; queda como opción para el cliente.

Atenuante: con `font-display: swap` el texto se pinta antes de que lleguen las
tipografías, así que la carta se lee aunque la descarga vaya lenta.

---

## Fase 4 — reservas

### D-21 · Dos huecos del modelo que salieron al construir las reservas

**El horario de cocina admite ahora varios tramos.** El campo aceptaba uno solo
(`13:00-23:30`), pero este bar tiene **dos servicios**: la propia maqueta de la
portada dice «Cocina de 12:30 a 16:30 y de 20:00 a 23:30», y la pantalla de
reserva dibuja la rejilla partida en comida y cena. Con un tramo único se
ofrecían franjas a las 18:00, con la cocina cerrada. Ahora se escriben separados
por coma: `12:30-16:30,20:00-23:30`. Un tramo suelto sigue valiendo.

**Se ha añadido `aforo_barra`.** El encargo pide «aforo por zona» y la reserva
ofrece cuatro zonas, pero `ajustes` solo traía `aforo_terraza` y `aforo_salon`.
Sin el de barra esa zona no se podía limitar.

**Una zona con aforo 0 no se ofrece**, en vez de mostrarse siempre llena.
Enseñar «Barra» tachada a todas horas le diría al cliente algo falso. Los tres
aforos arrancan a 0, así que hasta que Santi no los ponga la web enseña el
teléfono.

**Cómo se reparte el aforo entre zonas**, que el encargo no concreta:

- Una franja está libre para la zona Z si caben **las dos** cosas: en el bar
  entero (suma de los tres aforos) **y** en Z.
- Una reserva con zona «me da igual» **no** ocupa ninguna zona concreta —todavía
  no se sabe dónde se sentará— pero **sí** cuenta en el total. Eso es lo que
  evita aceptar más gente de la que cabe en el bar.
- Solo ocupan mesa los estados vivos: `pendiente`, `confirmada` y `sentada`. Una
  cancelada o un «no vino» liberan la franja.

---

### D-22 · Los hooks de PocketBase corren en runtimes aislados

**Otra trampa que costó una tarde y conviene tener escrita.**

Cada handler de hook se ejecuta en un **runtime de JavaScript aislado**, sacado
de un grupo. Lo que se declare en el nivel superior del fichero —constantes,
funciones auxiliares, un `Map` con estado— **no llega al cuerpo del handler**:
salta `ReferenceError: X is not defined` en cuanto entra la primera petición.

Por eso:

- La lógica compartida vive en `pb_hooks/lib/reglas-reserva.js` y se carga con
  `require()` **dentro** de cada handler.
- El estado que debe sobrevivir entre peticiones (el contador del antibot) va en
  `$app.store()`, que sí es común a todos los runtimes.

Como efecto secundario bueno: toda la lógica de aforo, franjas, teléfono y
códigos quedó en un módulo puro, sin PocketBase por medio, y por eso se puede
probar suelta. Son las 44 pruebas de `pruebas/unitarias/`.

---

### D-23 · La confirmación NO dice que se ha mandado un SMS

**Decisión:** se cambia el texto de la maqueta.

La pantalla de confirmación de `design/rincon-cliente.html` dice *«Te hemos
mandado un SMS con estos datos»*. **En la v1 no hay SMS**: la sección 10 deja el
módulo de avisos detrás de una interfaz, con una implementación por registro, y
las de SMS y WhatsApp preparadas pero sin activar.

Prometer un SMS que no llega deja al cliente esperando un mensaje que no existe,
y encima le hace pensar que tiene el resguardo cuando no lo tiene. En su lugar se
dice: **«Guarda el código: es lo que te pedimos en la puerta»**, que es verdad y
además es la instrucción útil.

Cuando se active el envío de SMS (sección 10), se recupera el texto de la
maqueta.

---

### D-24 · La reserva solo se puede leer una vez

**Decisión:** la pantalla de confirmación pinta desde una copia guardada en el
móvil, no pidiéndole la reserva al servidor.

**Por qué:** una reserva lleva nombre y teléfono de una persona, y la regla de
acceso impide leerla sin sesión —incluso conociendo su ID—. Es correcto y no se
toca. La reserva llega entera **una sola vez**, en la respuesta a la creación, y
de ahí se guarda en `localStorage` para la confirmación y para poder cancelarla.

**Consecuencia asumida:** abrir el enlace de la reserva desde **otro** móvil no
enseña los datos, sino el teléfono del bar. Es lo correcto: la alternativa sería
que cualquiera con el código pudiera ver el nombre y el teléfono de quien
reservó.

**La cancelación** necesita el código **y** el token: con el código suelto —que
se ve en pantalla y se dice en voz alta en la puerta— cualquiera podría cancelar
mesas ajenas. Un código que no existe y un token equivocado devuelven **el mismo
error**, para no confirmar si un código es real.

---

### D-25 · El freno antibot se cuenta por IP, y una IP no es una persona

**Decisión:** 12 reservas por hora y por IP, ajustable con la variable de entorno
`QUIJOTE_MAX_RESERVAS_IP`.

**Por qué el número es holgado y configurable:** el primer valor que puse fue 6, y
al ejecutar las pruebas se vio el problema de verdad: **el límite se cuenta por
IP, y en una oficina, un hotel o un wifi público hay decenas de personas detrás
de la misma**. Seis reservas por hora tumbaría a un grupo legítimo. Un robot, en
cambio, hace cientos, así que 12 lo para igual.

El contador vive en `$app.store()`: **en memoria, nunca en disco**. La IP no se
guarda en ningún momento (sección 13). Sin CAPTCHA (sección 6).

El **honeypot** es un campo invisible que una persona nunca rellena. Si viene con
algo, se rechaza — y el mensaje de error **no dice cuál era el campo trampa**,
para no enseñarle al robot dónde ha fallado.

---

### D-26 · «La mesa se guarda 15 minutos» es un texto, no una regla

El sistema **no cancela ni una reserva por su cuenta** (sección 8). El texto sale
en el formulario y en el `.ics`; lo que se haga con la mesa a los 15 minutos lo
decide quien está en la puerta, no el software.

---

## Fase 5 — panel: acceso, roles, hoy y reservas

### D-27 · El panel avisa; no prohíbe

**Decisión:** las reservas que entran **por el panel** (con sesión) se saltan las
reglas del formulario público: horario de cocina, media hora de antelación
mínima, antelación máxima de 30 días, máximo de 10 comensales y aforo. Se sigue
comprobando lo que es un **dato** y no un criterio: que haya nombre y que el
teléfono sea un teléfono español.

**Por qué:** esas cinco reglas existen para que un desconocido no reserve a las
cuatro de la mañana, para dentro de cinco minutos o para dentro de dos años. Al
teléfono manda quien coge el teléfono, que está mirando las mesas de verdad.
Tres casos reales que el sistema anterior habría rechazado:

| Situación | Qué decía la regla |
|---|---|
| «Vamos ahora, en veinte minutos» | *Necesitamos 30 minutos de antelación* |
| «Para Nochebuena, el menú cerrado» | *Máximo 30 días de antelación* |
| Una merienda a las 18:00 | *A esa hora la cocina está cerrada* |

Un programa que le dice que no a Santi mientras tiene al cliente al teléfono es
un programa que se deja de usar y se vuelve a la libreta.

**Lo que sí se hace:** avisar antes de guardar. El formulario del panel pide las
franjas a la misma ruta `/api/quijote/disponibilidad` que usa la web y marca las
que no tienen sitio («21:00 — completa», «13:00 — ya pasada»), con un aviso en
amarillo bajo el desplegable. Cuando se guarda por encima del aforo queda un
`warn` en el registro del servidor. La decisión es de la persona; el sistema
pone el dato delante.

**Consecuencia en la ruta de disponibilidad:** con sesión responde también con
las reservas de la web apagadas. El interruptor de `reservas_activas` cierra el
formulario del cliente, no la libreta del bar.

---

### D-28 · `dom.js` está duplicado a propósito

**Decisión:** `panel/js/dom.js` es una copia de las dos funciones de
`web/js/dom.js` (`el` y `pintar`), no un fichero compartido en `compartido/`.

**Por qué:** `compartido/` se sirve con `Cache-Control: public, max-age=2592000`
(30 días) y con nombres de fichero fijos. Eso está bien para las tipografías,
que no cambian nunca, y es una trampa para el código: un arreglo tardaría un mes
en llegar a los móviles que ya lo tuvieran en caché. Cambiar la política de
caché de todo `compartido/` para poder compartir treinta líneas sale peor.

**Coste:** hay dos copias que mantener iguales. Se acepta porque son treinta
líneas sin lógica de negocio y porque el fichero del panel no lleva la función
`logo()`, que allí no hace falta.

**Cambio que sí se ha hecho en las dos:** `el()` ahora aplana los hijos con
`.flat(Infinity)`. Sin eso, pasarle una lista dentro de otra lista —lo que
devuelve una vista que pinta varios nodos— acababa en el DOM como el texto
`[object HTMLDivElement]`. Es un endurecimiento del ayudante, no un cambio de
comportamiento: ninguna vista podía apoyarse en lo anterior porque lo anterior
estaba roto.

---

### D-29 · No hay recuperación de contraseña por correo

**Decisión:** el enlace «He olvidado la contraseña» abre una explicación de qué
hacer —pedírselo a Santi— en vez de enviar un correo de recuperación.

**Por qué:** el proyecto no tiene servidor de correo (no hay SMTP en el
`docker-compose.yml`, y montarlo no está en el encargo). Un botón que dice «te
hemos enviado un correo» cuando no se ha enviado nada es peor que no tener el
botón: la persona se queda esperando delante del buzón. Es el mismo criterio de
la fase 4 con el SMS de la confirmación (D-23): no se promete lo que no se hace.

**Cuando exista Personal (fase 9)**, el dueño podrá cambiar la contraseña de una
cuenta desde la ficha del empleado, que es lo que este texto ya anuncia.

---

### D-30 · El SDK de PocketBase se sirve desde este dominio

**Decisión:** `panel/vendor/pocketbase.es.js` es una copia del SDK oficial
(v0.28.0, 41 KB) guardada en el repositorio. No se pide a un CDN.

**Por qué:** la sección 4 prohíbe recursos de terceros, y así el panel sigue
entrando aunque `cdn.jsdelivr.net` esté caído. La versión queda fijada en un
único sitio, igual que `PB_VERSION` (D-01).

**Y por qué sí SDK aquí, si la web pública no lo usa (D-16):** allí eran 35 KB
para tres GET sin sesión, contra un presupuesto de 150 KB. Aquí aporta lo que
habría que reescribir a mano —sesión persistida, refresco de token, escapado de
filtros, subida de ficheros y tiempo real— y el panel se abre una vez por turno
en el móvil de la barra, no en 3G en la puerta.

**El presupuesto de 150 KB no aplica aquí, y conviene decirlo en voz alta.** Ese
techo (sección 6, D-20) es de la **primera carga de la carta pública**, que se
abre escaneando un QR en la terraza con 3G. La primera carga del panel son unos
250 KB sin comprimir, de los que la mitad son tipografías que ya están en la
caché del navegador desde la carta y que se sirven con `max-age` de un año. El
panel se abre una vez por turno y se queda abierto.

**El auto-cancelado del SDK está apagado.** Cancela sola la petición anterior
cuando se repite la misma llamada; eso está pensado para un buscador que teclea,
pero aquí las pantallas se repintan enteras (cambiar de día, confirmar una mesa)
y esa cancelación aparecía como un error que no lo era.

---

### D-31 · Los ajustes de reservas se tocan desde el panel, y solo el dueño

**Decisión:** la colección `ajustes` pasa a `updateRule = @request.auth.rol =
"dueno"` (migración `1756701100_ajustes_dueno.js`) y el engranaje de la cabecera
de Reservas abre una hoja con el interruptor de reservas por la web, el mensaje
de cerrado, los tres aforos, los minutos por mesa y los días de antelación.
`createRule` y `deleteRule` siguen en `null`: es un registro único.

**Por qué hace falta ya, en esta fase:** los aforos arrancan a cero a propósito
(D-07), y con aforo cero no se acepta ni una reserva por la web. Sin esta
pantalla, la única forma de abrir las reservas sería entrar al panel de
administración de PocketBase. Eso no se le pide a nadie.

**Por qué solo el dueño:** un encargado que sube el aforo del salón acepta mesas
que no existen, y uno que baja `meses_retencion_reservas` borra datos personales
antes de tiempo. Sección 7 del encargo.

---

### D-32 · El rol y los precios se defienden en un hook, no en una regla

**Decisión:** `pb_hooks/roles.pb.js` comprueba dos cosas que las reglas de
colección no saben decir:

1. **Nadie se cambia el rol a sí mismo.** El rol solo lo cambia un dueño, y
   sobre una cuenta que no sea la suya.
2. **El encargado no toca `precio_barra` ni `precio_terraza`.**

**Por qué no es una regla:** las reglas de PocketBase deciden **por registro**
(«¿puede tocar esta fila?»), no **por campo**. `users.updateRule` incluye
`@request.auth.id = id` porque cada cual tiene que poder cambiarse el nombre o
la contraseña; sin el hook, un empleado se asciende a dueño con un `PATCH` de
una línea. Lo mismo con `platos`: el encargado mantiene la carta, y el precio es
lo único que no le toca.

**Un dueño tampoco se degrada a sí mismo.** Si el único dueño se pone
«empleado» por error, no queda nadie que pueda deshacerlo. El superusuario de
PocketBase queda fuera de las dos comprobaciones: es la válvula de escape, y
quien entra ahí ya tiene el fichero SQLite entero.

**Vigilado por** `pruebas/reglas-acceso.sh`, sección 6.

---

### D-33 · La barra inferior tiene las cinco entradas desde el primer día

**Decisión:** «Hoy», «Carta», «Reservas», «Personal» y «Más» están todas en la
barra. Las que aún no se han construido llevan a un cartel que dice en qué fase
llegan y qué va a haber dentro.

**Por qué:** quien prueba el panel tiene que ver la forma final desde el
principio. Una entrada que aparece de una fase a otra descoloca más que un
cartel que dice cuándo llega, y con las cinco puestas se ve enseguida si falta
algo o si algo sobra.

**«Más» no es un cartel:** lleva la cuenta con la que se ha entrado, el rol y el
botón de salir. Salir importa más de lo que parece en un bar: el móvil del panel
se queda en la barra y lo coge cualquiera.

---

### D-34 · Los rótulos de la barra inferior son más oscuros que en la maqueta

**Decisión:** los rótulos apagados de la barra y el pie del acceso van en
`--apagado` (#786A5E) y no en el #A2917F / #B0A08E de la maqueta.

**Por qué:** #A2917F sobre blanco da **3,0:1** en un texto de 12,5 px, por
debajo del 4,5:1 que exige WCAG AA, y es la **navegación principal** del panel.
Es el mismo criterio con el que se oscureció `--apagado` en la fase 1 (D-17), y
a simple vista no se distingue.

**No se ha cambiado nada más de la maqueta.** El marco de móvil de
`design/rincon-panel.html` no se reproduce porque es la lámina, no el producto:
las pantallas ocupan lo que les den, con el tope de 720 px que ya usa la carta.

---

### D-35 · El panel no dice «0 escaneos», dice «—»

**Decisión:** la casilla de escaneos del QR enseña un guion cuando no hay fila de
métrica para hoy, no un cero.

**Por qué:** «0 escaneos» es una **afirmación**, y hoy no se puede hacer: el
contador de métricas no se enciende hasta la fase 10. Un guion dice «no hay
dato», que es la verdad. Las otras dos casillas —reservas y comensales— sí son
números de verdad y salen contando solo las reservas vivas, con el mismo
criterio que el aforo del servidor: una cancelada y un «no vino» no ocupan mesa.

---

### D-36 · «Oculto desde» lo escribe el servidor

**Decisión:** al apagar un plato, `pb_hooks/carta.pb.js` anota la fecha en
`oculto_desde`; al volver a encenderlo, la borra. Se guarda como medianoche UTC
del día natural, como el resto de fechas sin hora del proyecto.

**Por qué:** de ahí sale el aviso de la pantalla «Hoy» —«Croquetas de boletus y
sepia están ocultos en la carta desde el sábado»— y lo que preocupa no es que
hoy falten las croquetas, sino que lleven una semana apagadas y nadie se haya
acordado de encenderlas. Si fuese un campo del formulario se quedaría sin poner
justo el día que hay lío en la cocina, que es cuando hace falta.

---

### D-37 · Los datos de demostración traen una cuenta por rol

**Decisión:** `pocketbase demo` crea cuatro cuentas (`santi`, `marisa`, `kevin`,
`lucia` en `@ejemplo.invalid`, contraseña `demo-2026-quijote`) y las engancha con
las fichas de empleado correspondientes.

**Por qué:** desde esta fase el panel pide usuario y contraseña. Sin cuentas de
demostración no hay forma de ver el panel lleno mientras se construye, que es
justo para lo que existe ese subcomando.

**Son ficticias y la contraseña es pública.** El dominio `.invalid` está
reservado por norma y no existe: no se le puede escribir a nadie por error. En
producción las cuentas las crea Santi y este subcomando no se ejecuta.

---

## Fase 6 — panel: carta y edición de plato

### D-38 · El interruptor pinta antes de que conteste el servidor

**Decisión:** al apagar un plato en la lista, la palanca se mueve al momento y
la petición va detrás. Si el servidor dice que no, la palanca se vuelve sola y
sale el motivo arriba.

**Por qué:** es **el gesto de cada día**. Se acaban las croquetas a las dos de
la tarde y se apagan desde la barra, con una mano, con gente esperando. Un
interruptor que tarda dos segundos en reaccionar se pulsa tres veces, y las tres
llegan al servidor.

**Y por qué no hay botón de guardar:** apagar un plato no es una decisión que se
medite. Lo contrario —encenderlo— es igual de barato, así que el coste de
equivocarse es un toque.

---

### D-39 · Reordenar se puede con el dedo **y** con el teclado

**Decisión:** el asidero `⠿` es un `<button>`. Se arrastra con eventos de
puntero, y estando enfocado se mueve la fila con las flechas arriba y abajo.

**Por qué no la API de arrastrar y soltar de HTML5:** no existe en el móvil, que
es donde se va a usar esto. Con `pointerdown` funcionan los dos, y el
`touch-action: none` del asidero es lo que evita que arrastrar mueva la página
en vez de la fila.

**Por qué además con teclado:** una lista que solo se puede reordenar con un
gesto de arrastre deja fuera a quien no puede hacer ese gesto. El orden de los
platos es el orden de la carta pública; no es un adorno.

**Se guarda al soltar, no en cada paso.** Arrastrar de la primera posición a la
última son doce movimientos y no son doce guardados. Se renumera de diez en diez
y solo se escriben las filas cuyo número ha cambiado de verdad.

---

### D-40 · La foto se encoge en el navegador antes de subirla

**Decisión:** `panel/js/imagen.js` redibuja la foto en un lienzo a 1600 px de
lado mayor y la vuelve a codificar en JPEG antes de mandarla.

**Por qué, con números:** la foto la hace Santi con el móvil, con el plato
delante. Eso son entre 3 y 12 MB. El campo `foto` admite **8 MB**: la mitad de
las veces fallaría con un error que no dice nada útil, y la otra mitad tardaría
un minuto en la conexión del bar. A 1600 px quedan unos cientos de kB, y sobra:
la carta pública pide las miniaturas de 400 y 800 px, nunca el original.

**Y de paso arregla lo del HEIC.** Un iPhone entrega las fotos en HEIC, que no
está entre los tipos que acepta la colección (jpeg, png, webp). Safari sí sabe
dibujar un HEIC en un lienzo, así que al recodificarlo sale un JPEG normal y la
foto entra. Sin este paso le fallaría **la mitad de las fotos** y no habría forma
de explicarle por qué.

Se lee con `createImageBitmap(..., { imageOrientation: 'from-image' })`, que es
lo que evita que una foto hecha en vertical salga tumbada.

---

### D-41 · Un cero en `precio_terraza` significa «sin precio de terraza»

**Decisión:** el campo del precio de terraza sale **vacío** cuando vale 0, y en
la lista se pinta un guion.

**Por qué:** PocketBase guarda el vacío de un campo numérico como `0`; no hay
forma de distinguir «sin poner» de «cero». En este campo no es ambiguo —un plato
no vale cero euros en la terraza— y **es exactamente como ya lo leía la carta
pública**, que comprueba `plato.precio_terraza` por su veracidad y pinta un solo
precio cuando es 0.

Lo que se ha corregido es el panel, que enseñaba «0,00» donde la carta no enseña
nada. Quien lo mirara creería que se le ha colado un precio a cero.

`precio_barra` no tiene este problema: es obligatorio, y un campo numérico
obligatorio de PocketBase rechaza el 0.

---

### D-42 · Los dos precios se ven en la lista; se cambian en la ficha

**Decisión:** la línea de la carta enseña los dos precios uno al lado del otro,
y tocarla abre la ficha del plato, donde se editan.

**Por qué se anota esto:** el pie de la maqueta dice *«Los dos precios se ven y
se editan en la misma línea»*, pero el marcado dibuja dos `<span>` de texto, no
dos campos. Y el pie de la pantalla de editar repite la misma idea —*«los dos
precios juntos, uno al lado del otro, para que no se le olvide subir uno de los
dos»*— que es lo que de verdad resuelve el problema: cuando sube el proveedor se
tocan los dos a la vez.

Se ha seguido el marcado. Meter dos campos numéricos en una línea de 390 px que
además lleva asidero, nombre e interruptor daría un objetivo táctil por debajo
del mínimo, y el error que se evita —subir uno y olvidar el otro— ya lo evita la
ficha. **Es una lectura de la maqueta y conviene confirmarla con el cliente**
(sección 15).

---

### D-43 · Al encargado se le bloquea el precio, no se le da un error

> **SUPERADA por D-99 (2026-09-14).** El rol `encargado` ya no existe y la carta
> la mantiene todo el equipo, precios incluidos. Se deja escrita porque el
> razonamiento de fondo —un campo que no se puede tocar tiene que parecer que no
> se puede tocar— sigue valiendo para cualquier otro candado.

**Decisión:** al **editar**, el encargado se encuentra los dos campos de precio
desactivados y con el motivo escrito debajo. Al **crear** un plato sí los pone:
`precio_barra` es obligatorio y alguien tiene que escribirlo.

**Por qué:** quien lo impide de verdad es `pb_hooks/roles.pb.js` (D-32), y sin
esto el encargado escribiría un precio, pulsaría guardar y recibiría un 403 tras
haber hecho el trabajo. Un campo que no se puede tocar tiene que parecer que no
se puede tocar; de ahí el fondo apagado y el cursor de prohibido.

El resto del plato sí lo edita: nombre, descripción, categoría, alérgenos, foto
y visibilidad. Mantener la carta es su trabajo.

---

### D-44 · Apagar no es borrar, y la pantalla lo dice

**Decisión:** eliminar un plato solo lo puede hacer el dueño (lo dice ya la
`deleteRule`), pide confirmación, y en esa confirmación se explica **qué hacer
en su lugar**: si solo se ha acabado, se apaga con el interruptor.

**Por qué:** es el error caro de esta pantalla. Se acaba la sepia, alguien la
elimina, y al día siguiente hay que volver a escribir nombre, descripción,
precios, alérgenos y foto. El interruptor la devuelve a la carta con un toque.

---

### D-45 · Un plato sin categoría no desaparece de la pantalla

**Decisión:** los platos cuya categoría ya no existe se agrupan al final bajo
«Sin categoría».

**Por qué:** si se filtraran, seguirían en la base de datos sin salir en ninguna
parte, y nadie entendería por qué no aparecen en la carta. Un dato que existe y
no se ve es un dato que no se puede arreglar.

Por lo mismo, una categoría oculta se marca en su cabecera («categoría oculta»)
en vez de esconderse: sus platos pueden estar encendidos y aun así no salir en
la carta, y eso hay que poder verlo.

---

## Fase 7 — almacén: productos, proveedores y avisos de falta

### D-46 · El almacén cuelga de «Más», y la falta rápida vive además en «Hoy»

**Decisión:** el almacén **no tiene entrada en la barra inferior**. Se llega
desde «Más». Y «Apuntar una falta», que es lo que se hace todos los días, está
además en la pantalla «Hoy», dentro de la tarjeta de faltas.

**Por qué no una sexta entrada:** la barra tiene las cinco de la maqueta y eso
no se toca (D-33). Una sexta entrada obliga a rediseñar la barra entera, y en
390 px cinco ya van justas.

**Por qué entonces duplicar el acceso:** enterrar en un submenú el gesto
principal de cocina sería peor que no tenerlo. Quien descubre que no queda
harina está de pie, con prisa y mirando «Hoy». Ahí es donde tiene que estar el
botón, y por eso la tarjeta de faltas sale **aunque no haya ninguna**: «el
almacén está al día» es una respuesta, no un hueco.

**La barra marca «Más» mientras se está en el almacén.** Es de donde cuelga, y
mentir sobre dónde estás desorienta más que la ausencia de una entrada.

---

### D-47 · La maqueta no dibuja el almacén, y no se ha inventado una estética

**Decisión:** `design/rincon-panel.html` tiene ocho pantallas y **ninguna es el
almacén**. Las cuatro pantallas nuevas se han construido con piezas que ya
existían —tarjeta, filas, cabecera de grupo, pastilla, hoja, interruptor— con
los mismos tokens y las mismas medidas. Lo único nuevo son cuatro variantes de
fila, y están calcadas de `.fila-plato`.

**Por qué:** las maquetas son la fuente de verdad del diseño. Cuando no dicen
nada, lo honesto es **extender el vocabulario que ya hay**, no abrir uno nuevo:
un almacén con otro aire haría que el panel pareciera dos aplicaciones pegadas.

**Lo que sí se ha decidido aquí, porque la maqueta no podía decirlo:** el orden
de la pantalla. Faltas arriba (es lo que se mira con prisa y lo único que toca
todo el equipo), catálogo en medio agrupado **por ubicación** —que es como se
camina el almacén, no por categoría— y proveedores al final, que se tocan cuatro
veces al año.

---

### D-48 · La falta rápida no lleva cantidades

**Decisión:** apuntar que falta algo son **dos toques**: el producto y «queda
poco» o «se ha agotado». Ni cantidad, ni unidad, ni fecha, ni a quién avisar. La
nota es opcional y casi nadie la escribirá.

**Por qué:** son dos flujos distintos y mezclarlos los rompe los dos (sección 9
del encargo, y por eso son colecciones separadas). Nadie pesa la harina que
queda a las dos de la tarde con la cocina llena. Si apuntar una falta costara
dos minutos en vez de diez segundos, se volvería al papel de la nevera, que es
exactamente lo que veníamos a sustituir.

**Las cantidades son del recuento del domingo**, que se hace sentado, con
tiempo, recorriendo el almacén. Eso llega en la fase 8.

---

### D-49 · Se puede dar de alta un producto con solo el nombre

**Decisión:** si falta algo que no está en la lista, se escribe y se crea al
vuelo, con el nombre y nada más. `createRule` de `productos` deja crear a
**cualquiera** con sesión, cocina incluida.

**Por qué:** la alternativa es «ese producto no existe, avisa al encargado», que
es la forma más segura de que la falta **no se apunte en ninguna parte**. Un
catálogo perfecto con las faltas en un papel vale menos que un catálogo con
cuatro productos a medio configurar y todas las faltas dentro.

**Cómo se evita que eso degrade el almacén:** el producto queda marcado como
`sin_configurar`, la lista lo destaca en marrón diciendo **qué** le falta —«falta
la unidad y el proveedor»— y la marca se levanta sola en cuanto no falta nada.
Lo pone y lo quita el servidor (`pb_hooks/almacen.pb.js`), nunca el formulario:
un campo así se queda sin marcar justo el día que hay lío, que es cuando hace
falta. Es el mismo criterio que «oculto desde» (D-36).

**La marca solo se levanta, nunca se vuelve a poner.** Si alguien deja a
propósito un producto sin proveedor —porque se compra en el supermercado de la
esquina— no tiene por qué salirle el aviso cada vez que lo toca. La marca dice
«esto lo creó alguien con prisa», no «esto está incompleto».

---

### D-50 · La firma de un aviso la pone el servidor, y no se cuenta por persona

**Decisión:** `avisos_stock.creado_por` lo rellena el hook a partir de la sesión.
Lo que mande el navegador se ignora, y un aviso nace siempre sin resolver.

**Por qué el servidor:** si lo mandara el cliente, se podría firmar un aviso con
el nombre de otro. Es una firma, no un dato de formulario.

**Para qué sirve, y para qué no:** sirve para poder preguntar «oye, esto que
apuntaste, ¿era de la cámara o del sótano?». **No** se cuenta, ni se ordena, ni
se saca en ninguna estadística por persona: la sección 12 del encargo prohíbe
los rankings, y un contador de «quién apunta más faltas» convertiría una
herramienta útil en una forma de vigilar a la gente.

**Una cuenta sin ficha de empleado no se rechaza:** el aviso se guarda sin firma.
Lo que importa es que quede apuntado que falta harina.

---

### D-51 · Un producto no se borra: se aparta

**Decisión:** el interruptor «En uso» es lo primero que se ofrece. Eliminar solo
lo hace el dueño, pide confirmación y **falla a propósito** si el producto
aparece en algún recuento: la relación de `recuento_lineas` no arrastra el
borrado.

**Por qué:** un recuento cerrado es un documento de lo que había ese día. Si
borrar un producto vaciara sus líneas, los recuentos viejos empezarían a mentir
poco a poco y nadie sabría desde cuándo. Apartado, el producto deja de salir en
el recuento y en la lista de pedido, y lo viejo sigue cuadrando.

Es el mismo criterio que «apagar no es borrar» en la carta (D-44), y la pantalla
lo dice con todas las letras en vez de dejar que se descubra con un error.

---

### D-52 · Un producto no tiene dos faltas vivas a la vez

**Decisión:** si se apunta algo que ya estaba apuntado, **no se crea un aviso
nuevo**: se le cambia el nivel al que hay. En la pantalla de apuntar, esos
productos salen los primeros, con su nivel a la vista.

**Por qué:** dos avisos del mismo producto en la lista de «Hoy» no dicen nada
más que uno, y hacen dudar de si son dos cosas distintas. Además el aviso viejo
es el que lleva la fecha buena, la que dice **desde cuándo** falta, que es lo que
de verdad preocupa: no que hoy falte harina, sino que lleve cuatro días
apuntada.

---

### D-53 · Un mínimo a cero cuenta como «sin poner»

**Decisión:** en `stock_minimo` y en `pedido_habitual`, el 0 se enseña como
campo vacío, y un mínimo a 0 cuenta como que falta por configurar.

**Por qué:** es la misma trampa que `precio_terraza` (D-41). PocketBase guarda
el vacío de un campo numérico como 0 y no hay forma de distinguirlo de un cero
escrito a mano. Aquí encima no es ambiguo: un mínimo de cero **no dispara nunca**
la lista de pedido, así que vale exactamente lo mismo que no haberlo puesto.

---

## Fase 8 — almacén: recuento sin conexión y lista de pedido

### D-54 · En el recuento, nada espera al servidor

**Decisión:** lo que se teclea en el recuento se guarda **en el navegador** y se
manda cuando se puede (`panel/js/cola.js`). La pantalla da por bueno el número
en cuanto se escribe: no hay ruedas girando, ni líneas en gris, ni un guardado
que pueda fallar delante de quien está contando.

**Por qué:** el recuento se hace en el sótano y en la cámara, que es justo donde
no hay cobertura. Un formulario que confirma cada línea contra el servidor no
funciona ahí, y lo que pasaría es lo de siempre: la gente vuelve al papel.

**Por qué es seguro y no una forma elegante de perder datos:**

- Lo pendiente vive en `localStorage`, así que sobrevive a cerrar el navegador y
  a que el móvil se apague a media cuenta.
- Se reintenta solo: cuando el navegador avisa de que ha vuelto la red, cada
  ocho segundos mientras queden líneas, y al volver a entrar en la pantalla.
- **Mandar dos veces la misma línea no duplica nada.** `recuento_lineas` tiene
  índice único por `(recuento, producto)` (D-13): la segunda choca contra el
  índice, y ahí el cliente busca la línea que ya existe y la actualiza. Sin ese
  índice, una respuesta perdida dejaría dos filas del mismo producto y el
  recuento diría el doble.
- Cada línea va por su cuenta: una que falle no atasca a las demás. Se envían en
  serie y no en paralelo porque la conexión del sótano, cuando vuelve, es mala:
  veinte peticiones a la vez fallan más que veinte seguidas.

**Y una banda arriba dice cuántas quedan por mandar**, en marrón de aviso y no
en rojo. No es un error: en el sótano es lo normal, y asustar con ello hace que
alguien suba a la barra a media cuenta a ver «si se ha roto algo».

---

### D-55 · Esto no es todavía una aplicación que funcione sin conexión

**Decisión, dicha en voz alta:** lo que está resuelto es **lo que se teclea**. Si
se recarga la página estando sin red, no hay nada que cargar y la pantalla sale
en blanco.

**Por qué no se ha hecho entero:** que la aplicación arranque sin red necesita un
service worker que guarde el HTML, el CSS y el JavaScript, y eso es la **PWA de
la fase 10**. Adelantarlo aquí significaría además decidir la estrategia de
caché de todo el panel, que afecta a pantallas que aún no existen.

**Por qué así vale:** el recorrido real es abrir la pantalla arriba, con
cobertura, y bajar. Nadie recarga la página en mitad del sótano. Cuando llegue
la fase 10, la cola no cambia: lo único que se añade es que la página pueda
volver a abrirse sin red.

---

### D-56 · El cero se cuenta, y por eso `contada` es un campo aparte

**Decisión:** un campo vacío significa «no lo he mirado» y un cero significa «no
queda nada». Son dos cosas distintas y se guardan en dos campos: `cantidad` y
`contada`.

**Por qué:** «no queda nada» es la respuesta más importante de un recuento.
Deducir lo contado de `cantidad > 0` dejaría fuera de la lista de pedido
exactamente lo que hay que pedir, que es lo que está a cero.

**Y lo que no se ha contado no pide nada.** Una línea sin contar no entra en la
lista aunque su número sea 0: de eso no sabemos cuánto hay, y una lista de
pedido que se inventa lo que no se ha mirado no se puede usar.

---

### D-57 · La lista de pedido se calcula al guardar cada línea, no al cerrar

**Decisión:** `hay_que_pedir` y `cantidad_pedir` los escribe el servidor en cada
línea, en el momento en que se guarda.

**Por qué:** para que la lista esté hecha en el instante en que se cuenta la
última estantería. Contar el almacén entero y luego esperar a que algo lo
procese es justo lo que hace que la gente se vaya a casa sin pedir.

**Cuánto se sugiere:** `pedido_habitual` si está puesto, que es lo que sabe quien
lleva el bar; y si no, lo justo para volver al mínimo. Sin mínimo no se pide
nunca, y no es un descuido: un mínimo a cero es «sin poner» (D-53), y de un
producto del que no sabemos cuánto tiene que haber no podemos decir que falte.
Sale marcado como «sin configurar» en el almacén, que es donde se arregla.

---

### D-58 · Si la petición trae el campo, manda la petición

**Decisión:** el servidor calcula `hay_que_pedir` y `cantidad_pedir` **solo
cuando el cliente no los manda**. Si vienen en el cuerpo de la petición, se
respetan tal cual.

**Por qué:** la sección 5 del encargo pide que la lista se pueda corregir a mano.
Quien está delante de la estantería sabe cosas que el mínimo no recoge —que el
sábado hay bautizo, que la caja de arriba está abierta y hay que gastarla— y el
servidor no se las va a discutir.

**Cómo se distingue «no lo manda» de «lo manda a cero»:** mirando el cuerpo de la
petición (`e.requestInfo().body`), no el valor del registro. Un cero puesto a
mano es una decisión; un cero por defecto, no. Sin esa distinción, poner una
cantidad a 0 para quitar algo del pedido se sobrescribiría sola.

---

### D-59 · Un recuento cerrado no se vuelve a contar (pero el pedido sí se ajusta)

**Decisión:** con el recuento cerrado, cambiar `cantidad` o `contada` da un 403.
Cambiar `cantidad_pedir` o `hay_que_pedir`, no.

**Por qué la diferencia:** son dos cosas distintas. Lo contado es **el documento
de lo que había ese día**; si se pudiera reescribir, los recuentos viejos
empezarían a mentir poco a poco y nadie sabría desde cuándo. La cantidad a pedir
es una decisión de ahora, que se cambia mientras se llama al proveedor.

**Y para corregir una cantidad mal tecleada se reabre el recuento**, que es una
acción con nombre, con dueño (encargado o dueño) y que queda en el registro. Es
el mismo criterio que «apartar en vez de borrar» (D-51).

---

### D-60 · La lista se copia como texto; no se manda desde aquí

**Decisión:** «Copiar la lista» deja el pedido en el portapapeles con el nombre
del proveedor, la fecha del recuento y las líneas. Se pega en WhatsApp.

**Por qué:** es como se pide de verdad en un bar de barrio. Y sobre todo, no hay
pasarela de correo ni de SMS en la v1: **un botón que dijera «enviar» y no
enviara nada sería mentirle al cliente**, que es lo mismo que se decidió con el
SMS de la confirmación de reserva (D-23).

**Si el navegador no deja copiar** —hace falta permiso y contexto seguro— el
texto se queda seleccionado y se dice que lo copie a mano. Decir «copiado» sin
haber copiado nada es peor que no tener el botón.

---

### D-61 · Los proveedores se ordenan por quién reparte antes

**Decisión:** la lista de pedido agrupa por proveedor y ordena los grupos por los
días que faltan para su próximo reparto. Hoy cuenta como cero.

**Por qué:** la lista se usa haciendo la ronda de llamadas, y no todas urgen
igual. Al que reparte mañana hay que pedirle ya; al que viene el viernes se le
puede llamar esta tarde. Por eso `dia_reparto` es de selección múltiple desde la
fase 2: hay proveedores que reparten dos o tres días.

**Un proveedor sin día no va el último por castigo:** es que no sabemos cuándo
viene, así que no puede competir con quien sí lo dice.

---

## Fase 9 — personal: cuadrante, fichajes e informes

El cuadrante y los fichajes **sí** están dibujados en la maqueta (pantallas 6 y
7) y se siguen al pie. La pantalla del equipo no lo está, y ahí se ha aplicado
el mismo criterio que con el almacén (D-47): nada de estética nueva, todo con
piezas que ya existían.

Un aviso que vale para toda la fase: **esto es un registro de jornada laboral**.
Lo que se guarda aquí es lo que hay que poder enseñar si algún día alguien
pregunta por las horas de alguien, así que casi todas las decisiones de abajo
tiran hacia el mismo lado: que no se pueda falsear, que quede escrito quién tocó
qué, y que nada se borre sin decirlo tres veces.

### D-62 · Fichar es un botón en «Hoy», no una pantalla dentro de Personal

**Decisión:** el botón de fichar la entrada y la salida está en **Hoy**, en el
pie de la tarjeta «En turno ahora», y también en la pantalla de Fichajes.

**Por qué:** es el primer gesto del día y el último de la noche, y se hace con el
móvil en una mano mientras se levanta la persiana. Es exactamente el mismo
razonamiento que puso «Apuntar una falta» en Hoy (D-46): lo que se hace todos los
días no puede vivir tres toques dentro de un menú. Personal guarda lo que se
mira una vez a la semana (el cuadrante) o una vez al mes (el informe).

**Solo sale si la cuenta tiene ficha de empleado enlazada.** Una cuenta sin ficha
—la del gestor, o la de un dueño que no está en el cuadrante— no puede fichar, y
el servidor se lo rechazaría: un botón que da error al pulsarlo es peor que no
tener botón.

**Y es un botón, no dos.** O se ficha la entrada o se ficha la salida, según
dónde se esté, porque el servidor no admite dos fichajes abiertos a la vez.
Mientras la petición va y viene, el botón se apaga: dos toques seguidos serían
dos fichajes y el segundo daría un error que no dice nada.

---

### D-63 · La hora de salida también la pone el servidor

**Decisión:** al cerrar el turno, `pb_hooks/fichajes.pb.js` sustituye la hora que
manda el navegador por la suya. Dueño y encargado **sí** pueden escribirla.

**Por qué:** la hora de entrada ya la ponía el servidor desde la fase 2, con el
argumento de que el reloj del móvil se cambia en dos toques. La de salida se
quedó fuera y era el mismo agujero por el otro lado: irse a las 22:00 y fichar la
salida de las 02:00 era un `PATCH` de una línea. Un control horario en el que la
mitad de las horas las dicta el cliente no vale para nada.

**Por qué el mando sí puede escribirla:** es como se cierra el turno que alguien
se dejó abierto ayer. Y eso queda firmado en `corregido_por`, que es justo la
diferencia entre corregir y falsear.

**Vigilado por** `pruebas/reglas-acceso.sh`, sección 10.

---

### D-64 · Personal se abre por el cuadrante; fichajes y equipo cuelgan de él

**Decisión:** `/personal` es el **cuadrante**. Los fichajes (`/personal/fichajes`)
y las fichas del equipo (`/personal/equipo`) son pantallas de dentro, con dos
filas al final del cuadrante que llevan a ellas.

**Por qué:** la barra inferior tiene las cinco entradas de la maqueta y no se
toca (D-33), así que Personal es **una** entrada y hay tres pantallas. Se abre
por el cuadrante porque es la que se mira todos los días; los fichajes se miran
cuando hay que cerrar el mes y las fichas del equipo, cuatro veces al año. Es la
misma forma que tiene el almacén desde la fase 7.

**Consecuencia:** ya no hay ninguna entrada de la barra que lleve a un cartel de
«esto llega en la fase N», así que `panel/js/vistas/pendiente.js` se ha borrado.
Lo que falta por construir se sigue diciendo en «Más».

---

### D-65 · «Añadir turno» va en cada día, no en un botón al pie

**Decisión:** cada bloque de día del cuadrante lleva su propio «+ Añadir turno»
(solo para dueño y encargado). La maqueta pone un único botón «Añadir turno» al
pie de la pantalla.

**Por qué:** un turno es siempre de un día concreto, así que el botón del pie
obligaría a elegir el día en el formulario **siempre**. Con el botón en el día,
el formulario se abre con ese día ya puesto y poner el cuadrante de la semana es
tocar, tocar, tocar. El selector de día sigue estando en la hoja para cuando
haya que mover un turno de un día a otro.

**Lo que sí se ha respetado de la maqueta:** el botón grande del pie sigue
existiendo y es «Avisar del cuadrante al equipo», que es la acción que cierra la
tarea semanal.

---

### D-66 · El cuadrante avisa de los solapes; no los impide

**Decisión:** al guardar un turno que se pisa con otro de la misma persona ese
día, o que dura más de diez horas, la hoja lo dice y **deja guardar**. Lo único
que rechaza el servidor es un turno que empieza y acaba a la misma hora.

**Por qué:** es D-27 otra vez. Hay días de bautizo en los que alguien dobla, y
hay quien entra a las 08:00, se va a las 12:00 y vuelve a las 20:00. Un sistema
que lo prohíbe obliga a apuntarlo en un papel, y entonces el cuadrante ya no dice
la verdad. Casi siempre el aviso es un dedazo en la hora, y por eso se avisa.

**Un turno que acaba antes de empezar no es un error:** es el de noche, y cruza
la medianoche. `19:00`–`02:30` son siete horas y media, y así se cuenta a los dos
lados (`pb_hooks/lib/personal.js` y `panel/js/horas.js`).

---

### D-67 · Las horas se suman en el navegador, y el informe se descarga como CSV

**Decisión:** sumar jornadas es cosa del panel (`panel/js/horas.js`). El servidor
no cuenta horas: solo decide de quién es un fichaje y si un cambio es una
corrección. El informe del mes se arma en el navegador y se descarga como CSV.

**Por qué no lo suma el servidor:** no necesita el resultado para decidir nada, y
sumar jornadas en dos sitios es la forma segura de que un día no cuadren. Además
la sección 12 del encargo pide no construir mediciones de personas más allá del
informe mensual que se pide expresamente: sin totales guardados no hay
tentación de rankings.

**Por qué CSV y no PDF:** lo que hace la gestoría con esto es abrirlo en una hoja
de cálculo. Un PDF pediría una librería de 300 KB para dar algo que habría que
volver a teclear. El fichero va con punto y coma y con marca de orden de bytes,
que es lo que hace que el Excel en castellano lo abra en columnas y con las
tildes bien.

**Las jornadas sin cerrar no suman, y se dicen aparte.** Una jornada abierta no
es una jornada de cero horas: es una que no sabemos cuánto duró. Meterla como
cero haría mentir al informe, así que se cuentan en una columna propia y la
pantalla avisa de que el mes sale corto hasta que se corrijan. Por eso el aviso
de «fichaje sin cerrar» está arriba del todo en Fichajes: es lo que rompe el
informe, y es lo único de esa pantalla que hay que mirar todos los días.

---

### D-68 · Avisar del cuadrante al equipo copia un texto

**Decisión:** el botón arma el cuadrante de la semana como texto y lo copia al
portapapeles, para pegarlo en el grupo de WhatsApp. No manda nada.

**Por qué:** es D-60 otra vez (la lista de pedido). En la v1 no hay pasarela de
SMS ni de correo, y un botón que dijera «avisado» sin avisar a nadie sería
mentir; el mismo criterio que con el SMS de la reserva (D-23).

---

### D-69 · La contraseña y el correo necesitan una ruta propia del servidor

**Decisión:** `POST /api/quijote/cuenta` (`pb_hooks/cuentas.pb.js`) cambia la
contraseña, el correo o las dos cosas. Solo el dueño, mínimo ocho caracteres,
nunca sobre su propia cuenta, y queda escrito en el diario del servidor.

**Por qué hace falta:** D-29 quitó el «he olvidado mi contraseña» de la pantalla
de acceso porque no hay correo saliente, y prometió que el dueño podría cambiar
la contraseña desde la ficha del empleado. Al construirlo salió la razón por la
que no se puede hacer con un `PATCH` normal: **la API de PocketBase exige
`oldPassword`**, y el dueño justamente no la sabe —la persona la ha perdido, ese
es el caso—. Comprobado contra el servidor: contesta `400 oldPassword: Cannot be
blank`. Con el correo pasa lo mismo por otro motivo: cambiarlo exige el circuito
de confirmación por correo, que aquí no existe, y contesta `400 email: Values
don't match`. Desde un hook sí se puede llamar a `setPassword()`, escribir el
correo y guardar.

**Todo lo demás de una cuenta va por la API normal** —nombre, nombre de usuario,
rol, crear y borrar—, porque ahí PocketBase sí deja al dueño hacer su trabajo.
Esta ruta es solo para lo que no se puede de otra forma.

**Cuidado con `DynamicModel`:** un campo declarado con valor por defecto `null`
hace que `bindBody` reviente con un 500. Para saber si la petición trae un campo
o no lo trae se mira `e.requestInfo().body`, igual que en el almacén (D-58).

**Y por qué eso no es un agujero:** saltarse esa comprobación es exactamente lo
que hace peligrosa la ruta, así que quién puede llamarla es lo único que la
separa de un desastre. Se comprueba el rol en la sesión (no en el navegador), no
se tocan cuentas de superusuario —son otra colección—, y el propio dueño no puede
cambiarse así la suya: si se deja la sesión abierta en el móvil de la barra, eso
sería regalar la cuenta a quien lo coja. Cambiar la contraseña renueva además el
`tokenKey`, así que las sesiones abiertas con la clave vieja dejan de valer al
momento.

**La contraseña nueva se ve mientras se escribe**, a propósito: hay que poder
dictarla en voz alta.

**Vigilado por** `pruebas/reglas-acceso.sh`, sección 11.

---

### D-70 · Una ficha del equipo no se borra: se aparta

**Decisión:** la ficha lleva el interruptor «Trabaja aquí». Eliminarla existe,
solo para el dueño, y avisa de lo que se lleva por delante.

**Por qué:** `turnos.empleado` y `fichajes.empleado` se declararon con
`cascadeDelete` en la fase 2, así que borrar una ficha **se lleva todos sus
turnos y todas sus horas fichadas**. Eso es un registro de jornada laboral: es
justo lo que hay que poder enseñar si algún día se pregunta por las horas de
alguien, y no se borra porque una persona se vaya del bar. Apagada, la ficha
deja de ofrecerse al poner turnos y su historial sigue ahí.

Es el mismo criterio que con los productos (D-51), y por el mismo motivo: lo que
parece «limpiar» es en realidad perder los papeles.

---

### D-71 · El color del avatar es una lista cerrada de seis

**Decisión:** seis colores a elegir tocándolos —los tres de la maqueta (granate,
cobre y oliva) y tres más—, no un selector de color libre.

**Por qué:** el color no es decoración. En una pantalla de 390 px con cuatro
turnos seguidos, es lo que deja ver de un vistazo que el sábado de noche está
Lucía sola. Un selector libre acaba con un amarillo fluorescente sobre crema que
no lee nadie, y el contraste de esta paleta ya está pensado.

---

### D-72 · Al panel se entra con un nombre de usuario, no con un correo

**Decisión:** la colección `users` gana el campo `usuario`, se admite como
identidad **junto** al correo (`identityFields: ['usuario', 'email']`) y el
correo pasa a ser **opcional** (migración `1756701200_equipo.js`).

**Por qué:** era un defecto. La pantalla de acceso dice «Usuario» y la maqueta
pone `santi` en el campo, pero la colección venía con `identityFields:
["email"]`: escribir `santi` **no entraba**, y el panel prometía algo que no
hacía. Se descubrió al construir el alta de cuentas, que es cuando la pregunta
«¿y qué escribe aquí Santi?» tiene que tener respuesta.

**Y por qué el correo deja de ser obligatorio:** ahora las cuentas las crea el
dueño para gente del bar, y exigir un correo a cada persona es pedir algo que
muchas veces no existe —o que se inventa mal— para un dato que **no se usa para
nada**: no hay correo saliente (D-29). Quien tenga correo puede entrar también
con él; quien no, no lo necesita.

**Lo que ya existía sigue funcionando:** a las cuentas que había se les rellenó
el nombre de usuario con la parte de delante de su correo (`santi@…` → `santi`),
así que nadie se queda fuera.

**El índice único es parcial** (`WHERE usuario != ''`): sin eso, dos cuentas sin
nombre de usuario chocarían entre ellas. Y el servidor lo guarda **en
minúsculas** (`pb_hooks/equipo.pb.js`): «Kevin» y «kevin» tienen que ser la
misma cuenta, porque se teclea de memoria a las once de la noche.

---

### D-73 · Las cuentas se crean desde el panel, y son cosa aparte de las fichas

**Decisión:** pantalla propia, `/personal/cuentas`, colgando de «El equipo».
Crear, cambiar y borrar cuentas es **solo del dueño**; el encargado ve la lista
porque necesita saber a quién enlazar cada ficha.

**Por qué dos pantallas y no una:** son dos cosas distintas que se parecen.

| | Ficha del equipo | Cuenta de acceso |
|---|---|---|
| Qué es | quién trabaja aquí | una llave para entrar |
| La llevan | turnos y fichajes | el rol y los permisos |
| Puede faltar | sí: hay quien no entra nunca al panel | sí: el gestor no está en el cuadrante |

Meterlas en un solo formulario obliga a inventarse una cuenta para la señora que
solo viene los sábados, o una ficha para el gestor que nunca ha servido una
caña. Enlazarlas se puede desde los dos lados, y desde la ficha se puede crear
la cuenta de esa persona **de una vez**, que es el caso de verdad: «acabo de
contratar a alguien y quiero que entre al panel».

**Las cuentas que crea el panel nacen con el correo visible**
(`emailVisibility: true`). PocketBase tapa el correo de las cuentas ajenas, y
sin esto la lista de cuentas no podría decir de quién es cada una. No es una
fuga: `users.listRule` ya limita esa lista al dueño, al encargado y a uno mismo.

**Lo que el panel NO deja hacer**, y lo impide el servidor, no la pantalla
(`pb_hooks/equipo.pb.js`):

- **Nadie borra su propia cuenta.** Es la forma más rápida de quedarse fuera.
- **No se borra la última cuenta de dueño.** Sin ningún dueño, la única manera de
  volver a entrar es el panel de administración de PocketBase.
- **Nadie se cambia el rol a sí mismo** (eso ya lo hacía `roles.pb.js`, D-32).

---

### D-74 · Lo que dice una ficha del equipo, y lo que no

**Decisión:** la ficha guarda **puesto**, **fecha de alta**, **horas por semana**
del contrato y **notas**, además de lo que ya tenía (nombre, iniciales, color,
teléfono y cuenta enlazada).

**Por qué estos cuatro:** son los que se necesitan para lo que el sistema ya
hace. El puesto y las horas contratadas son lo que se mira al poner el cuadrante
(«¿le estoy metiendo 45 horas a alguien de 30?»); la fecha de alta es la
antigüedad, que se pregunta sola en cuanto hay una ficha delante; las notas son
donde acaba «libra los martes» en vez de en la cabeza de Santi.

**Un cero en `horas_semana` significa «sin poner»**, igual que en el mínimo de un
producto (D-53): un campo numérico vacío se guarda como 0 en PocketBase, y una
jornada de cero horas no existe.

**Lo que NO se guarda, y es a propósito:** ni DNI, ni dirección, ni número de la
Seguridad Social, ni datos de nómina. Eso es una decisión **legal** —protección
de datos, sección 12 del encargo—, no técnica, y de las que se preguntan antes
(sección 15). Está anotada como propuesta al final de este documento.

---

### D-75 · La fecha de baja la escribe el servidor

**Decisión:** al apagar «Trabaja aquí», el servidor apunta la fecha en
`fecha_baja`; al volver a encenderlo, la borra. El navegador no la manda nunca, y
si la manda se ignora (`pb_hooks/equipo.pb.js`).

**Por qué:** es el mismo criterio que `oculto_desde` en los platos (D-36) y que
la firma de un aviso de stock (D-50). Una fecha que dice desde cuándo alguien ya
no trabaja aquí es justo la clase de dato que no puede depender de lo que
teclee un móvil, porque es lo que se mira cuando hay una discusión.

**Y una ficha con horas fichadas ya no se puede borrar**, ni siendo dueño. El
panel ya empujaba a apartarla en vez de borrarla (D-70); ahora lo impide el
servidor, porque `cascadeDelete` se llevaría por delante el registro de jornada
de esa persona y eso es lo único de todo el sistema que hay que poder enseñar
años después. Sin fichajes sí se borra: una ficha creada por error no tiene por
qué quedarse para siempre.

---

## Carta real del cliente (2026-09-04)

### D-76 · Un plato puede no tener precio, y sin precio no sale en la carta

**Decisión:** `precio_barra` deja de ser obligatorio (migración
`1756701300_carta_sin_precio.js`), y la **regla de lectura pública de `platos`
exige precio**:

```
(visible = true && precio_barra > 0) || @request.auth.id != ""
```

**Por qué hizo falta:** la carta real del bar —278 platos, 15 categorías— llegó
**sin precios**. Cargarla es trabajo hecho que no se puede tirar (nombres,
descripciones y alérgenos), pero `precio_barra` era obligatorio y en PocketBase
**un campo numérico obligatorio rechaza el valor 0**: no había forma de guardar
un plato sin precio, ni por el panel ni por el importador. Comprobado contra el
servidor: `400 precio_barra: Cannot be blank`.

**Por qué la regla y no un filtro en la web:** una carta es una **lista de
precios**. Un plato sin precio en la calle es un problema —el cliente pregunta
«¿y esto cuánto vale?» a quien está sirviendo mesas— y además hay que poder
enseñar los precios. Dejarlo en manos del JavaScript de la web significaría que
el dato viaja igualmente y que cualquier otro consumidor de la API lo vería. Es
el mismo criterio que con los platos apagados desde la fase 2: **lo que no puede
salir, no sale del servidor**.

**Con sesión se ve todo**, porque el panel tiene que poder enseñar justo lo que
le falta a cada plato: la lista los marca con «Sin precio» en el marrón de
aviso, y arriba dice cuántos hay y qué significa. Mismo patrón que los productos
«sin configurar» del almacén (D-49).

**Un cero es «todavía sin precio», no «gratis»**, igual que en `stock_minimo`
(D-53). PocketBase guarda un número vacío como 0, así que el cero es el único
valor posible para decir «no lo sé».

---

### D-77 · Un plato se identifica por nombre Y categoría

**Decisión:** el importador (`pocketbase importar-carta`) busca el plato por
`nombre + categoria`, no por nombre suelto.

**Por qué:** la carta real tiene **«Casera»** en cervezas (la gaseosa para
mezclar) y en refrescos, y **«Pincho de tortilla»** en raciones y en sándwiches.
Con la búsqueda por nombre a secas, la segunda fila del CSV no creaba su plato:
**movía el primero de categoría**, y la carta acababa con 276 platos en vez de
278, sin decir nada. Dos categorías pueden tener un plato que se llame igual, y
eso es normal en un bar.

Sigue siendo idempotente: reimportar el mismo fichero actualiza, no duplica. Es
lo que permite cargar hoy los nombres y mañana los precios sin tocar nada más.

---

### D-78 · La carta pública pide solo los campos que pinta

**Decisión:** `web/js/api.js` pide `fields=…` con los once campos que usa la
carta, en vez del registro entero.

**Por qué:** con las quince filas de ejemplo daba igual; con la carta real son
**123 KB de JSON contra 57 KB** (11,7 KB comprimidos). Lo que sobraba —`visible`,
`oculto_desde`, `destacado`, `productos`, `created`, `updated`— es del panel y no
lo lee nadie en la web. Con un presupuesto de primera carga de 150 KB (D-20), 66
KB de más no son un detalle.

**Ojo al añadir un campo a la carta pública:** si no está en esa lista, llega
`undefined`. Está escrito en el propio fichero, encima de la constante.

---

### D-79 · El ingrediente extra: interruptor en el plato, importe en el código

**Decisión:** `platos.admite_extras` (booleano, migración
`1756701400_platos_extras.js`) marca qué platos admiten ingredientes extra, y el
importe —0,50 € por ingrediente, lineal— vive en **un solo sitio**:
`compartido/js/extras.js`, el mismo fichero para la carta y el panel.

**Por qué el interruptor va en el plato y no en la categoría:** las quince
categorías reales son gruesas («Raciones», «Platos combinados») y dentro de una
misma conviven cosas que admiten extra y cosas que no. Y sobre todo: **las
categorías no se editan desde el panel** (P-03), solo desde `/_/`. Un interruptor
por categoría no lo podría usar Santi. En el plato cae al lado de los precios,
que es donde se decide.

**Por qué el importe no es un campo:** es el mismo para todo el bar, así que como
campo serían 278 copias del mismo 0,50 y subirlo a 0,60 sería tocar 278 filas.
Además el sistema **no cobra nada** —no hay comandas ni caja—: este número solo se
pinta. Si algún día tiene que cambiarlo Santi sin tocar código, el sitio es
`ajustes` (lectura pública, escritura del dueño), dejando la constante de
respaldo para cuando la carta se ve sin conexión.

**Es un precio, así que lo cambia el dueño.** `admite_extras` pasa por el mismo
candado que `precio_barra` y `precio_terraza` en `pb_hooks/roles.pb.js`: enciende
un recargo, y eso no es del encargado. Lo cubren cinco comprobaciones de
`pruebas/reglas_acceso.py`, incluida la de que un PATCH del encargado que **no**
toca el interruptor sigue pasando.

**Coste:** un campo más en el JSON de la carta pública. Por eso se llama
`admite_extras` y no `admite_ingredientes_extra`: son ~3 KB de diferencia sobre
278 platos, con un presupuesto de 150 KB (D-20, D-78).

**Dos platos lo llevaban metido en la descripción** («Bocadillo de jamón
serrano. 0,50€ por ingrediente extra.»). Eso ahora se diría dos veces, y el día
que cambie el importe la etiqueta diría 0,60 y el texto seguiría diciendo 0,50.
Para sacarlo está `scripts/limpiar-aviso-extra.sh`, **en seco por defecto**: sin
`--aplicar` solo enseña, plato a plato, lo que dice y lo que diría. Es un cambio
de datos, así que se mira antes y no lo lanza nadie por su cuenta.

**El aviso se dice de dos formas.** En la ficha, entero: «+0,50 € por ingrediente
extra». En la línea de la carta, breve: «+0,50 € por ingrediente». Con la
miniatura a la izquierda y los dos precios a la derecha, la columna de texto son
158 px y la forma larga se parte en dos renglones y acaba abultando más que las
etiquetas de alérgeno, que son las que por ley tienen que cantar. Las dos salen
de `web/js/etiquetas.js`, que las compone en un único sitio.

---

### D-80 · La columna de precio se llama «Terraza / Salón»

**Decisión:** donde el rótulo decía «Terraza» ahora dice «Terraza / Salón», en la
carta pública y en el panel. **No cambia ningún precio ni ningún campo**: en la
base sigue siendo `precio_terraza`.

**Por qué:** terraza y salón comparten tarifa desde siempre, pero el rótulo solo
nombraba una. Quien se sentaba dentro no sabía cuál de los dos precios le tocaba,
y eso es exactamente la discusión con la camarera que la columna doble existe
para evitar.

**Lo que cuesta:** «Terraza / Salón» no cabe de una línea en una columna de 54 px
(46 en el panel). Se parte en dos, con un espacio duro entre la barra y «Salón»
para que el salto no deje una barra suelta al final del primer renglón, y en la
carta el rótulo baja a `--t-xs`. **No se ensancha la columna**: cada píxel que se
le quita al nombre del plato es una línea más de nombre partido en tres.

**Dónde NO se ha tocado:** las zonas de reserva (`formulario-reserva.js`,
`ajustes-reservas.js`, `confirmacion.js`). Ahí «Terraza» y «Salón» son dos sitios
distintos con aforos distintos, no una columna de precio.

**De paso se ha cuadrado la cabecera del panel**, que estaba descolocada desde
siempre: los rótulos no tenían en cuenta el ancho del interruptor y «Barra» caía
sobre la columna de terraza. En la carta pública el desajuste era de 2 px (la
cabecera usaba un hueco de 14 px y la línea uno de 12).

---

### D-81 · Las categorías del panel se pliegan, y arrancan abiertas

**Decisión:** cada cabecera de categoría de `/panel/carta` es un botón que pliega
su lista (`aria-expanded` + `aria-controls`), y la cabecera de la pantalla lleva
un botón que abre o cierra **todas**. El estado vive en el módulo, no en la vista.

**Por qué en el módulo:** al tocar un plato se sale de la pantalla y al volver la
vista se construye de cero. Con el estado dentro, quien pliega catorce categorías
para llegar a «Postres» se las encuentra abiertas otra vez en cuanto edita un
postre. Al recargar se olvida, que es lo que se espera de un pliegue.

**Por qué abiertas de partida:** es lo que hay hoy. Cambiar el estado inicial de
una pantalla que se usa todos los días no es un cambio de interfaz, es un cambio
de costumbre, y arrancar cerrado se decide, no se supone. Cerrarlas todas es un
toque. **Si se prefiere al revés, es una línea** (`colapsadas` arrancando con los
ids de todas las categorías).

**El cuerpo se pinta siempre y se esconde con `[hidden]`**, en vez de no pintarlo:
así `aria-controls` apunta a algo que existe y el lector de pantalla anuncia
«contraído» sabiendo de qué. No cambia ni los datos ni la descarga de la carta.

**El botón va dentro del `<h2>`, no al revés:** un `<h2>` dentro de un `<button>`
no es marcado válido, y sin el `<h2>` se pierde el índice de encabezados de la
pantalla.

---

### D-82 · La foto manda en la ficha; en la miniatura manda el hueco

**Decisión:** dos reglas opuestas a propósito.

- **Ficha de plato:** `object-fit: contain`, ancho completo, alto libre hasta
  52 dvh. La foto entera, sin recortar. Antes era una franja fija de 180 px con
  `cover`, o sea que a una foto de plato hecha desde arriba —que es como se
  fotografía un plato— se le comía la mitad. Comprobado con cuatro proporciones:
  3:2 → 336×224 px, cuadrada → 336×336, vertical → tope de 439, panorámica →
  336×92, sin franjas de degradado sobrantes en ninguna.

- **Miniatura de la lista:** `object-fit: cover` en un cuadrado de 48 px. Aquí sí
  se recorta, porque en 48 px lo que importa es reconocer el plato de un vistazo;
  sin recortar, una foto apaisada se quedaría en una franja de 20 px. La foto
  completa está a un toque.

**Las miniaturas llevan `loading="lazy"`.** La carta son 278 platos en una sola
página: sin esto, abrirla pediría 278 imágenes de golpe por la red del móvil, que
es justo el escenario que el proyecto lleva evitando desde el primer día.

**Se pide la miniatura de 400 px, no el original.** No hay nada nuevo que generar
en el servidor: es el mismo recorte que ya usaba el panel.

**Sin foto, el hueco se ocupa igual**, con la inicial sobre `--neutro-bg`. Si solo
apareciera en los platos que la tienen, los nombres bailarían de línea en línea.
Se usa el neutro y no el granate de la ficha: noventa cuadrados granates seguidos
serían un grito, y encima de algo que no hay que mirar.

---

### D-83 · En el Caddyfile, los matchers de `header` son excluyentes

**Decisión:** en el bloque `/compartido/*`, las tres reglas de `Cache-Control`
usan matchers que no se solapan (`*.woff2`, `*.js`, `not path *.woff2 *.js`).

**Por qué:** Caddy **no** aplica varias directivas `header` en el orden en que
están escritas. Una `header` sin matcher se aplica DESPUÉS de las que sí lo
tienen y las pisa. Estaba pasando ya, sin que nadie lo notara: **las tipografías
salían con `max-age=2592000` en vez del año inmutable** que decía su propio
bloque, y solo se coló el `Access-Control-Allow-Origin` porque nadie peleaba por
esa cabecera. Se descubrió al añadir `compartido/js/`, que necesita `no-cache`
porque de ahí sale el precio del ingrediente extra (D-79) y un cambio de precio
que tardase treinta días en llegar a los móviles sería una carta que miente.

**Ojo:** el cambio solo hace efecto al **reiniciar el contenedor `web`**. Con
`admin off` no hay `caddy reload`.

---

### D-84 · Lo que solo usa el panel se declara en el panel

**Decisión:** `--ancho-palanca` vive en `panel/css/panel.css`, no en
`compartido/css/tokens.css`, y todos sus usos llevan respaldo:
`var(--ancho-palanca, 46px)`.

**Por qué, y no es una manía de orden.** Los dos ficheros se sirven con caches
muy distintas:

| Fichero | Cache-Control |
|---|---|
| `compartido/css/tokens.css` | `public, max-age=2592000` (30 días) |
| `panel/css/panel.css` | `no-cache` |

Una variable declarada en el primero y usada en el segundo **le llega rota a
quien ya hubiera abierto el panel antes**: el navegador junta el CSS nuevo con el
`tokens.css` de hace semanas, `var(--ancho-palanca)` se queda sin valor y las
dos reglas que la usaban se caen a la vez:

- `.interruptor__palanca { width: var(--ancho-palanca) }` → `width: auto`, y como
  la palanca es un `<span>` vacío, **colapsa a 0 px**. El interruptor se veía sin
  píldora, sin color y cortado contra el borde derecho, con el círculo blanco
  —que va en `::after`, posicionado— saliéndose.
- `.columnas-precio--con-interruptor { padding-right: calc(… var(--ancho-palanca) …) }`
  → `calc()` inválido, `padding-right: 0`, y **la cabecera de precios descuadrada**
  24 px (justo lo que D-80 había dejado cuadrado).

**No fue una hipótesis: se reprodujo.** Sirviendo en el banco de pruebas el
`tokens.css` anterior contra el `panel.css` nuevo, la palanca medía `width: 0px`
y el padding de la cabecera `0px`. Con el arreglo, medido en 320, 344, 360, 375,
390, 414, 430, 768, 1024 y 1440 px, **con tokens fresco y con tokens viejo en
caché**: palanca de 46 px, dentro del viewport, cabecera alineada y sin desborde
horizontal en los veinte casos.

**Lo que NO era la causa.** El salto de «Terraza / Salón» a dos líneas no tiene
nada que ver: la cabecera (`.columnas-precio`) y la fila (`.fila-plato`) son
elementos **hermanos independientes**, no una tabla, así que lo que le pase a una
no puede empujar a la otra. Y `white-space: nowrap` en ese rótulo lo empeoraría:
medido, el texto pasa de 48 a **94 px dentro de una caja de 46**, se sale por la
izquierda sobre «Barra» y por la derecha sobre la columna del interruptor; ni
bajando la letra a 6 px llega a caber. La cabecera se queda en dos líneas.

**Regla para lo próximo:** `tokens.css` es para lo que comparten de verdad la
carta y el panel, y cambiarlo tarda hasta 30 días en llegar a un navegador que ya
lo tenga. Cualquier medida de una sola aplicación se declara en su propio CSS. Si
alguna vez hace falta una variable compartida nueva, hay que cambiar antes la
cache de `/compartido/*.css` en `deploy/Caddyfile` (hoy solo `*.js` va con
`no-cache`, ver D-83) o el estreno llegará a medias.

---

## Fase 10 — eventos, estadísticas, idiomas, textos legales y PWA

### D-85 · El bloque de celebraciones es la puerta de los eventos

**Decisión:** el cachet de «CELEBRACIONES» de la portada es ahora un enlace a
`/eventos`, con una última línea que dice «Ver lo que se cuece ›». No se ha
añadido un tercer botón a la botonera.

**Por qué:** la maqueta dibuja la pantalla de eventos (la sexta) pero **no dibuja
desde dónde se llega a ella**: la portada solo lleva a la carta y a la reserva.
Los dos botones grandes son dos a propósito —son las dos cosas que busca quien
tiene el móvil en la mano y hambre— y meter un tercero le quita fuerza a los dos.
El bloque que ya habla de bautizos, comuniones y bodas es exactamente el sitio
donde alguien pregunta «¿y qué más hacéis?».

**Coste:** un bloque que antes era decorativo ahora se puede pulsar. Se ha
marcado como tal (flecha, hundido al tocar) para que no sea un enlace escondido.

---

### D-86 · «Avísame de los próximos» no se construye

**Decisión:** el botón inferior de la pantalla de eventos, que en la maqueta dice
«Avísame de los próximos», es en su lugar «Reservar mesa».

**Por qué:** ese botón solo puede hacer una cosa honesta —pedir un teléfono para
avisar— y en la v1 **no hay forma de avisar a nadie**: la sección 2 del encargo
deja fuera la integración con WhatsApp y la sección 10 pide dejar el notificador
preparado pero sin montar. Pedirle el teléfono a un cliente para no llamarle
nunca es peor que no pedírselo, y además crea un fichero de datos personales
nuevo que habría que justificar en la política de privacidad.

**Si el cliente lo quiere de verdad**, hay que decidir antes tres cosas: por qué
vía se avisa, quién paga los mensajes y cuánto tiempo se guardan esos teléfonos.
Es una decisión de dinero y de datos personales, así que se pregunta.

---

### D-87 · Lo que no está en el camino del QR se carga cuando hace falta

**Decisión:** la carta pública ya no descarga de golpe todas sus pantallas.

| Cuándo se descarga | Qué |
|---|---|
| Siempre, para pintar la portada | portada, carta, ficha de plato, métricas |
| Al terminar de cargar y con el navegador parado | reserva y confirmación |
| Solo si alguien entra ahí | eventos y los tres textos legales |

**Por qué:** el camino del QR es escanear → portada → carta → plato. Todo lo
demás lo hace una minoría, y hasta ahora **lo pagaban todos**: `reserva.js`,
`confirmacion.js` e `ics.js` son 27 KB que se descargaban antes de pintar la
portada aunque nadie fuese a reservar.

**Medido, antes y después** (en el banco de pruebas, con la portada):

| | Antes | Después |
|---|---|---|
| Para pintar la portada | 226,2 KB (26 peticiones) | **199,9 KB (23 peticiones)** |
| Por el hilo, comprimido | 142,8 KB | **133,1 KB** |

Los 26,3 KB que salen del camino crítico son exactamente `reserva.js` (16,0),
`confirmacion.js` (6,6) e `ics.js` (3,8); comprimidos, 9,7 KB.

**Un detalle que se pagó midiendo:** pedir los módulos diferidos nada más
resolverse la carta no sirve de nada. `requestIdleCallback` se dispara **antes**
del evento `load`, así que las tres pantallas volvían a competir por la red con
la portada. Colgados de `load`, salen de verdad de la primera carga.

**Coste:** quien pulse «Reservar» en el primer segundo de la visita puede esperar
una fracción de segundo más. A cambio, quien solo mira la carta —que es casi
todo el mundo— la ve antes.

---

### D-88 · Los textos legales, solo en castellano

**Decisión:** el aviso legal, la política de privacidad y la de cookies se
publican en castellano y **no** se traducen al inglés. La barra superior de esas
tres pantallas no lleva el conmutador ES/EN.

**Por qué:** un texto legal mal traducido dice cosas distintas en cada idioma, y
el que vale es el de la jurisdicción donde está el bar. La carta cae al
castellano cuando no hay traducción y eso es correcto para un plato (D-31); para
una cláusula de conservación de datos, no: o está bien dicho o no se dice.

**Coste:** un cliente inglés lee la política en castellano. Es lo mismo que le
pasa en cualquier bar de Madrid, y el resumen de la primera sección («si reservas
mesa guardamos tu nombre y tu teléfono, y se borran solos a los doce meses») está
escrito para poder traducirse con el traductor del móvil sin perder el sentido.

---

### D-89 · Los campos en inglés entran en el editor de plato y en el de evento

**Decisión:** la pantalla de editar plato tiene ahora «Nombre en inglés» y
«Descripción en inglés», al final del formulario y bajo su propio rótulo. La hoja
de evento, lo mismo. **Cierra la propuesta P-04.**

**Por qué:** `platos` tiene `nombre_en` y `descripcion_en` desde la fase 2 y la
carta pública YA los usa, pero no había ninguna pantalla donde escribirlos. El
conmutador ES/EN traducía la interfaz y dejaba los platos en castellano: media
pantalla en cada idioma. La maqueta no dibuja esos campos, así que van donde
menos estorban —al final, después de lo que se toca todos los días.

**Coste:** el formulario de plato es dos campos más largo. Se rellenan una vez.

---

### D-90 · No hay «tiempo medio»; en su sitio va el reparto por idioma

**Decisión:** la pantalla de estadísticas **no** enseña la casilla de «2:40
minutos de media» que dibuja la maqueta. En su lugar va el porcentaje de visitas
en inglés.

**Por qué:** medir cuánto rato está alguien mirando la carta exige seguirle la
pista durante la visita —un identificador, una marca de entrada y otra de
salida—, y la sección 13 del encargo dice qué se puede contar (escaneo, plato
mirado, búsqueda sin resultado) y añade «nada más». No es que sea difícil: es que
está prohibido, y es la clase de cosa que se cuela sin darse cuenta.

El reparto por idioma **sí** lo pide la sección 7, y sale gratis: el escaneo ya
se guarda con el idioma en que se vio la carta, así que no hay que contar nada
nuevo para saberlo.

---

### D-91 · El escaneo se cuenta al FINAL de la visita

**Decisión:** la métrica de escaneo no se manda al abrir la carta, sino cuando la
página se oculta (se cierra, se cambia de aplicación, se bloquea el móvil), una
sola vez por visita y con `sendBeacon`.

**Por qué:** la web abre **siempre** en castellano, sin mirar el idioma del
navegador (D-32). Contando al entrar, el idioma que se apunta es «castellano»
hasta de quien lo primero que hace es pulsar EN, y el reparto por idioma de la
sección 7 saldría siempre 0 % de inglés: un número que parece un dato y es un
artefacto de cuándo se mide.

Esperando al final, el idioma que se cuenta es el que de verdad se usó.
`sendBeacon` está hecho justo para esto: entrega el dato aunque la pestaña se
cierre a continuación.

**Coste:** se pierde la visita de quien deje la pestaña abierta y no vuelva a
tocarla nunca, y la de quien tenga el móvil sin batería en el momento justo. Para
un contador de días enteros, da igual.

---

### D-92 · Los datos del titular no se inventan: los pone Santi

**Decisión:** `ajustes` tiene cuatro campos nuevos —`titular_legal`, `nif`,
`direccion_fiscal` y `correo_contacto`— que **nacen vacíos**. El aviso legal y la
política de privacidad los pintan si están, y omiten la línea si no. El panel se
lo recuerda al dueño con un aviso en «Más» mientras falten.

**Por qué:** un aviso legal tiene que decir quién responde de la web, con NIF y
domicilio, y ninguno de esos datos está en el encargo. Escribir un NIF de ejemplo
en una web publicada es peor que no escribir ninguno: el primero es falso y el
segundo está a medias. Y no es una decisión técnica, así que se pregunta
(sección 15).

**PENDIENTE DEL CLIENTE, y bloquea la publicación completa de los textos:**
titular (persona o sociedad), NIF/CIF, domicilio fiscal y un correo de contacto
para ejercer los derechos de protección de datos —el teléfono solo no basta—.
Además, **los tres textos son una base honesta escrita para este proyecto, no un
dictamen**: conviene que los lea la asesoría del bar antes de darlos por buenos.

---

### D-93 · Qué guarda la PWA sin conexión, y qué no

**Decisión:** el service worker del panel guarda **todas** las lecturas de la API
excepto dos colecciones: `metricas` y `users`. La aplicación (HTML, CSS y
JavaScript) va a red primero y a la copia solo si no hay red; las tipografías, al
revés.

**Por qué la lista es de excepciones y no de permitidas:** se probó con seis
colecciones elegidas a mano y la pantalla «Hoy» **mentía**: enseñaba «no hay nada
apuntado, el almacén está al día» con cinco faltas pendientes, porque la consulta
de avisos no estaba en la lista y su `catch` devuelve una lista vacía. Una
pantalla que miente sin conexión es peor que una que no carga. `metricas` no
sirve de nada sin red y `users` es la lista de cuentas del equipo con sus
correos: no tiene por qué estar guardada en un móvil que se deja en la barra.

**Por qué la aplicación va a red primero:** este proyecto se despliega editando
ficheros, sin compilación y sin versión en los nombres. Servir primero la copia
dejaría a Santi con el panel de la semana pasada sin que nadie se enterase.

**Y una banda que lo dice:** sin conexión aparece «Sin conexión · estás viendo lo
último que se guardó», encima de la barra inferior. Sin eso, el panel se pinta
igual de bien con datos de hace tres horas y quien lo mira da por buena una
pantalla sin reservas nuevas cuando lo que pasa es que el sótano no tiene
cobertura.

**Al salir de la sesión se borra la copia de datos.** Ahí dentro hay nombres y
teléfonos de gente que ha reservado, y el móvil del panel se queda en la barra.

**Probado con la red cortada** (`context.setOffline(true)`): el panel se abre,
«Hoy» enseña las siete reservas del día, los platos ocultos y las cinco faltas
pendientes, «Reservas» pinta el día entero y el recuento carga sus veinte
productos.

---

### D-94 · Los eventos pasados se atenúan al 60 %, no al 42 %

**Decisión:** la clase `.evento--pasado` usa `opacity: .6`; la maqueta usa `.42`.

**Por qué:** al 42 % el título de un evento pasado queda en **2,6:1** sobre la
crema, muy por debajo del 4,5:1 que exige WCAG AA, y sigue siendo texto que
alguien tiene que poder leer («Fiesta de la peña — gracias a los 80 que os
pasasteis»). Al 60 % da 4,6:1 y se distingue igual de bien de lo que está por
venir. Mismo criterio con el que se oscureció `--apagado` en D-17.

---

### D-95 · El presupuesto de 150 KB, con números de hoy (actualiza D-20)

**No es una decisión: es la medición al día.** D-20 se escribió en la fase 3 y
decía 152,4 KB. Con siete fases más encima, el número real es otro:

| | Bytes | Por el hilo (comprimido) |
|---|---|---|
| Para pintar la portada | **199,9 KB** (23 peticiones) | **133,1 KB** |
| Toda la visita, con la carta y las pantallas diferidas | 255,8 KB | 149,6 KB |

Dónde se ha ido: **95,8 KB de tipografías** (igual que en la fase 3, no ha
crecido ni un byte) y **43,0 KB de CSS**, que en la fase 3 eran 24,4. El resto
del crecimiento es el JavaScript de las pantallas que se han ido añadiendo.

De la fase 10, lo que suma es `metricas.js` (4,6 KB) y el CSS de eventos, pie y
textos legales (5,3 KB); lo que resta, las tres pantallas diferidas de D-87
(−26,9 KB). **La fase deja la primera carga más ligera de lo que estaba.**

**Lectura honesta del techo:** el encargo pone 150 KB. Por el hilo, que es lo que
tarda en llegar por 3G, la portada está en 133,1 KB y cumple. Contando bytes
descomprimidos, no. Las palancas que quedan, por orden de lo que dan:

1. **Fundir Alegreya Sans 800 en 700**: −12 KB, ya propuesto en D-20 y pendiente
   de que lo apruebe el cliente, porque toca el diseño.
2. **Repasar el CSS**: 43 KB para dos aplicaciones tiene grasa; hay reglas de
   pantallas que ya no existen tal cual.
3. **Diferir también `carta.js` y `ficha.js`** en quien entre por la portada.
   Cuesta un parpadeo al abrir la carta, y son 17 KB.

Se hace en la fase 11, que es la del repaso de rendimiento, y con el cliente
delante para lo de la tipografía.

---

### D-96 · Las reservas caducadas se borran de madrugada y por tandas

**Decisión:** un cron a las **04:15** borra las reservas anteriores al plazo de
`ajustes.meses_retencion_reservas` (12 meses por defecto), en tandas de 500.

**Por qué a esa hora:** el bar cierra a las 02:00 y la copia de seguridad se hace
a las 04:30. Borrando antes, la copia del día no arrastra lo que acaba de
caducar; borrando después, la copia guardaría un día más de datos personales de
los que toca.

**Por qué por tandas:** el día que esto se estrene sobre una base con años de
reservas dentro, 500 borrados seguidos bloquean SQLite un rato, y a las 04:15
todavía puede haber alguien reservando desde la web.

**Se borra la fila entera, no se anonimiza.** Sin nombre ni teléfono la reserva
no le sirve a nadie, y una fila «anónima» sigue diciendo que alguien cenó aquí el
3 de marzo a las 22:00 con siete personas.

**El plazo se toca desde el panel** («Más» → «Datos legales», solo el dueño) y es
el mismo número que la política de privacidad le promete al cliente: se cambia en
un sitio y cambian las tres cosas a la vez. El cálculo de la fecha está en
`pb_hooks/lib/retencion.js` y tiene seis pruebas unitarias, porque las fechas se
tuercen solas: restar doce meses al 31 de marzo y el cambio de hora de octubre
son dos formas conocidas de borrar un día de más.

---

### D-97 · Los avisos: una puerta, cinco disparos y un solo canal encendido

**Decisión:** existe `pb_hooks/lib/avisos.js` con una función `notificar(app,
tipo, datos)` y tres canales definidos. **En la v1 solo está encendido el del
diario del servidor.** Los de SMS y WhatsApp están escritos, no envían nada y
dejan constancia de que no están configurados.

Los cinco puntos de disparo de la sección 10 del encargo, y dónde están:

| Aviso | Dónde salta |
|---|---|
| Reserva creada **por la web** | `reservas.pb.js`, al guardarse |
| Reserva cancelada por el cliente | `reservas.pb.js`, en la ruta de cancelar |
| Producto marcado como **agotado** | `almacen.pb.js`, al apuntarse la falta |
| Recordatorio del recuento | `avisos.pb.js`, un cron a las 10:00 del día configurado |
| Cuadrante publicado | `avisos.pb.js`, ruta que llama el panel al copiarlo |

**Por qué una interfaz y no llamar al proveedor desde cada sitio:** para que el
día que se contrate una pasarela haya que tocar un fichero y no cinco, y para
que ninguna dependencia de un proveedor se meta en la lógica del bar. Es la
petición literal del encargo.

**Tres detalles que valen más que la interfaz:**

- **Solo las reservas de la web.** Las que apunta el equipo desde el panel las
  está escribiendo alguien que mira la pantalla; avisarle de lo que acaba de
  escribir es ruido. La de la web es la única cosa de este sistema que ocurre
  **sin nadie del bar delante**: puede caer a las once de la noche.
- **Solo el nivel «agotado»**, no «queda poco». Lo primero es un recado; lo
  segundo es que un plato de la carta ya no se puede servir.
- **`notificar()` no lanza nunca.** Un aviso que falla no puede tumbar la
  reserva que lo provocó: primero se guarda lo que importa y después se avisa, y
  si el aviso se pierde, se pierde. Hay una prueba unitaria que lo comprueba
  con un `app` roto a propósito.

**Qué haría falta para encender los otros dos canales** está en `docs/README.md`,
con la pregunta que hay que hacerle al cliente antes: **quién paga los
mensajes**. No es una decisión técnica.

---

## Lo que falta del encargo (encontrado en la fase 10)

Esto **no** son propuestas: son dos cosas que el encargo pide y que no están
construidas. Se apuntan aquí, con nombre y sitio, para que no se pierdan.

### F-01 · La sugerencia de ocultar platos cuando algo se agota

**Lo pide la sección 9.1 del encargo, y es un criterio de aceptación:** «Al
marcar un producto como agotado, el panel propone ocultar los platos que lo
llevan, sin hacerlo por su cuenta». La frase del encargo es literal: «Sin
huevos: ¿oculto huevos rotos, pisto con huevos y tortilla de patatas?», con un
botón para ocultarlos todos y otro para descartar, y lo simétrico al reponer.

**Estado: no construido.** Se marca un producto como agotado y no pasa nada más.
La fase 7 lo tenía en su enunciado y se quedó fuera.

**Y le falta la mitad de abajo:** la relación `platos.ingredientes` existe en el
modelo desde la fase 2, pero **la pantalla de editar plato no la dibuja**, así
que hoy ningún plato tiene ingredientes asignados y la sugerencia no tendría con
qué dispararse. La sección 7 del encargo pide ese selector expresamente: «un
selector opcional de ingredientes (productos del almacén) que alimenta las
sugerencias de la sección 9».

**Lo que hay hecho ya, y sirve:** el aviso de la sección 10 que salta al marcar
algo como agotado **ya cuenta cuántos platos visibles lo llevan** y lo dice
(«Lleva 3 platos en la carta: quizá haya que ocultarlos», D-97). Esa consulta es
exactamente la que necesita la sugerencia.

**Lo que falta, en orden:**

1. Selector de ingredientes en `panel/js/vistas/plato.js` (buscador + etiquetas,
   como los alérgenos, pero contra `productos`).
2. Al apuntar «se acabó» en `panel/js/vistas/falta.js`, buscar los platos
   visibles que lo llevan y, si hay, abrir una hoja con la lista, «Ocultarlos
   todos» y «Ahora no».
3. Lo simétrico al marcar el aviso como resuelto: «¿vuelvo a mostrarlos?».
4. Nunca automático: la carta la decide Santi.

### F-02 · Los manuales, el QR y el repaso de accesibilidad

Es la fase 11 y está por hacer: `docs/MANUAL-SANTI.md`, `docs/MANUAL-COCINA.md`,
`scripts/qr.js` y el repaso de accesibilidad y rendimiento (ahí entra bajar los
199,9 KB de la primera carga, ver D-95).

---

## Panel de administración (2026-09-14)

Unificación de roles, permisos comprobados en el servidor y el diario del
panel. Lo que se pidió: quitar «Próximamente», arreglar la estructura de «Del
negocio», añadir «Actividad» y dejar un solo rol superior.

---

### D-98 · Dos roles, no cuatro: `dueno` desaparece y nace `admin`

**Decisión (2026-09-14):** los cuatro roles de la sección 7 del encargo —`dueno`,
`encargado`, `cocina`, `empleado`— se quedan en **dos**: `admin` y `empleado`.
Migración `1757200000_rol_administrador.js`.

**Por qué ahora:** un año después, en la base había **dos cuentas de `dueno` y
una de `empleado`**. `encargado` y `cocina` no los usó nadie nunca. Cuatro roles
para tres personas no son un modelo de permisos: son cuatro sitios donde
equivocarse, cuatro ramas en cada regla de acceso y cuatro casos que probar. Y lo
que sí pasaba es que la persona que atiende la barra no podía ni mirar la lista
de reservas ni corregir la descripción de un plato, que es lo que hace todo el
día.

**Por qué `admin` y no `dueño`:** «dueño» describe a una persona —quién es el
titular del bar— y lo que hay que describir es un permiso: quién administra el
sistema. El día que Santi le dé acceso completo a su hija, «dueño» sería mentira
y «administrador» no. La palabra desaparece del producto entero: pantallas,
textos, hooks, pruebas, semillas y documentación. Solo sobrevive dentro de las
migraciones anteriores a esta, que cuentan lo que había, y en una prueba que
comprueba que ya **no** se puede poner.

**La conversión:** `dueno → admin`, y `encargado` y `cocina → empleado`. Nadie
pierde permisos: las dos cuentas de `dueno` pueden exactamente lo mismo, y la de
`empleado` **gana** reservas y carta. Los dos roles que nadie usaba se convierten
igual, para que la conversión sea segura el día que se restaure una copia vieja.

**El orden de la migración importa y está escrito allí:** primero se convierten
los datos con `UPDATE` directo y después se cambia el campo `select`. Al revés no
se puede —mientras el campo solo admita los valores viejos, guardar `admin` falla
la validación; en cuanto solo admita los nuevos, cualquier fila que siga en
`dueno` es inválida— y el `UPDATE` es lo único que no pasa por la validación.

**Dónde se partió lo que era `dueno || encargado`:**

| Antes | Ahora | Por qué |
|---|---|---|
| Reservas, platos y categorías | **cualquiera con sesión** | Es el trabajo del turno: quien coge el teléfono y quien sienta a la gente. |
| Proveedores, catálogo de productos, eventos, fichas del equipo, cuadrante, cerrar recuentos, estadísticas, ajustes, datos legales, cuentas y **todos los borrados** | **solo `admin`** | Es administrar el negocio, y el encargo lo deja fuera del empleado con todas las letras. |

**Los fichajes NO se abrieron** aunque ahora solo haya dos roles: el
administrador los ve todos y cada cual ve los suyos. Las horas de los demás no
son asunto de nadie (sección 12).

---

### D-99 · El precio de un plato lo cambia el turno, y queda escrito quién

**Decisión (2026-09-14):** se retira el candado de `precio_barra`,
`precio_terraza` y `admite_extras` que D-32 y D-43 le ponían al encargado. Un
empleado edita el plato **entero**.

**Por qué:** un plato que se puede editar entero *menos el número más importante*
es una regla que se explica bien en una conversación y fatal en una pantalla. Y
el encargo nuevo pide expresamente que el empleado pueda modificar los platos
existentes. Lo que hacía de verdad esa regla era empujar el trabajo a WhatsApp:
«Santi, que el café ha subido a 1,50».

**La garantía no desaparece, cambia de sitio y mejora.** Antes era un candado que
nadie podía saltarse y del que **no quedaba rastro**: si el precio lo cambiaba
quien sí podía, no había forma de saber quién ni cuándo. Ahora cada cambio de
precio queda en «Actividad» con el antes, el después, el nombre de quien lo hizo
y la hora (D-100). Para un bar de barrio eso resuelve el problema real —«¿quién
ha puesto esto a 19,50?»— mucho mejor que impedirlo.

Con el candado se va también el segundo hook de `pb_hooks/roles.pb.js`. El
primero —nadie se cambia el rol a sí mismo— **se queda**: ese sí es una escalada
de privilegios.

---

### D-100 · Actividad: un diario del panel, y una sola puerta para escribirlo

**Decisión (2026-09-14):** una colección `actividad` que guarda quién hizo qué,
sobre qué, cuándo y —para lo que lo merece— qué había antes y qué hay ahora. Se
escribe desde **un solo sitio**, `pb_hooks/actividad.pb.js`, con la lógica en
`pb_hooks/lib/actividad.js`, que se prueba suelta.

**Una puerta, no una llamada en cada pantalla.** La alternativa —que cada vista
apunte lo suyo— tiene dos problemas y los dos son graves: se olvida justo en la
pantalla nueva que alguien añada dentro de seis meses, y cada sitio redacta la
frase a su manera, así que el diario acaba hablando cuatro idiomas. Aquí las
colecciones auditadas son una lista de etiquetas en tres `onRecord*Request`.

**Por qué los hooks de petición y no los de «ya se ha guardado»**, que serían los
naturales: en PocketBase 0.40, `onRecordAfterUpdateSuccess` recibe un
`RecordEvent`, que **no lleva la petición dentro**. Sin `e.auth` no hay forma de
saber quién lo hizo, y un diario sin autor no es un diario. El de petición sí la
lleva. El precio es llamar a `e.next()` en medio: se mira el registro antes, se
deja que la operación ocurra, y **solo si no ha lanzado** se escribe la línea. Un
403 no es una acción, es un intento.

**El actor sale del token y de ningún otro sitio.** Nunca del cuerpo de la
petición. Es la diferencia entre un registro de auditoría y un cuaderno de
recados: si el navegador dice quién firma, cualquiera firma como cualquiera. Por
eso `actorDe(e)` solo lee `e.auth` y no existe ninguna forma de pasarle un
nombre.

**Nadie lo escribe desde fuera.** Las cuatro reglas de escritura de la colección
están en `null` —solo superusuario— y las líneas entran por `app.save()` desde el
hook, que no pasa por las reglas. Si `createRule` fuera `@request.auth.id != ""`,
cualquiera con sesión podría fabricarse una línea diciendo que fue otro quien
borró la reserva. **Tampoco se editan ni se borran**, ni siendo administrador: un
diario que se puede corregir no prueba nada.

**El nombre del autor se guarda copiado en la propia línea** (`actor_nombre`),
además de la relación. No es duplicar por duplicar: si alguien se cambia el
nombre, o si su cuenta desaparece, la línea de hace ocho meses tiene que seguir
diciendo quién era entonces. Por eso la relación tampoco borra en cascada.

**La frase se escribe una vez y se guarda hecha**, no se compone al pintar.
Dentro de un año el plato se llamará de otra forma, o no existirá, y «María
cambió el precio de Cachopo» tiene que seguir siendo verdad.

**Lo que no entra, y las tres razones:**

1. **La web pública.** Sin sesión no se apunta nada. El diario es de las acciones
   del equipo; lo que hace la gente en la carta ya se cuenta, sin identificar a
   nadie, en `metricas`.
2. **El superusuario de `/_/`.** No es una persona del negocio: es la válvula de
   escape para arreglar la base, y por ahí entran las migraciones y las pruebas.
   Si se auditara, cada pasada de pruebas dejaría cien líneas falsas.
3. **Un guardado que no cambia nada.** El panel repinta pantallas enteras y manda
   el registro completo en cada `PATCH`. Sin ese filtro, abrir un plato y
   cerrarlo dejaría una línea, y el diario dejaría de servir para lo único que
   está.

**Qué no se guarda nunca:** contraseñas, hashes, `tokenKey`, tokens y claves se
quitan enteros. Los datos de contacto de un **cliente** —teléfono, correo— se
marcan como cambiados pero no se copian: quien reserva una mesa no ha dado su
teléfono para acabar en un registro de auditoría. Hay dos cierres para esa
puerta: `publicExport()` ya deja fuera los campos ocultos de PocketBase, y encima
va la lista negra de `lib/actividad.js`. Cuando detrás hay contraseñas, dos.

**Se engancha al acceso por contraseña y no a `onRecordAuthRequest`**, que es el
que parece: aquel salta también en cada `authRefresh()`, y el panel refresca la
sesión cada vez que se abre. El diario se llenaría de «Santi inició sesión»
cuatro veces por turno.

**Salir necesita una ruta propia** (`POST /api/quijote/salir`). PocketBase no
tiene cierre de sesión —el token es un JWT y el navegador lo olvida—, así que el
panel avisa **antes** de tirarlo, que es cuando el aviso todavía va firmado. No
se espera respuesta ni se mira si falla: quien pulsa «Salir» tiene que salir haya
red o no.

**La retención es la misma que la de las reservas** (12 meses por defecto,
`ajustes.meses_retencion_reservas`), y eso no es comodidad. Una línea dice «Santi
modificó la reserva de Marta García»: ahí está el nombre de una clienta. Si el
diario durase más que la reserva, el borrado de D-96 no serviría de nada y la
promesa de la política de privacidad sería mentira por la puerta de atrás.

**Los índices** son `(creado DESC)` —la consulta de siempre— y
`(actor, creado DESC)` y `(recurso, creado DESC)`, que son los dos filtros de la
pantalla. La fecha va dentro de los dos últimos porque el orden es siempre el
mismo: sin esa segunda columna, filtrar por persona obliga a SQLite a ordenar a
mano lo que encuentre.

---

### D-101 · Una fila que se pulsa se escribe una sola vez, venga de donde venga

**Decisión (2026-09-14):** en «Más», todas las filas se construyen con la misma
función, lleven a una ruta (`<a>`) o abran una hoja (`<button>`). Y `.fila-ir`
lleva `width: 100%` y `text-align: left`.

**El fallo que arregla:** «Horario del bar» y «Datos legales» salían **apretadas
una al lado de la otra**, como dos tarjetas estrechas, mientras el resto de
opciones ocupaba la fila entera. Eran las dos únicas que se escribían a mano con
un `<button>` en vez de pasar por `filaIr()`.

**La causa, que conviene tener escrita:** un `<a>` con `display: flex` dentro de
un bloque ocupa el ancho disponible sin más. **Un `<button>` no**: el navegador
lo mide por su contenido aunque se le ponga `display: flex`, así que dos seguidos
se encogen y comparten línea. Es el mismo par de líneas que `.reserva` ya llevaba
por el mismo motivo.

**Por qué el arreglo va en los dos sitios.** El CSS tapa el síntoma para
cualquier `<button class="fila-ir">` futuro, venga de donde venga. La función
común elimina la causa: ya no hay dos maneras de escribir una fila que se pulsa,
así que no puede volver a divergir. Un `@media` para 390 px habría escondido el
problema hasta el siguiente tamaño de pantalla.

---

### D-102 · Fuera «Próximamente»

**Decisión (2026-09-14):** se elimina de «Más» la sección «Próximamente» con sus
dos líneas —«QR de las mesas y manuales» y «Avisar de los platos que llevan algo
agotado»—, y con ella su CSS (`.futuro`).

**Por qué:** era texto muerto. Dos renglones que no llevaban a ninguna parte,
ocupando sitio en una herramienta que se usa de pie y con prisa. Una lista de
promesas dentro de un panel de trabajo no informa: estorba. Lo que falta por
construir vive en `docs/README.md`, que es donde se mira para saberlo.

Las dos funcionalidades **siguen pendientes** y no se han tocado: no había nada
de backend detrás, solo los dos textos.

---

## Propuestas

Ideas que **no** se han construido porque no están en el encargo. Anotadas aquí
para decidirlas más adelante (sección 15).

### P-01 · Etiquetas de «Vegetariano» y «Pica»

La maqueta del cliente dibuja, en `Patatas bravas`, dos etiquetas verde y roja
con «Vegetariano» y «Pica», además de las de alérgenos. **El modelo de datos de la
sección 5 no las contempla**: `platos` solo tiene `alergenos`, con los 14
oficiales de la UE.

No se han inventado campos. Hoy se pintan solo las etiquetas de alérgeno, con el
mismo estilo `.tag` de la maqueta; los tokens de color de las otras dos
(`--veg`, `--veg-bg`, `--error-bg`) ya están en `tokens.css`, así que añadirlas
sería un campo `select` en `platos` y tres líneas de vista.

**Decisión para el cliente:** ¿se añaden dos marcas más al plato, o se dejan solo
los alérgenos?

### P-02 · Entrada de mercancía recibida

Lo menciona el propio encargo (sección 9.2) como algo que **no va en la v1**.
Anotado para no perderlo: sin registro de entradas no se pueden calcular
consumos, y calcularlos sin ese dato daría un número falso.

### P-03 · Gestionar las categorías

Hoy las categorías se crean con el importador de CSV (`importar-carta`) y no se
pueden renombrar, reordenar, ocultar ni crear desde el panel: **la maqueta no
dibuja ninguna pantalla para eso**, y no se ha inventado una. La cabecera de
grupo es un botón, pero solo pliega la categoría (D-81); no la edita.

Se nota en un caso concreto: para crear un plato hay que elegir una categoría
que ya exista. Si el bar quiere una sección nueva («Menú del día»), hoy hay que
volver a importar el CSV o entrar en `/_/`.

**Decisión para el cliente:** ¿se añade una pantalla de categorías —nombre,
orden y visible—, o se quedan como están, que cambian una vez al año?

### P-04 · Los campos en inglés no están en la pantalla de editar — HECHO

*Resuelta en la fase 10, ver **D-89**.* La pantalla de editar plato y la hoja de
evento tienen ya sus dos campos en inglés.

**Queda un cabo:** `categorias` también tiene `nombre_en`, y las categorías no se
editan desde el panel (ver P-03). Mientras eso siga así, los nombres de categoría
en inglés solo se pueden poner importando el CSV o entrando en `/_/`.

### P-05 · El campo `destacado` no lo usa nadie

`platos.destacado` existe en el modelo desde la fase 2 y **no lo lee ninguna
pantalla**, ni la pública ni el panel. O se le da un uso (una franja de
«sugerencias del chef» en la portada, por ejemplo) o se quita del modelo. Un
campo que nadie escribe ni lee acaba confundiendo a quien lo encuentre.

### P-06 · Las faltas resueltas no se ven en ninguna parte

Un aviso resuelto desaparece de la pantalla y se queda en la base con su fecha
de reposición. **No hay ningún sitio donde consultarlo**: ni un historial, ni un
«esto se ha agotado seis veces este mes».

No se ha construido porque el encargo no lo pide y porque la sección 12 prohíbe
medir a las personas —y un historial mal leído se convierte en eso—. Pero el
dato ya está guardado, y una lista de «lo que más se acaba» **por producto**, sin
nombres, sería útil para ajustar los mínimos.

**Decisión para el cliente:** ¿se enseñan las faltas resueltas de las últimas
semanas, agrupadas por producto y sin nombres de personas?

### P-07 · El pedido no se guarda como documento

La lista de pedido **se calcula cada vez** a partir de las líneas del último
recuento cerrado. No hay un registro de «pedido hecho el domingo a Cárnicas
Ramos, con estas cantidades»: si alguien cambia una cantidad después de llamar,
la lista cambia y no queda rastro de lo que se pidió.

No se ha construido porque el encargo no lo pide y porque un pedido guardado
empuja hacia el albarán, la entrada de mercancía (P-02) y, de ahí, hacia la
valoración del almacén, que está prohibida por encargo.

**Decisión para el cliente:** ¿hace falta guardar lo que se pidió y a quién, o
basta con la lista del momento?

---

### P-08 · Datos laborales de verdad en la ficha (DNI, Seguridad Social, contrato)

La ficha del equipo se ha quedado en lo que hace falta para el cuadrante y las
horas (D-74). Un bar que quiera llevar aquí **todo** el papeleo del personal
necesitaría además DNI, número de la Seguridad Social, tipo de contrato, fecha de
fin si es temporal y quizá una copia del contrato firmado.

**No se ha construido a propósito.** Son datos personales de otra categoría: la
sección 12 del encargo restringe expresamente lo que se guarda de las personas, y
meter un DNI en la base cambia las obligaciones de protección de datos del bar
(registro de actividades de tratamiento, plazos de conservación, quién puede
verlos). Eso se pregunta antes de escribirlo, no después.

Si el cliente lo pide, lo razonable sería: campos aparte, visibles **solo para el
administrador**, y un borrado automático a los cuatro años de la baja, que es lo
que pide la normativa de registro de jornada.

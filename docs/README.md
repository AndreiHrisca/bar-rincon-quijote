# El Rincón del Quijote

Carta digital, reservas, personal y almacén para el bar El Rincón del Quijote
(Ciudad de los Ángeles, Madrid).

- `https://barrinconquijote.es` — carta pública y reservas. Es la URL del QR de las mesas.
- `https://barrinconquijote.es/panel` — panel de gestión.
- `https://barrinconquijote.es/api` y `/_/` — PocketBase.

> **TODO antes de publicar:**
>
> 1. **Los precios de la carta.** Los 278 platos están cargados sin precio, así
>    que la carta pública está vacía a propósito (D-76). En cuanto haya precios,
>    salen solos.
> 2. **Confirmar los alérgenos.** Los que hay son los que estimó el cliente y
>    venían marcados como «estimado» en su lista. La información de alérgenos es
>    obligatoria por ley (Reglamento UE 1169/2011) y de ella responde el bar: hay
>    que repasarlos plato por plato.
> 3. **El logo.** La silueta de don Quijote y Sancho de `compartido/img/logo.svg`
>    (y embebida en las páginas) es una **reproducción hecha a ojo** desde una
>    foto del menú impreso. Hay que sustituirla por el original vectorizado.

---

## Estado

| Fase | Qué es | Estado |
|---|---|---|
| 1 | Esqueleto: Compose, PocketBase, Caddy, migraciones, tokens, tipografías | **hecha** |
| 2 | Modelo de datos, reglas de acceso, semillas e importadores | **hecha** |
| 3 | Web pública: portada, carta y ficha de plato | **hecha** |
| 4 | Reservas de principio a fin | **hecha** |
| 5 | Panel: acceso, roles, hoy y reservas | **hecha** |
| 6 | Panel: carta y edición de plato | **hecha** |
| 7 | Almacén: productos, proveedores y avisos de falta | **hecha** |
| 8 | Almacén: recuento sin conexión y lista de pedido | **hecha** |
| 9 | Personal: cuadrante, fichajes e informes | **hecha** |
| 10 | Eventos, estadísticas, idiomas, textos legales, PWA | **hecha** |
| 11 | Pruebas, documentación, manuales, QR, accesibilidad | pendiente |

---

## Cómo se levanta en local

Solo hace falta Docker. No hay Node, ni npm, ni paso de compilación: el frontend
son ficheros estáticos que se sirven tal cual.

```bash
docker compose up -d
```

Eso levanta tres contenedores:

| Contenedor | Qué hace |
|---|---|
| `quijote-pocketbase` | Base de datos, autenticación y API. Puerto 8090, solo en la red interna. |
| `quijote-web` | Caddy: sirve los estáticos y hace de proxy a PocketBase. Puerto 8080, solo en la red interna. |
| `quijote-copias` | Copia de seguridad diaria a las 04:30, con rotación de 14 días. |

**La primera vez** hay que crear el usuario administrador de PocketBase:

```bash
docker exec -it quijote-pocketbase pocketbase superuser upsert tu@correo.es 'una-clave-larga'
```

Para verlo desde el navegador del portátil, publica el puerto temporalmente:

```bash
docker compose run --rm --service-ports -p 8080:8080 web
```

### Cargar datos

**`seed/carta.csv` es LA CARTA REAL DEL BAR** desde el 2026-09-04: 278 platos en
15 categorías, con sus descripciones y sus alérgenos. Las filas de ejemplo que
había antes se borraron. `seed/productos.csv` sigue siendo de ejemplo: el almacén
real lo aporta el cliente.

```bash
# Almacén primero: la carta puede referenciar productos como ingredientes
docker exec -w /pb quijote-pocketbase pocketbase importar-productos seed/productos.csv --dir=/pb/pb_data
docker exec -w /pb quijote-pocketbase pocketbase importar-carta     seed/carta.csv     --dir=/pb/pb_data
```

Los dos importadores son **idempotentes**: identifican por nombre —y la carta,
por nombre **y categoría**, porque hay platos que se llaman igual en dos sitios
(D-77)—, así que reimportar el mismo fichero actualiza en vez de duplicar. Se
puede corregir un precio en el CSV y volver a lanzarlo.

> **La carta llegó SIN PRECIOS.** Un plato sin precio se guarda, se ve en el
> panel y **no sale en la carta pública**: lo impide la regla de acceso de la
> colección, no la pantalla (D-76). Mientras no haya precios, la carta pública
> está vacía. Para ponerlos: se rellenan las columnas `precio_barra` y
> `precio_terraza` del CSV y se reimporta, o se teclean plato a plato desde el
> panel.

Para ver el panel lleno mientras se construye (reservas, empleados, cuadrante,
fichajes, un recuento cerrado y varios avisos de falta):

```bash
docker exec -w /pb quijote-pocketbase pocketbase demo --dir=/pb/pb_data
```

> Todo lo que genera `demo` es **ficticio** y lleva la marca `[DEMO]`. Volver a
> lanzarlo borra lo anterior y lo regenera. **Nunca contra producción.**

Desde la fase 5 el panel pide usuario y contraseña, así que `demo` crea también
**cuentas de los dos roles**: una que administra y tres del turno, que es como
es un bar de verdad. Sirven para probar qué ve cada uno:

| Usuario | Rol | Correo (también vale para entrar) |
|---|---|---|
| `santi` | administrador | `santi@ejemplo.invalid` |
| `marisa` | empleado | `marisa@ejemplo.invalid` |
| `kevin` | empleado | `kevin@ejemplo.invalid` |
| `lucia` | empleado | `lucia@ejemplo.invalid` |

La contraseña de las cuatro es `demo-2026-quijote`. El dominio `.invalid` está
reservado por norma y no existe: no se le puede escribir a nadie por error.

> Si la base ya tiene una cuenta de verdad con uno de esos nombres —pasa al
> probar sobre una copia de la de producción, donde `santi` es una cuenta
> real—, la de mentira se crea como `santi-demo` y el comando lo dice. **La
> cuenta de verdad no se toca nunca.**

**La primera cuenta de producción** la crea el superusuario desde `/_/`, o así:

```bash
docker exec quijote-pocketbase pocketbase superuser upsert tu@correo.es 'clave-larga'
# y desde /_/ , en la colección "users", una cuenta con rol = admin
```

A partir de ahí, **las demás cuentas se crean desde el panel**: Personal → El
equipo → Cuentas de acceso, con el `+`. Solo el administrador. El correo es
opcional: se entra con el nombre de usuario (`DECISIONES.md`, D-72).

### El panel

Está en `/panel` y **no se indexa** (cabecera `X-Robots-Tag` y `meta robots`).
Se entra con usuario y contraseña; vale el correo o el nombre de usuario.

| Pantalla | Qué hay |
|---|---|
| **Hoy** | Reservas y comensales del día, escaneos del QR, platos agotados con desde cuándo, próximas reservas, lo que falta en el almacén y quién está fichado ahora. |
| **Reservas** | El día partido en comida y cena, con la zona en cada línea. Tira de días con un punto donde hay algo apuntado. Buscador por nombre, teléfono o código. |
| **Carta** | Los platos por categorías con los dos precios y el interruptor de disponible. Buscador, reordenar arrastrando y ficha de plato con foto. |
| **Personal** | El cuadrante de la semana, por días. Los huecos que no cubre nadie, en granate. De aquí cuelgan los fichajes y las fichas del equipo. |
| **Más** | Con qué cuenta se ha entrado, el botón de salir y la puerta de los eventos, las estadísticas y el almacén. |
| **Eventos** | Cuelga de «Más». El menú navideño, los vermús y las celebraciones que se anuncian en la web. Los pasados no se borran: sirven de borrador para el año que viene. |
| **La carta en números** | Cuelga de «Más». Escaneos del QR por día, platos más mirados y lo que se busca y no está. Consultas de la carta, **no ventas**. |
| **Datos legales** | Cuelga de «Más», solo el administrador. Quién figura como titular de la web y cuántos meses se guardan las reservas. |
| **Almacén** | Cuelga de «Más». Las faltas apuntadas arriba, el catálogo agrupado por ubicación y los proveedores al final. |
| **Apuntar una falta** | Dos toques: se toca el producto y se dice si queda poco o si se ha acabado. La usa todo el equipo. |
| **Recuento** | El recorrido del almacén con las cantidades. **Funciona sin cobertura**: lo tecleado se guarda en el móvil y se manda solo. |
| **Lista de pedido** | Lo que sale del recuento, agrupado por proveedor y ordenado por quién reparte antes. Se copia como texto para WhatsApp. |
| **Fichajes** | Cuelga de Personal. Los turnos sin cerrar arriba del todo, lo fichado estos días por jornadas y el resumen del mes. El informe se descarga como CSV. |
| **El equipo** | Cuelga de Personal. Las fichas: nombre, puesto, desde cuándo, horas contratadas, teléfono y con qué cuenta entra cada cual al panel. |
| **Cuentas** | Cuelga de «El equipo». Quién puede entrar al panel, con qué usuario y qué puede hacer. Las crea y las borra el administrador. |
| **Actividad** | Cuelga de «Más», solo el administrador. Quién ha hecho cada cambio en el panel, con el antes y el después. Filtros por persona, por tipo de cosa y por día. |

Lo que cada rol ve y puede es **lo mismo** que dicen las reglas del servidor: a
un `empleado` no se le pinta el engranaje de ajustes ni la entrada de
«Actividad», porque tampoco se los dejaría usar la API.

**Tocar una reserva** abre su ficha: teléfono con enlace para llamar, código,
notas y las cuatro pastillas de estado, que guardan al momento. Cancelar
pregunta antes, porque es lo único que no se deshace de un toque.

**El botón grande** apunta una reserva de teléfono. Ahí el panel **avisa pero no
prohíbe**: marca las franjas llenas o pasadas y deja guardar igual, porque al
teléfono manda quien coge el teléfono (`DECISIONES.md`, D-27).

#### La carta, desde el panel

El gesto de cada día es **el interruptor de la línea**: se acaban las croquetas y
se apagan desde la barra, en un toque. No las borra — siguen en la carta, en gris
y con un «Oculto desde el sábado» que dice cuánto llevan apagadas — y vuelven con
otro toque.

- **Sin precio no hay carta.** Un plato al que le falta el precio de barra sale
  marcado en marrón con «Sin precio», y arriba del todo se dice cuántos hay. No
  aparece en la carta pública aunque esté encendido, porque una carta es una
  lista de precios (D-76). Es el estado en el que está hoy la carta entera.
- **Reordenar**: el asidero `⠿`. Se arrastra con el dedo, y estando enfocado con
  el tabulador se mueve con las flechas arriba y abajo. Ese orden es el de la
  carta pública.
- **El `+`** crea un plato nuevo; va al final de su categoría.
- **La foto** se puede hacer con la cámara del móvil. Se encoge sola a 1600 px
  antes de subirla, así que da igual el tamaño que tenga (y así entran también
  las fotos HEIC de un iPhone, que la colección no aceptaría tal cual).
- **Los alérgenos** son los 14 obligatorios por ley, como etiquetas que se tocan.
- **Eliminar un plato** solo lo hace el administrador y pide confirmación. Casi
  nunca es lo que se quiere: para un plato que se ha acabado, el interruptor.

**La carta la mantiene todo el equipo**, precios incluidos: es lo que se hace a
diario y un empleado que no puede corregir una descripción acaba avisando por
WhatsApp a alguien que sí. La garantía no es el candado, es el rastro: cada
cambio de precio queda en «Actividad» con el antes y el después
(`DECISIONES.md`, D-99).

#### El almacén, desde el panel

El almacén **no tiene entrada propia en la barra inferior**: la barra tiene las
cinco de la maqueta y no se toca (`DECISIONES.md`, D-33). Cuelga de **Más**, y
lo que se hace todos los días —apuntar que falta algo— está además en **Hoy**,
que es donde se está cuando se descubre que no queda harina (D-46).

Son **dos flujos que no se mezclan**, y por eso son dos colecciones distintas:

- **La falta rápida**, durante el servicio. Dos toques, sin cantidades y sin
  formulario. El aviso se arrastra de un día a otro hasta que alguien lo
  resuelve: ese es justo el problema del papel que esto viene a arreglar.
- **El recuento del domingo**, con cantidades y recorrido físico, del que sale la
  lista de pedido. Llega en la **fase 8**.

Lo que hay que saber del día a día:

- **Apuntar una falta** la puede usar todo el equipo, cocina incluida: es su
  función principal en el sistema. Lo que más se acaba sale arriba, porque el
  orden lo pone cuántas veces se ha apuntado cada cosa.
- **Si falta algo que no está en la lista**, se escribe y se da de alta con solo
  el nombre. Queda marcado como «sin configurar» —en la lista se ve en marrón,
  diciendo qué le falta— hasta que alguien le pone unidad, mínimo y proveedor.
  La marca la pone y la quita **el servidor** (`pb_hooks/almacen.pb.js`).
- **Resolver una falta** es el `✓` de la línea, y también lo puede hacer
  cualquiera: si alguien repone la harina, la marca quien pasa por ahí.
- **Quién apuntó cada falta** se ve, pero lo escribe el servidor desde la sesión,
  no el navegador. No se cuenta ni se ordena por persona: nada de rankings
  (sección 12 del encargo).
- **El catálogo** —unidades, mínimos, proveedores, ubicaciones— solo lo toca el
  administrador. A un empleado la lista le sale entera pero de solo lectura, sin
  el `+` y sin filas que se abran. Dar de alta un producto **al vuelo**, con solo
  el nombre, sí lo hace cualquiera: es el gesto de la cocina.
- **Un producto que ya no se compra** no se elimina: se apaga con «En uso». Así
  deja de salir en el recuento y en la lista de pedido, y los recuentos viejos
  siguen cuadrando. Eliminar solo lo hace el administrador, y un producto que aparece en
  algún recuento **no se puede borrar**: la base lo impide a propósito.
- **La ubicación no es una etiqueta**: es el orden en que se camina el almacén, y
  es por donde se agrupa la lista y por donde irá el recuento.

Aquí **no hay precios**: ni de coste, ni valoración en euros, ni escandallos, ni
caducidades. Es la libreta del almacén, bien hecha (sección 2 del encargo).

#### El recuento y el pedido

El recuento se hace el domingo, en el sótano, y **allí no hay cobertura**. Es el
requisito que manda en esa pantalla:

- **Nada espera al servidor.** Lo tecleado se guarda al momento en el navegador
  y se manda cuando se puede. Arriba, pegada, una banda dice cuánto llevas
  contado y **cuántas líneas quedan por mandar**. Eso no es un error y no se
  pinta como tal: en el sótano es lo normal.
- **Se reintenta solo**: al volver la señal, cada pocos segundos mientras queden
  pendientes, y al volver a entrar en la pantalla. Lo pendiente sobrevive a
  cerrar el navegador y a quedarse sin batería.
- **Que se envíe dos veces no duplica nada**: `recuento_lineas` tiene índice
  único por `(recuento, producto)`, así que la segunda choca contra el índice y
  se convierte en una actualización (`DECISIONES.md`, D-13 y D-54).
- **Solo puede haber un recuento abierto.** «Empezar el recuento» continúa el que
  esté a medias en vez de abrir otro: es lo que evita que dos móviles en el
  sótano se pisen.
- **El cero se puede contar.** Un campo vacío es «no lo he mirado» y un cero es
  «no queda nada», que es la respuesta más importante del recuento. Se puede
  saltar productos y volver.

**Contar lo hace cualquiera** del equipo: baja al almacén quien baja. **Cerrar**
—que es lo que congela la lista de pedido— solo el administrador, y eso lo
comprueba el servidor. Un recuento cerrado **se puede volver a abrir** para
corregir; mientras está cerrado, lo contado no se toca, aunque la cantidad a
pedir sí (D-59).

La **lista de pedido** sale sola al cerrar:

- Agrupada por proveedor, y los proveedores **por quién reparte antes**: el del
  pescado que viene el martes no espera lo mismo que el que viene el viernes.
- Cada línea trae una cantidad sugerida —`pedido_habitual` si está puesto, y si
  no, lo justo para volver al mínimo— **que se corrige a mano**, y un interruptor
  para quitar o añadir productos que el mínimo no marcó.
- Con el `⊞` de la cabecera se ve **todo lo contado**, no solo lo que falta:
  sirve para añadir algo a mano.
- Al final, **las faltas que apuntó el equipo** y que no están en la lista.
  Míralas antes de llamar.
- **Copiar la lista** la deja en el portapapeles como texto para pegarla en
  WhatsApp. No se manda nada desde aquí: no hay pasarela de SMS ni de correo en
  la v1 y no se promete lo que no se hace.

Aquí tampoco hay precios: ni de coste, ni total del pedido, ni valoración del
almacén (sección 2 del encargo).

#### El personal, desde el panel

**Personal** se abre por el **cuadrante**, que es lo que se mira todos los días.
De él cuelgan **Fichajes** y **El equipo**, con dos filas al final de la
pantalla: la barra inferior tiene las cinco entradas de la maqueta y no se toca
(`DECISIONES.md`, D-33 y D-64).

**El cuadrante** es la semana por días en vertical, no una rejilla: siete
columnas en 390 px no se leen. Cada día dice de qué hora a qué hora hay alguien
y, en granate, **el servicio que no cubre nadie** — se mide contra el horario de
cocina de los ajustes, que es el único horario que el sistema conoce. Con `‹` y
`›` se cambia de semana; hoy va marcado con un filo granate.

- **Poner un turno** es el `+ Añadir turno` del día. Solo el administrador.
- Un turno que **acaba antes de empezar** es el de noche y cruza la medianoche:
  `19:00`–`02:30` son siete horas y media.
- El panel **avisa pero no prohíbe** (D-27): si el turno se pisa con otro de esa
  misma persona o dura más de diez horas, lo dice y deja guardar igual.
- **Avisar del cuadrante al equipo** copia la semana como texto para pegarla en
  el grupo de WhatsApp. No se manda nada desde aquí.

**Fichar** la entrada y la salida se hace desde **Hoy**, en la tarjeta «En turno
ahora», que es donde se está al levantar la persiana (D-62). También está en
Fichajes. El botón solo sale si la cuenta tiene **ficha de empleado enlazada**;
ese enlace se pone en la ficha del equipo.

- **La hora la pone el servidor**, la de entrada y la de salida. El reloj del
  móvil se cambia en dos toques y un registro de jornada que se fía de él no
  vale (D-63).
- **Nadie ficha por un compañero.** El administrador sí, y entonces queda
  firmado quién lo hizo.
- **No se ficha dos veces**: con un turno abierto, lo que toca es cerrarlo.

**La pantalla de Fichajes** saca arriba del todo lo que de verdad importa: **el
turno que alguien se dejó sin cerrar** un día que ya pasó. No suma horas mientras
siga abierto, así que es lo que rompe el informe del mes. Debajo van los días,
del más reciente al más antiguo, y el resumen del mes en curso.

- **Corregir una hora** solo lo hace el administrador, y queda firmado en el
  fichaje (se ve un `✎` en la línea). Con el `+` se apunta a mano el fichaje de
  quien se dejó el móvil en casa.
- **El informe del mes** es el `⇩` de la cabecera: se elige el mes, se ven las
  horas de cada cual y se descarga un **CSV** que se abre en cualquier hoja de
  cálculo. Es lo que se le manda a la gestoría.
- Las **jornadas sin cerrar no suman** y se cuentan aparte: una jornada abierta
  no es una jornada de cero horas, es una que no sabemos cuánto duró.

**El equipo** son las fichas de quien trabaja aquí: nombre, iniciales, color del
cuadrante, **puesto**, **desde cuándo** (con la antigüedad ya calculada), **horas
por semana** del contrato, teléfono, notas y —lo que de verdad importa— **con qué
cuenta entra esa persona al panel**. Ese enlace es lo que hace que cada cual vea
SUS horas y las de nadie más.

- Las crea, las edita y las elimina el **administrador**.
- Quien ya no trabaja aquí **no se elimina**: se apaga «Trabaja aquí», y el
  servidor apunta la fecha de la baja (D-75). Si tiene horas fichadas, el
  servidor **ya no deja borrar la ficha**: se llevaría por delante su registro de
  jornada, que es lo único del sistema que hay que poder enseñar años después.
- **Aquí no hay DNI, ni dirección, ni número de la Seguridad Social.** Es una
  decisión legal, no un olvido (`DECISIONES.md`, D-74 y P-08).

**Las cuentas de acceso** son otra cosa, y por eso son otra pantalla, colgando de
«El equipo»: la ficha dice quién trabaja aquí, la cuenta es una llave. Puede
haber fichas sin cuenta (quien no entra nunca al panel) y cuentas sin ficha (el
gestor). Enlazarlas se puede desde los dos lados, y desde la ficha se le puede
**crear la cuenta a esa persona de una vez**.

- **Se entra con el nombre de usuario** —`santi`, `marisa`—, que es lo que dibuja
  la maqueta. El correo vale también, pero es **opcional**: el bar no manda
  correos, así que no hace falta inventarse uno para cada persona (D-72).
- **Solo el administrador** crea cuentas, cambia roles y borra. Un empleado solo
  se ve a sí mismo en esa lista.
- **La contraseña y el correo los cambia el administrador** desde la cuenta, porque no
  hay correo saliente para un «he olvidado mi contraseña» (D-29 y D-69). La
  contraseña se ve mientras se escribe, para poder dictarla; las sesiones que
  hubiera abiertas se cierran al momento.
- **Nadie borra su propia cuenta**, ni se borra la última de administrador: es la forma
  más rápida de quedarse fuera del panel para siempre.

Las horas **no se cuentan por persona más allá de esto**: nada de rankings ni de
medias (sección 12 del encargo).

### Eventos: «Qué se cuece»

La sexta pantalla pública. Se llega desde el bloque de **celebraciones** de la
portada (`DECISIONES.md`, D-85) y enseña primero lo que está por venir y luego,
en gris, lo que ya pasó.

Se escriben desde el panel, en **Más → Eventos**: título, descripción, fecha (o
tramo de fechas, para el menú navideño), hora, precio por persona, una imagen
opcional y el interruptor de visible. Los crea, los edita y los borra el
administrador: anunciar algo en la web es administrar el negocio, no trabajo del
turno.

**Los eventos pasados no se borran.** El menú navideño del año que viene se hace
abriendo el de este, cambiándole las fechas y volviendo a encenderlo.

En la pantalla pública, el precio va pegado al título («Menú navideño · 40,00 €»)
y un evento sin precio no enseña ningún cero.

### Actividad: quién ha hecho cada cambio

Cuelga de «Más» → **Gestión**, y **solo la ve el administrador**. Es el diario
del panel: una línea por cada cosa que alguien del equipo hace aquí dentro.

```
12:48   María
        María confirmó la reserva de Laura Pérez
        Estado   pendiente → confirmada

12:48   María
        María modificó la reserva de Laura Pérez
        Personas   2 → 4
        Hora       20:00 → 21:00

12:20   Santi
        Santi inició sesión
```

**Para qué está.** Para contestar «¿quién cambió el precio del cachopo?» y
«¿quién canceló la mesa de los Ortega?» sin preguntar y sin tener que creerse la
respuesta. La mitad de las veces la respuesta es «se tocó sin querer» y lo único
que hace falta es saber **qué deshacer**.

**Qué se apunta.** Prácticamente todo lo que se hace desde el panel: entrar,
salir y los intentos de acceso fallidos cuando sabemos a quién iban dirigidos;
reservas (crear, modificar, cambiar de estado, confirmar, cancelar, borrar);
platos y categorías (crear, editar, precio, descripción, categoría, foto,
alérgenos, quitar de la carta, borrar); eventos; productos y proveedores; faltas
del almacén (apuntarlas, cambiarles la gravedad, resolverlas); recuentos; fichas
del equipo; turnos; fichajes; cuentas y cambios de rol; y los ajustes del bar,
que incluyen el horario y los datos legales.

**Qué NO se apunta, a propósito:**

- **Lo que hace la web pública.** Una reserva desde el móvil de un cliente llega
  sin sesión y no deja línea: el diario es de las acciones del equipo. Lo que
  hace la gente en la carta ya se cuenta, y sin identificar a nadie, en «La carta
  en números».
- **Lo que se hace desde `/_/`** con el superusuario de PocketBase. No es una
  persona del negocio: es la válvula de escape para arreglar la base a mano, y
  por ahí entran también las migraciones y las pruebas.
- **Un guardado que no cambia nada.** El panel manda el registro entero en cada
  PATCH; sin este filtro, abrir un plato y cerrarlo dejaría una línea.
- **Contraseñas, hashes, tokens y los datos de contacto de un cliente.** Si el
  teléfono de una reserva cambió, la línea dice que cambió, pero no a qué.

**Quién firma cada línea lo dice el token, nunca el navegador.** Eso es lo que
hace que el diario valga para algo: no hay forma de mandar una petición diciendo
que la hizo otro.

**Nadie escribe, corrige ni borra el diario**, tampoco el administrador. Las
cuatro reglas de escritura de la colección están cerradas y las líneas las pone
el servidor por dentro. Lo único que lo recorta es el borrado automático de
madrugada, **con el mismo plazo que las reservas** (12 meses por defecto): una
línea dice «Santi modificó la reserva de Marta García», y ahí está el nombre de
una clienta. Si el diario durase más que la reserva, borrar la reserva no
serviría de nada.

**Los filtros** —la lupa de la cabecera— son por persona, por tipo de cosa y por
día, y se combinan. La lista se trae de 40 en 40 con un «Ver más» al final.

### Textos legales

Tres pantallas colgadas del pie de la portada: **aviso legal**, **política de
privacidad** y **política de cookies**. Son módulos que **solo se descargan si
alguien entra ahí** (D-87), así que no pesan en la carga de la carta.

**No hay banner de cookies, y es correcto que no lo haya**: la web no usa ni una
cookie, ni propia ni de terceros. Lo único que guarda en el móvil es el idioma
elegido, una copia de la carta para verla sin cobertura, la última reserva y una
marca de que ya se ha contado la visita. Todo eso es almacenamiento técnico y no
necesita consentimiento; está explicado en la política de cookies con esas
mismas palabras.

**Las reservas se borran solas.** Un cron a las 04:15 borra las anteriores al
plazo configurado —12 meses por defecto— y deja constancia en el diario del
servidor, sin nombres. El plazo se cambia en **Más → Datos legales** y es el
mismo número que la política de privacidad le promete al cliente (D-96).

> **PENDIENTE DEL CLIENTE.** El aviso legal necesita cuatro datos que este
> proyecto no puede inventarse: **titular** (persona o sociedad), **NIF/CIF**,
> **domicilio fiscal** y un **correo de contacto** para ejercer los derechos de
> protección de datos. Mientras falten, esas líneas no se pintan y el panel se lo
> recuerda al administrador con un aviso en «Más». Se ponen ahí mismo, en **Datos
> legales**. Y conviene que la asesoría del bar lea los tres textos antes de
> darlos por buenos: son una base honesta, no un dictamen (D-92).

### Qué se cuenta de la carta, y qué no

**Tres cosas, y ni una más** (sección 13 del encargo): cuántas veces se abre la
carta cada día y en qué idioma, qué platos se miran y qué se busca sin
encontrarlo. Se ven en **Más → La carta en números**, con selector de semana, mes
o tres meses.

Lo que **no** se guarda: ni cookies, ni identificador de visitante, ni dirección
IP, ni hora, ni de dónde viene nadie. Las filas son un contador por día
(`dia + tipo + valor`), así que **con lo que queda apuntado es imposible
reconstruir el recorrido de una persona**. La IP se usa solo en memoria, para
frenar abusos, y no se escribe en disco en ningún momento.

Dos detalles que no son casualidad:

- **El escaneo se cuenta al terminar la visita**, no al empezarla, porque la web
  abre siempre en castellano: contando al entrar, el reparto por idioma diría
  siempre 0 % de inglés (D-91).
- **No hay «tiempo medio»**, aunque la maqueta lo dibuje: medirlo exige seguirle
  la pista a la visita, y eso es exactamente lo que la sección 13 prohíbe (D-90).

Nadie puede escribir métricas por la API: las filas las crea una ruta del
servidor (`POST /api/quijote/metrica`) que solo acepta esos tres tipos y que
**comprueba que el plato existe** antes de contarlo. El resumen del panel sale de
`GET /api/quijote/estadisticas`, que agrega en SQLite y devuelve 2 KB en vez de
bajarse miles de filas a un móvil.

Y lo dice la propia pantalla: **son consultas de la carta, no ventas**. Este
sistema no cobra ni factura nada, así que no hay un solo dato de caja dentro.

### El panel, instalado en el móvil (PWA)

El panel se **instala en la pantalla de inicio** como una aplicación más: en
Android, «Añadir a pantalla de inicio» desde el menú del navegador; en iPhone, el
botón de compartir → «Añadir a pantalla de inicio». El icono es el Quijote en
crema sobre el granate de la casa.

**Y sigue funcionando sin cobertura**, que es de lo que se trata: el almacén es un
sótano sin señal. Sin red se abre igual y enseña lo último que se guardó — las
reservas del día, el recuento en curso, las faltas apuntadas, el cuadrante — con
una banda que lo avisa: «Sin conexión · estás viendo lo último que se guardó».
Escribir sin red ya funcionaba antes en el recuento, con su cola (D-54); esto es
lo que faltaba para poder **abrir** la aplicación estando abajo.

Detalles que conviene saber:

- La aplicación se pide **siempre a la red primero** y solo cae a la copia si no
  hay. Así un cambio publicado se ve al momento, sin esperar a que caduque nada.
- **Al salir de la sesión se borra la copia de datos** del móvil: ahí hay nombres
  y teléfonos de reservas, y el móvil del panel se queda en la barra.
- No se guardan ni las métricas ni la lista de cuentas del equipo.

Los iconos se generan a partir del logo con:

```bash
./scripts/iconos-panel.sh      # necesita Docker y nada más
```

Solo hay que volver a pasarlo si cambia el logo — que sigue siendo el marcador de
posición redibujado a ojo, ver el aviso del principio.

### Avisos: qué se registra y qué haría falta para enviarlos

Cinco cosas disparan un aviso: una **reserva por la web**, una **cancelación**,
un **producto marcado como agotado**, el **recordatorio del recuento** (a las
10:00 del día configurado, y solo si no hay ya un recuento de hoy) y el
**cuadrante publicado**.

**En la v1 todo eso va al diario del servidor y a ningún sitio más.** Se ve así:

```bash
docker compose logs -f pocketbase          # mientras pasa
# o en el panel de PocketBase: /_/#/logs , buscando "Aviso"
```

Están definidos —y **apagados**— los canales de **SMS** y **WhatsApp**. Un aviso
mandado por ellos hoy no sale: deja escrito que el canal no está configurado. El
canal se elige con una variable de entorno en `docker-compose.yml`:

```yaml
environment:
  QUIJOTE_AVISOS: registro      # registro (por defecto) | sms | whatsapp
```

**Qué haría falta para encender cada uno:**

| Canal | Qué hay que tener antes |
|---|---|
| **SMS** | Una pasarela contratada (Twilio, MessageBird, LabsMobile…), sus credenciales en el entorno y un número de destino. El único cambio de código es el cuerpo de `CANALES.sms` en `pb_hooks/lib/avisos.js`. |
| **WhatsApp** | Cuenta de WhatsApp Business API con Meta, número verificado y **plantillas aprobadas por Meta**: sin plantilla aprobada no se puede escribir el primero. Eso es un trámite, no una tarde de trabajo. |

> **La pregunta que hay que hacerle al cliente antes de nada: quién paga los
> mensajes.** Un SMS cuesta unos céntimos y una reserva puede generar dos (la
> reserva y la cancelación). No es una decisión técnica, así que no se ha
> tomado (encargo, sección 15).

Mientras tanto, el bar sigue haciendo lo que ya hacía y funciona: **el cuadrante
y la lista de pedido se copian como texto y se pegan en el grupo de WhatsApp**
(D-60). Eso no depende de ninguna pasarela ni cuesta nada.

### Pruebas

```bash
./pruebas/unitarias.sh        # lógica pura: aforo, franjas, código, teléfono, horas
./pruebas/reglas-acceso.sh    # reglas de acceso de las 15 colecciones
./pruebas/reservas.sh         # reglas de reserva contra el servidor
```

Ninguna necesita nada instalado en el host: se ejecutan en contenedores. Las dos
últimas necesitan el stack levantado, se limpian solas y se pueden repetir.

- **Unitarias** (170): franjas de cocina con dos servicios, solapamiento de mesas,
  aforo por zona y total, antelación, teléfono español, código de reserva sin
  caracteres ambiguos, freno antibot, la marca de «sin configurar» del almacén,
  el cálculo de qué entra en la lista de pedido y con cuánto, las cuentas del
  cuadrante y del control horario (turnos que cruzan la medianoche, jornadas sin
  cerrar, huecos de servicio y el paso de día natural de aquí a instante UTC) y
  la antigüedad de una ficha del equipo, y **la fecha a partir de la cual una
  reserva se borra sola** (restar meses al 31 de marzo y el cambio de hora son
  dos formas conocidas de borrar un día de más) y **los textos de los avisos**,
  incluida la propiedad de que un aviso que falla no puede tumbar la reserva que
  lo provocó.
- **Reglas de acceso** (169): la carta se lee sin sesión; una reserva se puede
  crear pero **no leer ni conociendo su ID**; el almacén nunca es público; los
  fichajes solo los ve quien debe; cada rol puede lo que le toca; nadie se
  cambia el rol a sí mismo ni asciende a un compañero, un empleado da de alta un
  producto al vuelo pero no cambia el catálogo, nadie firma un aviso con el
  nombre de otro, **un plato sin precio no se descarga sin sesión aunque esté
  encendido**, el recuento lo cuenta cualquiera pero solo lo cierra quien pide, **nadie ficha por un compañero ni se pone su propia hora**, corregir
  horas deja firma, solo el administrador toca las cuentas —crearlas, borrarlas y
  cambiar contraseñas y correos—, nadie borra la suya propia y una ficha con
  horas fichadas no se puede borrar. Desde la fase 10, además: **nadie escribe
  métricas a mano** y la ruta que sí las cuenta solo acepta los tres tipos del
  encargo, suma en la fila del día en vez de crear otra, se traga las búsquedas
  recortadas y en minúsculas y **no cuenta la vista de un plato que no existe**;
  las estadísticas son del administrador; un evento apagado no se ve desde la
  calle ni por su ID, y un empleado ni los crea ni los publica ni los borra. Y
  desde el diario del panel: **nadie puede fabricarse una línea de actividad**,
  ni corregirla ni borrarla —tampoco el administrador—, un empleado no la lee,
  el diario **no guarda contraseñas ni teléfonos de clientes**, el acceso
  correcto y el fallido quedan apuntados y **lo que hace la web pública no deja
  línea**.
- **Reservas** (65): que el **servidor** aplica las reglas aunque se le mande una
  petición a mano saltándose el formulario, y que **el panel se las salta a
  propósito** (D-27).

### Configurar las reservas

Las reservas arrancan **desactivadas** y con los tres aforos a **0**, a propósito:
un aforo inventado aceptaría mesas que no existen.

Desde la fase 5 esto se hace **desde el panel**, sin tocar la base: entra como
administrador, ve a **Reservas** y pulsa el engranaje de la cabecera. Solo lo ve
el rol `admin`. Los campos son estos:

| Campo | Qué es |
|---|---|
| `horario_cocina` | Los servicios, separados por coma: `12:30-16:30,20:00-23:30` |
| `aforo_barra`, `aforo_terraza`, `aforo_salon` | Comensales que caben en cada zona. **Una zona con 0 no se ofrece.** |
| `duracion_mesa_min` | Cuánto ocupa una mesa. Por defecto 90. |
| `antelacion_maxima_dias` | Con cuánto se puede reservar. Por defecto 30. |
| `reservas_activas` | Mientras esté desactivado, la web enseña `mensaje_cerrado` y el teléfono. |

### Comandos del día a día

```bash
docker compose logs -f pocketbase     # ver qué pasa
docker compose restart pocketbase     # aplicar hooks o migraciones nuevas
docker compose down                   # parar (los datos siguen en el volumen)
```

### Actualizar el SDK de PocketBase del panel

El panel usa el SDK oficial servido **desde este dominio**, no desde un CDN
(`DECISIONES.md`, D-30). Está en `panel/vendor/pocketbase.es.js` y se versiona
con el repositorio. Para subirlo de versión:

```bash
curl -sS -o panel/vendor/pocketbase.es.js \
  https://cdn.jsdelivr.net/npm/pocketbase@X.Y.Z/dist/pocketbase.es.mjs
sed -i 's|^//# sourceMappingURL=.*$||' panel/vendor/pocketbase.es.js
```

La última línea quita la referencia al mapa de código fuente, que no se copia y
daría un 404 en las herramientas del navegador. Conviene que la versión mayor
del SDK y la de PocketBase (`PB_VERSION` en `docker-compose.yml`) vayan a la par.

---

## Cómo se despliega

### En este servidor

Este servidor ya tiene un Caddy central en los puertos 80/443 sirviendo otros
dominios, así que el Caddy del proyecto **no** termina TLS: cuelga de la red
`edge` y el proxy central le pasa el tráfico. Ver `DECISIONES.md`, D-02.

1. Apuntar en OVH los registros A/AAAA de `barrinconquijote.es` y
   `www.barrinconquijote.es` a la IP del servidor.
2. `docker compose up -d`
3. Añadir el bloque de `deploy/vhost-proxy-central.txt` al Caddyfile del proxy
   central y recargarlo:
   ```bash
   docker exec caddy caddy validate --config /etc/caddy/Caddyfile
   docker exec caddy caddy reload  --config /etc/caddy/Caddyfile
   ```

> **Si el vhost se aplicó ANTES de que el DNS resolviera**, el certificado falla
> y el sitio responde a HTTP pero da error de TLS en HTTPS. Cuando el DNS ya
> resuelva, un `caddy reload` normal **no arregla nada**: si el fichero no ha
> cambiado, Caddy contesta `config is unchanged` y no vuelve a intentar la
> emisión. Hay que forzarlo:
>
> ```bash
> docker exec caddy caddy reload --force --config /etc/caddy/Caddyfile
> docker logs caddy --since 2m | grep barrinconquijote   # "certificate obtained successfully"
> ```
>
> Pasó exactamente eso el 2026-09-01: el vhost se aplicó a las 08:48 con el
> dominio todavía sin delegar, y el sitio se quedó sin certificado hasta que se
> forzó la recarga.

### En un servidor limpio

Si el proyecto es lo único que corre en la máquina, se usa la configuración que
describe el encargo: Caddy propio con TLS automático en los puertos 80 y 443.

```bash
docker compose -f docker-compose.yml -f deploy/standalone/compose.yml up -d
```

Antes, cambia el correo de Let's Encrypt en `deploy/standalone/Caddyfile`: es la
única vía de aviso si un certificado falla.

---

## Copias de seguridad

Diarias a las 04:30 (hora de Madrid), en `./backups/`, con rotación de 14 días.
Cada copia es un `.tar.gz` con la base de datos y los ficheros subidos (fotos de
plato).

La base **no** se copia con `cp`: se genera con `VACUUM INTO`, que da un fichero
consistente aunque haya escrituras en marcha.

**Restaurar:**

```bash
docker compose stop pocketbase
tar -xzf backups/quijote-AAAAMMDD-HHMM.tar.gz -C /tmp/restaura
docker run --rm -v quijote_pb_data:/pb_data -v /tmp/restaura:/r alpine \
  sh -c 'cp /r/base/*.db /pb_data/ && rm -f /pb_data/*.db-wal /pb_data/*.db-shm && cp -a /r/storage /pb_data/ 2>/dev/null; true'
docker compose start pocketbase
```

**Comprobar que una copia sirve** (conviene hacerlo de vez en cuando; una copia
que nunca se ha restaurado no es una copia):

```bash
tar -xzf backups/quijote-AAAAMMDD-HHMM.tar.gz -C /tmp/prueba
docker run --rm --entrypoint sh -v /tmp/prueba:/r:ro quijote-copias:1 \
  -c 'sqlite3 /r/base/data.db "PRAGMA integrity_check;"'
```

---

## Cómo está organizado

```
web/            Carta pública y reservas. Estáticos, sin compilar.
pruebas/        Unitarias, reglas de acceso y reglas de reserva.
panel/          Panel de gestión. Estáticos también; vendor/ lleva el SDK.
compartido/     Lo que usan las dos: tokens CSS, tipografías y logo.
pb_hooks/       Lógica de servidor de PocketBase (reglas de reserva, avisos...).
pb_migrations/  Definición de las colecciones. Versionada, nunca a mano.
seed/           Datos de ejemplo e importadores de CSV. Todo marcado como ficticio.
deploy/         Dockerfiles, configuración de Caddy y copias de seguridad.
design/         Maquetas aprobadas por el cliente. FUENTE DE VERDAD DEL DISEÑO.
docs/           Esta documentación y los manuales.
scripts/        Utilidades: tipografías, iconos de la PWA, QR.
assets/         Materiales de origen (tipografías sin recortar). No se sirve.
```

### El modelo de datos

15 colecciones, todas definidas en `pb_migrations/` y **nunca a mano** por el
panel de administración: así un servidor nuevo se levanta idéntico al de
producción con un solo `docker compose up -d`.

| Grupo | Colecciones |
|---|---|
| Carta | `categorias`, `platos` |
| Reservas | `reservas` |
| Personal | `users`, `empleados`, `turnos`, `fichajes` |
| Almacén | `proveedores`, `productos`, `recuentos`, `recuento_lineas`, `avisos_stock` |
| Otros | `eventos`, `ajustes`, `metricas` |

**Lo que es público:** la carta, los eventos y los ajustes. Nada más. Las
reservas se pueden **crear** sin sesión pero no leer ni listar. El almacén, el
personal y las métricas no salen nunca sin sesión.

En `users`, además del rol, están el **nombre de usuario** con el que se entra
al panel y el correo, que es opcional (`DECISIONES.md`, D-72).

**Los dos roles** (campo `rol` en `users`):

| Rol | Puede |
|---|---|
| `admin` | Todo: ajustes, datos legales, cuentas y roles, equipo y cuadrante, almacén, eventos, estadísticas, actividad y todos los borrados. |
| `empleado` | Reservas y carta enteras (ver, crear y modificar), apuntar y resolver faltas, dar de alta un producto al vuelo, fichar y ver **sus** horas. |

Eran cuatro —`dueno`, `encargado`, `cocina` y `empleado`— hasta la migración
`1757200000_rol_administrador.js`. En la base solo había cuentas de `dueno` y
una de `empleado`: los otros dos no los usó nadie nunca. Ver `DECISIONES.md`,
D-98.

Lo que un empleado **no** puede: crear, borrar ni cambiar el rol de una cuenta,
tocar los ajustes o los datos legales, editar las fichas del equipo ni el
cuadrante, mantener el catálogo del almacén, cerrar un recuento, publicar
eventos, leer las estadísticas, ver la actividad del panel ni borrar nada.

### El diseño

`design/rincon-cliente.html` y `design/rincon-panel.html` son las maquetas
aprobadas por el cliente y **mandan sobre cualquier otra cosa**. Colores,
tipografías, espaciados y tamaños salen de ahí.

Todo eso está recogido en un único fichero, `compartido/css/tokens.css`. No hay
colores a pelo repartidos por el código: si necesitas uno que no está, se añade
ahí.

Se diseña a **390 px de ancho primero**. En escritorio, una columna centrada de
720 px como máximo; no hay un segundo layout.

### Las tipografías

Tres familias, autoalojadas, **sin una sola petición a Google**:

- **Alegreya SC** — la versalita de la carta impresa: nombres de plato, rótulos, botones.
- **Cormorant Garamond** itálica — el nombre del bar y las cifras grandes.
- **Alegreya Sans** — texto de interfaz y descripciones.

Los ficheros de `compartido/fuentes/` están recortados a castellano e inglés:
150 KB el sistema entero, frente a los 730 KB de los originales. Se versionan en
el repositorio; solo hay que regenerarlos si cambia algo:

```bash
./scripts/descargar-fuentes.sh    # baja los originales de Google
./scripts/subset-fuentes.sh       # los recorta (usa un contenedor, no ensucia el host)
```

---

## Lo que este sistema NO hace

No es un descuido, es el encargo (sección 2). Si algo empuja hacia aquí, hay que
parar y preguntar, porque es una decisión legal, no técnica:

- **No hay TPV, ni comandas, ni cobro, ni tickets, ni facturación.** El sistema
  no emite ningún documento de venta. Nada de Verifactu, facturas simplificadas,
  arqueo de caja ni datáfono.
- **El almacén no es contabilidad.** Ni precios de coste, ni valoración en euros,
  ni escandallos, ni márgenes, ni albaranes, ni caducidades ni lotes. Es la lista
  de lo que hay y lo que falta.
- **No hay pasarela de pago.** Las reservas no llevan depósito.
- **No hay app nativa.** Es una web.
- **No hay WhatsApp Business API** en la v1.

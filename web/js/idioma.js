/**
 * Idiomas ES / EN
 * ---------------------------------------------------------------------------
 * Sin traduccion, se cae al castellano SIN MARCAR ERROR (seccion 6): un plato
 * al que nadie le ha puesto nombre en ingles sale en castellano y ya esta. Es
 * lo correcto en un bar de barrio, y evita tener que traducir la carta entera
 * antes de poder publicar.
 *
 * La preferencia se guarda en localStorage.
 */

const CLAVE = 'quijote.idioma'
const IDIOMAS = ['es', 'en']

const TEXTOS = {
  es: {
    carta: 'Carta',
    verCarta: 'Ver la carta',
    reservar: 'Reservar mesa',
    buscarPlato: 'Buscar un plato',
    limpiar: 'Limpiar la búsqueda',
    volver: 'Volver',
    barra: 'Barra',
    // Terraza y salon comparten precio desde siempre; el rotulo decia solo
    // «Terraza» y quien se sentaba dentro no sabia cual de los dos le tocaba.
    // No cambia ningun precio ni ningun campo: es la misma columna, dicha
    // entera. Ver DECISIONES.md, D-80.
    terraza: 'Terraza / Salón',
    precio: 'Precio',
    contiene: 'Contiene',
    // El importe NO se escribe aqui: sale de compartido/js/extras.js, que es el
    // unico sitio donde vive. Aqui solo van las palabras que lo acompanan.
    //
    // Dos formas del mismo aviso: la larga es la de la ficha, donde hay sitio y
    // el cliente esta decidiendo; la breve es la de la linea de la carta, donde
    // la columna de texto son 156 px y la larga se parte en dos renglones y pesa
    // mas que los alergenos, que son los que por ley tienen que cantar.
    porIngredienteExtra: 'por ingrediente extra',
    porIngrediente: 'por ingrediente',
    cerrar: 'Cerrar',
    abierto: 'Abierto',
    cerrado: 'Cerrado ahora',
    cerramosALas: 'cerramos a las',
    abrimosALas: 'abrimos a las',
    // Cuando la vuelta no es hoy. El nombre del dia lo pone horario.js, que ya
    // lo tiene en castellano; en ingles se deja el mismo, que es un nombre.
    abrimosManana: 'abrimos mañana a las',
    abrimosEl: 'abrimos el',
    aLas: 'a las',
    todas: 'Todas',
    horario: 'Horario',
    reservas: 'Reservas',
    donde: 'Dónde estamos',
    cocina: 'Cocina',
    celebraciones: 'CELEBRACIONES',
    celebracionesTitulo: 'Bautizos, comuniones y bodas',
    celebracionesTexto: 'Menús cerrados para grupos, con la sala reservada. Cuéntanos qué necesitas y te preparamos presupuesto.',
    sinResultadosTitulo: 'No encontramos ese plato',
    sinResultadosTexto: 'Prueba con otra palabra, o mira la carta entera.',
    cartaVaciaTitulo: 'La carta no está disponible',
    cartaVaciaTexto: 'Vuelve a intentarlo en un momento, o llámanos y te contamos qué hay hoy.',
    sinConexion: 'Sin conexión. Estás viendo la carta guardada en el móvil.',
    saltarContenido: 'Saltar al contenido',
    cambiarIdioma: 'Switch to English',

    // --- Eventos (fase 10) ---
    queSeCuece: 'Qué se cuece',
    verEventos: 'Ver lo que se cuece',
    yaPaso: 'Ya pasó',
    del: 'Del',
    al: 'al',
    cargandoEventos: 'Cargando…',
    sinEventosTitulo: 'Ahora mismo no hay nada anunciado',
    sinEventosTexto: 'Organizamos bautizos, comuniones, bodas y comidas de empresa. Llámanos y lo vemos.',
    eventosErrorTitulo: 'No hemos podido cargar los eventos',
    eventosErrorTexto: 'Vuelve a intentarlo en un momento, o llámanos y te contamos.',

    // --- Pie y textos legales (fase 10) ---
    avisoLegal: 'Aviso legal',
    privacidad: 'Privacidad',
    cookies: 'Cookies',
    sinRastreo: 'Esta web no usa cookies de terceros ni te sigue el rastro.',
  },
  en: {
    carta: 'Menu',
    verCarta: 'See the menu',
    reservar: 'Book a table',
    buscarPlato: 'Search a dish',
    limpiar: 'Clear search',
    volver: 'Back',
    barra: 'Bar',
    terraza: 'Terrace / Indoors',
    precio: 'Price',
    contiene: 'Contains',
    porIngredienteExtra: 'per extra ingredient',
    porIngrediente: 'per ingredient',
    cerrar: 'Close',
    abierto: 'Open',
    cerrado: 'Closed now',
    cerramosALas: 'we close at',
    abrimosALas: 'we open at',
    abrimosManana: 'we open tomorrow at',
    abrimosEl: 'we open on',
    aLas: 'at',
    todas: 'All',
    horario: 'Opening hours',
    reservas: 'Bookings',
    donde: 'Where we are',
    cocina: 'Kitchen',
    celebraciones: 'CELEBRATIONS',
    celebracionesTitulo: 'Christenings, communions and weddings',
    celebracionesTexto: 'Set menus for groups, with the room reserved for you. Tell us what you need and we will prepare a quote.',
    sinResultadosTitulo: 'We could not find that dish',
    sinResultadosTexto: 'Try another word, or browse the whole menu.',
    cartaVaciaTitulo: 'The menu is not available',
    cartaVaciaTexto: 'Please try again in a moment, or give us a call and we will tell you what we have today.',
    sinConexion: 'No connection. You are seeing the menu saved on your phone.',
    saltarContenido: 'Skip to content',
    cambiarIdioma: 'Ver en español',

    queSeCuece: "What's on",
    verEventos: "See what's on",
    yaPaso: 'Past event',
    del: 'From',
    al: 'to',
    cargandoEventos: 'Loading…',
    sinEventosTitulo: 'Nothing announced right now',
    sinEventosTexto: 'We host christenings, communions, weddings and company lunches. Give us a call.',
    eventosErrorTitulo: 'We could not load what is on',
    eventosErrorTexto: 'Please try again in a moment, or give us a call.',

    avisoLegal: 'Legal notice',
    privacidad: 'Privacy',
    cookies: 'Cookies',
    sinRastreo: 'This site uses no third-party cookies and does not track you.',
  },
}

/** Nombre visible de cada uno de los 14 alergenos oficiales de la UE. */
const ALERGENOS = {
  es: {
    gluten: 'Gluten', crustaceos: 'Crustáceos', huevos: 'Huevo', pescado: 'Pescado',
    cacahuetes: 'Cacahuete', soja: 'Soja', lacteos: 'Lácteos',
    frutos_cascara: 'Frutos de cáscara', apio: 'Apio', mostaza: 'Mostaza',
    sesamo: 'Sésamo', sulfitos: 'Sulfitos', altramuces: 'Altramuces', moluscos: 'Moluscos',
  },
  en: {
    gluten: 'Gluten', crustaceos: 'Crustaceans', huevos: 'Egg', pescado: 'Fish',
    cacahuetes: 'Peanuts', soja: 'Soya', lacteos: 'Milk',
    frutos_cascara: 'Tree nuts', apio: 'Celery', mostaza: 'Mustard',
    sesamo: 'Sesame', sulfitos: 'Sulphites', altramuces: 'Lupin', moluscos: 'Molluscs',
  },
}

let actual = leerPreferencia()

function leerPreferencia() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    if (IDIOMAS.includes(guardado)) return guardado
  } catch (e) { /* modo privado */ }

  // Sin preferencia guardada, SIEMPRE castellano. No se mira el idioma del
  // navegador a proposito:
  //
  //   - El QR esta en las mesas de un bar de barrio de Madrid. La inmensa
  //     mayoria de quien lo escanea lee castellano.
  //   - La traduccion de la carta es opcional plato a plato. Un movil en ingles
  //     veria la interfaz en ingles pero los platos sin traducir en castellano:
  //     media pantalla en cada idioma, que es peor que una entera en castellano.
  //   - El encargo pide conmutador y preferencia en localStorage, no deteccion.
  //
  // Quien quiera ingles lo pulsa una vez y se le recuerda.
  return 'es'
}

export function idioma() { return actual }

export function cambiarIdioma() {
  actual = actual === 'es' ? 'en' : 'es'
  try { localStorage.setItem(CLAVE, actual) } catch (e) { /* modo privado */ }
  document.documentElement.lang = actual
  return actual
}

/** Texto de interfaz. */
export function t(clave) {
  return TEXTOS[actual][clave] ?? TEXTOS.es[clave] ?? clave
}

/**
 * Campo traducible de un registro. Si no hay traduccion, cae al castellano.
 * No se marca error ni se ensena "[sin traducir]": se ve el castellano y punto.
 */
export function campo(registro, nombre) {
  if (actual === 'en') {
    const enIngles = registro[`${nombre}_en`]
    if (enIngles) return enIngles
  }
  return registro[nombre] || ''
}

export function nombreAlergeno(clave) {
  return ALERGENOS[actual][clave] ?? ALERGENOS.es[clave] ?? clave
}

export function todosLosAlergenos() {
  return Object.keys(ALERGENOS.es)
}

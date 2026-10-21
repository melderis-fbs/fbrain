import 'server-only';
import type { ValoresFicha } from './planilla';

/**
 * EL FORMULARIO DE ONBOARDING, QUE YA ESTÁ EN GHL
 *
 * El onboarding se completa en un formulario de GHL, así que sus respuestas
 * ya viven como campos del contacto. No hay que extraerlas de un documento
 * con inteligencia artificial ni pedirle a nadie que las vuelva a tipear:
 * están, y esto las trae.
 *
 * Por eso lo que entra por acá **es dato cargado, no propuesta**: lo escribió
 * el cliente con su nombre. No pasa por la pantalla de confirmación, que está
 * para lo que deduce el motor de un texto.
 *
 * LO INCÓMODO, Y POR QUÉ ESTO ES UNA LISTA Y NO UN CAMPO
 *
 * La subcuenta tiene 234 campos de contacto, y la misma pregunta aparece
 * varias veces porque se fue copiando de un formulario a otro: hay tres
 * versiones de «¿cuánto facturás?» y dos de «¿a cuánto querés llegar?». Un
 * cliente respondió una y los otros campos le quedaron vacíos.
 *
 * Entonces cada dato de la ficha apunta a **varios campos de GHL en orden de
 * preferencia**, y se toma el primero que tenga valor. Tomar uno solo dejaría
 * media cartera sin ficha por haber elegido el formulario equivocado.
 *
 * Los identificadores no se tocan aunque alguien renombre la pregunta en
 * GHL —que pasa— y por eso están acá y no los nombres.
 */

export const CAMPO_CONTACTO = {
  /** Lo que vende, en sus palabras. */
  oferta: ['WFI3mKVwezyvWmpJd8gu'],
  /** A quién se lo vende. */
  clienteIdeal: ['SAfKvaSAxNfZ96NVimab', 'jbwHwZW3vCDGrEFlgKAv'],
  /** Qué problema le resuelve. */
  problema: ['jQCvXXASdml4fTVYLGB4'],
  /** La promesa, que en el formulario es «en una línea qué hacés y a quién ayudás». */
  promesa: ['bQH6UZg8BxS9Ipb824Vd', 'S0kKHxbl2NgtrG283msk'],
  /** Por dónde le entran hoy los clientes. */
  canal: ['OgixMoudDbu1Yn51tfn3'],
  /** Cómo entrega: su modelo de negocio. */
  modeloNegocio: ['lyH4cmao6Ib4i6g8eYKE', 'oY3jTWsSl0VlhZsiPAZV'],
  /** Su profesión al entrar al programa. */
  profesion: ['v6MxIPBzN7g2DuhgpjYs'],
  /** Qué lo hace elegible: su ventaja. */
  ventaja: ['GRZ3WREotzQujzjnu0rN'],
  /** El ticket, en texto libre: «¿Sabés cuál es el valor promedio de compra?» */
  ticket: ['Q7wvcmWmk1OG9AAeQdzh'],
  /** La meta, que en el formulario es una opción de rango. */
  meta: ['azTpFcewboBTmhH6CKZ7', 'rZXdKbdgsBsvryFa3KKK'],
  /** Lo que factura hoy, también por rangos y en tres formularios distintos. */
  facturacion: ['eXd2VRt2I7F9sMYqIdT9', 'tASbAkMph82gtDgWx25l', '7owgy7PY0Yb5oGEnF0Uu'],
  /** El nombre de su negocio. */
  nombreNegocio: ['3d4O9fJ2SY0q3id7pJng'],
  /** El contrato firmado. */
  linkContrato: ['rqAXGrql3yDv2pkRrmd1'],
} as const;

export interface CampoContacto {
  id: string;
  value?: unknown;
  fieldValue?: unknown;
  fieldValueString?: string;
}

export interface ContactoConCampos {
  id: string;
  customFields?: CampoContacto[];
}

/** El valor de un campo, venga como venga: GHL cambia la forma según el tipo. */
export function valorDe(campo: CampoContacto | undefined): string | undefined {
  if (!campo) return undefined;
  const bruto = campo.value ?? campo.fieldValue ?? campo.fieldValueString;
  if (bruto === null || bruto === undefined) return undefined;
  // Las casillas múltiples vienen como lista; se unen con coma, como se leen.
  const texto = Array.isArray(bruto) ? bruto.filter(Boolean).join(', ') : String(bruto);
  const limpio = texto.trim();
  return limpio || undefined;
}

/** El primero de varios campos que tenga valor. */
export function primero(c: ContactoConCampos, ids: readonly string[]): string | undefined {
  for (const id of ids) {
    const v = valorDe(c.customFields?.find((x) => x.id === id));
    if (v) return v;
  }
  return undefined;
}

/**
 * UN NÚMERO SÓLO SI ES UN NÚMERO
 *
 * El ticket y la meta son texto libre o rangos: «Entre 5.000 y 10.000 USD»,
 * «unos 1200 aprox», «no sé». Convertir eso a un número es inventarlo, y no
 * es un dato cualquiera: la meta mensual y el ticket son de donde sale la
 * cuenta inversa, o sea cuántas conversaciones por semana se le pide al
 * cliente. Un número mal deducido se convierte en el objetivo que la
 * consultora persigue toda la semana.
 *
 * Así que sólo se acepta cuando el texto es **un** número sin ambigüedad. Un
 * rango, dos números o prosa quedan sin cargar, y eso es correcto: la ficha
 * va a decir que falta el ticket, que es la verdad.
 */
export function numeroFirme(texto: string | undefined): number | undefined {
  if (!texto) return undefined;
  // Un rango explícito nunca es un número.
  if (/\b(entre|hasta|a|o|y|-|–|más de|menos de)\b.*\d/i.test(texto.replace(/\d[\d.,]*/g, (m) => m))) {
    const cuantos = texto.match(/\d[\d.,]*/g)?.length ?? 0;
    if (cuantos > 1) return undefined;
  }
  const encontrados = texto.match(/\d[\d.,]*/g);
  if (!encontrados || encontrados.length !== 1) return undefined;
  // 4.500 y 4,500 son cuatro mil quinientos; 4500.50 es con decimales.
  const crudo = encontrados[0];
  const normal = /[.,]\d{3}\b/.test(crudo)
    ? crudo.replace(/[.,]/g, '')
    : crudo.replace(/,/g, '.');
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface FichaDeGhl {
  valores: ValoresFicha;
  linkContrato?: string;
  /** Lo que vino con texto pero no se pudo convertir a número, para informarlo. */
  sinConvertir: { campo: string; texto: string }[];
}

/**
 * De los campos del contacto a los valores del expediente.
 *
 * Lo que no vino se omite. Más arriba, un valor ausente nunca borra lo que ya
 * estaba cargado.
 */
export function fichaDeContacto(c: ContactoConCampos): FichaDeGhl {
  const v: ValoresFicha = {};
  const sinConvertir: { campo: string; texto: string }[] = [];

  const oferta = primero(c, CAMPO_CONTACTO.oferta);
  const clienteIdeal = primero(c, CAMPO_CONTACTO.clienteIdeal);
  const problema = primero(c, CAMPO_CONTACTO.problema);
  const promesa = primero(c, CAMPO_CONTACTO.promesa);
  const canal = primero(c, CAMPO_CONTACTO.canal);
  const modelo = primero(c, CAMPO_CONTACTO.modeloNegocio);
  const profesion = primero(c, CAMPO_CONTACTO.profesion);
  const ventaja = primero(c, CAMPO_CONTACTO.ventaja);
  const nombreNegocio = primero(c, CAMPO_CONTACTO.nombreNegocio);

  // --- estrategia: el método de Founders vive acá
  if (clienteIdeal) v.clienteIdeal = clienteIdeal;
  if (problema) v.problema = problema;
  if (promesa) v.promesa = promesa;
  if (oferta) v.oferta = oferta;
  if (canal) v.canal = canal;
  v.motivoCambio = 'Formulario de onboarding (GHL)';

  // --- negocio
  if (oferta ?? profesion) v.queVende = oferta ?? profesion;
  if (clienteIdeal) v.aQuien = clienteIdeal;
  if (modelo) v.comoEntrega = modelo;
  if (canal) v.origenClientes = canal;
  if (nombreNegocio && !v.queVende) v.queVende = nombreNegocio;

  // --- autoridad
  if (ventaja) v.haceExcepcionalmenteBien = ventaja;
  if (profesion) v.experienciaProfesional = profesion;

  // --- los números, sólo si son inequívocos
  const ticketTexto = primero(c, CAMPO_CONTACTO.ticket);
  const metaTexto = primero(c, CAMPO_CONTACTO.meta);
  const factTexto = primero(c, CAMPO_CONTACTO.facturacion);

  const ticket = numeroFirme(ticketTexto);
  const meta = numeroFirme(metaTexto);
  const facturacion = numeroFirme(factTexto);

  if (ticket) v.ticket = ticket;
  if (meta) v.metaMensual = meta;
  if (facturacion) v.facturacionMensual = facturacion;

  if (ticketTexto && !ticket) sinConvertir.push({ campo: 'ticket', texto: ticketTexto });
  if (metaTexto && !meta) sinConvertir.push({ campo: 'meta mensual', texto: metaTexto });

  return { valores: v, linkContrato: primero(c, CAMPO_CONTACTO.linkContrato), sinConvertir };
}

/**
 * EL BRIEF · LO QUE LA CONSULTORA LEE ANTES DE LA PRIMERA REUNIÓN
 *
 * El formulario de onboarding tiene mucho más de lo que entra en la ficha:
 * qué lo frena, qué intentó antes, qué quiere lograr, con qué activos cuenta.
 * Nada de eso tiene una casilla en el expediente, y perderlo sería tirar lo
 * único que la consultora tiene del cliente antes de conocerlo.
 *
 * Así que el formulario entero se guarda como un documento, con las preguntas
 * puestas, y el brief lo ordena en los bloques en que una consultora lo
 * necesita leer: quién es, dónde está, qué quiere, qué lo frena.
 *
 * Sin inteligencia artificial. Antes de la primera reunión, las palabras del
 * cliente valen más que un resumen: el «me da vergüenza cobrar más» textual
 * es el dato, y una paráfrasis lo borra.
 */

/** Los bloques del brief, en el orden en que se leen antes de una reunión. */
export const BLOQUES_BRIEF = [
  {
    clave: 'quien',
    titulo: 'Quién es y qué vende',
    campos: [
      'v6MxIPBzN7g2DuhgpjYs', // profesión
      '3d4O9fJ2SY0q3id7pJng', // nombre del negocio
      'lyH4cmao6Ib4i6g8eYKE', 'oY3jTWsSl0VlhZsiPAZV', // modelo de negocio
      'WFI3mKVwezyvWmpJd8gu', // ofertas
      'SAfKvaSAxNfZ96NVimab', 'jbwHwZW3vCDGrEFlgKAv', // cliente ideal
      'jQCvXXASdml4fTVYLGB4', // problema que resuelve
      'bQH6UZg8BxS9Ipb824Vd', 'S0kKHxbl2NgtrG283msk', // promesa
      'GRZ3WREotzQujzjnu0rN', // su ventaja
    ],
  },
  {
    clave: 'donde',
    titulo: 'Dónde está hoy',
    campos: [
      'eXd2VRt2I7F9sMYqIdT9', 'tASbAkMph82gtDgWx25l', '7owgy7PY0Yb5oGEnF0Uu', // facturación
      'Q7wvcmWmk1OG9AAeQdzh', // valor promedio por cliente
      'OgixMoudDbu1Yn51tfn3', // canal que mejor funciona
      'kF1jSYGWRr3Ynh8a7ucz', // estrategia de marketing
      'pBpJNLYtg3x5QDY7wdnd', // proceso de ventas
      'B6GunNlvBP6eXfRUHYSd', // activos y plataformas
      'xDRp77kgu6ayRay33hVD', // equipo
      'iQxwT0nGPxcySLyeuCwf', // competidores
      'MaoIu1CpL16UjDNjRFDt', // números que mira
    ],
  },
  {
    clave: 'quiere',
    titulo: 'Qué quiere',
    campos: [
      'ILmuDnz6vHUGDqOg240d', // objetivo a 6 meses
      'azTpFcewboBTmhH6CKZ7', 'rZXdKbdgsBsvryFa3KKK', // a cuánto quiere llegar
      'GBgi3gTiBJIZfBXTIU8h', // 3 objetivos de las próximas semanas
      'D3FjREK0GkU0yU7W4MUZ', // oportunidad sin explotar
    ],
  },
  {
    clave: 'frena',
    titulo: 'Qué lo frena',
    campos: [
      '7L1pz9CSGlDnmHJTVHqa', 'Omv42KqHrDMP97kIzJmQ', 'PaLp2YkkmuZYiyWCjFrM', 'SX7LOTQcEDXiTiwMu6dZ',
      'Hb6l3YaRCq5UVJO3hude', // mayor desafío
      '52inz8eVttU7LSKJ4hWR', // qué intentó antes
      'W7EnU9NPZ6Jo2rENywna', // qué sí le funcionó
      'qg78036O36cOAtaMFXXA', 'uPL1FgXok3mycrYswPBX', // qué probó
      'dZu8DGNdy4nn4FXeBA1g', // frustraciones
    ],
  },
] as const;

export interface LineaBrief {
  pregunta: string;
  respuesta: string;
}
export interface BloqueBrief {
  clave: string;
  titulo: string;
  lineas: LineaBrief[];
}

/**
 * El formulario entero, ordenado en bloques. Lo que no entra en ningún bloque
 * va al final: puede ser de otro formulario, pero si el cliente lo escribió
 * no se tira.
 */
export function brief(
  c: ContactoConCampos,
  diccionario: Map<string, string>,
): { bloques: BloqueBrief[]; otras: LineaBrief[] } {
  const usados = new Set<string>();
  const bloques: BloqueBrief[] = [];

  for (const b of BLOQUES_BRIEF) {
    const lineas: LineaBrief[] = [];
    for (const id of b.campos) {
      usados.add(id);
      const v = valorDe(c.customFields?.find((x) => x.id === id));
      const pregunta = diccionario.get(id);
      // Sin la pregunta la respuesta no se entiende, y mostrar un
      // identificador de GHL en una pantalla es peor que no mostrar nada.
      if (v && pregunta) lineas.push({ pregunta, respuesta: v });
    }
    if (lineas.length) bloques.push({ clave: b.clave, titulo: b.titulo, lineas });
  }

  const otras: LineaBrief[] = [];
  for (const campo of c.customFields ?? []) {
    if (usados.has(campo.id)) continue;
    const v = valorDe(campo);
    const pregunta = diccionario.get(campo.id);
    if (v && pregunta) otras.push({ pregunta, respuesta: v });
  }

  return { bloques, otras };
}

/** El formulario como texto, para guardarlo de documento del expediente. */
export function briefComoTexto(b: ReturnType<typeof brief>): string {
  const partes: string[] = [];
  for (const bloque of b.bloques) {
    partes.push(`## ${bloque.titulo}`);
    for (const l of bloque.lineas) partes.push(`${l.pregunta}\n${l.respuesta}`);
  }
  if (b.otras.length) {
    partes.push('## Otras respuestas');
    for (const l of b.otras) partes.push(`${l.pregunta}\n${l.respuesta}`);
  }
  return partes.join('\n\n');
}

/** El tipo de contrato que firmó, tal como lo clasifica administración. */
export const CAMPO_TIPO_CONTRATO = 'tjJexFQzVhzIeOQ47RQN';

export function tipoDeContrato(c: ContactoConCampos): string | undefined {
  return valorDe(c.customFields?.find((x) => x.id === CAMPO_TIPO_CONTRATO));
}

/**
 * El documento se guardó como texto con `## Bloque` y pares de
 * pregunta/respuesta. Se vuelve a partir acá para mostrarlo, en vez de
 * guardar el mismo contenido dos veces en formatos distintos.
 */
export function parsearBrief(texto: string): { titulo: string; lineas: { pregunta: string; respuesta: string }[] }[] {
  const bloques: { titulo: string; lineas: { pregunta: string; respuesta: string }[] }[] = [];
  for (const parte of texto.split(/\n{2,}/)) {
    const limpio = parte.trim();
    if (!limpio) continue;
    if (limpio.startsWith('## ')) {
      bloques.push({ titulo: limpio.slice(3).trim(), lineas: [] });
      continue;
    }
    const salto = limpio.indexOf('\n');
    if (salto === -1) continue;
    if (!bloques.length) bloques.push({ titulo: 'Del onboarding', lineas: [] });
    bloques[bloques.length - 1].lineas.push({
      pregunta: limpio.slice(0, salto).trim(),
      respuesta: limpio.slice(salto + 1).trim(),
    });
  }
  return bloques.filter((b) => b.lineas.length);
}

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

import 'server-only';
import type { Cliente, EstadoCliente } from '@/domain/types';

/**
 * GHL · DE DÓNDE SALEN LOS CLIENTES
 *
 * Founders vende en GoHighLevel y la venta ya queda cargada ahí: quién es,
 * qué programa compró, qué consultora lo lleva y desde cuándo. Hasta hoy eso
 * se volvía a tipear en una planilla, y por eso la mitad de la cartera estaba
 * a medias.
 *
 * Un cliente nace cuando su oportunidad entra a la etapa de Onboarding del
 * pipeline de clientes. Antes de eso hay una venta, pero todavía no hay nada
 * con qué compararlo: ni fecha de inicio ni programa.
 *
 * Dos reglas que ordenan todo lo demás:
 *
 *  1. **El cliente es el contacto, no la oportunidad.** Un mismo cliente tiene
 *     la oportunidad de la venta, la del programa y a veces una de cobranza.
 *     Todas cuelgan del contacto, así que la llave es el contacto. Si fuera la
 *     oportunidad, una renovación entraría como un cliente nuevo.
 *  2. **Sólo se lee.** La app no escribe en GHL. Un análisis automático no
 *     toca el sistema donde está la facturación.
 */

const API = 'https://services.leadconnectorhq.com';

/**
 * La API de HighLevel versiona por encabezado, no por URL. Sin esto responde
 * 412 y el mensaje no dice que falta la versión.
 */
const VERSION = '2021-07-28';

export function hayGhl(): boolean {
  return Boolean(process.env.GHL_TOKEN && process.env.GHL_LOCATION_ID);
}

/**
 * El par pipeline + etapa que da de alta a un cliente.
 *
 * Vive en el entorno y no en el código a propósito: en esta cuenta se crean
 * pipelines nuevos todos los meses. Si los identificadores estuvieran escritos
 * acá, el día que alguien rearme el pipeline los clientes dejarían de entrar
 * y nadie se enteraría hasta que falte medio mes de altas.
 */
export function disparador(): { pipelineId: string; etapaId: string } | null {
  const pipelineId = process.env.GHL_PIPELINE_CLIENTES;
  const etapaId = process.env.GHL_ETAPA_ALTA;
  return pipelineId && etapaId ? { pipelineId, etapaId } : null;
}

async function pedir<T>(ruta: string): Promise<T> {
  const r = await fetch(`${API}${ruta}`, {
    headers: {
      Authorization: `Bearer ${process.env.GHL_TOKEN}`,
      Version: VERSION,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    throw new Error(
      r.status === 401
        ? 'GHL rechazó el token. Revisá `GHL_TOKEN`: se genera en Ajustes → Private Integrations de la subcuenta y se ve una sola vez.'
        : `GHL respondió ${r.status} en ${ruta}. ${cuerpo.slice(0, 200)}`,
    );
  }
  return (await r.json()) as T;
}

// --- lo que devuelve la API, recortado a lo que se usa ----------------------

export interface CampoGhl {
  id: string;
  fieldValueString?: string;
  fieldValueDate?: number;
  fieldValueNumber?: number;
}

export interface ContactoGhl {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

export interface OportunidadGhl {
  id: string;
  name?: string;
  contactId?: string;
  pipelineId?: string;
  pipelineStageId?: string;
  customFields?: CampoGhl[];
  contact?: ContactoGhl;
  createdAt?: string;
}

/**
 * Los campos de la oportunidad que la ficha necesita.
 *
 * Son identificadores, no nombres: GHL permite dos campos con el mismo rótulo
 * y el rótulo se edita desde la pantalla. El identificador no cambia nunca.
 */
export const CAMPO = {
  fechaInicio: 'brCPZJCW6LnRGdXUZbck',
  fechaIngresoPrograma: 'wKiE5i17Yj8BNwQDA9xf',
  fechaFin: 'jYD1uyijPF23YqsTfNKS',
  programa: 'bFC0DoZxxYcL7NFDfoMk',
  coach: 'uoI1D1BrRUlgs4zB2NB3',
  garantia: '4utVbtMY56WopCz6Xm4C',
  montoTotal: 'pxKRunj5D8pe4rtnctyf',
  cantidadCuotas: 'BitAm6lGcIwovfP21iZu',
  estatus: 'I4LmfN8U04IWD2OVPUhi',
} as const;

const valor = (o: OportunidadGhl, id: string): CampoGhl | undefined =>
  o.customFields?.find((c) => c.id === id);

const texto = (o: OportunidadGhl, id: string): string | undefined => {
  const c = valor(o, id);
  const v = c?.fieldValueString?.trim();
  return v || undefined;
};

const numero = (o: OportunidadGhl, id: string): number | undefined => {
  const c = valor(o, id);
  return typeof c?.fieldValueNumber === 'number' ? c.fieldValueNumber : undefined;
};

/** Las fechas vienen en milisegundos. Se guardan como día, sin hora. */
export function fecha(o: OportunidadGhl, id: string): string | undefined {
  const c = valor(o, id);
  if (typeof c?.fieldValueDate !== 'number') return undefined;
  const d = new Date(c.fieldValueDate);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString().slice(0, 10);
}

/**
 * QUÉ FECHA MANDA PARA CONTAR LAS SEMANAS
 *
 * Esto no es una preferencia: está medido sobre la cuenta. En la etapa de
 * Onboarding «Fecha Inicio» está cargada en 5 de cada 40 clientes y «Fecha de
 * Ingreso Programa» en 29 de 40. Más adelante se invierte. Así que se toma la
 * mejor de las dos que exista, y si no hay ninguna **no se inventa**: el
 * cliente entra con la fecha de creación de la oportunidad marcada como
 * provisional, y mientras lo esté el reloj del programa no corre.
 */
export function fechaDeArranque(o: OportunidadGhl): { fecha?: string; provisional: boolean } {
  const buena = fecha(o, CAMPO.fechaInicio) ?? fecha(o, CAMPO.fechaIngresoPrograma);
  if (buena) return { fecha: buena, provisional: false };
  const creada = o.createdAt?.slice(0, 10);
  return { fecha: creada, provisional: true };
}

/**
 * El estatus que lleva la consultora en GHL, traducido al estado del cliente.
 *
 * Es su juicio, no el cálculo de la app: sirve para saber si el cliente sigue
 * activo, no para decir si va bien. Dónde está parado lo decide la comparación
 * contra los hitos, y eso no lo pisa nadie.
 */
export function estadoDesde(estatus: string | undefined): EstadoCliente {
  switch ((estatus ?? '').toLowerCase()) {
    case 'finalizado':
      return 'finalizado';
    case 'en pausa':
      return 'pausado';
    case 'abandono':
    case 'desaparecido':
      return 'perdido';
    default:
      return 'activo';
  }
}

export interface ClienteDeGhl {
  ghlContactId: string;
  ghlOpportunityId: string;
  campos: Partial<Cliente> & { nombre: string };
}

/**
 * De una oportunidad de GHL a los campos de un cliente.
 *
 * Devuelve sólo lo que vino con valor. Lo vacío se omite, no se manda en
 * blanco: más arriba, una celda vacía nunca pisa un dato que ya estaba
 * cargado a mano.
 */
export function aCliente(o: OportunidadGhl): ClienteDeGhl | null {
  const contacto = o.contact;
  const contactId = o.contactId ?? contacto?.id;
  const nombre = (contacto?.name ?? o.name ?? '').trim();
  // Sin contacto no hay llave, y sin llave la próxima corrida lo duplicaría.
  // Sin nombre no hay cliente que mostrar. En los dos casos se informa arriba.
  if (!contactId || !nombre) return null;

  const { fecha: arranque, provisional } = fechaDeArranque(o);
  const campos: Partial<Cliente> & { nombre: string } = { nombre };

  if (contacto?.email) campos.email = contacto.email;
  if (contacto?.phone) campos.telefono = contacto.phone;
  const programa = texto(o, CAMPO.programa);
  if (programa) campos.programa = programa;
  if (arranque) {
    campos.fechaAlta = arranque;
    campos.fechaAltaProvisional = provisional;
  }
  const fin = fecha(o, CAMPO.fechaFin);
  if (fin) campos.fechaFinPrevista = fin;
  const garantia = texto(o, CAMPO.garantia);
  if (garantia) campos.tieneGarantia = /^s[ií]$/i.test(garantia);
  const monto = numero(o, CAMPO.montoTotal);
  if (monto) campos.montoTotal = monto;
  const cuotas = numero(o, CAMPO.cantidadCuotas);
  if (cuotas) campos.cantidadCuotas = cuotas;
  const estatus = texto(o, CAMPO.estatus);
  if (estatus) campos.estado = estadoDesde(estatus);

  return { ghlContactId: contactId, ghlOpportunityId: o.id, campos };
}

/** El nombre de la coach en GHL, para enlazarla con el equipo por nombre. */
export function coachDe(o: OportunidadGhl): string | undefined {
  return texto(o, CAMPO.coach);
}

/**
 * Todas las oportunidades de una etapa. Pagina hasta traerlas todas: con 454
 * oportunidades en el pipeline, quedarse con la primera página sería traer un
 * quinto de la cartera y no decirlo.
 */
export async function oportunidadesDeEtapa(
  pipelineId: string,
  etapaId: string,
  tope = 500,
): Promise<OportunidadGhl[]> {
  const todas: OportunidadGhl[] = [];
  const locationId = process.env.GHL_LOCATION_ID!;
  let pagina = 1;

  while (todas.length < tope) {
    const q = new URLSearchParams({
      location_id: locationId,
      pipelineId,
      pipelineStageId: etapaId,
      limit: '100',
      page: String(pagina),
    });
    const r = await pedir<{ opportunities?: OportunidadGhl[]; meta?: { nextPage?: number | null } }>(
      `/opportunities/search?${q}`,
    );
    const lote = r.opportunities ?? [];
    todas.push(...lote);
    if (!lote.length || !r.meta?.nextPage) break;
    pagina = r.meta.nextPage;
  }
  return todas.slice(0, tope);
}

/** Una oportunidad suelta, para cuando el aviso de GHL trae sólo su id. */
export async function oportunidad(id: string): Promise<OportunidadGhl> {
  const r = await pedir<{ opportunity: OportunidadGhl }>(`/opportunities/${id}`);
  return r.opportunity;
}

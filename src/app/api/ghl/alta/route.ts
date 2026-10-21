import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { nuevoId } from '@/lib/id';
import { clienteDeIntegracion, hayIntegracion } from '@/data/supabase/integracion';
import { aCliente, coachDe, contacto, disparador, hayGhl, oportunidad, type OportunidadGhl } from '@/server/ghl';
import { fichaDeContacto } from '@/server/ghl-ficha';
import { buscarConsultora } from '@/server/ghl-sync';
import type { Cliente } from '@/domain/types';

/**
 * EL AVISO DE GHL · UN CLIENTE NUEVO SE DA DE ALTA SOLO
 *
 * Cuando una oportunidad entra a la etapa de Onboarding del pipeline de
 * clientes, un workflow de GHL pega acá y el cliente aparece en la app sin que
 * nadie tipee nada.
 *
 * Es una ruta y no una acción de servidor por dos motivos: las acciones de
 * servidor sólo se pueden llamar desde la propia app, y tienen un tope de 1 MB
 * que ya nos costó una semana de cargas trabadas.
 *
 * Qué NO hace:
 *
 *  - No escribe en GHL. Lee y escribe en su propia base.
 *  - No borra nada. Un campo que GHL no trae no pisa lo que ya estaba.
 *  - No confía en el cuerpo del aviso para los datos: le cree el identificador
 *    de la oportunidad y va a buscar el resto a la API. Un cuerpo de webhook
 *    es texto que mandó alguien de afuera; la API está autenticada.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Comparación en tiempo constante: un `===` filtra el secreto carácter a carácter. */
function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.GHL_WEBHOOK_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** De dónde sacar el id de la oportunidad, según cómo lo mande el workflow. */
function idDeOportunidad(cuerpo: Record<string, unknown>): string | undefined {
  for (const k of ['opportunityId', 'opportunity_id', 'id']) {
    const v = cuerpo[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const o = cuerpo.opportunity;
  if (o && typeof o === 'object') {
    const v = (o as Record<string, unknown>).id;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export async function POST(req: Request) {
  if (!secretoValido(req.headers.get('x-founders-secreto'))) {
    // Sin detalle: a quien no tiene el secreto no se le explica qué falta.
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!hayGhl()) {
    return NextResponse.json({ ok: false, error: 'Falta configurar GHL en el servidor.' }, { status: 503 });
  }
  if (!hayIntegracion()) {
    return NextResponse.json(
      { ok: false, error: 'Falta el usuario de integración de Supabase en el servidor.' },
      { status: 503 },
    );
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'El cuerpo no es JSON.' }, { status: 400 });
  }

  const id = idDeOportunidad(cuerpo);
  if (!id) {
    return NextResponse.json(
      { ok: false, error: 'El aviso no trae el id de la oportunidad. Agregalo al cuerpo del workflow como `opportunityId`.' },
      { status: 400 },
    );
  }

  let op: OportunidadGhl;
  try {
    op = await oportunidad(id);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'No se pudo leer la oportunidad en GHL.' },
      { status: 502 },
    );
  }

  /**
   * Que el aviso llegue no alcanza: tiene que venir de la etapa que da de
   * alta. Un workflow mal apuntado, o uno que alguien duplique para otra cosa,
   * metería prospectos en la cartera de clientes.
   */
  const d = disparador();
  if (d && (op.pipelineId !== d.pipelineId || op.pipelineStageId !== d.etapaId)) {
    return NextResponse.json(
      { ok: true, ignorado: 'La oportunidad no está en la etapa que da de alta.' },
      { status: 202 },
    );
  }

  const traido = aCliente(op);
  if (!traido) {
    return NextResponse.json(
      { ok: false, error: 'La oportunidad no tiene contacto o no tiene nombre, así que no hay con qué identificar al cliente.' },
      { status: 422 },
    );
  }

  try {
    const sb = await clienteDeIntegracion();

    const { data: equipo } = await sb.from('consultoras').select('id, nombre');
    const consultoraId = buscarConsultora(coachDe(op), equipo ?? []);

    const { data: previos, error: errLectura } = await sb
      .from('clientes')
      .select('*')
      .eq('ghl_contact_id', traido.ghlContactId)
      .limit(1);
    if (errLectura) throw new Error(errLectura.message);

    const campos: Partial<Cliente> = { ...traido.campos };
    if (consultoraId) campos.consultoraId = consultoraId;

    /**
     * El formulario de onboarding ya está en GHL como campos del contacto.
     * Si falla, el cliente entra igual: tenerlo sin ficha es muy distinto de
     * no tenerlo, y el botón «Traer de GHL» la completa después.
     */
    let ficha: ReturnType<typeof fichaDeContacto> | undefined;
    try {
      ficha = fichaDeContacto(await contacto(traido.ghlContactId));
      if (ficha.linkContrato) campos.linkContrato = ficha.linkContrato;
    } catch {
      ficha = undefined;
    }

    const fila = filaDe(previos?.[0] ?? null, campos, traido.ghlContactId, traido.ghlOpportunityId);

    const { error } = await sb.from('clientes').upsert(fila, { onConflict: 'id' });
    if (error) {
      /**
       * RLS devuelve un error, no una excepción. Si esto se traga, el endpoint
       * contesta «listo» sobre una base donde no entró nada — que es
       * exactamente cómo se perdieron 155 filas la otra vez.
       */
      throw new Error(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? `La base rechazó el alta por permisos: ${error.message}. El usuario de integración tiene que tener rol de administración en la tabla consultoras.`
          : error.message,
      );
    }

    /**
     * El expediente —negocio, autoridad, estrategia y objetivo— se escribe
     * desde el botón «Traer de GHL», que corre con una sesión de persona y
     * con el repositorio entero cargado. Acá sólo se guarda el contrato y los
     * datos del cliente; la ficha completa entra en la primera corrida.
     */
    return NextResponse.json({
      ok: true,
      clienteId: fila.id,
      nuevo: !previos?.length,
      nombre: fila.nombre,
      contrato: Boolean(campos.linkContrato),
      camposDeOnboarding: ficha ? Object.keys(ficha.valores).length - 1 : 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Error desconocido.' },
      { status: 500 },
    );
  }
}

/** Los campos en el formato de la tabla. Lo vacío no viaja: no pisa nada. */
function filaDe(
  previo: Record<string, unknown> | null,
  campos: Partial<Cliente>,
  contactId: string,
  opportunityId: string,
) {
  const base: Record<string, unknown> = previo ? { ...previo } : { id: nuevoId() };
  const poner = (col: string, v: unknown) => {
    if (v !== undefined && v !== '') base[col] = v;
  };
  poner('nombre', campos.nombre);
  poner('email', campos.email);
  poner('telefono', campos.telefono);
  poner('programa', campos.programa ?? (previo ? undefined : 'sin programa'));
  poner('fecha_fin_prevista', campos.fechaFinPrevista);
  poner('consultora_id', campos.consultoraId);
  poner('estado', campos.estado ?? (previo ? undefined : 'activo'));
  poner('monto_total', campos.montoTotal);
  poner('cantidad_cuotas', campos.cantidadCuotas);
  poner('link_contrato', campos.linkContrato);
  if (campos.tieneGarantia !== undefined) base.tiene_garantia = campos.tieneGarantia;
  else if (!previo) base.tiene_garantia = false;

  // La fecha firme nunca la degrada una estimada; una real sí pisa a la estimada.
  const firmePrevia = previo && previo.fecha_alta && previo.fecha_alta_provisional === false;
  if (campos.fechaAlta && !(firmePrevia && campos.fechaAltaProvisional)) {
    base.fecha_alta = campos.fechaAlta;
    base.fecha_alta_provisional = campos.fechaAltaProvisional ?? false;
  }

  base.ghl_contact_id = contactId;
  base.ghl_opportunity_id = opportunityId;
  return base as Record<string, unknown> & { id: string; nombre: string };
}

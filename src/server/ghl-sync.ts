import 'server-only';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import type { Cliente } from '@/domain/types';
import type { Reporte, ReporteSolapa } from './planilla';
import { aCliente, coachDe, disparador, hayGhl, oportunidadesDeEtapa, type OportunidadGhl } from './ghl';

/**
 * TRAER LOS CLIENTES DE GHL
 *
 * La venta ya quedó cargada en GHL; esto la trae y no la vuelve a tipear.
 *
 * Tres reglas, las mismas que las otras fuentes:
 *
 *  1. **Se identifica por el contacto de GHL, nunca por parecido de nombre.**
 *     Volver a traer corrige la fila que ya existe en vez de crear otra, y una
 *     renovación —que es el mismo contacto pasando de nuevo por las etapas—
 *     actualiza al cliente en lugar de duplicarlo.
 *  2. **Un campo vacío en GHL no borra lo que ya estaba.** La mitad de las
 *     oportunidades tienen campos sin cargar; si el vacío pisara, cada corrida
 *     borraría lo que alguien completó a mano la semana pasada.
 *  3. **Lo que no se pudo traer se informa con su motivo**, con el nombre del
 *     cliente adelante.
 */

/** Cuántos por corrida. Evita que un timeout deje la cartera a medias. */
const TOPE = Number(process.env.GHL_CLIENTES_POR_CORRIDA) || 100;

/**
 * Fusiona lo que vino de GHL sobre el cliente que ya existe.
 *
 * `undefined` significa «GHL no lo trajo», y eso nunca es una orden de borrar.
 */
export function fusionar(previo: Cliente, nuevo: Partial<Cliente>): Cliente {
  const out: Cliente = { ...previo };
  for (const [k, v] of Object.entries(nuevo)) {
    if (v === undefined || v === '') continue;
    (out as unknown as Record<string, unknown>)[k] = v;
  }
  /**
   * Una excepción deliberada: si el cliente ya tiene una fecha de alta firme,
   * una provisional de GHL no la degrada. Al revés sí — una fecha real pisa a
   * la estimada, que es justo lo que uno quiere que pase.
   */
  if (previo.fechaAlta && previo.fechaAltaProvisional === false && nuevo.fechaAltaProvisional) {
    out.fechaAlta = previo.fechaAlta;
    out.fechaAltaProvisional = false;
  }
  return out;
}

/**
 * La consultora, por nombre.
 *
 * En GHL la coach es un texto de una lista cerrada; acá es una fila del
 * equipo. Si el nombre no coincide con nadie, el cliente entra igual sin
 * consultora y la corrida lo dice: es preferible un cliente sin asignar que un
 * cliente asignado a quien no es.
 */
export function buscarConsultora(
  nombre: string | undefined,
  equipo: { id: string; nombre: string }[],
): string | undefined {
  if (!nombre) return undefined;
  const limpio = nombre.trim().toLowerCase();
  const exacta = equipo.find((c) => c.nombre.trim().toLowerCase() === limpio);
  if (exacta) return exacta.id;
  // Un solo nombre de pila que identifique a una sola persona del equipo.
  const porPila = equipo.filter((c) => c.nombre.trim().toLowerCase().split(/\s+/)[0] === limpio);
  return porPila.length === 1 ? porPila[0].id : undefined;
}

/** Lo que hay que aplicar por una oportunidad, ya resuelto contra lo existente. */
export function resolver(
  o: OportunidadGhl,
  porContacto: Map<string, Cliente>,
  equipo: { id: string; nombre: string }[],
): { cliente: Cliente; nuevo: boolean } | { motivo: string } {
  const traido = aCliente(o);
  if (!traido) {
    return {
      motivo: `«${o.name ?? o.id}»: sin contacto o sin nombre en GHL, así que no hay con qué identificarlo. Se revisa la oportunidad y entra en la próxima corrida.`,
    };
  }

  const consultoraId = buscarConsultora(coachDe(o), equipo);
  const campos: Partial<Cliente> = { ...traido.campos };
  if (consultoraId) campos.consultoraId = consultoraId;

  const previo = porContacto.get(traido.ghlContactId);
  if (previo) {
    return {
      cliente: { ...fusionar(previo, campos), ghlOpportunityId: traido.ghlOpportunityId },
      nuevo: false,
    };
  }

  return {
    cliente: {
      id: nuevoId(),
      nombre: traido.campos.nombre,
      programa: campos.programa ?? 'sin programa',
      fechaAlta: campos.fechaAlta ?? '',
      tieneGarantia: campos.tieneGarantia ?? false,
      estado: campos.estado ?? 'activo',
      ...campos,
      ghlContactId: traido.ghlContactId,
      ghlOpportunityId: traido.ghlOpportunityId,
    } as Cliente,
    nuevo: true,
  };
}

export async function sincronizarGhl(hoy: string): Promise<Reporte> {
  const r: ReporteSolapa = { solapa: 'Clientes de GHL', leidas: 0, aplicadas: 0, salteadas: [] };

  if (!hayGhl()) {
    return {
      at: hoy,
      solapas: [{ ...r, error: 'Faltan `GHL_TOKEN` y `GHL_LOCATION_ID` en el entorno.' }],
    };
  }
  const d = disparador();
  if (!d) {
    return {
      at: hoy,
      solapas: [{
        ...r,
        error:
          'Falta decir qué etapa da de alta a un cliente. Se declara con `GHL_PIPELINE_CLIENTES` y `GHL_ETAPA_ALTA`, y no está en el código a propósito: en esta cuenta se arman pipelines nuevos seguido.',
      }],
    };
  }

  const repo = getRepo();
  // Lectura directa y no `getDataset`: eso memoiza por request, y acá se
  // escribe y se vuelve a leer dentro del mismo request.
  const dataset = await repo.cargarTodo(hoy);
  const porContacto = new Map(
    dataset.clientes
      .filter((c): c is Cliente & { ghlContactId: string } => Boolean(c.ghlContactId))
      .map((c) => [c.ghlContactId, c as Cliente]),
  );
  const equipo = dataset.equipo.map((c) => ({ id: c.id, nombre: c.nombre }));

  try {
    const oportunidades = await oportunidadesDeEtapa(d.pipelineId, d.etapaId, TOPE + 1);
    const tanda = oportunidades.slice(0, TOPE);
    r.leidas = oportunidades.length;

    let altas = 0;
    let sinConsultora = 0;
    for (const o of tanda) {
      const res = resolver(o, porContacto, equipo);
      if ('motivo' in res) {
        r.salteadas.push({ fila: 0, motivo: res.motivo });
        continue;
      }
      await repo.guardarCliente(res.cliente);
      porContacto.set(res.cliente.ghlContactId!, res.cliente);
      if (res.nuevo) altas++;
      if (!res.cliente.consultoraId) sinConsultora++;
      r.aplicadas++;
    }

    r.nota = `${altas} cliente(s) nuevos y ${r.aplicadas - altas} actualizados.`;
    if (sinConsultora) {
      r.salteadas.push({
        fila: 0,
        motivo: `${sinConsultora} cliente(s) entraron sin consultora porque el nombre de la coach en GHL no coincide con nadie del equipo. Se asignan a mano, o se corrige el nombre en el equipo.`,
      });
    }
    if (oportunidades.length > tanda.length) {
      r.restantes = oportunidades.length - tanda.length;
      r.nota += ` Se procesaron ${tanda.length} de ${oportunidades.length}; volvé a traer para seguir.`;
    }
  } catch (e) {
    r.error = e instanceof Error ? e.message : 'Error desconocido.';
  }

  return { at: hoy, solapas: [r] };
}

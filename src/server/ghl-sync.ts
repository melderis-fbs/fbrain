import 'server-only';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import type { Cliente, DocumentoCliente } from '@/domain/types';
import type { Reporte, ReporteSolapa } from './planilla';
import { CAMPO, aCliente, coachDe, contacto, diccionarioDeCampos, disparador, hayGhl, oportunidadesDeEtapa, type OportunidadGhl } from './ghl';
import { brief, briefComoTexto, fichaDeContacto, tipoDeContrato } from './ghl-ficha';
import { escribirFicha } from './planilla';

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
    /**
     * El diccionario de preguntas, una vez por corrida y no una por cliente:
     * son 234 campos y no cambian entre un cliente y el siguiente. Si falla,
     * la corrida sigue sin el brief — el cliente y su ficha valen igual.
     */
    let diccionario = new Map<string, string>();
    try {
      diccionario = await diccionarioDeCampos();
    } catch {
      r.salteadas.push({
        fila: 0,
        motivo: 'No se pudo leer el diccionario de preguntas de GHL, así que esta corrida no guarda el formulario de onboarding. Los clientes y sus fichas entran igual.',
      });
    }

    const oportunidades = await oportunidadesDeEtapa(d.pipelineId, d.etapaId, TOPE + 1);
    const tanda = oportunidades.slice(0, TOPE);
    r.leidas = oportunidades.length;

    let altas = 0;
    let sinConsultora = 0;
    let conFicha = 0;
    let conContrato = 0;
    let conBrief = 0;
    const sinNumero: string[] = [];
    for (const o of tanda) {
      const res = resolver(o, porContacto, equipo);
      if ('motivo' in res) {
        r.salteadas.push({ fila: 0, motivo: res.motivo });
        continue;
      }
      /**
       * El formulario de onboarding, que ya vive en GHL como campos del
       * contacto. Se pide aparte porque la búsqueda de oportunidades trae el
       * contacto sin sus campos.
       *
       * Si esta llamada falla, el cliente igual entra: tener al cliente sin
       * ficha es muy distinto de no tenerlo. Se informa y la próxima corrida
       * vuelve a intentar.
       */
      let ficha: ReturnType<typeof fichaDeContacto> | undefined;
      let textoBrief: string | undefined;
      try {
        const ct = await contacto(res.cliente.ghlContactId!);
        ficha = fichaDeContacto(ct);
        if (ficha.linkContrato) res.cliente.linkContrato = ficha.linkContrato;
        const tipo = tipoDeContrato(ct);
        if (tipo) res.cliente.tipoContrato = tipo;
        if (diccionario.size) {
          const b = brief(ct, diccionario);
          if (b.bloques.length || b.otras.length) textoBrief = briefComoTexto(b);
        }
      } catch (e) {
        r.salteadas.push({
          fila: 0,
          motivo: `«${res.cliente.nombre}»: entró el cliente pero no se pudo leer su formulario de onboarding (${e instanceof Error ? e.message : 'error'}). Se reintenta en la próxima corrida.`,
        });
      }

      const otos = o.customFields?.find((c) => c.id === CAMPO.otos)?.fieldValueString?.trim();
      if (otos) res.cliente.beneficiosExtra = otos;

      await repo.guardarCliente(res.cliente);
      porContacto.set(res.cliente.ghlContactId!, res.cliente);

      /**
       * El formulario entero, como documento del expediente.
       *
       * Es lo único que la consultora tiene del cliente antes de conocerlo, y
       * la ficha sólo se queda con nueve de sus respuestas. La clave es el
       * cliente más el tipo: hay un solo onboarding, así que volver a traer
       * corrige ese texto en vez de apilar copias.
       */
      if (textoBrief) {
        const previo = dataset.documentos.find(
          (doc) => doc.clienteId === res.cliente.id && doc.tipo === 'formulario_onboarding',
        );
        const doc: DocumentoCliente = {
          id: previo?.id ?? nuevoId(),
          clienteId: res.cliente.id,
          tipo: 'formulario_onboarding',
          titulo: 'Formulario de onboarding',
          contenido: textoBrief,
          fecha: previo?.fecha ?? (res.cliente.fechaAlta || hoy),
          creadoAt: previo?.creadoAt ?? hoy,
        };
        await repo.guardarDocumento(doc);
        conBrief++;
      }

      if (ficha) {
        // Lo del formulario es dato cargado, no propuesta: lo escribió el
        // cliente. La confirmación es para lo que deduce el motor de un texto.
        await escribirFicha(ficha.valores, res.cliente.id, dataset, repo, hoy, 'Formulario de onboarding (GHL)');
        if (ficha.linkContrato) conContrato++;
        if (Object.keys(ficha.valores).length > 1) conFicha++;
        for (const s of ficha.sinConvertir) {
          sinNumero.push(`«${res.cliente.nombre}» · ${s.campo}: «${s.texto.slice(0, 60)}»`);
        }
      }

      if (res.nuevo) altas++;
      if (!res.cliente.consultoraId) sinConsultora++;
      r.aplicadas++;
    }

    r.nota =
      `${altas} cliente(s) nuevos y ${r.aplicadas - altas} actualizados. ` +
      `${conFicha} con ficha del formulario de onboarding, ${conBrief} con el brief guardado, ${conContrato} con contrato.`;
    if (sinNumero.length) {
      /**
       * El ticket y la meta vienen como texto libre o como rango. De ahí sale
       * la cuenta inversa —cuántas conversaciones por semana se le pide al
       * cliente—, así que deducir un número de «entre 5.000 y 10.000» sería
       * fijarle un objetivo inventado. Se deja sin cargar y se dice cuál era
       * el texto, para que alguien lo complete mirando el caso.
       */
      r.salteadas.push({
        fila: 0,
        motivo:
          `${sinNumero.length} dato(s) numéricos quedaron sin cargar porque en el formulario son un rango o texto, y de ahí sale la cuenta inversa: ` +
          sinNumero.slice(0, 8).join(' · ') + (sinNumero.length > 8 ? ' …' : ''),
      });
    }
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

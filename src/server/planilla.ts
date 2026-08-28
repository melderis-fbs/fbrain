import 'server-only';
import { getRepo } from '@/data';
import { mondayOf } from '@/lib/date';
import { fechaDePlanilla as fecha, normalizarEncabezado as normalizar, numeroDePlanilla as numero, parsearCsv } from '@/lib/csv';
import type {
  AsistenciaMentoria, Autoridad, Cliente, EstrategiaVersion, MetricaSemanal,
  Mentoria, Negocio, ObjetivoComercial, Pago,
} from '@/domain/types';
import {
  ASISTENCIAS, CLIENTES, CUOTAS, ESTADO_CLIENTE, ESTADO_PAGO, MENTORIAS,
  METRICAS, PAGOS, SOLAPAS, type Mapeo,
} from './planilla-mapeo';

/**
 * LA PLANILLA CONSOLIDADA
 *
 * Una sola planilla en Drive con cuatro solapas, y la app la lee. La regla del
 * paquete es "no migrar nada de lugar": el equipo sigue trabajando donde ya
 * trabaja y acá se sincroniza, en vez de pedirle a nadie que cargue dos veces.
 *
 * Tres reglas de ingesta que no se negocian:
 *
 *  1. Celda vacía ≠ cero. Vacío es `null`. Un cero significa que se midió y dio
 *     cero; vacío significa que nadie lo midió. La diferencia es todo el
 *     diagnóstico.
 *  2. Fila con cliente no identificable: se saltea y se informa. No se inventa
 *     y no se adivina por parecido de nombre.
 *  3. Nada de lo que el consultor carga en la app se pisa desde la planilla:
 *     sesiones, reportes, compromisos, lecturas y alertas no se tocan acá.
 */

export function hayPlanilla(): boolean {
  return Boolean(process.env.SHEETS_PLANILLA_ID);
}

/**
 * Se lee por el export CSV de Google, que no necesita service account: alcanza
 * con que la planilla esté compartida como "cualquiera con el enlace puede
 * ver". Es una integración menos que mantener y funciona en WebContainer,
 * donde no hay forma de firmar un JWT con librerías nativas.
 */
function urlSolapa(solapa: string): string {
  const id = process.env.SHEETS_PLANILLA_ID;
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(solapa)}`;
}

type Fila = Record<string, string>;

function aFilas(csv: string[][]): Fila[] {
  if (!csv.length) return [];
  const encabezados = csv[0].map(normalizar);
  return csv.slice(1).map((f) => {
    const o: Fila = {};
    encabezados.forEach((h, i) => {
      if (h && o[h] === undefined) o[h] = (f[i] ?? '').trim();
    });
    return o;
  });
}

/** Busca el valor de un campo probando todos sus alias. */
function campo(fila: Fila, alias: string[]): string {
  for (const a of alias) {
    const v = fila[normalizar(a)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}
const leer = (fila: Fila, mapeo: Mapeo, key: string) => campo(fila, mapeo[key] ?? []);

// ------------------------------------------------------------- conversiones

const opcional = (v: string) => (v.trim() === '' ? undefined : v.trim());

const booleano = (v: string): boolean => ['si', 'sí', 'true', 'x', '1', 'yes', 'ok'].includes(normalizar(v));

const idDe = (nombre: string) => normalizar(nombre).replace(/ /g, '-').slice(0, 48);

// ------------------------------------------------------------------ reporte

export type ReporteSolapa = {
  solapa: string;
  leidas: number;
  aplicadas: number;
  salteadas: { fila: number; motivo: string }[];
  error?: string;
};
export type Reporte = { at: string; solapas: ReporteSolapa[] };

async function bajar(solapa: string): Promise<Fila[]> {
  const res = await fetch(urlSolapa(solapa), { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `No existe la solapa «${solapa}», o la planilla no está compartida como "cualquiera con el enlace puede ver".`
        : `Google devolvió ${res.status} al leer «${solapa}».`,
    );
  }
  const texto = await res.text();
  if (texto.trimStart().startsWith('<')) {
    throw new Error(
      `Google devolvió HTML en vez de CSV para «${solapa}». Casi siempre es que la planilla no está compartida por enlace.`,
    );
  }
  return aFilas(parsearCsv(texto));
}

// ---------------------------------------------------------------- sincronía

export async function sincronizar(hoy: string): Promise<Reporte> {
  if (!hayPlanilla()) {
    return { at: hoy, solapas: [{ solapa: '—', leidas: 0, aplicadas: 0, salteadas: [], error: 'Falta SHEETS_PLANILLA_ID.' }] };
  }

  const repo = getRepo();
  const dataset = await repo.cargarTodo(hoy);
  const porNombre = new Map(dataset.clientes.map((c) => [normalizar(c.nombre), c]));
  const consultoraPorNombre = new Map(dataset.equipo.map((c) => [normalizar(c.nombre), c.id]));

  const solapas: ReporteSolapa[] = [];

  // ------------------------------------------------------------ 1 · clientes
  const rc: ReporteSolapa = { solapa: SOLAPAS.clientes, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.clientes);
    rc.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, CLIENTES, 'nombre');
      if (!nombre) { rc.salteadas.push({ fila: i + 2, motivo: 'Sin nombre de cliente.' }); continue; }

      const previo = porNombre.get(normalizar(nombre));
      const id = previo?.id ?? idDe(nombre);
      const alta = fecha(leer(f, CLIENTES, 'fechaAlta')) ?? previo?.fechaAlta;
      if (!alta) { rc.salteadas.push({ fila: i + 2, motivo: `«${nombre}» no tiene fecha de alta y es cliente nuevo.` }); continue; }

      const nombreConsultora = leer(f, CLIENTES, 'consultora');
      const consultoraId = nombreConsultora
        ? consultoraPorNombre.get(normalizar(nombreConsultora))
        : previo?.consultoraId;
      if (nombreConsultora && !consultoraId) {
        rc.salteadas.push({ fila: i + 2, motivo: `Consultora «${nombreConsultora}» no existe en el equipo. El cliente se cargó sin asignar.` });
      }

      const cliente: Cliente = {
        ...previo,
        id,
        nombre,
        email: opcional(leer(f, CLIENTES, 'email')) ?? previo?.email,
        telefono: opcional(leer(f, CLIENTES, 'telefono')) ?? previo?.telefono,
        programa: opcional(leer(f, CLIENTES, 'programa')) ?? previo?.programa ?? 'Founders',
        fechaAlta: alta,
        fechaFinPrevista: fecha(leer(f, CLIENTES, 'fechaFinPrevista')) ?? previo?.fechaFinPrevista,
        planPago: opcional(leer(f, CLIENTES, 'planPago')) ?? previo?.planPago,
        tieneGarantia: booleano(leer(f, CLIENTES, 'tieneGarantia')) || Boolean(previo?.tieneGarantia),
        fuente: opcional(leer(f, CLIENTES, 'fuente')) ?? previo?.fuente,
        consultoraId,
        estado: ESTADO_CLIENTE[normalizar(leer(f, CLIENTES, 'estado'))] ?? previo?.estado ?? 'activo',
        horasRealesSemana: numero(leer(f, CLIENTES, 'horasRealesSemana')) ?? previo?.horasRealesSemana,
        diasGraciaPago: numero(leer(f, CLIENTES, 'diasGraciaPago')) ?? previo?.diasGraciaPago,
        nivelVendido: opcional(leer(f, CLIENTES, 'nivelVendido')) ?? previo?.nivelVendido,
      };
      await repo.guardarCliente(cliente);
      porNombre.set(normalizar(nombre), cliente);

      const moneda = opcional(leer(f, CLIENTES, 'moneda')) ?? 'ARS';

      // --- negocio
      const negocio: Negocio = {
        clienteId: id,
        queVende: opcional(leer(f, CLIENTES, 'queVende')),
        aQuien: opcional(leer(f, CLIENTES, 'aQuien')),
        precio: numero(leer(f, CLIENTES, 'negocioPrecio')) ?? undefined,
        moneda,
        comoEntrega: opcional(leer(f, CLIENTES, 'comoEntrega')),
        facturacionMensual: numero(leer(f, CLIENTES, 'facturacionMensual')) ?? undefined,
        cantidadClientes: numero(leer(f, CLIENTES, 'cantidadClientes')) ?? undefined,
        origenClientes: opcional(leer(f, CLIENTES, 'origenClientes')),
        queFunciono: opcional(leer(f, CLIENTES, 'queFunciono')),
        queNoFunciono: opcional(leer(f, CLIENTES, 'queNoFunciono')),
        actualizadoAt: hoy,
      };
      if (Object.values(negocio).some((x) => x !== undefined && x !== id && x !== hoy && x !== moneda)) {
        await repo.guardarNegocio(negocio);
      }

      // --- autoridad
      const industrias = leer(f, CLIENTES, 'industriasQueConoce');
      const autoridad: Autoridad = {
        clienteId: id,
        haceExcepcionalmenteBien: opcional(leer(f, CLIENTES, 'haceExcepcionalmenteBien')),
        experienciaProfesional: opcional(leer(f, CLIENTES, 'experienciaProfesional')),
        resultadosPropios: opcional(leer(f, CLIENTES, 'resultadosPropios')),
        resultadosTerceros: opcional(leer(f, CLIENTES, 'resultadosTerceros')),
        industriasQueConoce: industrias ? industrias.split(',').map((x) => x.trim()).filter(Boolean) : [],
        autoridadDesperdiciada: opcional(leer(f, CLIENTES, 'autoridadDesperdiciada')),
        actualizadoAt: hoy,
      };
      if (autoridad.industriasQueConoce.length || autoridad.haceExcepcionalmenteBien || autoridad.experienciaProfesional) {
        await repo.guardarAutoridad(autoridad);
      }

      // --- estrategia · append-only, sólo si cambió algo
      const previa = dataset.estrategias.filter((e) => e.clienteId === id).at(-1);
      const est = {
        clienteIdeal: opcional(leer(f, CLIENTES, 'clienteIdeal')),
        problema: opcional(leer(f, CLIENTES, 'problema')),
        deseo: opcional(leer(f, CLIENTES, 'deseo')),
        promesa: opcional(leer(f, CLIENTES, 'promesa')),
        oferta: opcional(leer(f, CLIENTES, 'oferta')),
        mecanismo: opcional(leer(f, CLIENTES, 'mecanismo')),
        canal: opcional(leer(f, CLIENTES, 'canal')),
        precio: numero(leer(f, CLIENTES, 'estrategiaPrecio')) ?? undefined,
      };
      const hayEstrategia = Object.values(est).some((x) => x !== undefined);
      const cambio = !previa || (Object.keys(est) as (keyof typeof est)[]).some(
        (k) => est[k] !== ((previa as unknown as Record<string, unknown>)[k] ?? undefined),
      );
      if (hayEstrategia && cambio) {
        const nueva: EstrategiaVersion = {
          id: `${id}-e${Date.now()}`,
          clienteId: id,
          version: (previa?.version ?? 0) + 1,
          ...est,
          moneda,
          vigenteDesde: hoy,
          motivoCambio: opcional(leer(f, CLIENTES, 'motivoCambio')) ?? 'Importado de la planilla',
          iniciativa: 'consultora',
        };
        await repo.guardarEstrategia(nueva);
      }

      // --- objetivo comercial
      const meta = numero(leer(f, CLIENTES, 'metaMensual'));
      const ticket = numero(leer(f, CLIENTES, 'ticket'));
      const objPrevio = dataset.objetivos.filter((o) => o.clienteId === id).at(-1);
      if (meta !== null && ticket !== null &&
          (!objPrevio || objPrevio.metaMensual !== meta || objPrevio.ticket !== ticket)) {
        const objetivo: ObjetivoComercial = {
          id: `${id}-o${Date.now()}`,
          clienteId: id,
          metaMensual: meta,
          ticket,
          moneda,
          tasaCierre: objPrevio?.tasaCierre ?? 0.25,
          tasaAsistencia: objPrevio?.tasaAsistencia ?? 0.7,
          tasaAgendamiento: objPrevio?.tasaAgendamiento ?? 0.2,
          tasaAvance: objPrevio?.tasaAvance ?? 0.3,
          tasaDmSobreAlcance: objPrevio?.tasaDmSobreAlcance ?? 0.02,
          diaInicioProspeccion: objPrevio?.diaInicioProspeccion ?? 14,
          vigenteDesde: hoy,
        };
        await repo.guardarObjetivo(objetivo);
      }

      // --- las cuatro cuotas de finanzas, en formato ancho
      for (const [n, def] of CUOTAS.entries()) {
        const monto = numero(campo(f, def.monto));
        const venc = fecha(campo(f, def.fecha));
        const estadoCrudo = normalizar(campo(f, def.estado));
        if (monto === null && !venc && !estadoCrudo) continue;

        const estado = ESTADO_PAGO[estadoCrudo] ?? (venc && venc < hoy ? 'vencido' : 'pendiente');
        const pago: Pago = {
          id: `${id}-c${n + 1}`,
          clienteId: id,
          numeroCuota: n + 1,
          monto: monto ?? 0,
          moneda,
          fechaVencimiento: venc ?? alta,
          fechaPago: estado === 'pagado' ? venc : undefined,
          estado,
        };
        await repo.guardarPago(pago);
      }

      rc.aplicadas++;
    }
  } catch (e) {
    rc.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(rc);

  // ------------------------------------------------------------ 2 · métricas
  const rm: ReporteSolapa = { solapa: SOLAPAS.metricas, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.metricas);
    rm.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, METRICAS, 'cliente');
      const c = porNombre.get(normalizar(nombre));
      if (!c) { rm.salteadas.push({ fila: i + 2, motivo: `Cliente «${nombre || '(vacío)'}» no identificable.` }); continue; }
      const semanaCruda = fecha(leer(f, METRICAS, 'semana'));
      if (!semanaCruda) { rm.salteadas.push({ fila: i + 2, motivo: `Semana ilegible para «${nombre}».` }); continue; }
      const semana = mondayOf(semanaCruda);

      const m: MetricaSemanal = {
        id: `${c.id}-${semana}`,
        clienteId: c.id,
        semanaIso: semana,
        contenidoPublicado: numero(leer(f, METRICAS, 'contenidoPublicado')),
        alcanceTotal: numero(leer(f, METRICAS, 'alcanceTotal')),
        alcanceNoSeguidores: numero(leer(f, METRICAS, 'alcanceNoSeguidores')),
        dmsIniciados: numero(leer(f, METRICAS, 'dmsIniciados')),
        conversacionesAvanzadas: numero(leer(f, METRICAS, 'conversacionesAvanzadas')),
        leads: numero(leer(f, METRICAS, 'leads')),
        leadsCalificados: numero(leer(f, METRICAS, 'leadsCalificados')),
        agendas: numero(leer(f, METRICAS, 'agendas')),
        asistencias: numero(leer(f, METRICAS, 'asistencias')),
        cancelaciones: numero(leer(f, METRICAS, 'cancelaciones')),
        llamadas: numero(leer(f, METRICAS, 'asistencias')),
        ofertasRealizadas: numero(leer(f, METRICAS, 'ofertasRealizadas')),
        ventas: numero(leer(f, METRICAS, 'ventas')),
        facturado: numero(leer(f, METRICAS, 'facturado')),
        ticketPromedio: numero(leer(f, METRICAS, 'ticketPromedio')),
        inversionAds: numero(leer(f, METRICAS, 'inversionAds')),
        objeciones: [],
        origenOportunidades: {},
      };
      await repo.guardarMetrica(m);
      rm.aplicadas++;
    }
  } catch (e) {
    rm.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(rm);

  // --------------------------------------------------------------- 3 · pagos
  const rp: ReporteSolapa = { solapa: SOLAPAS.pagos, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.pagos);
    rp.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, PAGOS, 'cliente');
      const c = porNombre.get(normalizar(nombre));
      if (!c) { rp.salteadas.push({ fila: i + 2, motivo: `Cliente «${nombre || '(vacío)'}» no identificable.` }); continue; }
      const cuota = numero(leer(f, PAGOS, 'numeroCuota'));
      const venc = fecha(leer(f, PAGOS, 'fechaVencimiento'));
      if (cuota === null || !venc) { rp.salteadas.push({ fila: i + 2, motivo: `Falta cuota o vencimiento para «${nombre}».` }); continue; }

      const pagado = fecha(leer(f, PAGOS, 'fechaPago'));
      const p: Pago = {
        id: `${c.id}-c${cuota}`,
        clienteId: c.id,
        numeroCuota: cuota,
        monto: numero(leer(f, PAGOS, 'monto')) ?? 0,
        moneda: opcional(leer(f, PAGOS, 'moneda')) ?? 'ARS',
        fechaVencimiento: venc,
        fechaPago: pagado,
        estado: ESTADO_PAGO[normalizar(leer(f, PAGOS, 'estado'))] ?? (pagado ? 'pagado' : venc < hoy ? 'vencido' : 'pendiente'),
      };
      await repo.guardarPago(p);
      rp.aplicadas++;
    }
  } catch (e) {
    rp.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(rp);

  // --------------------------------------------------------- 4 · asistencias
  const ra: ReporteSolapa = { solapa: SOLAPAS.asistencias, leidas: 0, aplicadas: 0, salteadas: [] };
  try {
    const filas = await bajar(SOLAPAS.asistencias);
    ra.leidas = filas.length;
    for (const [i, f] of filas.entries()) {
      const nombre = leer(f, ASISTENCIAS, 'cliente');
      const c = porNombre.get(normalizar(nombre));
      if (!c) { ra.salteadas.push({ fila: i + 2, motivo: `Cliente «${nombre || '(vacío)'}» no identificable.` }); continue; }
      const f2 = fecha(leer(f, ASISTENCIAS, 'fecha'));
      const mentoriaCruda = normalizar(leer(f, ASISTENCIAS, 'mentoria'));
      const mentoria = MENTORIAS.find((m) => mentoriaCruda.includes(m));
      if (!f2 || !mentoria) {
        ra.salteadas.push({ fila: i + 2, motivo: `Fecha o mentoría ilegible para «${nombre}». Mentorías válidas: ${MENTORIAS.join(', ')}.` });
        continue;
      }
      const a: AsistenciaMentoria = {
        id: `${c.id}-${mentoria}-${f2}`,
        clienteId: c.id,
        mentoria: mentoria as Mentoria,
        fecha: f2,
        asistio: booleano(leer(f, ASISTENCIAS, 'asistio')),
      };
      await repo.guardarAsistencia(a);
      ra.aplicadas++;
    }
  } catch (e) {
    ra.error = e instanceof Error ? e.message : 'Error desconocido.';
  }
  solapas.push(ra);

  return { at: hoy, solapas };
}

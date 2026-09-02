import { cache } from 'react';
import { getRepo, getDataset } from '@/data';
import type { Dataset } from '@/data/repo';
import { aplicarTechoSemanal, correrReglas, type AlertaViva } from '@/domain/alertas';
import {
  atribuir, desvioDeHitos, guionConfrontacion,
  type Atribucion, type DesvioHitos, type Guion,
} from '@/domain/atribucion';
import { leerCobranza, resumenCobranza, type LecturaCobranza, type ResumenCobranza } from '@/domain/cobranza';
import { leerEmbudo, type LecturaEmbudo } from '@/domain/embudo';
import { construirContexto, type ContextoCliente, type RegistrosCliente } from '@/domain/expediente';
import { calcularIndice, type Indice } from '@/domain/indice';
import { calcularSemaforo } from '@/domain/semaforo';
import { construirTimeline } from '@/domain/timeline';
import { armarItem, ordenarTriage, type ItemTriage } from '@/domain/triage';
import type { Consultora, EventoTimeline, Semaforo } from '@/domain/types';

export interface VistaCliente {
  ctx: ContextoCliente;
  indice: Indice;
  semaforo: Semaforo;
  alertas: AlertaViva[];
  alertasAbiertas: AlertaViva[];
  embudo: LecturaEmbudo;
  triage: ItemTriage;
  timeline: EventoTimeline[];
  consultora?: Consultora;
  /** ¿Es el cliente o somos nosotros? */
  atribucion: Atribucion;
  desvio: DesvioHitos;
  guion: Guion;
  /** El carril de cobranza, que no mira nada de lo de arriba */
  cobranza: LecturaCobranza;
}

export interface Workspace {
  hoy: string;
  modo: 'demo' | 'supabase';
  dataset: Dataset;
  equipo: Consultora[];
  consultoras: Consultora[];
  vistas: VistaCliente[];
  porId: Map<string, VistaCliente>;
  /** Alertas de toda la cartera, ya con el techo semanal aplicado */
  bandeja: AlertaViva[];
  cobranza: ResumenCobranza;
}

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Punto único de cálculo. Todas las pantallas leen de acá, así el semáforo y el
 * índice de un cliente son exactamente los mismos en la cartera, en el triage y
 * en su expediente. Sin esto aparecen números que no coinciden, y ese es el día
 * en que el equipo deja de confiar en la app.
 */
export const getWorkspace = cache(async (): Promise<Workspace> => {
  const hoy = hoyIso();
  const dataset = await getDataset(hoy);

  const porCliente = <T extends { clienteId: string }>(arr: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of arr) {
      const l = m.get(x.clienteId);
      if (l) l.push(x);
      else m.set(x.clienteId, [x]);
    }
    return m;
  };

  const negocios = new Map(dataset.negocios.map((x) => [x.clienteId, x]));
  const autoridades = new Map(dataset.autoridades.map((x) => [x.clienteId, x]));
  const objetivos = new Map(dataset.objetivos.map((x) => [x.clienteId, x]));
  const estrategias = porCliente(dataset.estrategias);
  const metricas = porCliente(dataset.metricas);
  const sesiones = porCliente(dataset.sesiones);
  const compromisos = porCliente(dataset.compromisos);
  const pagos = porCliente(dataset.pagos);
  const asistencias = porCliente(dataset.asistencias);
  const documentos = porCliente(dataset.documentos);
  const hitos = porCliente(dataset.hitos);
  const lecturas = porCliente(dataset.lecturas);
  const alertas = porCliente(dataset.alertas);
  const traspasos = porCliente(dataset.traspasos);
  const diagnosticos = porCliente(dataset.diagnosticos);
  const prorrogas = porCliente(dataset.prorrogas);
  const bajas = porCliente(dataset.bajas);
  const atribuciones = porCliente(dataset.atribuciones);
  const revisiones = porCliente(dataset.revisiones);
  const equipoPorId = new Map(dataset.equipo.map((c) => [c.id, c]));

  const vistas: VistaCliente[] = dataset.clientes.map((cliente) => {
    const registros: RegistrosCliente = {
      cliente,
      negocio: negocios.get(cliente.id),
      autoridad: autoridades.get(cliente.id),
      estrategias: estrategias.get(cliente.id) ?? [],
      objetivo: objetivos.get(cliente.id),
      metricas: metricas.get(cliente.id) ?? [],
      sesiones: sesiones.get(cliente.id) ?? [],
      compromisos: compromisos.get(cliente.id) ?? [],
      pagos: pagos.get(cliente.id) ?? [],
      asistencias: asistencias.get(cliente.id) ?? [],
      hitos: hitos.get(cliente.id) ?? [],
      lecturas: lecturas.get(cliente.id) ?? [],
      alertas: alertas.get(cliente.id) ?? [],
      traspasos: traspasos.get(cliente.id) ?? [],
      diagnosticos: diagnosticos.get(cliente.id) ?? [],
      documentos: (documentos.get(cliente.id) ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha)),
      prorrogas: prorrogas.get(cliente.id) ?? [],
      bajas: (bajas.get(cliente.id) ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha)),
      atribuciones: (atribuciones.get(cliente.id) ?? []).sort((a, b) => b.at.localeCompare(a.at)),
      revisiones: (revisiones.get(cliente.id) ?? []).sort((a, b) => b.fecha.localeCompare(a.fecha)),
    };
    const consultora = cliente.consultoraId ? equipoPorId.get(cliente.consultoraId) : undefined;
    const ctx = construirContexto(registros, hoy, consultora);
    const vivas = correrReglas(ctx);
    const indice = calcularIndice(ctx);
    const semaforo = calcularSemaforo(vivas);
    const embudo = leerEmbudo(ctx);
    const atribucion = atribuir(ctx, vivas);
    const desvio = desvioDeHitos(ctx);
    const triage = armarItem({ ctx, indice, semaforo, alertas: vivas, embudo, consultora, atribucion, desvio });
    return {
      ctx,
      indice,
      semaforo,
      alertas: vivas,
      alertasAbiertas: vivas.filter((a) => !a.cerradaAt),
      embudo,
      triage,
      timeline: construirTimeline(ctx, vivas),
      consultora,
      atribucion,
      desvio,
      guion: guionConfrontacion(ctx, atribucion),
      cobranza: leerCobranza(ctx),
    };
  });

  const todasAbiertas = vistas.flatMap((v) => v.alertasAbiertas);
  const bandeja = aplicarTechoSemanal(todasAbiertas, 10);
  const cobranza = resumenCobranza(
    vistas
      .filter((v) => v.ctx.cliente.estado !== 'finalizado')
      .map((v) => ({ lectura: v.cobranza, prorrogas: v.ctx.registros.prorrogas })),
  );

  return {
    hoy,
    modo: getRepo().modo,
    dataset,
    equipo: dataset.equipo,
    consultoras: dataset.equipo.filter((c) => c.rol === 'consultora'),
    vistas,
    porId: new Map(vistas.map((v) => [v.ctx.cliente.id, v])),
    bandeja,
    cobranza,
  };
});

/**
 * La bandeja de cobranza. Ordena por su propia severidad y NO por el semáforo:
 * es el carril que no discute el servicio.
 */
export function bandejaCobranza(ws: Workspace): VistaCliente[] {
  return ws.vistas
    .filter((v) => v.ctx.cliente.estado !== 'finalizado')
    .filter((v) => v.cobranza.estado !== 'al_dia' && v.cobranza.estado !== 'cerrado')
    .sort(
      (a, b) =>
        b.cobranza.orden - a.cobranza.orden ||
        (a.cobranza.limite ?? '9999').localeCompare(b.cobranza.limite ?? '9999'),
    );
}

export function triage(ws: Workspace, filtro?: (v: VistaCliente) => boolean): ItemTriage[] {
  return ordenarTriage(
    ws.vistas
      .filter((v) => v.ctx.cliente.estado === 'activo')
      .filter((v) => (filtro ? filtro(v) : true))
      .map((v) => v.triage),
  );
}

export function alertaPorId(ws: Workspace, id: string) {
  for (const v of ws.vistas) {
    const a = v.alertas.find((x) => x.id === id);
    if (a) return { alerta: a, vista: v };
  }
  return null;
}

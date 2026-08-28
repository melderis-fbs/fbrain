/**
 * Verificación del motor sobre la cartera de demostración.
 * npm run inspect
 */
import { generarDataset, resumenDataset } from '../src/data/demo/generar';
import { CONSULTORAS, CARGA } from '../src/data/demo/gente';
import { construirContexto } from '../src/domain/expediente';
import { correrReglas, aplicarTechoSemanal } from '../src/domain/alertas';
import { atribuir, desvioDeHitos } from '../src/domain/atribucion';
import { leerCobranza, resumenCobranza } from '../src/domain/cobranza';
import { calcularIndice } from '../src/domain/indice';
import { calcularSemaforo } from '../src/domain/semaforo';
import { leerEmbudo } from '../src/domain/embudo';
import { armarItem } from '../src/domain/triage';

const hoy = new Date().toISOString().slice(0, 10);
const d = generarDataset(hoy);
console.log('dataset:', resumenDataset(d));

const idx = <T extends { clienteId: string }>(arr: T[]) => {
  const m = new Map<string, T[]>();
  for (const x of arr) (m.get(x.clienteId) ?? m.set(x.clienteId, []).get(x.clienteId)!).push(x);
  return m;
};

const negocios = new Map(d.negocios.map((x) => [x.clienteId, x]));
const autoridades = new Map(d.autoridades.map((x) => [x.clienteId, x]));
const objetivos = new Map(d.objetivos.map((x) => [x.clienteId, x]));
const es = idx(d.estrategias), me = idx(d.metricas), se = idx(d.sesiones), co = idx(d.compromisos);
const pa = idx(d.pagos), asi = idx(d.asistencias), hi = idx(d.hitos), le = idx(d.lecturas);
const al = idx(d.alertas), tr = idx(d.traspasos), di = idx(d.diagnosticos);
const pr = idx(d.prorrogas), ba = idx(d.bajas), at = idx(d.atribuciones), rv = idx(d.revisiones);

const filas = d.clientes.map((cliente) => {
  const consultora = CONSULTORAS.find((c) => c.id === cliente.consultoraId);
  const ctx = construirContexto(
    {
      cliente,
      negocio: negocios.get(cliente.id),
      autoridad: autoridades.get(cliente.id),
      estrategias: es.get(cliente.id) ?? [],
      objetivo: objetivos.get(cliente.id),
      metricas: me.get(cliente.id) ?? [],
      sesiones: se.get(cliente.id) ?? [],
      compromisos: co.get(cliente.id) ?? [],
      pagos: pa.get(cliente.id) ?? [],
      asistencias: asi.get(cliente.id) ?? [],
      hitos: hi.get(cliente.id) ?? [],
      lecturas: le.get(cliente.id) ?? [],
      alertas: al.get(cliente.id) ?? [],
      traspasos: tr.get(cliente.id) ?? [],
      diagnosticos: di.get(cliente.id) ?? [],
      prorrogas: pr.get(cliente.id) ?? [],
      bajas: ba.get(cliente.id) ?? [],
      atribuciones: at.get(cliente.id) ?? [],
      revisiones: rv.get(cliente.id) ?? [],
    },
    hoy,
    consultora,
  );
  const alertas = correrReglas(ctx);
  const indice = calcularIndice(ctx);
  const semaforo = calcularSemaforo(alertas);
  const embudo = leerEmbudo(ctx);
  const atribucion = atribuir(ctx, alertas);
  const desvio = desvioDeHitos(ctx);
  const t = armarItem({ ctx, indice, semaforo, alertas, embudo, consultora, atribucion, desvio });
  return {
    cliente: cliente.nombre,
    coach: consultora?.nombre,
    dia: ctx.dia,
    bloques: ctx.bloquesCargados,
    fase: ctx.fase,
    semaforo,
    indice: indice.valor,
    conf: indice.confianza,
    ventas: ctx.ventas,
    alertas: alertas.filter((a) => !a.cerradaAt).length,
    eslabon: embudo.eslabon,
    bloqueo: embudo.tipoBloqueo,
    prio: t.prioridad,
    carril: t.carril,
    culpa: atribucion.responsable,
    atraso: desvio.estado,
    cobranza: leerCobranza(ctx).estado,
  };
});

const orden = filas.sort((a, b) => b.prio - a.prio);
console.table(orden.slice(0, 25));

const semaforos = orden.reduce<Record<string, number>>((a, r) => ({ ...a, [r.semaforo]: (a[r.semaforo] ?? 0) + 1 }), {});
console.log('\nSemáforo:', semaforos);
console.log('Índice promedio:', Math.round(orden.reduce((a, r) => a + r.indice, 0) / orden.length));
console.log('Confianza baja:', orden.filter((r) => r.conf === 'baja').length);
console.log('Sin venta al día 90+:', orden.filter((r) => r.dia >= 90 && r.ventas === 0).length);
console.log('Expedientes ciegos (<4 bloques):', orden.filter((r) => r.bloques < 4).length);

const totalAlertas = orden.reduce((a, r) => a + r.alertas, 0);
console.log('Alertas abiertas totales:', totalAlertas, '· por cliente:', (totalAlertas / orden.length).toFixed(1));

const todas = d.clientes.flatMap((cliente) => {
  const consultora = CONSULTORAS.find((c) => c.id === cliente.consultoraId);
  const ctx = construirContexto(
    {
      cliente, negocio: negocios.get(cliente.id), autoridad: autoridades.get(cliente.id),
      estrategias: es.get(cliente.id) ?? [], objetivo: objetivos.get(cliente.id),
      metricas: me.get(cliente.id) ?? [], sesiones: se.get(cliente.id) ?? [],
      compromisos: co.get(cliente.id) ?? [], pagos: pa.get(cliente.id) ?? [],
      asistencias: asi.get(cliente.id) ?? [], hitos: hi.get(cliente.id) ?? [],
      lecturas: le.get(cliente.id) ?? [], alertas: al.get(cliente.id) ?? [],
      traspasos: tr.get(cliente.id) ?? [], diagnosticos: di.get(cliente.id) ?? [],
      prorrogas: pr.get(cliente.id) ?? [], bajas: ba.get(cliente.id) ?? [],
      atribuciones: at.get(cliente.id) ?? [], revisiones: rv.get(cliente.id) ?? [],
    }, hoy, consultora);
  return correrReglas(ctx).filter((a) => !a.cerradaAt);
});
const conTecho = aplicarTechoSemanal(todas, 10);
console.log('Bandeja de la semana:', conTecho.filter((a) => !a.diferida).length, '· diferidas:', conTecho.filter((a) => a.diferida).length);
const porCodigo = todas.reduce<Record<string, number>>((a, x) => ({ ...a, [x.codigo]: (a[x.codigo] ?? 0) + 1 }), {});
console.log('Por código:', Object.entries(porCodigo).sort((a, b) => b[1] - a[1]));
console.log('Carga por consultora:', CARGA);

// --- Lo que agregó la revisión de cartera de agosto -------------------------
const culpas = orden.reduce<Record<string, number>>((a, r) => ({ ...a, [r.culpa]: (a[r.culpa] ?? 0) + 1 }), {});
console.log('\n¿Es el cliente o somos nosotros?:', culpas);
const atrasos = orden.reduce<Record<string, number>>((a, r) => ({ ...a, [r.atraso]: (a[r.atraso] ?? 0) + 1 }), {});
console.log('Desvío de hitos:', atrasos);
const cobros = orden.reduce<Record<string, number>>((a, r) => ({ ...a, [r.cobranza]: (a[r.cobranza] ?? 0) + 1 }), {});
console.log('Cobranza:', cobros);

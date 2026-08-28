import { addDays } from '@/lib/date';
import type { Dataset, Repo } from '../repo';
import { generarDataset } from './generar';
import { EQUIPO } from './gente';

/** Las fechas del equipo se declaran relativas a hoy para que la demo no envejezca. */
function equipoDe(hoy: string) {
  return EQUIPO.map((c) =>
    c.manoLevantadaAt?.startsWith('RELATIVO-')
      ? { ...c, manoLevantadaAt: addDays(hoy, -Number(c.manoLevantadaAt.split('-')[1])) }
      : c,
  );
}

/**
 * Adaptador de demostración: la cartera se genera una vez por día y vive en
 * memoria del proceso. Las escrituras funcionan durante la sesión de trabajo
 * —sirve para recorrer el flujo completo— y se pierden al reiniciar.
 * Es intencional: nadie debería confundir la demo con producción.
 */
let cache: { key: string; data: Dataset } | null = null;

function asegurar(hoy: string): Dataset {
  if (cache && cache.key === hoy) return cache.data;
  const base = generarDataset(hoy);
  cache = { key: hoy, data: { equipo: equipoDe(hoy), ...base } };
  return cache.data;
}

export const demoRepo: Repo = {
  modo: 'demo',

  async cargarTodo(hoy) {
    return asegurar(hoy);
  },

  async guardarSesion(s) {
    const d = cache?.data;
    if (!d) return;
    const i = d.sesiones.findIndex((x) => x.id === s.id);
    if (i >= 0) d.sesiones[i] = s;
    else d.sesiones.unshift(s);
  },

  async guardarMetrica(m) {
    const d = cache?.data;
    if (!d) return;
    const i = d.metricas.findIndex((x) => x.clienteId === m.clienteId && x.semanaIso === m.semanaIso);
    if (i >= 0) d.metricas[i] = m;
    else d.metricas.push(m);
  },

  async guardarCompromiso(c) {
    const d = cache?.data;
    if (!d) return;
    const i = d.compromisos.findIndex((x) => x.id === c.id);
    if (i >= 0) d.compromisos[i] = c;
    else d.compromisos.push(c);
  },

  async guardarHito(h) {
    const d = cache?.data;
    if (!d) return;
    const i = d.hitos.findIndex((x) => x.clienteId === h.clienteId && x.hitoKey === h.hitoKey);
    if (i >= 0) d.hitos[i] = h;
    else d.hitos.push(h);
  },

  async guardarLectura(l) {
    const d = cache?.data;
    if (!d) return;
    d.lecturas.unshift(l);
  },

  /** Append-only: una corrección es una versión nueva, nunca un UPDATE. */
  async guardarEstrategia(e) {
    const d = cache?.data;
    if (!d) return;
    const previas = d.estrategias.filter((x) => x.clienteId === e.clienteId);
    d.estrategias.push({ ...e, version: previas.length + 1 });
  },

  async guardarDiagnostico(x) {
    const d = cache?.data;
    if (!d) return;
    d.diagnosticos.unshift(x);
  },

  async cerrarAlerta({ alertaId, texto, cerradaPor }, hoy) {
    const d = cache?.data;
    if (!d) return;
    const i = d.alertas.findIndex((a) => a.id === alertaId);
    if (i >= 0) {
      d.alertas[i] = { ...d.alertas[i], cerradaAt: hoy, textoCierre: texto, cerradaPor };
      return;
    }
    // Alerta viva generada por una regla dura: se materializa al cerrarla.
    const [clienteId, codigo] = alertaId.split(':');
    if (!clienteId || !codigo) return;
    d.alertas.push({
      id: alertaId,
      clienteId,
      codigo,
      origen: 'regla_dura',
      estadoSemaforo: 'amarillo',
      titulo: codigo,
      cuerpo: 'Alerta generada por regla dura.',
      pedido: '—',
      destinatario: 'consultora',
      plazoHoras: 72,
      prioridad: 50,
      emitidaAt: hoy,
      emitidaEnSemana: hoy,
      diferida: false,
      vecesEmitida: 1,
      cerradaAt: hoy,
      textoCierre: texto,
      cerradaPor,
    });
  },

  async crearAlerta(a) {
    const d = cache?.data;
    if (!d) return;
    d.alertas.unshift(a);
  },

  async guardarProrroga(p) {
    const d = cache?.data;
    if (!d) return;
    const i = d.prorrogas.findIndex((x) => x.id === p.id);
    if (i >= 0) d.prorrogas[i] = p;
    else d.prorrogas.unshift(p);
  },

  async guardarBaja(b) {
    const d = cache?.data;
    if (!d) return;
    const i = d.bajas.findIndex((x) => x.id === b.id);
    if (i >= 0) d.bajas[i] = b;
    else d.bajas.unshift(b);
  },

  /** Append-only: la corrección anterior queda, para poder discutir el criterio después. */
  async guardarAtribucion(a) {
    const d = cache?.data;
    if (!d) return;
    d.atribuciones.unshift(a);
  },

  async guardarRevision(r) {
    const d = cache?.data;
    if (!d) return;
    d.revisiones.unshift(r);
  },
};

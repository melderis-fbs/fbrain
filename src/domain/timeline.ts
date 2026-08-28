import { formatShort } from '@/lib/date';
import type { AlertaViva } from './alertas';
import type { ContextoCliente } from './expediente';
import { hitoDef } from './fases';
import type { EventoTimeline } from './types';

/**
 * LA LÍNEA DE TIEMPO UNIFICADA
 *
 * La pantalla más valiosa del expediente, y no la escribe nadie: se deriva de
 * sesiones, hitos, cambios de estrategia, compromisos, alertas, pagos y
 * traspasos, todo mezclado en orden cronológico.
 *
 * Es lo que hace visible que cinco escaladas emocionales pasaron en diez
 * semanas, o que el traspaso y la primera queja están a seis días de distancia.
 * Con cada fuente en su propia pestaña eso no se ve nunca.
 */
export function construirTimeline(ctx: ContextoCliente, alertas: AlertaViva[]): EventoTimeline[] {
  const ev: EventoTimeline[] = [];

  ev.push({
    at: ctx.cliente.fechaAlta,
    tipo: 'alta',
    titulo: 'Alta',
    detalle: `${ctx.cliente.programa}${ctx.cliente.tieneGarantia ? ' · con garantía firmada' : ''}`,
    tono: 'neutral',
  });

  for (const [key, h] of ctx.hitos) {
    if (h.estado !== 'cumplido' || !h.cumplidoAt) continue;
    const def = hitoDef(key);
    if (!def) continue;
    ev.push({
      at: h.cumplidoAt,
      tipo: 'hito',
      titulo: def.label,
      detalle: def.gate ? 'Gate del programa' : undefined,
      tono: 'bueno',
    });
  }

  for (const s of ctx.registros.sesiones) {
    if (s.fecha > ctx.hoy) continue;
    const sinRegistro = !s.transcripcionTexto && !s.transcripcionPath && !s.reporte;
    ev.push({
      at: s.fecha,
      tipo: 'sesion',
      titulo:
        s.estadoAgenda === 'realizada'
          ? sinRegistro
            ? 'Sesión — sin registro'
            : 'Sesión'
          : `Sesión ${s.estadoAgenda.replace('_', ' ')}`,
      detalle: s.reporte?.split('\n')[0],
      tono: s.estadoAgenda === 'realizada' ? (sinRegistro ? 'malo' : 'neutral') : 'malo',
    });
  }

  for (const e of ctx.registros.estrategias) {
    if (e.version === 1) continue;
    const previa = ctx.registros.estrategias.find((x) => x.version === e.version - 1);
    const cambioPrecio =
      previa?.precio && e.precio && previa.precio !== e.precio
        ? `precio ${previa.precio.toLocaleString('es-AR')} → ${e.precio.toLocaleString('es-AR')}`
        : undefined;
    ev.push({
      at: e.vigenteDesde,
      tipo: 'estrategia',
      titulo: `Estrategia v${e.version}${e.iniciativa ? ` · iniciativa ${e.iniciativa}` : ''}`,
      detalle: [cambioPrecio, e.motivoCambio].filter(Boolean).join(' · '),
      tono: e.iniciativa === 'cliente' && cambioPrecio ? 'malo' : 'neutral',
    });
  }

  for (const m of ctx.registros.metricas) {
    if ((m.ventas ?? 0) > 0) {
      ev.push({
        at: m.semanaIso,
        tipo: 'venta',
        titulo: `${m.ventas} venta(s)`,
        detalle: m.facturado ? `${m.facturado.toLocaleString('es-AR')} facturado` : undefined,
        tono: 'bueno',
      });
    }
  }

  for (const a of alertas) {
    ev.push({
      at: a.emitidaAt,
      tipo: 'alerta',
      titulo: `${a.codigo} · ${a.reglaTitulo}`,
      detalle: a.cuerpo,
      cita: a.citaTextual,
      tono: a.estadoSemaforo === 'verde' ? 'neutral' : 'malo',
    });
    if (a.cerradaAt) {
      ev.push({
        at: a.cerradaAt,
        tipo: 'alerta',
        titulo: `${a.codigo} cerrada`,
        detalle: a.textoCierre,
        tono: 'bueno',
      });
    }
  }

  for (const c of ctx.registros.compromisos) {
    if (c.estado === 'no_cumplido') {
      ev.push({
        at: c.fechaVencimiento,
        tipo: 'compromiso',
        titulo: 'Compromiso no cumplido',
        detalle: c.descripcion,
        tono: 'malo',
      });
    }
  }

  for (const p of ctx.registros.pagos) {
    if (!p.fechaPago && p.fechaVencimiento < ctx.hoy) {
      ev.push({
        at: p.fechaVencimiento,
        tipo: 'pago',
        titulo: `Cuota ${p.numeroCuota} vencida`,
        detalle: `${p.moneda} ${p.monto.toLocaleString('es-AR')}`,
        tono: 'malo',
      });
    }
  }

  for (const t of ctx.registros.traspasos) {
    ev.push({
      at: t.fecha,
      tipo: 'traspaso',
      titulo: 'Cambio de consultora',
      detalle: t.motivo,
      tono: 'neutral',
    });
  }

  for (const d of ctx.registros.diagnosticos) {
    ev.push({
      at: d.createdAt,
      tipo: 'diagnostico',
      titulo: `Diagnóstico · ${d.tipoBloqueo}`,
      detalle: `${d.cuelloBotella}${d.coincidio === false ? ' · la consultora había dicho otra cosa' : ''}`,
      tono: 'neutral',
    });
  }

  return ev
    .filter((e) => e.at <= ctx.hoy)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function resumenTimeline(ev: EventoTimeline[]) {
  const malos = ev.filter((e) => e.tono === 'malo').length;
  return `${ev.length} eventos · ${malos} señales negativas · desde ${formatShort(ev[ev.length - 1]?.at)}`;
}

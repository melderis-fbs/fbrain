'use client';

import { useState } from 'react';
import type { Reporte, ReporteSolapa } from '@/server/planilla';

/**
 * El reporte de importación no es un log: es la lista de lo que la app decidió
 * NO hacer. Una fila salteada con su motivo vale más que "importación
 * completada", porque es lo único que le dice a alguien qué arreglar en la
 * planilla.
 */
export function Planilla({
  configurada,
  sincronizar,
  etiqueta = 'Sincronizar ahora',
  etiquetaCorriendo = 'Leyendo la planilla…',
  faltante = 'SHEETS_PLANILLA_ID',
  repetir = false,
}: {
  configurada: boolean;
  sincronizar: () => Promise<Reporte>;
  etiqueta?: string;
  etiquetaCorriendo?: string;
  faltante?: string;
  /**
   * Las fuentes que trabajan por tandas —Drive, el extractor— informan cuántos
   * clientes quedaron. Con esto la pantalla vuelve a llamar sola hasta
   * terminar, en vez de pedirle a alguien que apriete treinta veces seguidas.
   */
  repetir?: boolean;
}) {
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [quedan, setQuedan] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function correr() {
    setCorriendo(true);
    setError(null);
    setReporte(null);
    setQuedan(0);
    try {
      let acumulado: Reporte | null = null;
      // El tope existe para que un `restantes` que nunca baja —un bug en una
      // fuente— no deje la pantalla llamando para siempre.
      for (let vuelta = 0; vuelta < 200; vuelta++) {
        const parcial = await sincronizar();
        acumulado = acumulado ? fusionar(acumulado, parcial) : parcial;
        setReporte(acumulado);
        const faltan = parcial.solapas.reduce((n, s) => n + (s.restantes ?? 0), 0);
        setQuedan(faltan);
        if (!repetir || faltan === 0 || parcial.solapas.some((s) => s.error)) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la sincronización.');
    } finally {
      setCorriendo(false);
    }
  }

  const totalAplicadas = (reporte?.solapas ?? []).reduce((n, s) => n + s.aplicadas, 0);
  const totalSalteadas = (reporte?.solapas ?? []).reduce((n, s) => n + s.salteadas.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={correr}
          disabled={!configurada || corriendo}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {corriendo ? etiquetaCorriendo : etiqueta}
        </button>
        {corriendo && reporte && (
          <span className="tnum text-[12px] text-ink-3">
            {totalAplicadas} listos{quedan > 0 ? ` · quedan ${quedan}` : ''}
          </span>
        )}
        {!configurada && (
          <span className="max-w-md text-[12px] leading-relaxed text-ink-3">
            Falta <code>{faltante}</code> en el entorno. Si ya la cargaste en Vercel, falta
            redeployar: una variable nueva no entra en el deploy que ya está corriendo. Y
            verificá que esté tildada para <strong>Production</strong>, no sólo para Preview.
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
          {error}
        </p>
      )}

      {reporte && (
        <div className="space-y-3">
          {reporte.solapas.map((s) => (
            <section key={s.solapa} className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold">{s.solapa}</h3>
                <span className="tnum text-[12px] text-ink-3">
                  {s.aplicadas} de {s.leidas} filas aplicadas
                  {s.restantes ? ` · ${s.restantes} pendientes` : ''}
                </span>
              </div>

              {s.nota && (
                <p className="mt-2 text-[12px] text-ink-3">{s.nota}</p>
              )}

              {s.error && (
                <p className="mt-2 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
                  {s.error}
                </p>
              )}

              {s.salteadas.length > 0 && (
                <div className="mt-2">
                  <p className="text-[12px] font-medium" style={{ color: 'var(--warning-ink)' }}>
                    {s.salteadas.length} fila{s.salteadas.length > 1 ? 's' : ''} salteada
                    {s.salteadas.length > 1 ? 's' : ''} — esto es lo que hay que arreglar en la planilla:
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
                    {s.salteadas.slice(0, 25).map((x, i) => (
                      <li key={i}>
                        {x.fila > 0 && <span className="tnum text-ink-3">fila {x.fila}: </span>}
                        {x.motivo}
                      </li>
                    ))}
                    {s.salteadas.length > 25 && (
                      <li className="text-ink-3">…y {s.salteadas.length - 25} más.</li>
                    )}
                  </ul>
                </div>
              )}

              {!s.error && !s.nota && s.salteadas.length === 0 && s.leidas > 0 && (
                <p className="mt-1 text-[12px] text-ink-3">Sin filas salteadas.</p>
              )}
            </section>
          ))}

          {totalSalteadas === 0 && !reporte.solapas.some((s) => s.error) && (
            <p className="rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
              Entró todo. Nada quedó afuera y nada se adivinó.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Dos tandas de la misma fuente, en una sola tarjeta.
 *
 * Sin esto, correr Drive sobre 104 clientes dejaría cinco reportes idénticos
 * apilados y nadie podría leer cuánto entró en total.
 */
function fusionar(a: Reporte, b: Reporte): Reporte {
  const porNombre = new Map<string, ReporteSolapa>();
  for (const s of a.solapas) porNombre.set(s.solapa, { ...s });
  for (const s of b.solapas) {
    const previo = porNombre.get(s.solapa);
    porNombre.set(
      s.solapa,
      previo
        ? {
            ...s,
            leidas: previo.leidas + s.leidas,
            aplicadas: previo.aplicadas + s.aplicadas,
            salteadas: [...previo.salteadas, ...s.salteadas],
          }
        : { ...s },
    );
  }
  return { at: b.at, solapas: [...porNombre.values()] };
}

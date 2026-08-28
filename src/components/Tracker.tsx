import type { MetricaSemanal } from '@/domain/types';
import { formatShort } from '@/lib/date';

/**
 * El tracker semanal como small multiples.
 *
 * Deliberadamente no es un gráfico con dos ejes: alcance y ventas viven en
 * escalas distintas y superponerlas miente. Cada métrica tiene su panel, su
 * escala y su título; el eje temporal es común.
 *
 * Y las semanas sin cargar se dibujan distinto de las semanas en cero. Es la
 * diferencia entre "no hubo conversaciones" y "no sabemos cuántas hubo", que es
 * exactamente lo que hace que un diagnóstico concluya sobre nada.
 */
function Serie({
  titulo,
  valores,
  etiquetas,
  color,
  objetivo,
}: {
  titulo: string;
  valores: (number | null)[];
  etiquetas: string[];
  color: string;
  objetivo?: number;
}) {
  const reales = valores.filter((v): v is number => v !== null);
  const max = Math.max(1, ...reales, objetivo ?? 0);
  const total = reales.reduce((a, b) => a + b, 0);
  const sinCargar = valores.filter((v) => v === null).length;
  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium text-ink-2">{titulo}</span>
        <span className="tnum text-[12px] text-ink-3">
          {total} total{sinCargar > 0 && <span> · {sinCargar} sem. sin cargar</span>}
        </span>
      </figcaption>
      <div className="relative mt-2 flex h-16 items-end gap-[2px]">
        {objetivo !== undefined && objetivo > 0 && (
          <span
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed"
            style={{ bottom: `${(objetivo / max) * 100}%`, borderColor: 'var(--ink-3)' }}
            title={`Objetivo semanal: ${objetivo}`}
          />
        )}
        {valores.map((v, i) => (
          <div key={i} className="relative flex-1" title={`${etiquetas[i]}: ${v === null ? 'sin cargar' : v}`}>
            {v === null ? (
              <div
                className="absolute bottom-0 h-full w-full rounded-t-[3px] opacity-40"
                style={{
                  background:
                    'repeating-linear-gradient(45deg, var(--line-strong) 0 2px, transparent 2px 5px)',
                }}
              />
            ) : (
              <div
                className="absolute bottom-0 w-full rounded-t-[4px]"
                style={{ height: `${Math.max(v > 0 ? 6 : 1, (v / max) * 100)}%`, background: v > 0 ? color : 'var(--line)' }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-ink-3">
        <span>{etiquetas[0]}</span>
        <span>{etiquetas[etiquetas.length - 1]}</span>
      </div>
    </figure>
  );
}

export function Tracker({
  metricas,
  kpi,
}: {
  metricas: MetricaSemanal[];
  kpi?: { dms: number; agendas: number };
}) {
  const orden = [...metricas].sort((a, b) => a.semanaIso.localeCompare(b.semanaIso)).slice(-16);
  if (!orden.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-3">
        Todavía no hay semanas cargadas en el tracker.
      </p>
    );
  }
  const etiquetas = orden.map((m) => formatShort(m.semanaIso));
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <Serie titulo="DMs iniciados" valores={orden.map((m) => m.dmsIniciados)} etiquetas={etiquetas} color="var(--accent)" objetivo={kpi?.dms} />
      <Serie titulo="Conversaciones que avanzan" valores={orden.map((m) => m.conversacionesAvanzadas)} etiquetas={etiquetas} color="var(--accent)" />
      <Serie titulo="Agendas" valores={orden.map((m) => m.agendas)} etiquetas={etiquetas} color="var(--accent)" objetivo={kpi?.agendas} />
      <Serie titulo="Ventas" valores={orden.map((m) => m.ventas)} etiquetas={etiquetas} color="var(--good)" />
    </div>
  );
}

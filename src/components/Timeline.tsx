import type { EventoTimeline } from '@/domain/types';
import { formatShort } from '@/lib/date';

const TONO = {
  bueno: 'var(--good)',
  malo: 'var(--critical)',
  neutral: 'var(--line-strong)',
};

const ICONO: Record<string, string> = {
  alta: '◆',
  sesion: '·',
  hito: '✓',
  estrategia: '↻',
  venta: '$',
  alerta: '!',
  compromiso: '□',
  pago: '$',
  traspaso: '⇄',
  diagnostico: '✳',
  perdido: '×',
};

/**
 * Todo mezclado en orden cronológico: sesiones, hitos, cambios de estrategia,
 * alertas, pagos y traspasos. Con cada fuente en su propia pestaña no se ve
 * nunca que el traspaso y la primera queja están a seis días de distancia.
 */
export function Timeline({ eventos, limite = 40 }: { eventos: EventoTimeline[]; limite?: number }) {
  const mostrados = eventos.slice(0, limite);
  return (
    <ol className="relative space-y-0">
      <span className="absolute bottom-2 left-[52px] top-2 w-px" style={{ background: 'var(--line)' }} />
      {mostrados.map((e, i) => (
        <li key={i} className="relative flex gap-3 py-1.5">
          <span className="tnum w-10 shrink-0 pt-[1px] text-right text-[11px] text-ink-3">
            {formatShort(e.at)}
          </span>
          <span
            className="relative z-10 mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2"
            style={{ background: TONO[e.tono], ['--tw-ring-color' as string]: 'var(--surface)' }}
            aria-hidden
          >
            {ICONO[e.tipo] ?? '·'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] leading-snug">{e.titulo}</span>
            {e.detalle && <span className="block text-[11.5px] leading-snug text-ink-3">{e.detalle}</span>}
            {e.cita && (
              <span
                className="mt-1 block rounded px-2 py-1 text-[11.5px] italic"
                style={{ background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}
              >
                “{e.cita}”
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

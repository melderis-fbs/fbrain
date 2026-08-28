import type { ContextoCliente } from '@/domain/expediente';
import { HITOS_POR_FASE } from '@/domain/fases';
import { ESTADO_HITO } from '@/lib/ui';
import { formatShort } from '@/lib/date';

/**
 * Los hitos con su día esperado. El módulo del programa mide avance de
 * programa; esto mide avance de negocio, que es lo que define si el cliente
 * va a vender antes del día 60.
 */
export function Hitos({ ctx }: { ctx: ContextoCliente }) {
  return (
    <div className="space-y-3">
      {HITOS_POR_FASE.map((fase) => {
        const actual = fase.key === ctx.fase;
        const pasada = fase.hitos.every((h) => ctx.hitos.get(h.key)?.estado === 'cumplido');
        const cumplidos = fase.hitos.filter((h) => ctx.hitos.get(h.key)?.estado === 'cumplido').length;
        return (
          <div
            key={fase.key}
            className="rounded-lg border p-3"
            style={{
              borderColor: actual ? 'var(--accent)' : 'var(--line)',
              background: actual ? 'var(--accent-soft)' : 'transparent',
              opacity: !actual && !pasada ? 0.62 : 1,
            }}
          >
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[13px] font-semibold capitalize">{fase.nombre}</span>
              <span className="text-[11px] text-ink-3">{fase.pregunta}</span>
              <span className="tnum ml-auto text-[11px] text-ink-3">
                {cumplidos}/{fase.hitos.length}
              </span>
            </div>
            <ul className="grid gap-1 sm:grid-cols-2">
              {fase.hitos.map((def) => {
                const h = ctx.hitos.get(def.key);
                const estado = h?.estado ?? 'sin_trabajar';
                const t = ESTADO_HITO[estado];
                const vencido = estado !== 'cumplido' && def.dia < ctx.dia;
                return (
                  <li
                    key={def.key}
                    className="flex items-start gap-2 rounded-md px-2 py-1.5"
                    style={{ background: estado === 'sin_trabajar' ? 'transparent' : t.soft }}
                  >
                    <span aria-hidden className="mt-[1px] w-3.5 text-center text-[12px] font-bold" style={{ color: t.ink }}>
                      {t.icono}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug">
                        {def.label}
                        {def.gate && (
                          <span
                            className="ml-1.5 rounded px-1 py-[1px] text-[9px] font-bold uppercase tracking-wide"
                            style={{ background: 'var(--ink)', color: 'var(--surface)' }}
                          >
                            gate
                          </span>
                        )}
                        {def.automatico && (
                          <span className="ml-1.5 text-[9.5px] uppercase tracking-wide text-ink-3">auto</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-ink-3">
                        {estado === 'cumplido'
                          ? `Cumplido ${formatShort(h?.cumplidoAt)}`
                          : vencido
                            ? `${t.label} · vencido (día ${def.dia})`
                            : `${t.label} · esperado día ${def.dia}`}
                      </span>
                      {h?.nota && estado !== 'cumplido' && (
                        <span className="mt-0.5 block text-[11px] italic text-ink-2">{h.nota}</span>
                      )}
                    </span>
                    {vencido && (
                      <span aria-hidden title="Vencido" style={{ color: 'var(--critical)' }}>!</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

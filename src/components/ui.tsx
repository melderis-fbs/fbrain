import type { ReactNode } from 'react';
import { SEMAFORO, colorIndice, cx, iniciales } from '@/lib/ui';
import type { Consultora, Semaforo } from '@/domain/types';

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section
      className={cx('rounded-xl border border-line bg-surface', pad && 'p-4 sm:p-5', className)}
      style={{ boxShadow: 'var(--shadow)' }}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-2">{children}</h2>
        {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Semáforo: color + icono + etiqueta. Nunca color solo. */
export function SemaforoBadge({ estado, size = 'md' }: { estado: Semaforo; size?: 'sm' | 'md' | 'lg' }) {
  const t = SEMAFORO[estado];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' && 'px-2 py-0.5 text-[11px]',
        size === 'md' && 'px-2.5 py-1 text-[12px]',
        size === 'lg' && 'px-3 py-1.5 text-[13px]',
      )}
      style={{ background: t.soft, color: t.ink }}
    >
      <span aria-hidden>{t.icono}</span>
      {t.label}
    </span>
  );
}

/** Celda de semáforo para tablas densas: color de fondo, no un ícono chico. */
export function SemaforoCelda({ estado }: { estado: Semaforo }) {
  const t = SEMAFORO[estado];
  return (
    <span
      className="flex h-7 w-full min-w-[76px] items-center justify-center gap-1 rounded-md text-[11px] font-semibold"
      style={{ background: t.soft, color: t.ink }}
      title={t.label}
    >
      <span aria-hidden>{t.icono}</span>
      {t.label}
    </span>
  );
}

/** Índice de avance: arco para la magnitud, número para el valor. */
export function IndiceRing({ valor, size = 64 }: { valor: number; size?: number }) {
  const stroke = size >= 76 ? 7 : 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, valor)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`Índice de avance ${valor}/100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorIndice(valor)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-semibold leading-none" style={{ fontSize: size * 0.3 }}>{valor}</span>
        {size >= 76 && <span className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-3">índice</span>}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'var(--good-ink)' : tone === 'bad' ? 'var(--critical-ink)' : 'var(--ink)';
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="tnum mt-1 text-[19px] font-semibold leading-tight" style={{ color }}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </div>
  );
}

export function Avatar({ persona, size = 26 }: { persona?: Consultora; size?: number }) {
  if (!persona) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: persona.color, fontSize: size * 0.4 }}
      title={persona.nombre}
    >
      {iniciales(persona.nombre)}
    </span>
  );
}

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical' }) {
  const map = {
    neutral: { bg: 'var(--surface-2)', fg: 'var(--ink-2)' },
    accent: { bg: 'var(--accent-soft)', fg: 'var(--accent-ink)' },
    good: { bg: 'var(--good-soft)', fg: 'var(--good-ink)' },
    warning: { bg: 'var(--warning-soft)', fg: 'var(--warning-ink)' },
    serious: { bg: 'var(--serious-soft)', fg: 'var(--serious-ink)' },
    critical: { bg: 'var(--critical-soft)', fg: 'var(--critical-ink)' },
  }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium" style={{ background: map.bg, color: map.fg }}>
      {children}
    </span>
  );
}

/** Barra "real vs lo que necesita". El fondo es la expectativa; la barra, lo logrado. */
export function BarraExpectativa({
  actual,
  esperado,
  label,
  sinDato,
}: {
  actual: number;
  esperado: number;
  label: string;
  sinDato?: boolean;
}) {
  const ratio = esperado > 0 ? Math.min(1.25, actual / esperado) : actual > 0 ? 1 : 0;
  const tone = sinDato
    ? 'var(--line-strong)'
    : esperado <= 0 ? 'var(--line-strong)'
    : ratio >= 0.9 ? 'var(--good)'
    : ratio >= 0.6 ? 'var(--warning)'
    : ratio >= 0.3 ? 'var(--serious)'
    : 'var(--critical)';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] text-ink-2">{label}</span>
        <span className="tnum text-[12px] text-ink-2">
          {sinDato ? <span className="text-ink-3">sin dato</span> : <strong className="text-ink">{actual}</strong>}
          <span className="text-ink-3"> / {Math.round(esperado)} nec.</span>
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--surface-2)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio * 80)}%`, background: tone }} />
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[13px] text-ink-3">{children}</p>
  );
}

/** Un dato vacío no se muestra en blanco: se muestra como faltante, con qué hacer. */
export function SinDato({ que, comoLlenar }: { que: string; comoLlenar?: string }) {
  return (
    <div className="rounded-lg border border-dashed px-3 py-2.5" style={{ borderColor: 'var(--warning)' }}>
      <div className="text-[12px] font-medium" style={{ color: 'var(--warning-ink)' }}>Sin datos · {que}</div>
      {comoLlenar && <div className="mt-0.5 text-[11.5px] text-ink-2">{comoLlenar}</div>}
    </div>
  );
}

export function Divider() {
  return <hr className="my-4 border-0 border-t border-line" />;
}

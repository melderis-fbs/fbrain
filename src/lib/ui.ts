import type { Semaforo } from '@/domain/types';

export interface Tokens {
  label: string;
  icono: string;
  fill: string;
  ink: string;
  soft: string;
}

/**
 * El semáforo nunca comunica por color solo: siempre va con icono y etiqueta.
 * Negro es el estado más grave, y por eso no se puede ordenar alfabéticamente
 * ni con un max() ingenuo.
 */
export const SEMAFORO: Record<Semaforo, Tokens> = {
  verde: { label: 'Verde', icono: '🟢', fill: 'var(--good)', ink: 'var(--good-ink)', soft: 'var(--good-soft)' },
  amarillo: { label: 'Amarillo', icono: '🟡', fill: 'var(--warning)', ink: 'var(--warning-ink)', soft: 'var(--warning-soft)' },
  rojo: { label: 'Rojo', icono: '🟠', fill: 'var(--serious)', ink: 'var(--serious-ink)', soft: 'var(--serious-soft)' },
  negro: { label: 'Negro', icono: '⚫', fill: 'var(--critical)', ink: 'var(--critical-ink)', soft: 'var(--critical-soft)' },
};

export const ESTADO_HITO: Record<string, { label: string; icono: string; ink: string; soft: string }> = {
  cumplido: { label: 'Cumplido', icono: '✓', ink: 'var(--good-ink)', soft: 'var(--good-soft)' },
  en_progreso: { label: 'En progreso', icono: '◐', ink: 'var(--ink-2)', soft: 'var(--surface-2)' },
  necesita_ajustes: { label: 'Necesita ajustes', icono: '↻', ink: 'var(--warning-ink)', soft: 'var(--warning-soft)' },
  bloqueado: { label: 'Bloqueado', icono: '✕', ink: 'var(--critical-ink)', soft: 'var(--critical-soft)' },
  sin_trabajar: { label: 'Sin trabajar', icono: '·', ink: 'var(--ink-3)', soft: 'transparent' },
};

/** Color del índice de avance. Distinto del semáforo a propósito: son dos preguntas. */
export function colorIndice(v: number) {
  if (v >= 75) return 'var(--good)';
  if (v >= 55) return 'var(--warning)';
  if (v >= 40) return 'var(--serious)';
  return 'var(--critical)';
}

export function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function plata(n: number, moneda = 'USD') {
  const signo = moneda === 'USD' ? 'US$' : '$';
  return `${signo} ${Math.round(n).toLocaleString('es-AR')}`;
}

export function cx(...partes: (string | false | null | undefined)[]) {
  return partes.filter(Boolean).join(' ');
}

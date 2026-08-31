'use client';

import { useActionState } from 'react';
import { entrarConEmail } from '@/app/login/actions';

/**
 * El login de producción. La identidad la resuelve Supabase Auth; el rol y el
 * alcance los resuelve Postgres con RLS. Acá no se decide nada de eso: sólo se
 * toman el email y la contraseña, y se muestra con claridad qué salió mal.
 */
export function LoginForm() {
  const [estado, accion, pendiente] = useActionState(entrarConEmail, null);

  return (
    <form action={accion} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-[12px] font-medium">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[12px] font-medium">Contraseña</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
      </label>

      {estado?.error && (
        <p
          className="rounded-lg border px-3 py-2 text-[12.5px] leading-relaxed"
          style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}
        >
          {estado.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
        style={{ background: 'var(--accent)' }}
      >
        {pendiente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}

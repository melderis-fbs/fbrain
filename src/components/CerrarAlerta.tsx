'use client';

import { useActionState, useState } from 'react';
import { cerrarAlerta, type EstadoCierre } from '@/app/(app)/alertas/actions';

/**
 * El campo no pregunta "¿resuelto?": pregunta qué se hizo. Es la diferencia
 * entre un sistema de alertas que deja rastro y una lista de tildes.
 */
export function CerrarAlerta({
  alertaId,
  puede,
  motivo,
  condicionVigente,
}: {
  alertaId: string;
  puede: boolean;
  motivo?: string;
  condicionVigente: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, action, pendiente] = useActionState<EstadoCierre | null, FormData>(cerrarAlerta, null);

  if (estado?.ok) {
    return (
      <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
        ✓ Cerrada. Queda registrado qué se hizo y cuánto tardó.
      </p>
    );
  }

  if (!puede) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-[11.5px] text-ink-2" style={{ borderColor: 'var(--line-strong)' }}>
        {motivo} Podés dejar tu registro en el expediente, pero el cierre no es tuyo.
      </p>
    );
  }

  if (!abierto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setAbierto(true)}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:border-accent"
        >
          Cerrar alerta
        </button>
        {!condicionVigente && (
          <span className="text-[11.5px]" style={{ color: 'var(--good-ink)' }}>
            La condición ya no se cumple — sólo falta escribir qué hiciste.
          </span>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="alertaId" value={alertaId} />
      <label className="block text-[12px] font-medium">¿Qué hiciste?</label>
      <textarea
        name="texto"
        rows={3}
        required
        minLength={20}
        placeholder="Llamé fuera de agenda, retomamos la cadencia semanal y quedó agendada para el martes…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
      />
      {estado?.error && (
        <p className="text-[12px]" style={{ color: 'var(--critical-ink)' }}>{estado.error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {pendiente ? 'Guardando…' : 'Cerrar con este registro'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-3">
          Cancelar
        </button>
      </div>
    </form>
  );
}

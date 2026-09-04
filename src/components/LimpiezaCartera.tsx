'use client';

import { useState } from 'react';
import type { MotivoBaja } from '@/domain/types';

export type FilaLimpieza = {
  id: string;
  nombre: string;
  consultora: string;
  dia: number;
  estado: string;
  motivos: string[];
  cuotasImpagas: number;
};

/**
 * La lista de candidatos, para revisar y dar de baja juntos.
 *
 * Nada viene tildado. Es deliberado: la app propone y una persona confirma,
 * y con «seleccionar todo» por defecto la confirmación deja de existir —
 * alcanza con no mirar para dar de baja a sesenta clientes.
 */
export function LimpiezaCartera({
  filas,
  darDeBaja,
}: {
  filas: FilaLimpieza[];
  darDeBaja: (ids: string[], motivo: MotivoBaja) => Promise<{ ok: true; bajas: number } | { ok: false; error: string }>;
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState<MotivoBaja>('fin_programa');
  const [corriendo, setCorriendo] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: string) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function confirmar() {
    setCorriendo(true);
    setError(null);
    setResultado(null);
    try {
      const r = await darDeBaja([...elegidos], motivo);
      if (r.ok) {
        setResultado(`${r.bajas} cliente${r.bajas === 1 ? '' : 's'} dado${r.bajas === 1 ? '' : 's'} de baja.`);
        setElegidos(new Set());
      } else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo dar de baja.');
    } finally {
      setCorriendo(false);
    }
  }

  if (!filas.length) {
    return (
      <p className="rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
        No hay ningún candidato: todos los clientes vivos tienen actividad cargada y su programa en curso.
      </p>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-paper py-3">
        <button
          type="button"
          onClick={() => setElegidos(new Set(filas.map((f) => f.id)))}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:border-accent"
        >
          Seleccionar los {filas.length}
        </button>
        {elegidos.size > 0 && (
          <button
            type="button"
            onClick={() => setElegidos(new Set())}
            className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:border-accent"
          >
            Limpiar
          </button>
        )}

        <label className="flex items-center gap-2 text-[12px] text-ink-2">
          Motivo
          <select
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoBaja)}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[12px]"
          >
            <option value="fin_programa">Terminó el programa</option>
            <option value="voluntaria">Se fue antes de terminar</option>
            <option value="falta_de_pago">Falta de pago</option>
            <option value="reembolso">Reembolso</option>
          </select>
        </label>

        <button
          type="button"
          onClick={confirmar}
          disabled={!elegidos.size || corriendo}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--critical)' }}
        >
          {corriendo ? 'Dando de baja…' : `Dar de baja ${elegidos.size || ''}`}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
          {error}
        </p>
      )}
      {resultado && (
        <p className="mt-3 rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
          {resultado} Se puede revertir desde la ficha de cada uno; la baja queda en su historial.
        </p>
      )}

      <ul className="mt-2">
        {filas.map((f) => {
          const elegido = elegidos.has(f.id);
          return (
            <li key={f.id} className="border-b border-line last:border-0">
              <label className="flex cursor-pointer items-baseline gap-3 py-2.5">
                <input
                  type="checkbox"
                  checked={elegido}
                  onChange={() => alternar(f.id)}
                  className="mt-1 h-4 w-4 flex-none accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-medium">{f.nombre}</span>
                    <span className="tnum text-[11.5px] text-ink-3">día {f.dia}</span>
                    <span className="text-[11.5px] text-ink-3">· {f.consultora}</span>
                    {f.estado === 'pausado' && (
                      <span className="text-[11.5px]" style={{ color: 'var(--warning-ink)' }}>· pausado</span>
                    )}
                    {f.cuotasImpagas > 0 && (
                      <span className="tnum text-[11.5px]" style={{ color: 'var(--critical-ink)' }}>
                        · {f.cuotasImpagas} cuota{f.cuotasImpagas === 1 ? '' : 's'} sin pagar
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-3">
                    {f.motivos.join(' · ')}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

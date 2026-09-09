'use client';

import { useState } from 'react';

/**
 * LAS SESIONES DE UN CLIENTE
 *
 * Una línea por sesión: número, fecha, y qué pasó. Se abre la que interesa y
 * adentro está todo lo que hay que hacer con ella — pegar la transcripción y
 * analizarla— sin ir a otra pantalla.
 *
 * Reemplaza un recorrido de cuatro clics y un formulario de catorce controles.
 * La regla que lo ordena: lo que se hace todos los días tiene que estar donde
 * ya estás mirando.
 */

export type FilaSesion = {
  id: string;
  numero: number;
  fecha: string;
  estado: string;
  /** Los puntos del resumen, si ya se analizó. */
  resumen?: string;
  tieneTranscripcion: boolean;
};

export function ListaSesiones({
  clienteId,
  sesiones,
  analizar,
}: {
  clienteId: string;
  sesiones: FilaSesion[];
  analizar: (
    clienteId: string,
    sesionId: string,
    texto: string,
  ) => Promise<{ ok: true; puntos: string[] } | { ok: false; error: string }>;
}) {
  const [abierta, setAbierta] = useState<string | null>(null);

  if (!sesiones.length) {
    return (
      <p className="rounded-xl border border-line bg-surface p-4 text-[13px] leading-relaxed text-ink-2">
        Todavía no hay ninguna sesión registrada para este cliente. Aparecen acá cuando entran por
        la planilla o cuando se agenda la primera.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
      {sesiones.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => setAbierta((a) => (a === s.id ? null : s.id))}
            className="flex w-full items-baseline gap-3 px-4 py-3 text-left hover:bg-surface-2/40"
            aria-expanded={abierta === s.id}
          >
            <span className="tnum flex-none text-[13px] font-semibold">Sesión {s.numero}</span>
            <span className="tnum flex-none text-[12px] text-ink-3">{s.fecha}</span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
              {s.resumen
                ? s.resumen.split('\n')[0].replace(/^·\s*/, '')
                : s.tieneTranscripcion
                  ? <span className="text-ink-3">transcripción cargada, sin analizar</span>
                  : <span className="text-ink-3">sin transcripción</span>}
            </span>
            <span className="flex-none text-[11px] text-ink-3">{abierta === s.id ? '−' : '+'}</span>
          </button>

          {abierta === s.id && (
            <div className="border-t border-line px-4 pb-4 pt-3">
              <Panel clienteId={clienteId} sesion={s} analizar={analizar} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function Panel({
  clienteId,
  sesion,
  analizar,
}: {
  clienteId: string;
  sesion: FilaSesion;
  analizar: (
    clienteId: string,
    sesionId: string,
    texto: string,
  ) => Promise<{ ok: true; puntos: string[] } | { ok: false; error: string }>;
}) {
  const [texto, setTexto] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [puntos, setPuntos] = useState<string[] | null>(null);

  async function correr() {
    setCorriendo(true);
    setError(null);
    try {
      const r = await analizar(clienteId, sesion.id, texto);
      if (r.ok) setPuntos(r.puntos);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo analizar.');
    } finally {
      setCorriendo(false);
    }
  }

  const yaHay = puntos ?? (sesion.resumen ? sesion.resumen.split('\n').map((p) => p.replace(/^·\s*/, '')) : null);

  return (
    <div className="space-y-3">
      {yaHay && (
        <ul className="space-y-1 text-[13px] leading-relaxed text-ink-2">
          {yaHay.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-none text-ink-3">·</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="mb-1 block text-[11.5px] text-ink-3">
          {yaHay ? 'Volver a analizar con otra transcripción' : 'Pegá la transcripción de la sesión'}
        </label>
        <textarea
          rows={5}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Pegá acá la conversación completa…"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] leading-relaxed"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={correr}
          disabled={corriendo || texto.trim().length < 200}
          className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {corriendo ? 'Analizando…' : 'Analizar'}
        </button>
        <span className="text-[11.5px] text-ink-3">
          Devuelve tres a cinco puntos y los compromisos que se acordaron. Nada se aplica solo: el
          resumen queda como reporte de la sesión y se puede corregir.
        </span>
      </div>

      {error && (
        <p
          className="rounded-lg border px-3 py-2 text-[12px]"
          style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

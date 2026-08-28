'use client';

import { useState } from 'react';
import type { DiagnosticoPayload } from '@/domain/types';

/**
 * DIAGNÓSTICO
 *
 * Antes de mostrar nada, la hipótesis de la consultora. No se puede saltear y
 * no hay botón de "ver directamente". Esa franja de comparación es la razón de
 * ser del flujo: convierte cada consulta en una repetición de entrenamiento en
 * lugar de una consulta a un oráculo.
 *
 * La hipótesis NO se le manda al modelo: si la ve, acomoda su conclusión.
 */
export function Diagnostico({
  clienteId,
  payload,
  prompt,
  bloqueos,
  habilitado,
  faltantes,
  conectado,
  correr,
}: {
  clienteId: string;
  payload: DiagnosticoPayload;
  prompt: string;
  bloqueos: { v: string; l: string }[];
  habilitado: boolean;
  faltantes: string[];
  conectado: boolean;
  correr: (clienteId: string, fd: FormData) => Promise<
    | { ok: true; payload: DiagnosticoPayload; uso: { modelo: string; intentos: number; tokensSalida: number } }
    | { ok: false; error: string; errores?: string[] }
  >;
}) {
  const [hipotesis, setHipotesis] = useState('');
  const [bloqueoElegido, setBloqueoElegido] = useState('');
  const [revelado, setRevelado] = useState(false);
  const [verPrompt, setVerPrompt] = useState(false);
  const [delModelo, setDelModelo] = useState<DiagnosticoPayload | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [errorModelo, setErrorModelo] = useState<string | null>(null);
  const [uso, setUso] = useState<{ modelo: string; intentos: number; tokensSalida: number } | null>(null);

  async function pedirAlModelo() {
    setCorriendo(true);
    setErrorModelo(null);
    try {
      const fd = new FormData();
      fd.set('hipotesis', hipotesis);
      fd.set('bloqueoHipotesis', bloqueoElegido);
      const r = await correr(clienteId, fd);
      if (!r.ok) {
        setErrorModelo([r.error, ...(r.errores ?? [])].join(' · '));
        return;
      }
      setDelModelo(r.payload);
      setUso(r.uso);
      setRevelado(true);
    } catch (e) {
      setErrorModelo(e instanceof Error ? e.message : 'Falló la llamada al modelo.');
    } finally {
      setCorriendo(false);
    }
  }

  if (!habilitado) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--warning-ink)' }}>
          El motor no corre con este expediente
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Faltan bloques y con menos de cuatro cargados un diagnóstico no es un diagnóstico: es una
          opinión con formato. Esto es lo que falta y dónde conseguirlo:
        </p>
        <ul className="mt-2 space-y-1 text-[13px]">
          {faltantes.map((f) => <li key={f}>· {f}</li>)}
        </ul>
      </div>
    );
  }

  if (!revelado) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5" style={{ boxShadow: 'var(--shadow)' }}>
        <h2 className="text-[15px] font-semibold">Antes de ver la respuesta</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          ¿Cuál creés que es el cuello de botella de este cliente? Dos líneas alcanzan. No se puede
          saltear: sin tu hipótesis previa, esto es un oráculo y no un entrenamiento.
        </p>
        <textarea
          rows={3}
          value={hipotesis}
          onChange={(e) => setHipotesis(e.target.value)}
          placeholder="Creo que el problema es…"
          className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        <div className="mt-3">
          <span className="text-[12px] font-medium">¿Y qué tipo de bloqueo es?</span>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {bloqueos.map((b) => (
              <button
                key={b.v}
                type="button"
                onClick={() => setBloqueoElegido(b.v)}
                className="rounded-lg border px-2.5 py-1.5 text-[11.5px]"
                style={{
                  borderColor: bloqueoElegido === b.v ? 'transparent' : 'var(--line)',
                  background: bloqueoElegido === b.v ? 'var(--accent)' : 'transparent',
                  color: bloqueoElegido === b.v ? '#fff' : 'var(--ink-2)',
                  fontWeight: bloqueoElegido === b.v ? 600 : 400,
                }}
              >
                {b.l}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {conectado && (
            <button
              type="button"
              disabled={hipotesis.trim().length < 20 || !bloqueoElegido || corriendo}
              onClick={pedirAlModelo}
              className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {corriendo ? 'Pensando…' : 'Pedirle el diagnóstico al modelo'}
            </button>
          )}
          <button
            type="button"
            disabled={hipotesis.trim().length < 20 || !bloqueoElegido || corriendo}
            onClick={() => setRevelado(true)}
            className={
              conectado
                ? 'rounded-lg border border-line px-4 py-2.5 text-[13px] font-medium hover:border-accent disabled:opacity-50'
                : 'rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50'
            }
            style={conectado ? undefined : { background: 'var(--accent)' }}
          >
            Ver el del motor local
          </button>
        </div>
        {errorModelo && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
            {errorModelo}
          </p>
        )}
      </div>
    );
  }

  // Lo que se muestra: la respuesta del modelo si se pidió, el borrador local si no.
  const activo = delModelo ?? payload;

  const coincide = bloqueoElegido === activo.tipoBloqueo;

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl border p-4"
        style={{
          borderColor: coincide ? 'var(--good)' : 'var(--serious)',
          background: coincide ? 'var(--good-soft)' : 'var(--serious-soft)',
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: coincide ? 'var(--good-ink)' : 'var(--serious-ink)' }}>
          {coincide ? 'Coincidieron' : 'Se separaron'}
        </div>
        <div className="mt-1.5 grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-3">Tu hipótesis</div>
            <p className="mt-0.5 leading-relaxed">{hipotesis}</p>
            <p className="mt-1 text-[12px] text-ink-3">Bloqueo: {bloqueoElegido}</p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-ink-3">El sistema</div>
            <p className="mt-0.5 leading-relaxed">{activo.cuelloBotella}</p>
            <p className="mt-1 text-[12px] text-ink-3">Bloqueo: {activo.tipoBloqueo} · eslabón: {activo.eslabonRoto}</p>
          </div>
        </div>
        {!coincide && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
            Discrepar no significa que el sistema tenga razón. Significa que uno de los dos está
            mirando algo que el otro no. Si tenés la evidencia, ganás vos — y ese caso entra al set de
            evaluación.
          </p>
        )}
      </div>

      {delModelo && uso && (
        <p className="rounded-lg border px-3 py-2 text-[11.5px] leading-relaxed" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
          Generado por {uso.modelo}, validado contra el contrato
          {uso.intentos > 1 ? ` al intento ${uso.intentos}` : ' al primer intento'}. Queda
          registrado con su versión de prompt.
        </p>
      )}

      {!delModelo && (
        <p className="rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[11.5px] leading-relaxed text-ink-2">
          Generado por el motor de reglas local, no por el modelo. Cuando se conecte la API, este
          mismo contexto se manda con el prompt de abajo. El motor local es el piso de calidad: si el
          modelo dice algo peor que esto, está diciendo algo peor que una resta.
        </p>
      )}

      <Bloque titulo="Diagnóstico">
        <ul className="space-y-1">
          {activo.diagnostico.map((d, i) => <li key={i}>· {d}</li>)}
        </ul>
      </Bloque>

      <Bloque titulo="Cuello de botella principal">
        <p className="text-[15px] font-semibold">{activo.cuelloBotella}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">
          {activo.tipoBloqueo} · se rompe en el eslabón {activo.eslabonRoto}
        </p>
      </Bloque>

      <Bloque titulo="Evidencia">
        <ul className="space-y-1.5">
          {activo.evidencia.map((e, i) => (
            <li key={i} className="flex gap-2">
              <span
                className="mt-[3px] h-fit shrink-0 rounded px-1.5 py-[1px] text-[9.5px] font-bold uppercase"
                style={{
                  background: e.tipo === 'hecho' ? 'var(--good-soft)' : 'var(--warning-soft)',
                  color: e.tipo === 'hecho' ? 'var(--good-ink)' : 'var(--warning-ink)',
                }}
              >
                {e.tipo}
              </span>
              <span>
                {e.afirmacion}
                {e.fuenteId && <span className="text-[11.5px] text-ink-3"> · {e.fuenteTipo} {e.fecha}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="Qué NO haría" tono="critical">
        <ul className="space-y-1">{activo.queNoHaria.map((x, i) => <li key={i}>· {x}</li>)}</ul>
      </Bloque>

      <Bloque titulo="Hipótesis principal"><p>{activo.hipotesisPrincipal}</p></Bloque>

      <Bloque titulo="Plan de acción">
        <ol className="list-decimal space-y-1 pl-4">
          {activo.planAccion.map((p, i) => (
            <li key={i}>{p.accion} <span className="text-[11.5px] text-ink-3">· {p.responsable}</span></li>
          ))}
        </ol>
      </Bloque>

      <Bloque titulo="Métricas y criterio de decisión">
        <ul className="space-y-1">
          {activo.metricas.map((m, i) => (
            <li key={i}>· {m.metrica}{m.valorPartida ? ` — parte de ${m.valorPartida}` : ''}</li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 text-[12.5px]">
          <div><dt className="inline font-medium">Continuar si:</dt> <dd className="inline">{activo.criterioDecision.continuar}</dd></div>
          <div><dt className="inline font-medium">Corregir si:</dt> <dd className="inline">{activo.criterioDecision.corregir}</dd></div>
          <div><dt className="inline font-medium">Replantear si:</dt> <dd className="inline">{activo.criterioDecision.replantear}</dd></div>
        </dl>
      </Bloque>

      {activo.preguntasAbiertas.length > 0 && (
        <Bloque titulo="Preguntas abiertas">
          <ul className="space-y-1">{activo.preguntasAbiertas.map((p, i) => <li key={i}>· {p}</li>)}</ul>
        </Bloque>
      )}

      <Bloque titulo="Principio Founders" tono="accent">
        <p>{activo.principioFounders}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{activo.porQue}</p>
      </Bloque>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVerPrompt((s) => !s)}
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] hover:border-accent"
        >
          {verPrompt ? 'Ocultar' : 'Ver'} el contexto que se manda al modelo
        </button>
        <button
          type="button"
          onClick={() => setRevelado(false)}
          className="rounded-lg px-3 py-1.5 text-[12px] text-ink-3"
        >
          Volver a la hipótesis
        </button>
      </div>

      {verPrompt && (
        <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-surface-2/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
          {prompt}
        </pre>
      )}
    </div>
  );
}

function Bloque({ titulo, children, tono }: { titulo: string; children: React.ReactNode; tono?: 'critical' | 'accent' }) {
  return (
    <section
      className="rounded-xl border bg-surface p-4"
      style={{
        borderColor: tono === 'critical' ? 'var(--critical)' : tono === 'accent' ? 'var(--accent)' : 'var(--line)',
      }}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{titulo}</h3>
      <div className="mt-1.5 text-[13px] leading-relaxed">{children}</div>
    </section>
  );
}

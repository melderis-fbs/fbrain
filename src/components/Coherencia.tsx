'use client';

import { useState } from 'react';

/**
 * TEST DE COHERENCIA
 *
 * La arquitectura ES la funcionalidad: dos llamadas, en orden, y la primera no
 * puede ver lo que ve la segunda. Si el modelo ve el cliente ideal declarado
 * antes de inferir, confirma la intención en lugar de leer el mensaje — que es
 * exactamente el error que comete un humano releyendo su propio anuncio.
 *
 * Por eso la interfaz muestra el perfil inferido ANTES de mostrar el declarado,
 * y lo dice. Es lo que hace que la consultora le crea.
 */

interface PerfilInferido {
  quienEs: string;
  nivelDolor: 'principiante' | 'crecimiento';
  movimiento: 'escapar' | 'capturar';
  capacidadPago: string;
  quienNo: string;
  frases: { cita: string; senal: string }[];
}

/** Heurística local de demostración. En producción es la llamada A al modelo. */
function inferirLocal(texto: string): PerfilInferido {
  const t = texto.toLowerCase();
  const principiante = /(empezar|arrancar|primer cliente|no vendo|desde cero|no sé por dónde)/.test(t);
  const escapar = /(cansad|harto|frustrad|no doy más|estanc|no llego)/.test(t);
  const frases = texto
    .split(/[.\n!?]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 18)
    .slice(0, 5)
    .map((cita) => ({
      cita,
      senal: /\bvos\b|\bte\b|\btu\b/.test(cita.toLowerCase())
        ? 'Habla en segunda persona: define a quién interpela.'
        : 'Describe una situación: define en qué momento del negocio está quien se reconoce.',
    }));
  return {
    quienEs: principiante
      ? 'Alguien que todavía no facturó de forma sostenida con este servicio: se reconoce en el "no sé por dónde empezar".'
      : 'Alguien que ya factura y depende de sí mismo para hacerlo: se reconoce en el "no puedo escalar sin trabajar más".',
    nivelDolor: principiante ? 'principiante' : 'crecimiento',
    movimiento: escapar ? 'escapar' : 'capturar',
    capacidadPago: principiante
      ? 'Baja a media: alguien sin facturación estable difícilmente pueda pagar un ticket alto.'
      : 'Media a alta: si ya factura, el ticket alto es defendible.',
    quienNo: /(no es para|si no estás dispuesto|sólo para|solo para)/.test(t)
      ? 'El texto repele explícitamente a un perfil.'
      : 'No repele a nadie. Eso es un hallazgo, no un vacío: un mensaje que le habla a todos no le habla a nadie.',
    frases,
  };
}

type ResultadoCoherencia = {
  veredicto: 'coherente' | 'parcial' | 'incoherente';
  veredictoPorQue: string;
  brecha: { dimension: string; inferido: string; declarado: string; coincide: boolean }[];
  palabrasResponsables: { cita: string; porQueDesvia: string; queDiriaEnSuLugar: string }[];
  eslabonATocar: string;
  queNoHaria: string[];
  conclusionLeads: string;
  perfilInferidoCiego: { quienEs: string; frasesDecisivas: { cita: string; senal: string }[] };
};

export function Coherencia({
  clienteId,
  clienteIdeal,
  precio,
  moneda,
  promptA,
  promptB,
  conectado,
  correr,
}: {
  clienteId: string;
  clienteIdeal?: string;
  precio?: number;
  moneda?: string;
  promptA: string;
  promptB: string;
  conectado: boolean;
  correr: (clienteId: string, fd: FormData) => Promise<
    { ok: true; resultado: ResultadoCoherencia } | { ok: false; error: string; errores?: string[] }
  >;
}) {
  const [material, setMaterial] = useState('');
  const [tipo, setTipo] = useState('reel');
  const [leads, setLeads] = useState('');
  const [paso, setPaso] = useState<'material' | 'ciego' | 'comparacion'>('material');
  const [perfil, setPerfil] = useState<PerfilInferido | null>(null);
  const [verPrompts, setVerPrompts] = useState(false);
  const [resultado, setResultado] = useState<ResultadoCoherencia | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [errorModelo, setErrorModelo] = useState<string | null>(null);

  async function correrTest() {
    setCorriendo(true);
    setErrorModelo(null);
    try {
      const fd = new FormData();
      fd.set('material', material);
      fd.set('tipo', tipo);
      fd.set('leads', leads);
      const r = await correr(clienteId, fd);
      if (!r.ok) {
        setErrorModelo([r.error, ...(r.errores ?? [])].join(' · '));
        return;
      }
      setResultado(r.resultado);
    } catch (e) {
      setErrorModelo(e instanceof Error ? e.message : 'Falló la llamada al modelo.');
    } finally {
      setCorriendo(false);
    }
  }

  const nLeads = Number(leads) || 0;

  if (!clienteIdeal) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--warning-ink)' }}>
          No hay cliente ideal declarado
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          El motor no puede comparar contra nada. Se puede inferir el perfil del material igual, pero
          primero conviene cerrar el bloque de estrategia: la comparación es todo el valor.
        </p>
      </div>
    );
  }

  const TONO: Record<string, string> = {
    coherente: 'good', parcial: 'warning', incoherente: 'critical',
  };

  return (
    <div className="space-y-4">
      {errorModelo && (
        <p className="rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
          {errorModelo}
        </p>
      )}

      {resultado && (
        <section className="space-y-3">
          <div className="rounded-xl border p-4" style={{ borderColor: `var(--${TONO[resultado.veredicto]})`, background: `var(--${TONO[resultado.veredicto]}-soft)` }}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: `var(--${TONO[resultado.veredicto]}-ink)` }}>
              {resultado.veredicto}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed">{resultado.veredictoPorQue}</p>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-2 text-[13px] font-semibold">A quién atrae de verdad (lectura a ciegas)</h3>
            <p className="text-[13px] leading-relaxed">{resultado.perfilInferidoCiego.quienEs}</p>
            <ul className="mt-2 space-y-1 text-[12.5px] text-ink-2">
              {resultado.perfilInferidoCiego.frasesDecisivas.map((f, i) => (
                <li key={i}>«{f.cita}» → {f.senal}</li>
              ))}
            </ul>
          </div>

          <div className="overflow-x-auto rounded-xl border border-line bg-surface p-4">
            <h3 className="mb-2 text-[13px] font-semibold">La brecha, dimensión por dimensión</h3>
            <table className="w-full min-w-[32rem] text-[12.5px]">
              <thead><tr className="text-left text-ink-3"><th className="pb-1 font-medium">Dimensión</th><th className="pb-1 font-medium">Atrae</th><th className="pb-1 font-medium">Declarado</th></tr></thead>
              <tbody>
                {resultado.brecha.map((b, i) => (
                  <tr key={i} className="border-t border-line" style={{ background: b.coincide ? undefined : 'var(--serious-soft)' }}>
                    <td className="py-1.5 font-medium">{b.dimension}</td>
                    <td className="py-1.5">{b.inferido}</td>
                    <td className="py-1.5">{b.declarado}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {resultado.palabrasResponsables.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-2 text-[13px] font-semibold">Las palabras responsables</h3>
              <ul className="space-y-2 text-[12.5px]">
                {resultado.palabrasResponsables.map((p, i) => (
                  <li key={i}>
                    <div className="italic">«{p.cita}»</div>
                    <div className="text-ink-3">{p.porQueDesvia}</div>
                    <div>En su lugar: <strong>{p.queDiriaEnSuLugar}</strong></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl border border-line bg-surface p-4 text-[12.5px]">
            <p><strong>Eslabón a tocar primero:</strong> {resultado.eslabonATocar}</p>
            <p className="mt-1"><strong>Qué no haría todavía:</strong> {resultado.queNoHaria.join(' · ')}</p>
            <p className="mt-1"><strong>Sobre los leads:</strong> {resultado.conclusionLeads}</p>
          </div>

          <button type="button" onClick={() => { setResultado(null); setPaso('material'); }} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-3">
            Probar otro material
          </button>
        </section>
      )}

      {!resultado && paso === 'material' && (
        <section className="rounded-xl border border-line bg-surface p-4">
          <h2 className="mb-1 text-[13px] font-semibold">El material</h2>
          <p className="mb-3 text-[11.5px] text-ink-3">
            Pegá el anuncio, reel, guion, landing o DM tal como se publicó. La primera lectura se hace
            a ciegas: sin ver el cliente ideal declarado.
          </p>
          <textarea
            rows={8}
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder="Pegá el material acá…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-[12px] font-medium">Tipo</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]">
                {['anuncio', 'reel', 'guion', 'landing', 'dm', 'email', 'bio', 'otro'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-medium">Leads que trajo</span>
              <span className="ml-1.5 text-[11px] text-ink-3">opcional</span>
              <input
                value={leads}
                onChange={(e) => setLeads(e.target.value.replace(/[^0-9]/g, ''))}
                inputMode="numeric"
                placeholder="—"
                className="mt-1 w-24 rounded-lg border border-line bg-surface px-3 py-2 text-[13px]"
              />
            </label>
            <button
              type="button"
              disabled={material.trim().length < 60}
              onClick={() => {
                setPerfil(inferirLocal(material));
                setPaso('ciego');
              }}
              className={
                conectado
                  ? 'rounded-lg border border-line px-4 py-2.5 text-[13px] font-medium hover:border-accent disabled:opacity-50'
                  : 'rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50'
              }
              style={conectado ? undefined : { background: 'var(--accent)' }}
            >
              Leer a ciegas a mano
            </button>
            {conectado && (
              <button
                type="button"
                disabled={material.trim().length < 60 || corriendo}
                onClick={correrTest}
                className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
                title="Dos llamadas: primero lee el material sin saber nada del negocio, recién después compara"
              >
                {corriendo ? 'Leyendo a ciegas y comparando…' : 'Correr el test con el modelo'}
              </button>
            )}
          </div>
        </section>
      )}

      {paso !== 'material' && perfil && (
        <section className="rounded-xl border p-4" style={{ borderColor: 'var(--accent)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--accent)' }}>
            Llamada A · perfil inferido a ciegas
          </div>
          <p className="mt-1 text-[11.5px] text-ink-3">
            Producido sin ver el cliente ideal declarado, el nicho, el precio ni el nombre del cliente.
          </p>
          <p className="mt-2 text-[14px] leading-relaxed">{perfil.quienEs}</p>
          <dl className="mt-3 grid gap-2 text-[12.5px] sm:grid-cols-2">
            <div><dt className="text-ink-3">Nivel de dolor</dt><dd className="font-medium">{perfil.nivelDolor}</dd></div>
            <div><dt className="text-ink-3">Movimiento</dt><dd className="font-medium">{perfil.movimiento === 'escapar' ? 'escapar de un problema' : 'capturar una oportunidad'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-3">Capacidad de pago inferida</dt><dd>{perfil.capacidadPago}</dd></div>
            <div className="sm:col-span-2"><dt className="text-ink-3">Quién NO se reconoce</dt><dd>{perfil.quienNo}</dd></div>
          </dl>
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-3">Frases decisivas</div>
            <ul className="mt-1 space-y-1.5 text-[12.5px]">
              {perfil.frases.map((f, i) => (
                <li key={i}>
                  <span className="italic">“{f.cita}”</span>
                  <span className="block text-[11.5px] text-ink-3">{f.senal}</span>
                </li>
              ))}
            </ul>
          </div>
          {paso === 'ciego' && (
            <button
              type="button"
              onClick={() => setPaso('comparacion')}
              className="mt-4 rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Comparar contra el cliente ideal declarado
            </button>
          )}
        </section>
      )}

      {paso === 'comparacion' && perfil && (
        <>
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
              Llamada B · comparación
            </div>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-3">Inferido del material</div>
                <p className="mt-1 text-[13px] leading-relaxed">{perfil.quienEs}</p>
              </div>
              <div className="rounded-lg border border-line p-3">
                <div className="text-[11px] uppercase tracking-wide text-ink-3">Declarado en la estrategia</div>
                <p className="mt-1 text-[13px] leading-relaxed">{clienteIdeal}</p>
                {precio && <p className="mt-1 text-[12px] text-ink-3">Precio: {moneda} {precio.toLocaleString('es-AR')}</p>}
              </div>
            </div>
            <p className="mt-3 rounded-lg px-3 py-2 text-[13px] leading-relaxed" style={{ background: 'var(--warning-soft)', color: 'var(--warning-ink)' }}>
              Veredicto preliminar del motor local: revisar el nivel de madurez y la capacidad de pago.
              El veredicto formal —coherente, parcial o incoherente— lo produce el modelo con el prompt
              de la llamada B, que ya está escrito.
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
              <strong className="font-medium">Orden de revisión, y no se negocia:</strong> mensaje →
              problema descrito → nivel de madurez → deseo activado → palabras. Recién al final,
              targeting. Si los leads son incorrectos, no se concluye que hay un problema de
              segmentación.
            </p>
            {nLeads > 0 && nLeads < 10 && (
              <p className="mt-2 text-[12.5px]" style={{ color: 'var(--warning-ink)' }}>
                {nLeads} leads no alcanzan para concluir sobre calidad de leads. Hacen falta al menos
                diez, y clasificados.
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setVerPrompts((s) => !s)} className="rounded-lg border border-line px-3 py-1.5 text-[12px] hover:border-accent">
              {verPrompts ? 'Ocultar' : 'Ver'} los dos prompts
            </button>
            <button type="button" onClick={() => { setPaso('material'); setPerfil(null); }} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-3">
              Probar otro material
            </button>
          </div>

          {verPrompts && (
            <div className="space-y-3">
              <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-surface-2/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                {'### LLAMADA A · a ciegas\n\n' + promptA}
              </pre>
              <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-surface-2/60 p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                {'### LLAMADA B · comparación\n\n' + promptB}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

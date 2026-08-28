'use client';

import { useRef, useState } from 'react';

/**
 * CHAT SOBRE EL CLIENTE
 *
 * No es un asistente general: es una conversación sobre un expediente
 * concreto, que viaja entero como contexto. Por eso no hay selector de
 * modelo ni system prompt editable — la constitución del rol es la misma que
 * usan los motores, y si se pudiera cambiar acá dejaría de ser el mismo
 * criterio.
 */

type Mensaje = { role: 'user' | 'assistant'; content: string };

const SUGERENCIAS = [
  '¿Cuál es el cuello de botella y por qué?',
  '¿Qué le pregunto en la sesión de mañana?',
  '¿Es el cliente o somos nosotros?',
  '¿Qué dato me falta para poder concluir algo?',
];

export function ChatCliente({ clienteId, nombre, conectado }: { clienteId: string; nombre: string; conectado: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [corriendo, setCorriendo] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);

  async function enviar(pregunta: string) {
    const limpio = pregunta.trim();
    if (!limpio || corriendo) return;

    const historia: Mensaje[] = [...mensajes, { role: 'user', content: limpio }];
    setMensajes([...historia, { role: 'assistant', content: '' }]);
    setTexto('');
    setCorriendo(true);

    try {
      const res = await fetch(`/api/clientes/${clienteId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historia }),
      });

      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: 'No se pudo conectar con el modelo.' }));
        setMensajes([...historia, { role: 'assistant', content: `[${e.error}]` }]);
        return;
      }

      const lector = res.body.getReader();
      const decoder = new TextDecoder();
      let acumulado = '';
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        acumulado += decoder.decode(value, { stream: true });
        setMensajes([...historia, { role: 'assistant', content: acumulado }]);
        finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } catch {
      setMensajes([...historia, { role: 'assistant', content: '[Se cortó la conexión con el modelo.]' }]);
    } finally {
      setCorriendo(false);
    }
  }

  if (!conectado) {
    return (
      <div className="rounded-xl border p-4" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
        <h2 className="text-[14px] font-semibold" style={{ color: 'var(--warning-ink)' }}>
          El chat está sin conectar
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Falta cargar <code className="text-[12px]">ANTHROPIC_API_KEY</code> en el entorno. El resto
          de Brain funciona igual: el motor de reglas local no necesita modelo.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Preguntar sobre {nombre}</h2>
        {mensajes.length > 0 && (
          <button
            type="button"
            onClick={() => setMensajes([])}
            className="text-[11.5px] text-ink-3 hover:border-accent"
          >
            Empezar de nuevo
          </button>
        )}
      </div>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        El expediente completo viaja como contexto. Lo que no está cargado, no se inventa: se dice
        que falta.
      </p>

      {mensajes.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SUGERENCIAS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => enviar(s)}
              className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-accent"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {mensajes.length > 0 && (
        <div className="mb-3 max-h-[28rem] space-y-3 overflow-y-auto">
          {mensajes.map((m, i) => (
            <div key={i}>
              <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">
                {m.role === 'user' ? 'Vos' : 'Brain'}
              </div>
              <div
                className={
                  m.role === 'user'
                    ? 'rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed'
                    : 'whitespace-pre-wrap text-[13px] leading-relaxed'
                }
              >
                {m.content || (corriendo ? 'Pensando…' : '')}
              </div>
            </div>
          ))}
          <div ref={finRef} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex items-end gap-2"
      >
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              enviar(texto);
            }
          }}
          placeholder="Preguntá sobre este cliente…"
          className="w-full flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={corriendo || !texto.trim()}
          className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {corriendo ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}

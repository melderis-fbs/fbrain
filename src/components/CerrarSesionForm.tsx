'use client';

import { useState } from 'react';
import { cx } from '@/lib/ui';
import type { EstadoHito, TipoBloqueo } from '@/domain/types';

/**
 * CERRAR SESIÓN
 *
 * Criterio de aceptación de esta pantalla, y no es negociable: cerrar una
 * sesión acá tiene que tardar menos que escribir el reporte a mano. Si tarda
 * más, el expediente queda vacío en tres semanas y todo lo demás deja de
 * funcionar.
 *
 * Por eso: la transcripción arma el borrador, los números son contadores, los
 * hitos son botones y la lectura son cuatro toques. Nada se guarda hasta la
 * firma.
 */

export interface HitoUI {
  key: string;
  label: string;
  estado: EstadoHito;
  gate: boolean;
  dia: number;
}

interface Props {
  clienteNombre: string;
  hitos: HitoUI[];
  ultimaSemana?: Record<string, number | null>;
  kpi?: { dms: number; agendas: number };
  hoy: string;
  criterios: { codigo: string; titulo: string; estado: string }[];
  lecturaActual?: { percepcion: string; bloqueo: string; renovacion: string };
  action: (formData: FormData) => void;
}

const PERCEPCIONES = [
  { v: 'muy_bien', l: 'Muy bien' },
  { v: 'bien', l: 'Bien' },
  { v: 'atencion', l: 'Necesita atención' },
  { v: 'riesgo', l: 'En riesgo' },
];

const BLOQUEOS: (TipoBloqueo | 'ninguno')[] = [
  'ninguno', 'estrategico', 'mensaje', 'adquisicion', 'comercial',
  'entrega', 'operativo', 'ejecucion', 'emocional',
];

const ESTADOS_HITO: { v: EstadoHito; l: string }[] = [
  { v: 'sin_trabajar', l: '—' },
  { v: 'en_progreso', l: 'En progreso' },
  { v: 'necesita_ajustes', l: 'Ajustes' },
  { v: 'bloqueado', l: 'Bloqueado' },
  { v: 'cumplido', l: 'Cumplido' },
];

const input =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent';

function Segmentado({
  name, options, value, onChange, small,
}: {
  name: string;
  options: { v: string; l: string }[];
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1">
      <input type="hidden" name={name} value={value} />
      {options.map((o) => {
        const activo = value === o.v;
        const neutro = o.v === 'sin_trabajar' || o.v === 'ninguno';
        return (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            className={cx(
              'rounded-lg border px-2.5 py-1.5 transition',
              small ? 'text-[11.5px]' : 'text-[12.5px]',
              activo && !neutro
                ? 'border-transparent font-semibold text-white'
                : activo
                  ? 'border-line bg-surface-2 font-semibold text-ink-2'
                  : 'border-line text-ink-2 hover:border-accent',
            )}
            style={activo && !neutro ? { background: 'var(--accent)' } : undefined}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

function Contador({ name, label, inicial, objetivo }: { name: string; label: string; inicial: number | null; objetivo?: number }) {
  const [v, setV] = useState<string>(inicial === null || inicial === undefined ? '' : String(inicial));
  const paso = (d: number) => setV((x) => String(Math.max(0, (Number(x) || 0) + d)));
  return (
    <div className="rounded-lg border border-line p-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-ink-3">{label}</span>
        {objetivo !== undefined && <span className="tnum text-[10px] text-ink-3">obj. {objetivo}</span>}
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <button type="button" onClick={() => paso(-1)} className="h-7 w-7 rounded-md border border-line text-[14px] leading-none hover:border-accent">−</button>
        <input
          name={name}
          value={v}
          onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ''))}
          inputMode="numeric"
          placeholder="—"
          className="tnum w-full min-w-0 rounded-md border border-line bg-transparent px-2 py-1 text-center text-[14px] font-semibold"
        />
        <button type="button" onClick={() => paso(1)} className="h-7 w-7 rounded-md border border-line text-[14px] leading-none hover:border-accent">+</button>
      </div>
    </div>
  );
}

function Campo({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[12px] font-medium">{label}</span>
      {hint && <span className="ml-1.5 text-[11px] text-ink-3">{hint}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function CerrarSesionForm(props: Props) {
  const [estadoAgenda, setEstadoAgenda] = useState('realizada');
  const [percepcion, setPercepcion] = useState(props.lecturaActual?.percepcion ?? 'bien');
  const [bloqueo, setBloqueo] = useState(props.lecturaActual?.bloqueo ?? 'ninguno');
  const [renovacion, setRenovacion] = useState(props.lecturaActual?.renovacion ?? 'medio');
  const [cargarNumeros, setCargarNumeros] = useState('si');
  const [hitos, setHitos] = useState<Record<string, EstadoHito>>(
    Object.fromEntries(props.hitos.map((h) => [h.key, h.estado])),
  );
  const [transcripcion, setTranscripcion] = useState('');
  const [borrador, setBorrador] = useState({ reporte: '', compromisos: '', frases: [] as string[] });
  const [extraido, setExtraido] = useState(false);
  const [codigoCriterio, setCodigoCriterio] = useState('');
  const [cita, setCita] = useState('');
  const [senales, setSenales] = useState<Record<string, string>>({});

  const senal = (k: string, v: string) => setSenales((s) => ({ ...s, [k]: v }));

  /**
   * Extracción local. En producción esta llamada va al modelo chico con el
   * prompt del extractor; acá arma el borrador con reglas simples para que se
   * vea el flujo completo. Todo queda editable, siempre.
   */
  function extraer() {
    const oraciones = transcripcion
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 25);
    const compromisos = oraciones.filter((s) => /\b(voy a|te mando|hago|entrego|publico|agendo|escribo|preparo)\b/i.test(s));
    const frases = oraciones.filter((s) =>
      /\b(no puedo|no sé|no entiendo|no llegué|reembolso|me voy|otra consultora|no veo|abruma|caro|bajar el precio|nadie)\b/i.test(s),
    );
    setBorrador({
      reporte: oraciones.slice(0, 4).join('. ') + (oraciones.length ? '.' : ''),
      compromisos: compromisos.slice(0, 3).join('\n'),
      frases: frases.slice(0, 4),
    });
    setSenales((s) => ({
      ...s,
      mencionoNumeros: /\d/.test(transcripcion) ? 'si' : 'no',
      cerroConCompromiso: compromisos.length ? 'si' : 'no',
    }));
    setExtraido(true);
  }

  return (
    <form action={props.action} className="space-y-4">
      {/* 1 · la sesión */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-semibold">1 · La sesión</h2>
        <div className="flex flex-wrap items-end gap-4">
          <Campo label="Fecha">
            <input type="date" name="fecha" defaultValue={props.hoy} className={input} />
          </Campo>
          <Campo label="¿Qué pasó con la agenda?">
            <Segmentado
              name="estadoAgenda"
              value={estadoAgenda}
              onChange={setEstadoAgenda}
              options={[
                { v: 'realizada', l: 'Se hizo' },
                { v: 'cancelada', l: 'Cancelada' },
                { v: 'reprogramada', l: 'Reprogramada' },
                { v: 'no_asistio', l: 'No asistió' },
              ]}
            />
          </Campo>
        </div>
      </section>

      {estadoAgenda === 'realizada' && (
        <>
          {/* 2 · transcripción y reporte */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1 text-[13px] font-semibold">2 · Qué pasó</h2>
            <p className="mb-3 text-[11.5px] text-ink-3">
              Pegá la transcripción y el extractor arma el borrador. Todo queda editable: el extractor
              propone, vos firmás.
            </p>
            <details className="mb-3 rounded-lg border border-line p-3" open={!extraido}>
              <summary className="cursor-pointer text-[12px] font-medium">Transcripción (opcional)</summary>
              <textarea
                name="transcripcion"
                rows={5}
                value={transcripcion}
                onChange={(e) => setTranscripcion(e.target.value)}
                placeholder="Pegá acá la transcripción de la sesión…"
                className={`${input} mt-2`}
              />
              <button
                type="button"
                onClick={extraer}
                disabled={transcripcion.length < 60}
                className="mt-2 rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                Generar borrador
              </button>
            </details>

            <Campo label="Reporte" hint="5 a 10 líneas, para que alguien que no estuvo entienda en 30 segundos">
              <textarea
                name="reporte"
                rows={4}
                value={borrador.reporte}
                onChange={(e) => setBorrador({ ...borrador, reporte: e.target.value })}
                className={input}
              />
            </Campo>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Campo label="Compromisos del cliente" hint="uno por línea, verificables">
                <textarea
                  name="compromisos"
                  rows={3}
                  value={borrador.compromisos}
                  onChange={(e) => setBorrador({ ...borrador, compromisos: e.target.value })}
                  className={input}
                />
              </Campo>
              <Campo label="Vencen el">
                <input type="date" name="vencimientoCompromisos" className={input} />
              </Campo>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[
                ['mencionoNumeros', '¿Se dijo algún número del embudo?'],
                ['cerroConCompromiso', '¿Cerró con un compromiso con fecha?'],
                ['abrioRepasando', '¿Abrió repasando el compromiso anterior?'],
                ['seFueEnHerramienta', '¿Se fue en pantalla o configuración?'],
              ].map(([k, label]) => (
                <div key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5">
                  <span className="text-[11.5px]">{label}</span>
                  <Segmentado
                    small
                    name={k}
                    value={senales[k] ?? ''}
                    onChange={(v) => senal(k, v)}
                    options={[{ v: 'si', l: 'Sí' }, { v: 'no', l: 'No' }]}
                  />
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              Las ausencias también son señal, y son las más baratas de detectar. Cerca de la mitad de
              las sesiones de un caso perdido se fueron en configurar herramientas.
            </p>

            <div className="mt-3">
              <Campo label="Satisfacción del cliente (0-10)" hint="una sola pregunta al cierre; hoy esta casilla está vacía en 818 filas">
                <input name="satisfaccion" inputMode="numeric" placeholder="—" className={`${input} max-w-[120px]`} />
              </Campo>
            </div>
          </section>

          {/* 3 · números */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1 text-[13px] font-semibold">3 · Números de la semana</h2>
            <p className="mb-3 text-[11.5px] text-ink-3">
              Dejá vacío lo que no sepas. Vacío significa «no lo medimos»; cero significa «lo medimos
              y dio cero». Confundirlos hace que el diagnóstico concluya sobre nada.
            </p>
            <div className="mb-3">
              <Segmentado
                name="cargarNumeros"
                value={cargarNumeros}
                onChange={setCargarNumeros}
                options={[{ v: 'si', l: 'Cargar números' }, { v: 'no', l: 'Esta semana no' }]}
              />
            </div>
            {cargarNumeros === 'si' && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                <Contador name="contenidoPublicado" label="Contenido" inicial={props.ultimaSemana?.contenidoPublicado ?? null} />
                <Contador name="alcanceTotal" label="Alcance" inicial={props.ultimaSemana?.alcanceTotal ?? null} />
                <Contador name="alcanceNoSeguidores" label="Alcance no seguidores" inicial={props.ultimaSemana?.alcanceNoSeguidores ?? null} />
                <Contador name="dmsIniciados" label="DMs" inicial={props.ultimaSemana?.dmsIniciados ?? null} objetivo={props.kpi?.dms} />
                <Contador name="conversacionesAvanzadas" label="Conversaciones" inicial={props.ultimaSemana?.conversacionesAvanzadas ?? null} />
                <Contador name="agendas" label="Agendas" inicial={props.ultimaSemana?.agendas ?? null} objetivo={props.kpi?.agendas} />
                <Contador name="asistencias" label="Asistencias" inicial={props.ultimaSemana?.asistencias ?? null} />
                <Contador name="ofertasRealizadas" label="Ofertas" inicial={props.ultimaSemana?.ofertasRealizadas ?? null} />
                <Contador name="ventas" label="Ventas" inicial={props.ultimaSemana?.ventas ?? null} />
                <div className="rounded-lg border border-line p-2.5">
                  <div className="text-[11px] text-ink-3">Facturado</div>
                  <input name="facturado" inputMode="numeric" placeholder="—" className="tnum mt-1 w-full rounded-md border border-line bg-transparent px-2 py-1 text-center text-[14px] font-semibold" />
                </div>
              </div>
            )}
          </section>

          {/* 4 · hitos */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-1 text-[13px] font-semibold">4 · Hitos de la fase</h2>
            <p className="mb-3 text-[11.5px] text-ink-3">
              Sólo los de la fase actual. Los hitos automáticos (primera venta, primera agenda) no
              aparecen: los deriva el sistema de los números.
            </p>
            <div className="space-y-2">
              {props.hitos.map((h) => (
                <div key={h.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px]">
                    {h.label}
                    {h.gate && (
                      <span className="ml-1.5 rounded px-1 py-[1px] text-[9px] font-bold uppercase" style={{ background: 'var(--ink)', color: 'var(--surface)' }}>
                        gate
                      </span>
                    )}
                    <span className="ml-1.5 text-[10.5px] text-ink-3">día {h.dia}</span>
                  </span>
                  <Segmentado
                    small
                    name={`hito:${h.key}`}
                    value={hitos[h.key]}
                    onChange={(v) => setHitos({ ...hitos, [h.key]: v as EstadoHito })}
                    options={ESTADOS_HITO}
                  />
                </div>
              ))}
              {!props.hitos.length && <p className="text-[12px] text-ink-3">No hay hitos manuales en esta fase.</p>}
            </div>
          </section>
        </>
      )}

      {/* 5 · lectura */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-[13px] font-semibold">5 · Tu lectura</h2>
        <p className="mb-3 text-[11.5px] text-ink-3">
          Esto no se promedia en ningún puntaje: emite alertas. Si marcás que necesitás intervención,
          se abre una roja con responsable y plazo, y no la podés cerrar vos.
        </p>
        <div className="space-y-3">
          <Campo label="¿Cómo ves al cliente?">
            <Segmentado name="percepcion" value={percepcion} onChange={setPercepcion} options={PERCEPCIONES} />
          </Campo>
          <Campo label="¿Qué está bloqueando el resultado?">
            <Segmentado
              small
              name="bloqueo"
              value={bloqueo}
              onChange={setBloqueo}
              options={BLOQUEOS.map((b) => ({ v: b, l: b }))}
            />
          </Campo>
          <Campo label="Potencial de renovación">
            <Segmentado
              small
              name="renovacion"
              value={renovacion}
              onChange={setRenovacion}
              options={[{ v: 'alto', l: 'Alto' }, { v: 'medio', l: 'Medio' }, { v: 'bajo', l: 'Bajo' }]}
            />
          </Campo>
          <label className="flex items-center gap-2 text-[12.5px] font-medium">
            <input type="checkbox" name="necesitaIntervencion" />
            Necesito intervención: no puedo sola con este caso
          </label>
          <Campo label="Comentario" hint="opcional">
            <textarea name="comentario" rows={2} className={input} />
          </Campo>
        </div>
      </section>

      {/* 6 · alerta de criterio */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-1 text-[13px] font-semibold">6 · ¿Hay una frase para marcar? (opcional)</h2>
        <p className="mb-3 text-[11.5px] text-ink-3">
          Sin cita textual no hay alerta. Con cita es un hecho y se trabaja; sin cita es una
          interpretación y se discute.
        </p>
        {borrador.frases.length > 0 && (
          <div className="mb-3 space-y-1.5">
            <div className="text-[11px] uppercase tracking-wide text-ink-3">Frases candidatas detectadas</div>
            {borrador.frases.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setCita(f)}
                className="block w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-[12px] italic hover:border-accent"
              >
                “{f}”
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Criterio">
            <select name="codigoCriterio" value={codigoCriterio} onChange={(e) => setCodigoCriterio(e.target.value)} className={input}>
              <option value="">— ninguno —</option>
              {props.criterios.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} · {c.titulo} ({c.estado})
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Cita textual" hint="literal, sin corregir la gramática">
            <input name="citaTextual" value={cita} onChange={(e) => setCita(e.target.value)} className={input} />
          </Campo>
        </div>
        {codigoCriterio && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo label="Qué está pasando"><input name="cuerpoCriterio" className={input} /></Campo>
            <Campo label="Pedido" hint="qué se espera y de quién"><input name="pedidoCriterio" className={input} /></Campo>
          </div>
        )}
      </section>

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3" style={{ boxShadow: 'var(--shadow)' }}>
        <button type="submit" className="rounded-lg px-4 py-2.5 text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
          Firmar y guardar
        </button>
        <span className="text-[11.5px] text-ink-3">
          Escribe sesión, compromisos, números, hitos, lectura y alertas de una sola vez.
        </span>
      </div>
    </form>
  );
}

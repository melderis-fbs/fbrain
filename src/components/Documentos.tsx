'use client';

import { useRef, useState } from 'react';

/**
 * DOCUMENTOS DEL CLIENTE
 *
 * Todo lo que el consultor tiene y hasta ahora no tenía dónde poner: la
 * transcripción de la llamada de venta, el formulario de onboarding, las
 * transcripciones de sesión anteriores al día 1. El diagnóstico y el chat los
 * leen, así que cargar acá es lo que hace que el motor hable del caso y no de
 * un negocio genérico.
 *
 * Entran .txt, .md, .vtt, .srt, PDF y .docx, o el texto pegado a mano. Los de
 * texto los lee el navegador; el PDF y el .docx viajan al servidor, que saca
 * el texto y lo devuelve a la pantalla para que la consultora lo revise antes
 * de guardarlo.
 *
 * En los dos casos **nada se sube a un storage**: lo único que queda guardado
 * es el texto, junto al resto del expediente. El archivo original sigue
 * viviendo donde ya estaba.
 */

const TIPOS = [
  { v: 'transcripcion', l: 'Transcripción de sesión' },
  { v: 'llamada_venta', l: 'Llamada de venta' },
  { v: 'formulario_onboarding', l: 'Formulario de onboarding' },
  { v: 'contrato', l: 'Contrato' },
  { v: 'reporte', l: 'Reporte' },
  { v: 'otro', l: 'Otro' },
];

export const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.v, t.l]));

/** Los de texto los lee el navegador; el resto los extrae el servidor. */
const PLANOS = ['.txt', '.md', '.csv', '.vtt', '.srt', '.json', '.log'];
const EXTENSIONES = [...PLANOS, '.pdf', '.docx'].join(',');
const esPlano = (n: string) => PLANOS.some((e) => n.toLowerCase().endsWith(e));

type Doc = {
  id: string;
  tipo: string;
  titulo: string;
  fecha: string;
  contenido: string;
  archivo?: string;
};

export function Documentos({
  clienteId,
  documentos,
  hoy,
  subir,
  borrar,
  extraer,
}: {
  clienteId: string;
  documentos: Doc[];
  hoy: string;
  subir: (clienteId: string, fd: FormData) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  borrar: (clienteId: string, id: string) => Promise<void>;
  extraer: (clienteId: string, fd: FormData) => Promise<{ ok: true; texto: string; nota?: string } | { ok: false; error: string }>;
}) {
  const [contenido, setContenido] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [nota, setNota] = useState('');
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState('transcripcion');
  const [fecha, setFecha] = useState(hoy);
  const [archivo, setArchivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  async function leerArchivos(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setLeyendo(true);
    const partes: string[] = [];
    const notas: string[] = [];

    try {
      for (const f of Array.from(files)) {
        let texto: string;

        if (esPlano(f.name)) {
          texto = await f.text();
        } else {
          // Un PDF o un .docx sólo se puede abrir en el servidor.
          const fd = new FormData();
          fd.set('archivo', f);
          const r = await extraer(clienteId, fd);
          if (!r.ok) { setError(r.error); return; }
          texto = r.texto;
          if (r.nota) notas.push(`${f.name}: ${r.nota}`);
        }

        partes.push(files.length > 1 ? `### ${f.name}\n\n${texto}` : texto);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
      return;
    } finally {
      setLeyendo(false);
    }

    setContenido((prev) => (prev ? `${prev}\n\n${partes.join('\n\n')}` : partes.join('\n\n')));
    setArchivo(Array.from(files).map((f) => f.name).join(', '));
    setNota(notas.join(' · '));
    if (!titulo) setTitulo(files[0].name.replace(/\.[^.]+$/, ''));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('contenido', contenido);
      fd.set('titulo', titulo);
      fd.set('tipo', tipo);
      fd.set('fecha', fecha);
      fd.set('archivo', archivo);
      const r = await subir(clienteId, fd);
      if (!r.ok) { setError(r.error); return; }
      setContenido('');
      setTitulo('');
      setArchivo('');
      if (inputArchivo.current) inputArchivo.current.value = '';
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  }

  const palabras = contenido.trim() ? contenido.trim().split(/\s+/).length : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">Subir un documento</h2>
        <p className="mb-3 mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
          <strong>PDF, .docx</strong> o archivos de texto (.txt, .md, .vtt, .srt), o el texto
          pegado directo. De los PDF y los .docx se extrae el texto y aparece acá abajo para que lo
          revises antes de guardar. El archivo en sí no se sube a ningún lado: lo que queda es el
          texto. Un PDF escaneado no tiene texto adentro y te lo va a decir.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[12px] font-medium">Título</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Llamada de venta · 12 de marzo"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-medium">Fecha del documento</span>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
          </label>
          <label className="block sm:col-span-3">
            <span className="mb-1 block text-[12px] font-medium">Tipo</span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
            >
              {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-3">
          <input
            ref={inputArchivo}
            type="file"
            multiple
            accept={EXTENSIONES}
            onChange={(e) => leerArchivos(e.target.files)}
            disabled={leyendo}
            className="text-[12px] text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-medium hover:file:border-accent"
          />
        </div>

        {leyendo && (
          <p className="mt-2 text-[12px] text-ink-3">Extrayendo el texto del archivo…</p>
        )}
        {nota && !leyendo && (
          <p className="mt-2 text-[12px] text-ink-3">{nota}</p>
        )}

        <textarea
          rows={8}
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
          placeholder="…o pegá el texto acá"
          className="mt-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
        />

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || contenido.trim().length < 20 || !titulo.trim()}
            className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {guardando ? 'Guardando…' : 'Guardar el documento'}
          </button>
          {palabras > 0 && (
            <span className="tnum text-[11.5px] text-ink-3">
              {palabras.toLocaleString('es-AR')} palabras
              {archivo && <> · desde {archivo}</>}
            </span>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
            {error}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">
          Cargados <span className="text-ink-3">({documentos.length})</span>
        </h2>
        {documentos.length === 0 ? (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">
            Todavía no hay ninguno. El diagnóstico y el chat leen lo que haya acá: con el expediente
            vacío, el motor razona sobre huecos.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {documentos.map((d) => (
              <li key={d.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{d.titulo}</div>
                    <div className="text-[11.5px] text-ink-3">
                      {TIPO_LABEL[d.tipo] ?? d.tipo} · {d.fecha} ·{' '}
                      {d.contenido.trim().split(/\s+/).length.toLocaleString('es-AR')} palabras
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setAbierto(abierto === d.id ? null : d.id)}
                      className="rounded-md border border-line px-2 py-0.5 text-[11.5px] hover:border-accent"
                    >
                      {abierto === d.id ? 'Cerrar' : 'Ver'}
                    </button>
                    <button
                      type="button"
                      onClick={() => borrar(clienteId, d.id)}
                      className="rounded-md px-2 py-0.5 text-[11.5px] text-ink-3 hover:border-accent"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
                {abierto === d.id && (
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface-2/60 p-3 text-[11.5px] leading-relaxed">
                    {d.contenido}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

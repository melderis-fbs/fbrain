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
 * Se aceptan archivos de texto y se leen en el navegador: nada se sube a un
 * storage, el contenido viaja como texto y queda en la base con el resto del
 * expediente. Un PDF o un .docx hay que copiarlos y pegarlos — extraerlos
 * necesitaría librerías nativas que no corren en WebContainer, y prefiero
 * decirlo antes que fallar en silencio.
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

/** Lo que se puede leer como texto en el navegador, sin librerías. */
const EXTENSIONES = '.txt,.md,.csv,.vtt,.srt,.json,.log,text/plain';

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
}: {
  clienteId: string;
  documentos: Doc[];
  hoy: string;
  subir: (clienteId: string, fd: FormData) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  borrar: (clienteId: string, id: string) => Promise<void>;
}) {
  const [contenido, setContenido] = useState('');
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
    const partes: string[] = [];
    for (const f of Array.from(files)) {
      try {
        partes.push(files.length > 1 ? `### ${f.name}\n\n${await f.text()}` : await f.text());
      } catch {
        setError(`No se pudo leer ${f.name}. Si es un PDF o un .docx, copiá el texto y pegalo acá.`);
        return;
      }
    }
    setContenido((prev) => (prev ? `${prev}\n\n${partes.join('\n\n')}` : partes.join('\n\n')));
    setArchivo(Array.from(files).map((f) => f.name).join(', '));
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
          Archivos de texto (.txt, .md, .vtt, .srt) o pegado directo. Un PDF o un .docx hay que
          copiarlo y pegarlo: extraerlos necesitaría librerías que no corren acá.
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
            className="text-[12px] text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-[12px] file:font-medium hover:file:border-accent"
          />
        </div>

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

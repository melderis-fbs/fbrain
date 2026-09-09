import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ListaSesiones, type FilaSesion } from '@/components/ListaSesiones';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { hayModelo } from '@/server/modelo';
import { analizarSesion } from './actions';

export const metadata = { title: 'Sesiones · Founders Brain' };

/** Analizar una transcripción es una llamada al modelo: puede tardar. */
export const maxDuration = 300;

export default async function SesionesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  // De la más nueva a la más vieja, pero numeradas desde la primera: «sesión 4»
  // es la cuarta que tuvo, no la cuarta desde abajo.
  const orden = [...v.ctx.registros.sesiones].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const filas: FilaSesion[] = orden
    .map((s, i) => ({
      id: s.id,
      numero: i + 1,
      fecha: s.fecha,
      estado: s.estadoAgenda,
      resumen: s.reporte,
      tieneTranscripcion: Boolean(s.transcripcionTexto),
    }))
    .reverse();

  const sinAnalizar = filas.filter((f) => !f.resumen).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:border-accent">← {v.ctx.cliente.nombre}</Link>
      </div>

      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight">Sesiones</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          {filas.length === 0
            ? 'Todavía no hay ninguna registrada.'
            : `${filas.length} sesión${filas.length === 1 ? '' : 'es'}${sinAnalizar ? ` · ${sinAnalizar} sin analizar` : ' · todas analizadas'}.`}{' '}
          Abrí la que te interese, pegá la transcripción y apretá analizar: vuelve en tres a cinco
          puntos, con los compromisos que se acordaron.
        </p>
        {!hayModelo() && (
          <p className="mt-2 text-[12.5px]" style={{ color: 'var(--warning-ink)' }}>
            Falta <code>ANTHROPIC_API_KEY</code> en el entorno: el análisis está apagado. Cargar la
            transcripción funciona igual.
          </p>
        )}
      </div>

      <ListaSesiones clienteId={id} sesiones={filas} analizar={analizarSesion} />
    </div>
  );
}

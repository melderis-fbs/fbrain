import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import { addDays, formatShort, mondayOf } from '@/lib/date';
import { guardarSemana } from './actions';

export const metadata = { title: 'Tracker semanal · Founders Brain' };

const CAMPOS: { name: string; label: string }[] = [
  { name: 'contenidoPublicado', label: 'Contenido publicado' },
  { name: 'alcanceTotal', label: 'Alcance total' },
  { name: 'alcanceNoSeguidores', label: 'Alcance no seguidores' },
  { name: 'dmsIniciados', label: 'DMs iniciados' },
  { name: 'conversacionesAvanzadas', label: 'Conversaciones avanzadas' },
  { name: 'leads', label: 'Leads' },
  { name: 'leadsCalificados', label: 'Leads calificados' },
  { name: 'agendas', label: 'Agendas' },
  { name: 'asistencias', label: 'Asistencias' },
  { name: 'cancelaciones', label: 'Cancelaciones' },
  { name: 'ofertasRealizadas', label: 'Ofertas realizadas' },
  { name: 'ventas', label: 'Ventas' },
  { name: 'facturado', label: 'Facturado' },
  { name: 'ticketPromedio', label: 'Ticket promedio' },
  { name: 'inversionAds', label: 'Inversión en ads' },
];

/** Las columnas que se miran de un vistazo en la grilla de semanas. */
const RESUMEN = ['dmsIniciados', 'conversacionesAvanzadas', 'agendas', 'asistencias', 'ofertasRealizadas', 'ventas'] as const;

export default async function TrackerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ semana?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { semana: semanaParam, ok } = await searchParams;

  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const hoy = hoyIso();
  const semana = mondayOf(semanaParam || hoy);
  const metricas = v.ctx.registros.metricas;
  const actual = metricas.find((m) => m.semanaIso === semana);

  // Las últimas 12 semanas desde el alta, más nuevas primero.
  const semanas: string[] = [];
  for (let i = 0; i < 12; i++) {
    const s = mondayOf(addDays(hoy, -7 * i));
    if (s < mondayOf(v.ctx.cliente.fechaAlta)) break;
    semanas.push(s);
  }

  const kpi = v.ctx.kpiSemanal;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:border-accent">← {v.ctx.cliente.nombre}</Link>
      </div>

      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight">Tracker semanal</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Una fila por semana. <strong>Dejar un campo vacío no es cargar un cero</strong>: vacío
          significa que nadie lo midió, y el motor los trata distinto en todos lados.
          {kpi && (
            <> El KPI de este cliente sale de su propia meta y su ticket, no de un benchmark.</>
          )}
        </p>
      </div>

      {ok && (
        <p className="mb-4 rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
          Semana del {formatShort(ok)} guardada.
        </p>
      )}

      {/* ------------------------------------------------ grilla de semanas */}
      <section className="mb-4 overflow-x-auto rounded-xl border border-line bg-surface p-4">
        <h2 className="mb-3 text-[13px] font-semibold">Las últimas {semanas.length} semanas</h2>
        <table className="w-full min-w-[36rem] text-[12px]">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="pb-2 font-medium">Semana</th>
              {RESUMEN.map((c) => (
                <th key={c} className="pb-2 text-right font-medium">
                  {CAMPOS.find((x) => x.name === c)?.label.split(' ')[0]}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {semanas.map((s) => {
              const m = metricas.find((x) => x.semanaIso === s);
              return (
                <tr key={s} className="border-t border-line">
                  <td className="py-1.5 font-medium">{formatShort(s)}</td>
                  {RESUMEN.map((c) => {
                    const valor = m ? (m[c] as number | null) : undefined;
                    return (
                      <td key={c} className="tnum py-1.5 text-right">
                        {valor === undefined || valor === null ? (
                          <span className="text-ink-3" title="Sin cargar: no es cero">—</span>
                        ) : (
                          valor
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1.5 text-right">
                    <Link
                      href={`/clientes/${id}/tracker?semana=${s}`}
                      className="rounded-md border border-line px-2 py-0.5 text-[11px] hover:border-accent"
                    >
                      {m ? 'Editar' : 'Cargar'}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-ink-3">
          El guión no es un cero: es una semana que nadie cargó.
        </p>
      </section>

      {/* ------------------------------------------------ carga de la semana */}
      <form action={guardarSemana.bind(null, id)} className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[13px] font-semibold">
          Semana del {formatShort(semana)} {actual ? '· editando' : '· sin cargar'}
        </h2>
        <p className="mb-3 mt-0.5 text-[11.5px] text-ink-3">
          Se guarda por semana del lunes. Cargar la misma semana de nuevo la reemplaza.
        </p>

        <input type="hidden" name="semana" value={semana} />

        <div className="grid gap-3 sm:grid-cols-3">
          {CAMPOS.map((c) => (
            <label key={c.name} className="block">
              <span className="mb-1 block text-[12px] font-medium">{c.label}</span>
              <input
                name={c.name}
                type="number"
                min={0}
                step="any"
                placeholder="—"
                defaultValue={
                  actual && (actual[c.name as keyof typeof actual] as number | null) !== null
                    ? String(actual[c.name as keyof typeof actual])
                    : ''
                }
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
              />
            </label>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-medium">Objeciones que aparecieron</span>
          <textarea
            name="objeciones"
            rows={3}
            defaultValue={(actual?.objeciones ?? []).join('\n')}
            placeholder="Una por línea"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
        </label>

        <button
          type="submit"
          className="mt-4 rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          Guardar la semana
        </button>
      </form>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { AlertaCard } from '@/components/AlertaCard';
import { Card, Empty, SectionTitle, Stat } from '@/components/ui';
import { mondayOf } from '@/lib/date';
import type { Semaforo } from '@/domain/types';

export const metadata = { title: 'Bandeja de alertas · Founders Brain' };

const TITULO: Record<Semaforo, string> = {
  negro: 'Negras · administración, el mismo día',
  rojo: 'Rojas · revisión con alguien que no sea su consultora, en 48 h',
  amarillo: 'Amarillas de esta semana · las resuelve la consultora',
  verde: 'Verdes',
};

export default async function AlertasPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();

  const mias = ws.vistas.filter((v) => veTodo(usuario.rol) || v.ctx.cliente.consultoraId === usuario.id);
  const porCliente = new Map(mias.map((v) => [v.ctx.cliente.id, v]));
  const todas = ws.bandeja.filter((a) => porCliente.has(a.clienteId));

  const semana = mondayOf(ws.hoy);
  const graves = todas.filter((a) => a.estadoSemaforo === 'negro' || a.estadoSemaforo === 'rojo');
  const amarillas = todas.filter((a) => a.estadoSemaforo === 'amarillo');
  const nuevas = amarillas.filter((a) => a.emitidaEnSemana === semana && !a.diferida);
  const backlog = amarillas.filter((a) => a.emitidaEnSemana !== semana && !a.diferida);
  const diferidas = todas.filter((a) => a.diferida);

  const viejas = graves.filter(
    (a) => new Date(ws.hoy).getTime() - new Date(a.emitidaAt).getTime() > 7 * 86400000,
  );

  /**
   * AGRUPAR POR REGLA.
   *
   * Una alerta por cliente es lo correcto en la base y es ruido en la
   * pantalla: si la misma regla dispara sobre cuarenta y ocho clientes, no son
   * cuarenta y ocho problemas — es uno, y la decisión se toma una vez. Con
   * ciento seis tarjetas abiertas nadie lee la bandeja; con seis renglones sí,
   * y desde cada uno se llega a los clientes sin perder ninguno.
   *
   * Se ordena por cantidad: la regla que más dispara es la que más dice sobre
   * la cartera, y es por donde conviene empezar.
   */
  const agrupar = (items: typeof todas) => {
    const m = new Map<string, typeof todas>();
    for (const a of items) {
      const l = m.get(a.codigo);
      if (l) l.push(a);
      else m.set(a.codigo, [a]);
    }
    return [...m.entries()].sort((x, y) => y[1].length - x[1].length);
  };

  const nombresDe = (items: typeof todas) =>
    items.map((a) => porCliente.get(a.clienteId)!.ctx.cliente.nombre);

  const tarjeta = (a: (typeof todas)[number], compacta = false) => {
    const v = porCliente.get(a.clienteId)!;
    return (
      <AlertaCard
        key={a.id}
        alerta={a}
        clienteId={a.clienteId}
        clienteNombre={v.ctx.cliente.nombre}
        consultoraDelCaso={v.ctx.cliente.consultoraId}
        usuario={usuario}
        compacta={compacta}
      />
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Bandeja de alertas</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Cada alerta muestra sus tres líneas completas, con la cita textual. Ninguna se cierra por el
          paso del tiempo: se cierra porque alguien escribió qué hizo.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><Stat label="Negras y rojas" value={graves.length} tone={graves.length ? 'bad' : 'good'} sub="lo que se atiende hoy" /></Card>
        <Card><Stat label="Nuevas esta semana" value={nuevas.length} sub="techo de 10" /></Card>
        <Card><Stat label="Backlog" value={backlog.length} tone={backlog.length > 20 ? 'bad' : 'neutral'} sub="abiertas de semanas anteriores" /></Card>
        <Card><Stat label="Rojas abiertas +7 días" value={viejas.length} tone={viejas.length ? 'bad' : 'good'} /></Card>
      </div>

      {backlog.length > 15 && (
        <div className="mb-5 rounded-xl border p-4" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--warning-ink)' }}>
            Backlog de la primera corrida
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            Las reglas corrieron por primera vez sobre toda la cartera, así que estas{' '}
            <strong>{backlog.length} alertas</strong> son el estado real de hoy, no ruido del sistema.
            Ese número es el primer hallazgo: es lo que hasta ahora nadie miraba. El techo de diez por
            semana regula lo que entra de acá en adelante; el backlog se baja una vez, en una reunión.
          </p>
        </div>
      )}

      {!todas.length && (
        <Empty>No hay alertas abiertas. Verificá que los datos estén cargados antes de festejar.</Empty>
      )}

      {(['negro', 'rojo'] as Semaforo[]).map((estado) => {
        const items = graves.filter((a) => a.estadoSemaforo === estado);
        if (!items.length) return null;
        const grupos = agrupar(items);
        return (
          <section key={estado} className="mb-6">
            <SectionTitle hint={`${grupos.length} regla${grupos.length > 1 ? 's' : ''} · ${items.length} cliente${items.length > 1 ? 's' : ''}`}>
              {TITULO[estado]}
            </SectionTitle>
            <div className="space-y-2">
              {grupos.map(([codigo, del]) => (
                <Grupo
                  key={codigo}
                  codigo={codigo}
                  titulo={del[0].reglaTitulo}
                  nombres={nombresDe(del)}
                  tono={estado === 'negro' ? 'var(--critical)' : 'var(--serious)'}
                >
                  {del.map((a) => tarjeta(a))}
                </Grupo>
              ))}
            </div>
          </section>
        );
      })}

      {nuevas.length > 0 && (
        <section className="mb-6">
          <SectionTitle hint={`${agrupar(nuevas).length} regla(s) · ${nuevas.length} cliente(s)`}>
            {TITULO.amarillo}
          </SectionTitle>
          <div className="space-y-2">
            {agrupar(nuevas).map(([codigo, del]) => (
              <Grupo
                key={codigo}
                codigo={codigo}
                titulo={del[0].reglaTitulo}
                nombres={nombresDe(del)}
                tono="var(--warning)"
              >
                {del.map((a) => tarjeta(a))}
              </Grupo>
            ))}
          </div>
        </section>
      )}

      {backlog.length > 0 && (
        <details className="mb-4 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Backlog de amarillas · {backlog.length}
          </summary>
          <p className="mb-3 mt-1 text-[12px] text-ink-3">
            Abiertas de semanas anteriores. Se bajan de a poco, empezando por las de mayor prioridad.
          </p>
          <div className="space-y-2">
            {agrupar(backlog).map(([codigo, del]) => (
              <div key={codigo} className="rounded-lg border border-line px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="tnum text-[11px] font-semibold text-ink-3">{codigo}</span>
                  <strong className="text-[12.5px] font-medium">{del[0].reglaTitulo}</strong>
                  <span className="tnum ml-auto text-[12px] text-ink-2">{del.length}</span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
                  {del.slice(0, 8).map((a, i) => (
                    <span key={a.id}>
                      {i > 0 && ' · '}
                      <Link href={`/clientes/${a.clienteId}`} className="hover:underline">
                        {porCliente.get(a.clienteId)!.ctx.cliente.nombre}
                      </Link>
                    </span>
                  ))}
                  {del.length > 8 && ` · y ${del.length - 8} más`}
                </p>
              </div>
            ))}
          </div>
        </details>
      )}

      {diferidas.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Diferidas por el techo semanal · {diferidas.length}
          </summary>
          <p className="mb-3 mt-1 text-[12px] text-ink-3">
            Pasaron el techo de diez de esta semana. No se borran y no compiten por la atención: van al
            informe mensual. Las negras nunca se difieren.
          </p>
          <div className="space-y-3">{diferidas.slice(0, 15).map((a) => tarjeta(a, true))}</div>
        </details>
      )}
    </div>
  );
}

/**
 * Un renglón por regla: se lee sin abrir, y se abre cuando hace falta.
 *
 * Los nombres van en el resumen a propósito. Saber *quiénes* es la mitad de la
 * decisión, y si hay que desplegar para averiguarlo el renglón no sirve de
 * nada. Con más de seis se corta y se dice cuántos faltan.
 */
function Grupo({
  codigo,
  titulo,
  nombres,
  tono,
  children,
}: {
  codigo: string;
  titulo: string;
  nombres: string[];
  tono: string;
  children: React.ReactNode;
}) {
  const muestra = nombres.slice(0, 6);
  const resto = nombres.length - muestra.length;

  return (
    <details className="overflow-hidden rounded-xl border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 hover:bg-surface-2/50">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span
            className="inline-block h-2.5 w-2.5 flex-none rounded-full"
            style={{ background: tono }}
            aria-hidden
          />
          <span className="tnum text-[11px] font-semibold text-ink-3">{codigo}</span>
          <strong className="text-[13.5px] font-semibold">{titulo}</strong>
          <span className="tnum ml-auto text-[12.5px] font-semibold" style={{ color: tono }}>
            {nombres.length} cliente{nombres.length > 1 ? 's' : ''}
          </span>
        </div>
        <p className="mt-1 pl-[22px] text-[12px] leading-relaxed text-ink-3">
          {muestra.join(' · ')}
          {resto > 0 && ` · y ${resto} más`}
        </p>
      </summary>
      <div className="space-y-3 border-t border-line bg-surface-2/30 p-4">{children}</div>
    </details>
  );
}

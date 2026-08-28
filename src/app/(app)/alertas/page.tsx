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
        return (
          <section key={estado} className="mb-6">
            <SectionTitle>
              {TITULO[estado]} <span className="tnum text-ink-3">· {items.length}</span>
            </SectionTitle>
            <div className="space-y-3">{items.map((a) => tarjeta(a))}</div>
          </section>
        );
      })}

      {nuevas.length > 0 && (
        <section className="mb-6">
          <SectionTitle>
            {TITULO.amarillo} <span className="tnum text-ink-3">· {nuevas.length}</span>
          </SectionTitle>
          <div className="space-y-3">{nuevas.map((a) => tarjeta(a))}</div>
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
            {backlog.slice(0, 40).map((a) => {
              const v = porCliente.get(a.clienteId)!;
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
                  <span aria-hidden>🟡</span>
                  <Link href={`/clientes/${a.clienteId}`} className="font-medium hover:underline">
                    {v.ctx.cliente.nombre}
                  </Link>
                  <span className="text-ink-3">{a.codigo}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{a.titulo}</span>
                  <span className="tnum text-[11px] text-ink-3">prioridad {a.prioridad}</span>
                </div>
              );
            })}
            {backlog.length > 40 && (
              <p className="text-[12px] text-ink-3">
                Y {backlog.length - 40} más. Se ven completas desde el expediente de cada cliente.
              </p>
            )}
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

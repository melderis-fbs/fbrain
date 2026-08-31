import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, type VistaCliente } from '@/server/workspace';
import { Avatar, Card, Chip, Empty, SemaforoCelda } from '@/components/ui';
import { ListaComercial } from '@/components/ListaComercial';
import { colorIndice } from '@/lib/ui';
import { formatShort } from '@/lib/date';

export const metadata = { title: 'Mis clientes · Founders Brain' };

type Filtro = 'todos' | 'alertas' | 'sin_sesion' | 'sin_ventas' | 'dia60' | 'ciegos';

const FILTROS: { key: Filtro; label: string; test: (v: VistaCliente) => boolean }[] = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'alertas', label: 'Con alertas abiertas', test: (v) => v.alertasAbiertas.length > 0 },
  { key: 'sin_sesion', label: 'Sin sesión hace 14+ días', test: (v) => (v.ctx.diasSinSesion ?? 999) > 14 },
  { key: 'sin_ventas', label: 'Sin ventas', test: (v) => v.ctx.ventas === 0 },
  { key: 'dia60', label: 'Día 60+', test: (v) => v.ctx.dia >= 60 },
  { key: 'ciegos', label: 'Expediente incompleto', test: (v) => v.ctx.bloquesCargados < 4 },
];

function Vista({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md border px-2.5 py-1 font-medium"
      style={{
        borderColor: activo ? 'var(--accent)' : 'var(--line)',
        background: activo ? 'var(--accent-soft)' : 'transparent',
        color: activo ? 'var(--accent-ink)' : 'var(--ink-2)',
      }}
    >
      {children}
    </Link>
  );
}

export default async function MisClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; v?: string }>;
}) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const sp = await searchParams;
  const filtroKey = (sp.f ?? 'todos') as Filtro;
  const filtro = FILTROS.find((f) => f.key === filtroKey) ?? FILTROS[0];
  const comercial = sp.v === 'comercial';

  const base = ws.vistas
    .filter((v) => veTodo(usuario.rol) || v.ctx.cliente.consultoraId === usuario.id)
    .filter((v) => v.ctx.cliente.estado === 'activo');

  const filas = base.filter(filtro.test).sort((a, b) => b.triage.prioridad - a.triage.prioridad);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight">
          {veTodo(usuario.rol) ? 'Todos los clientes' : 'Mis clientes'}
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {comercial
            ? 'Cómo viene el cobro, por mes de ingreso: si paga en cuotas, cuántas están pagas y si hay algo vencido. El resto de la ficha está adentro de cada cliente.'
            : 'Ordenados por urgencia, no alfabéticamente. Arriba está el que más te necesita hoy.'}
        </p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-ink-3">Ver:</span>
        <Vista href={`/mis-clientes?f=${filtro.key}`} activo={!comercial}>Seguimiento</Vista>
        <Vista href={`/mis-clientes?f=${filtro.key}&v=comercial`} activo={comercial}>Pagos</Vista>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const n = base.filter(f.test).length;
          const activo = f.key === filtro.key;
          return (
            <Link
              key={f.key}
              href={comercial ? `/mis-clientes?f=${f.key}&v=comercial` : `/mis-clientes?f=${f.key}`}
              className="rounded-lg border px-3 py-1.5 text-[12px]"
              style={{
                borderColor: activo ? 'var(--accent)' : 'var(--line)',
                background: activo ? 'var(--accent-soft)' : 'transparent',
                color: activo ? 'var(--accent-ink)' : undefined,
                fontWeight: activo ? 600 : 400,
              }}
            >
              {f.label} <span className="tnum text-ink-3">{n}</span>
            </Link>
          );
        })}
      </div>

      {filas.length && comercial ? (
        <ListaComercial vistas={filas} verConsultora={veTodo(usuario.rol)} hoy={ws.hoy} />
      ) : filas.length ? (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
                  <th className="px-3 py-2.5 font-medium">Semáforo</th>
                  <th className="px-3 py-2.5 font-medium">Cliente</th>
                  {veTodo(usuario.rol) && <th className="px-3 py-2.5 font-medium">Consultora</th>}
                  <th className="px-3 py-2.5 font-medium">Fase</th>
                  <th className="px-3 py-2.5 text-right font-medium">Índice</th>
                  <th className="px-3 py-2.5 font-medium">Última sesión</th>
                  <th className="px-3 py-2.5 font-medium">Compromiso vigente</th>
                  <th className="px-3 py-2.5 text-right font-medium">Alertas</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ventas</th>
                  <th className="px-3 py-2.5 font-medium">Esta semana</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((v) => {
                  const c = v.ctx;
                  const compromiso = c.registros.compromisos
                    .filter((x) => x.estado === 'pendiente')
                    .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))[0];
                  const vencido = compromiso && compromiso.fechaVencimiento < ws.hoy;
                  const sinSesion = (c.diasSinSesion ?? 999) > 21;
                  const ventaCritica = c.ventas === 0 && c.dia >= 60;
                  return (
                    <tr key={c.cliente.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                      <td className="px-3 py-2 align-middle">
                        <SemaforoCelda estado={v.semaforo} />
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/clientes/${c.cliente.id}`} className="font-medium hover:underline">
                          {c.cliente.nombre}
                        </Link>
                        <div className="text-[11px] text-ink-3">
                          {c.cliente.programa} · día {c.dia}
                          {c.cliente.tieneGarantia && ' · garantía'}
                        </div>
                      </td>
                      {veTodo(usuario.rol) && (
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5">
                            <Avatar persona={v.consultora} size={20} />
                            <span className="text-[12px]">{v.consultora?.nombre}</span>
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <Chip tone="neutral">{c.fase}</Chip>
                      </td>
                      <td className="tnum px-3 py-2 text-right font-semibold" style={{ color: colorIndice(v.indice.valor) }}>
                        {v.indice.valor}
                        {v.indice.confianza !== 'alta' && (
                          <span className="ml-1 text-[10px] font-normal text-ink-3">?</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12px]" style={{ color: sinSesion ? 'var(--critical-ink)' : undefined }}>
                        {c.diasSinSesion === null ? 'nunca' : `hace ${c.diasSinSesion} d`}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-[12px]">
                        {compromiso ? (
                          <span style={{ color: vencido ? 'var(--critical-ink)' : undefined }}>
                            <span className="line-clamp-1">{compromiso.descripcion}</span>
                            <span className="text-[11px] text-ink-3">{formatShort(compromiso.fechaVencimiento)}</span>
                          </span>
                        ) : (
                          <span className="text-ink-3">sin compromiso vivo</span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2 text-right">{v.alertasAbiertas.length || '—'}</td>
                      <td
                        className="tnum px-3 py-2 text-right font-semibold"
                        style={{ color: ventaCritica ? 'var(--critical-ink)' : undefined }}
                      >
                        {c.ventas}
                      </td>
                      <td className="max-w-[220px] px-3 py-2 text-[12px] text-ink-2">
                        {c.kpiSemanal
                          ? `${c.kpiSemanal.dms} DMs · ${c.kpiSemanal.agendas} agendas`
                          : 'sin cuenta inversa'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Empty>
          No hay nada que atender con este filtro. La pantalla lo dice en vez de inventar tarjetas
          para llenar espacio.
        </Empty>
      )}
    </div>
  );
}

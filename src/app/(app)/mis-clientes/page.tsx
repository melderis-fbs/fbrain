import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, type VistaCliente } from '@/server/workspace';
import { Card, Empty } from '@/components/ui';
import { ListaComercial } from '@/components/ListaComercial';
import { LeyendaTira, TiraCliente, type FilaCliente } from '@/components/TiraCliente';
import { queNecesita, tiraDeEtapas } from '@/domain/tira';
import { BLOQUE_LABEL } from '@/domain/expediente';

export const metadata = { title: 'Mis clientes · Founders Brain' };

type Filtro = 'todos' | 'alertas' | 'sin_sesion' | 'sin_ventas' | 'dia60' | 'ciegos' | 'sin_fecha';

const FILTROS: { key: Filtro; label: string; test: (v: VistaCliente) => boolean }[] = [
  { key: 'todos', label: 'Todos', test: () => true },
  { key: 'alertas', label: 'Con alertas abiertas', test: (v) => v.alertasAbiertas.length > 0 },
  { key: 'sin_sesion', label: 'Sin sesión hace 14+ días', test: (v) => (v.ctx.diasSinSesion ?? 999) > 14 },
  { key: 'sin_ventas', label: 'Sin ventas', test: (v) => v.ctx.ventas === 0 },
  { key: 'dia60', label: 'Día 60+', test: (v) => v.ctx.dia >= 60 },
  { key: 'ciegos', label: 'Expediente incompleto', test: (v) => v.ctx.bloquesCargados < 4 },
  // Los que entraron sin fecha de inicio. No se les mide nada hasta que
  // alguien la carga, así que conviene poder juntarlos en una pantalla.
  { key: 'sin_fecha', label: 'Sin fecha de inicio', test: (v) => Boolean(v.ctx.cliente.fechaAltaProvisional) },
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
          <div className="px-3">
            <LeyendaTira />
          </div>
          <div className="px-3 pb-1">
            <TiraCliente
              verConsultora={veTodo(usuario.rol)}
              filas={filas.map((v): FilaCliente => {
                const c = v.ctx;
                return {
                  id: c.cliente.id,
                  nombre: c.cliente.nombre,
                  semana: Math.max(1, Math.ceil(c.dia / 7)),
                  dia: c.dia,
                  programa: c.cliente.programa,
                  sinFecha: Boolean(c.cliente.fechaAltaProvisional),
                  semaforo: v.semaforo,
                  etapas: tiraDeEtapas(c, v.desvio.atrasados),
                  bloques: (Object.keys(BLOQUE_LABEL) as (keyof typeof BLOQUE_LABEL)[]).map((k) => ({
                    label: BLOQUE_LABEL[k],
                    corto: BLOQUE_LABEL[k].slice(0, 5),
                    cargado: Boolean(c.bloques[k]),
                  })),
                  necesita: queNecesita(c, v.alertasAbiertas),
                  consultora: v.consultora,
                };
              })}
            />
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

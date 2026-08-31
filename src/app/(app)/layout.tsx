import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ROL_LABEL, getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Nav, type NavItem } from '@/components/Nav';
import { salir } from '@/app/login/actions';
import { Avatar } from '@/components/ui';
import { formatDateLong } from '@/lib/date';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');

  const ws = await getWorkspace();
  const mias = ws.vistas.filter(
    (v) => veTodo(usuario.rol) || v.ctx.cliente.consultoraId === usuario.id,
  );
  const activos = mias.filter((v) => v.ctx.cliente.estado === 'activo');
  const abiertas = activos.flatMap((v) => v.alertasAbiertas);
  const rojas = abiertas.filter((a) => a.estadoSemaforo === 'rojo' || a.estadoSemaforo === 'negro').length;
  const atender = activos.filter((v) => v.semaforo !== 'verde' || v.indice.valor < 55).length;
  const atrasados = activos.filter((v) => v.desvio.estado !== 'en_tiempo').length;
  // La cobranza cuenta lo suyo: lo que hay que hacer hoy, no lo que está pendiente.
  const cobrar = activos.filter((v) =>
    ['corte_pendiente', 'prorroga_vencida', 'baja_en_curso', 'en_gracia'].includes(v.cobranza.estado),
  ).length;

  const grupos: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { href: '/atencion', label: 'A quién ayudar', icon: '◎', badge: atender, badgeTone: rojas ? 'critical' : 'serious' },
        { href: '/alertas', label: 'Alertas', icon: '⚑', badge: abiertas.length, badgeTone: rojas ? 'critical' : 'serious' },
      ],
    },
    {
      title: 'Clientes',
      items: [
        { href: '/mis-clientes', label: veTodo(usuario.rol) ? 'Todos los clientes' : 'Mis clientes', icon: '◍', badge: activos.length },
        { href: '/grilla', label: 'La grilla', icon: '⊞', badge: atrasados, badgeTone: 'serious' },
      ],
    },
    {
      title: 'Equipo',
      items: [
        ...(veTodo(usuario.rol)
          ? [
              { href: '/cartera', label: 'Cartera', icon: '▦' },
              { href: '/cobranza', label: 'Cobranza', icon: '$', badge: cobrar, badgeTone: 'critical' as const },
              { href: '/consultoras', label: 'Consultoras', icon: '☰' },
              { href: '/planilla', label: 'Planilla', icon: '⤓' },
            ]
          : []),
        { href: '/modelo', label: 'Cómo se calcula', icon: '⚙' },
      ],
    },
  ];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            B
          </div>
          <span className="text-[13px] font-semibold tracking-tight">FOUNDERS BRAIN</span>
        </Link>

        <Nav groups={grupos} />

        <div className="mt-auto pt-4">
          <div className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-2">
            <Avatar persona={usuario} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium">{usuario.nombre}</div>
              <div className="truncate text-[11px] text-ink-3">{ROL_LABEL[usuario.rol]}</div>
            </div>
          </div>
          <form action={salir}>
            <button className="mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-left text-[11px] text-ink-3 hover:bg-surface-2">
              Cambiar de usuario
            </button>
          </form>
          {ws.modo === 'demo' && (
            <p className="mt-2 px-2.5 text-[10px] leading-relaxed text-ink-3">
              Modo demostración · cartera ficticia
            </p>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-page/85 px-4 py-2.5 backdrop-blur sm:px-6">
          <div className="lg:hidden">
            <Link href="/" className="text-[13px] font-semibold">FOUNDERS BRAIN</Link>
          </div>
          <div className="ml-auto text-[12px] text-ink-3">{formatDateLong(ws.hoy)}</div>
        </header>
        <main className="px-4 py-5 sm:px-6 sm:py-7">{children}</main>
        <nav className="sticky bottom-0 z-10 flex justify-around border-t border-line bg-surface px-2 py-2 lg:hidden">
          <Link href="/atencion" className="px-3 py-1 text-[12px]">◎ Atención</Link>
          <Link href="/mis-clientes" className="px-3 py-1 text-[12px]">◍ Clientes</Link>
          <Link href="/alertas" className="px-3 py-1 text-[12px]">⚑ Alertas</Link>
        </nav>
      </div>
    </div>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, type VistaCliente } from '@/server/workspace';
import { Avatar, Card, Chip, Stat } from '@/components/ui';
import { DESVIO_LABEL, RESPONSABLE_CORTO, RESPONSABLE_LABEL, type EstadoDesvio } from '@/domain/atribucion';
import { HITOS } from '@/domain/fases';
import { plata } from '@/lib/ui';

export const metadata = { title: 'La grilla · Founders Brain' };

/**
 * LA GRILLA
 *
 * Esta pantalla es la reconstrucción de algo que Founders tenía y perdió al
 * migrar al CRM en febrero: un cuadro de clientes por hitos, con cuadritos de
 * color, que en una pasada decía quién va en tiempo y quién no.
 *
 * Se reconstruyó con dos diferencias, y las dos importan:
 *
 *  1. Las columnas no son módulos del programa sino hitos del negocio con día
 *     esperado, así que el color sale de una resta de fechas y no del criterio
 *     de quien completaba la planilla.
 *  2. Hay una columna que el Excel no tenía y que es la que convierte la
 *     lectura en una decisión: de quién es el atraso.
 */

type Filtro = { consultora?: string; solo?: string };

const COLOR: Record<string, { bg: string; borde: string; titulo: string }> = {
  cumplido: { bg: 'var(--good)', borde: 'var(--good)', titulo: 'Cumplido' },
  incipiente: { bg: 'var(--warning)', borde: 'var(--warning)', titulo: 'Se está pasando de fecha' },
  atrasado: { bg: 'var(--serious)', borde: 'var(--serious)', titulo: 'Atrasado' },
  grave: { bg: 'var(--critical)', borde: 'var(--critical)', titulo: 'Atrasado, y bloquea lo que viene' },
  pendiente: { bg: 'transparent', borde: 'var(--line-strong)', titulo: 'Todavía no le toca' },
};

export default async function GrillaPage({
  searchParams,
}: {
  searchParams: Promise<Filtro>;
}) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const q = await searchParams;

  const base = ws.vistas
    .filter((v) => v.ctx.cliente.estado === 'activo')
    .filter((v) => veTodo(usuario.rol) || v.ctx.cliente.consultoraId === usuario.id);

  let filas = q.consultora ? base.filter((v) => v.ctx.cliente.consultoraId === q.consultora) : base;
  if (q.solo === 'atrasados') filas = filas.filter((v) => v.desvio.estado !== 'en_tiempo');
  if (q.solo === 'nosotros') filas = filas.filter((v) => ['nosotros', 'ambos'].includes(v.atribucion.responsable));
  if (q.solo === 'cliente') filas = filas.filter((v) => v.atribucion.responsable === 'cliente');

  // Primero la gravedad del desvío y sólo después el tamaño del atraso: un
  // cliente del día 130 con un hito viejo sin tildar no puede encabezar la
  // lista por encima de uno del día 70 con un gate vencido.
  const PESO: Record<EstadoDesvio, number> = { grave: 3, atrasado: 2, incipiente: 1, en_tiempo: 0 };
  filas = [...filas].sort(
    (a, b) =>
      PESO[b.desvio.estado] - PESO[a.desvio.estado] ||
      // A igual gravedad, primero el que todavía no vendió: es el único
      // resultado que el programa promete.
      (a.ctx.ventas > 0 ? 1 : 0) - (b.ctx.ventas > 0 ? 1 : 0) ||
      b.desvio.diasDeAtrasoMax - a.desvio.diasDeAtrasoMax ||
      a.ctx.dia - b.ctx.dia,
  );

  const cuenta = (e: EstadoDesvio) => base.filter((v) => v.desvio.estado === e).length;
  const deNosotros = base.filter((v) => ['nosotros', 'ambos'].includes(v.atribucion.responsable)).length;

  const link = (extra: Filtro) => {
    const p = new URLSearchParams();
    const merged = { ...q, ...extra };
    if (merged.consultora) p.set('consultora', merged.consultora);
    if (merged.solo) p.set('solo', merged.solo);
    const s = p.toString();
    return s ? `/grilla?${s}` : '/grilla';
  };

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">La grilla</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] leading-relaxed text-ink-2">
          Toda la cartera contra el reloj del programa, en una pantalla. Cada columna es un hito con
          día esperado, así que el color sale de una resta y no del criterio de quien completa la
          planilla. La última columna es la que el Excel no tenía: de quién es el atraso.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><Stat label="En tiempo" value={cuenta('en_tiempo')} tone="good" sub={`de ${base.length} activos`} /></Card>
        <Card><Stat label="Empezando a retrasarse" value={cuenta('incipiente')} sub="todavía sale barato" /></Card>
        <Card><Stat label="Atrasados" value={cuenta('atrasado') + cuenta('grave')} tone={cuenta('grave') ? 'bad' : 'neutral'} sub={`${cuenta('grave')} con un gate vencido`} /></Card>
        <Card><Stat label="El atraso es nuestro" value={deNosotros} tone={deNosotros ? 'bad' : 'good'} sub="antes de reclamarle a nadie" /></Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink-3">Filtrar:</span>
          <Filtro href={link({ solo: undefined })} activo={!q.solo}>Todos</Filtro>
          <Filtro href={link({ solo: 'atrasados' })} activo={q.solo === 'atrasados'}>Atrasados</Filtro>
          <Filtro href={link({ solo: 'nosotros' })} activo={q.solo === 'nosotros'}>Es nuestro</Filtro>
          <Filtro href={link({ solo: 'cliente' })} activo={q.solo === 'cliente'}>Es del cliente</Filtro>
        </div>
        {veTodo(usuario.rol) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-ink-3">Consultora:</span>
            <Filtro href={link({ consultora: undefined })} activo={!q.consultora}>Todas</Filtro>
            {ws.consultoras.map((c) => (
              <Filtro key={c.id} href={link({ consultora: c.id })} activo={q.consultora === c.id}>
                {c.nombre}
              </Filtro>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--shadow)' }}>
        <table className="w-full min-w-[1080px] border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-line-strong">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-ink-3">Cliente</th>
              <th className="px-2 py-2 text-right font-medium text-ink-3">Día</th>
              {HITOS.map((h) => (
                <th key={h.key} className="px-1 py-2 text-center font-medium text-ink-3" title={`${h.label} · día ${h.dia}`}>
                  <div className="mx-auto w-6 truncate text-[10px] leading-tight">{abrev(h.label)}</div>
                  <div className="tnum text-[9px] text-ink-3">{h.dia}{h.gate ? '·G' : ''}</div>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-medium text-ink-3">Vtas</th>
              <th className="px-3 py-2 text-left font-medium text-ink-3">¿De quién es el atraso?</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((v) => (
              <Fila key={v.ctx.cliente.id} v={v} />
            ))}
            {!filas.length && (
              <tr><td colSpan={HITOS.length + 4} className="px-3 py-8 text-center text-ink-3">
                Ningún cliente entra en este filtro.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[12px] text-ink-2">
        {(['cumplido', 'pendiente', 'incipiente', 'atrasado', 'grave'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-[3px]"
              style={{ background: COLOR[k].bg, border: `1px solid ${COLOR[k].borde}` }}
            />
            {COLOR[k].titulo}
          </span>
        ))}
      </div>

      <p className="mt-3 max-w-3xl text-[12px] leading-relaxed text-ink-3">
        El amarillo es deliberado y es el estado que faltaba: un hito que se pasó de fecha pero
        todavía está dentro del margen no es una alerta, es el momento en que corregirlo sale barato.
        Los gates tienen la mitad del margen que el resto, porque bloquean todo lo que viene después.
      </p>
    </div>
  );
}

function Fila({ v }: { v: VistaCliente }) {
  const { ctx, desvio, atribucion } = v;
  const tone =
    atribucion.responsable === 'nosotros' || atribucion.responsable === 'ambos'
      ? 'critical'
      : atribucion.responsable === 'cliente'
        ? 'warning'
        : atribucion.responsable === 'sin_datos'
          ? 'neutral'
          : 'good';

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface-2/50">
      <td className="sticky left-0 z-10 max-w-[190px] bg-surface px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Avatar persona={v.consultora} size={18} />
          <Link href={`/clientes/${ctx.cliente.id}`} className="truncate font-medium hover:underline">
            {ctx.cliente.nombre}
          </Link>
        </div>
      </td>
      <td className="tnum px-2 py-1.5 text-right text-ink-2">{ctx.dia}</td>
      {HITOS.map((h) => {
        const cumplido = ctx.hitos.get(h.key)?.estado === 'cumplido';
        const atraso = desvio.atrasados.find((a) => a.hito.key === h.key);
        const k = cumplido
          ? 'cumplido'
          : !atraso
            ? 'pendiente'
            : atraso.incipiente
              ? 'incipiente'
              : h.gate
                ? 'grave'
                : 'atrasado';
        const c = COLOR[k];
        return (
          <td key={h.key} className="px-1 py-1.5 text-center">
            <span
              className="mx-auto inline-block h-4 w-4 rounded-[3px]"
              style={{ background: c.bg, border: `1px solid ${c.borde}` }}
              title={`${h.label} · día ${h.dia} · ${c.titulo}${atraso ? ` (${atraso.diasDeAtraso} días de más)` : ''}`}
            />
          </td>
        );
      })}
      <td className="tnum px-2 py-1.5 text-right text-ink-2" title={plata(ctx.facturado)}>
        {ctx.ventas}
      </td>
      <td className="max-w-[300px] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap" title={RESPONSABLE_LABEL[atribucion.responsable]}>
            <Chip tone={tone}>{RESPONSABLE_CORTO[atribucion.responsable]}</Chip>
          </span>
          <span className="truncate text-[11.5px] text-ink-3" title={atribucion.titular}>
            {desvio.estado === 'en_tiempo' ? DESVIO_LABEL.en_tiempo : atribucion.titular}
          </span>
        </div>
      </td>
    </tr>
  );
}

function Filtro({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md border px-2 py-1 text-[12px] font-medium"
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

/** Abreviatura estable para la cabecera; el nombre completo va en el title. */
function abrev(label: string): string {
  const m: Record<string, string> = {
    'Onboarding hecho y expediente base cargado': 'Onbrd',
    'Cuenta inversa hecha con el cliente': 'Cta.inv',
    'Cliente ideal y problema cerrados': 'Ideal',
    'Oferta y promesa cerradas': 'Oferta',
    'Mensaje y canal definidos': 'Mens',
    'Primeras conversaciones que avanzan': 'Conv',
    'KPI semanal de DMs sostenido 3 semanas': 'KPI',
    'Primera agenda': 'Agend',
    'Primera llamada realizada': 'Llam',
    'Primera venta': 'VENTA',
    'Segunda venta': '2ªvta',
    'Sistema de seguimiento sostenible': 'Sist',
  };
  return m[label] ?? label.slice(0, 6);
}

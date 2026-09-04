import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, type VistaCliente } from '@/server/workspace';
import { Avatar, Card, Chip, Empty, SectionTitle, SemaforoBadge, Stat } from '@/components/ui';
import { SEMAFORO, plata } from '@/lib/ui';
import type { Semaforo } from '@/domain/types';
import { formatDate } from '@/lib/date';

export const metadata = { title: 'Cartera · Founders Brain' };

const ESTADOS: Semaforo[] = ['verde', 'amarillo', 'rojo', 'negro'];

function BarraSemaforo({ vistas }: { vistas: VistaCliente[] }) {
  const total = vistas.length || 1;
  return (
    <div className="flex h-2.5 w-full gap-[2px] overflow-hidden">
      {ESTADOS.map((e) => {
        const n = vistas.filter((v) => v.semaforo === e).length;
        if (!n) return null;
        return (
          <div
            key={e}
            style={{ width: `${(n / total) * 100}%`, background: SEMAFORO[e].fill }}
            className="first:rounded-l-full last:rounded-r-full"
            title={`${SEMAFORO[e].label}: ${n}`}
          />
        );
      })}
    </div>
  );
}

export default async function CarteraPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const ws = await getWorkspace();
  const activos = ws.vistas.filter((v) => v.ctx.cliente.estado === 'activo');

  const porEstado = Object.fromEntries(
    ESTADOS.map((e) => [e, activos.filter((v) => v.semaforo === e)]),
  ) as Record<Semaforo, VistaCliente[]>;

  const dia60SinVenta = activos.filter((v) => v.ctx.dia >= 60 && v.ctx.dia < 90 && v.ctx.ventas === 0);
  const dia90SinVenta = activos.filter((v) => v.ctx.dia >= 90 && v.ctx.ventas === 0);
  const rojasViejas = activos.flatMap((v) =>
    v.alertasAbiertas.filter(
      (a) =>
        (a.estadoSemaforo === 'rojo' || a.estadoSemaforo === 'negro') &&
        new Date(ws.hoy).getTime() - new Date(a.emitidaAt).getTime() > 7 * 86400000,
    ),
  );
  const sinRegistro30 = activos.reduce(
    (a, v) => a + v.ctx.sesionesSinRegistro.filter((s) => new Date(ws.hoy).getTime() - new Date(s.fecha).getTime() <= 30 * 86400000).length,
    0,
  );
  const reportesAtrasados = activos.flatMap((v) => v.alertasAbiertas.filter((a) => a.codigo === 'RD-06')).length;
  const ciegos = activos.filter((v) => v.ctx.bloquesCargados < 4 || !v.ctx.bloques.trazabilidad);
  const sinConsultora = activos.filter((v) => !v.ctx.cliente.consultoraId);
  const conGarantia = activos.filter((v) => v.ctx.cliente.tieneGarantia);
  const cuotasVencidas = activos.filter((v) => v.ctx.cuotasVencidas.length > 0);

  const altasSemana = activos.filter((v) => v.ctx.dia <= 7);

  const porConsultora = ws.consultoras
    .map((c) => {
      const mios = activos.filter((v) => v.ctx.cliente.consultoraId === c.id);
      return {
        consultora: c,
        vistas: mios,
        total: mios.length,
        exceso: mios.length - c.cupoMaximo,
        altas: mios.filter((v) => v.ctx.dia <= 7).length,
        // Sólo cuentan los que ya pasaron el día 60: si no, el numerador puede
        // superar al denominador y la tabla pierde toda credibilidad.
        elegibles60: mios.filter((v) => v.ctx.dia >= 60).length,
        vendieron60: mios.filter((v) => v.ctx.dia >= 60 && (v.ctx.primeraVentaDia ?? 999) <= 60).length,
      };
    })
    .sort((a, b) => b.exceso - a.exceso);

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Cartera</h1>
          <p className="mt-1.5 text-[13px] text-ink-2">
            {activos.length} clientes activos · {ws.consultoras.length} consultoras. Estado real de la
            operación en una pantalla.
          </p>
        </div>
        {/*
          Mientras la importación arrastre clientes viejos, este número no es la
          cartera: son alertas sobre gente que no está.
        */}
        <Link
          href="/cartera/limpieza"
          className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium hover:border-accent"
        >
          Limpiar la cartera
        </Link>
      </header>

      {/* 1 · Semáforo */}
      <Card className="mb-4">
        <SectionTitle hint="El peor estado abierto manda. Verde no es «todo bien»: es «no hay nada abierto».">
          Semáforo de los {activos.length}
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ESTADOS.map((e) => (
            <div key={e} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between">
                <Stat label={SEMAFORO[e].label} value={porEstado[e].length} />
                <span aria-hidden className="text-[15px]">{SEMAFORO[e].icono}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(porEstado[e].length / Math.max(1, activos.length)) * 100}%`, background: SEMAFORO[e].fill }}
                />
              </div>
            </div>
          ))}
        </div>

        {(porEstado.negro.length > 0 || porEstado.rojo.length > 0) && (
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Nombrados: negras y rojas
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {[...porEstado.negro, ...porEstado.rojo].map((v) => (
                <li key={v.ctx.cliente.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[12.5px]">
                  <SemaforoBadge estado={v.semaforo} size="sm" />
                  <Link href={`/clientes/${v.ctx.cliente.id}`} className="font-medium hover:underline">
                    {v.ctx.cliente.nombre}
                  </Link>
                  <span className="text-ink-3">{v.consultora?.nombre}</span>
                  <span className="ml-auto text-ink-3">{v.alertasAbiertas[0]?.codigo}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* 2 · Carga por consultora */}
      <Card className="mb-4">
        <SectionTitle hint="Cuando tres de seis están arriba del techo y entran diez altas por mes, el problema de asignación no es del caso: es de capacidad.">
          Carga por consultora
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
                <th className="py-2 pr-3 font-medium">Consultora</th>
                <th className="py-2 pr-3 text-right font-medium">Activos</th>
                <th className="py-2 pr-3 text-right font-medium">Techo</th>
                <th className="py-2 pr-3 text-right font-medium">Exceso</th>
                <th className="py-2 pr-3 text-right font-medium">Altas 7d</th>
                <th className="py-2 pr-3 text-right font-medium">Vendieron antes del 60</th>
                <th className="py-2 pl-3 font-medium">Distribución</th>
              </tr>
            </thead>
            <tbody>
              {porConsultora.map((r) => (
                <tr key={r.consultora.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3">
                    <Link href={`/consultoras?c=${r.consultora.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar persona={r.consultora} size={22} />
                      <span className="font-medium">{r.consultora.nombre}</span>
                    </Link>
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right">{r.total}</td>
                  <td className="tnum py-2.5 pr-3 text-right text-ink-3">{r.consultora.cupoMaximo}</td>
                  <td
                    className="tnum py-2.5 pr-3 text-right font-semibold"
                    style={{ color: r.exceso > 0 ? 'var(--critical-ink)' : 'var(--ink-3)' }}
                  >
                    {r.exceso > 0 ? `+${r.exceso}` : '—'}
                  </td>
                  <td className="tnum py-2.5 pr-3 text-right">{r.altas}</td>
                  <td className="tnum py-2.5 pr-3 text-right">
                    {r.elegibles60 ? `${r.vendieron60}/${r.elegibles60}` : '—'}
                  </td>
                  <td className="w-44 py-2.5 pl-3"><BarraSemaforo vistas={r.vistas} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          Esta tabla evalúa carteras, no personas. La columna que importa es la última con número:
          cuántos de sus clientes vendieron antes del día 60. Un tablero que midiera sesiones dictadas
          diría que una cartera de 12 clientes sin ventas está trabajando bien.
        </p>
      </Card>

      {/* 3 · Los números que definen el sistema */}
      <Card className="mb-4">
        <SectionTitle hint="Si una roja puede seguir roja tres semanas, el sistema de alertas no funciona">
          Los números que definen el sistema
        </SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Día 60 sin venta" value={dia60SinVenta.length} tone={dia60SinVenta.length ? 'bad' : 'good'} />
          <Stat label="Día 90 sin venta" value={dia90SinVenta.length} tone={dia90SinVenta.length ? 'bad' : 'good'} />
          <Stat label="Rojas abiertas +7 días" value={rojasViejas.length} tone={rojasViejas.length ? 'bad' : 'good'} />
          <Stat label="Sesiones sin registro (30d)" value={sinRegistro30} tone={sinRegistro30 ? 'bad' : 'good'} />
          <Stat label="Reportes atrasados" value={reportesAtrasados} tone={reportesAtrasados ? 'bad' : 'good'} />
          <Stat label="Cuotas vencidas" value={cuotasVencidas.length} tone={cuotasVencidas.length ? 'bad' : 'good'} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4 · Expedientes ciegos */}
        <Card>
          <SectionTitle hint="Donde la app no puede ayudar. Es la mitad donde están los casos que se pierden.">
            Expedientes ciegos · {ciegos.length}
          </SectionTitle>
          {ciegos.length ? (
            <ul className="space-y-1.5 text-[12.5px]">
              {ciegos.slice(0, 12).map((v) => (
                <li key={v.ctx.cliente.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 last:border-0">
                  <Link href={`/clientes/${v.ctx.cliente.id}`} className="font-medium hover:underline">
                    {v.ctx.cliente.nombre}
                  </Link>
                  <span className="text-ink-3">{v.consultora?.nombre}</span>
                  <span className="ml-auto text-ink-3">
                    {v.ctx.bloquesCargados}/6 bloques · día {v.ctx.dia}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Todos los expedientes habilitan diagnóstico.</Empty>
          )}
        </Card>

        <Card>
          <SectionTitle hint="Lo que Vicky mira y nadie más">Operación</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Altas últimos 7 días" value={altasSemana.length} sub="la regla es 1 por consultora por semana" />
            <Stat label="Sin consultora asignada" value={sinConsultora.length} tone={sinConsultora.length ? 'bad' : 'good'} />
            <Stat label="Con garantía firmada" value={conGarantia.length} sub="condiciones auditables" />
            <Stat
              label="Ingresos atribuidos"
              value={plata(activos.reduce((a, v) => a + v.ctx.facturado, 0))}
              sub="facturado por clientes durante el programa"
              tone="good"
            />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <SectionTitle
          hint="Los cinco casos con mayor prioridad ahora mismo"
          action={<Link href="/atencion" className="text-[12px] font-medium text-accent-ink hover:underline">Ver todos →</Link>}
        >
          A quién ayudar esta semana
        </SectionTitle>
        <ul className="divide-y divide-line">
          {[...activos]
            .sort((a, b) => b.triage.prioridad - a.triage.prioridad)
            .slice(0, 5)
            .map((v) => (
              <li key={v.ctx.cliente.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Link href={`/clientes/${v.ctx.cliente.id}`} className="text-[13px] font-medium hover:underline">
                  {v.ctx.cliente.nombre}
                </Link>
                <SemaforoBadge estado={v.semaforo} size="sm" />
                <Chip tone="neutral">índice {v.indice.valor}</Chip>
                <span className="text-[12px] text-ink-3">{v.triage.titular}</span>
                <span className="tnum ml-auto text-[12px] text-ink-3">
                  {v.consultora?.nombre} · desde {formatDate(v.ctx.cliente.fechaAlta)}
                </span>
              </li>
            ))}
        </ul>
      </Card>
    </div>
  );
}

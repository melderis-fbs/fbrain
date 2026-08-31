import Link from 'next/link';
import { Avatar, Chip, SemaforoCelda } from '@/components/ui';
import { colorIndice, plata } from '@/lib/ui';
import { daysBetween, formatShort } from '@/lib/date';
import { ESTADO_DEUDA_LABEL, type EstadoDeuda } from '@/domain/types';
import type { VistaCliente } from '@/server/workspace';

/**
 * LA LECTURA DE COBRO
 *
 * La misma cartera que el equipo ya mira en la planilla, por mes de ingreso,
 * pero respondiendo una sola pregunta: cómo viene el pago. Si es en cuotas,
 * cuántas, cuántas están pagas y si hay algo vencido.
 *
 * Deliberadamente NO trae el resto de lo comercial —fuente, closer, programa—
 * aunque esté cargado: se ve en la ficha del cliente. Una tabla que muestra
 * todo lo que tiene obliga a buscar el dato que importa entre otros nueve.
 *
 * Lo único que se agrega a la lectura de cobro es el semáforo y el índice. La
 * planilla dice que un cliente pagó las tres cuotas; esto dice además que hace
 * treinta y cuatro días que no tiene sesión. Los dos datos en el mismo
 * renglón es lo que la planilla no puede hacer.
 */

const MES = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 'YYYY-MM' → 'Agosto de 2026'. */
function nombreDeMes(clave: string): string {
  const [a, m] = clave.split('-');
  const t = MES.format(new Date(Date.UTC(Number(a), Number(m) - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TONO: Record<EstadoDeuda, 'good' | 'warning' | 'critical'> = {
  al_dia: 'good',
  deudor: 'warning',
  moroso: 'critical',
  en_tramite: 'warning',
  incobrable: 'critical',
};

/**
 * Cómo viene el pago, en una línea. El estado que escribió finanzas manda
 * sobre la aritmética: si marcaron "en trámite" es porque el cliente avisó que
 * paga el martes, y eso es información que las fechas no tienen. Sólo cuando
 * no dice nada la cuenta la hacen los vencimientos.
 */
function estadoDePago(v: VistaCliente, hoy: string) {
  const pagos = v.ctx.registros.pagos;
  if (!pagos.length) return { tono: 'neutral' as const, label: 'Sin cuotas', detalle: 'no entraron de la planilla' };

  const moneda = pagos[0].moneda;
  const vencidas = pagos.filter((p) => p.estado === 'vencido');
  const pendientes = pagos.filter((p) => p.estado === 'pendiente').sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const declarado = v.ctx.cliente.estadoDeuda;

  if (vencidas.length) {
    const debe = vencidas.reduce((a, p) => a + p.monto, 0);
    const masVieja = vencidas.reduce((a, p) => (p.fechaVencimiento < a.fechaVencimiento ? p : a));
    const dias = daysBetween(masVieja.fechaVencimiento, hoy);
    return {
      tono: declarado && declarado !== 'al_dia' ? TONO[declarado] : ('critical' as const),
      label: declarado && declarado !== 'al_dia' ? ESTADO_DEUDA_LABEL[declarado] : 'Vencida',
      detalle: `debe ${plata(debe, moneda)} · hace ${dias} d`,
    };
  }

  if (declarado && declarado !== 'al_dia') {
    return { tono: TONO[declarado], label: ESTADO_DEUDA_LABEL[declarado], detalle: 'sin cuota vencida hoy' };
  }

  return {
    tono: 'good' as const,
    label: 'Al día',
    detalle: pendientes.length ? `próxima ${formatShort(pendientes[0].fechaVencimiento)}` : 'terminó de pagar',
  };
}

export function ListaComercial({ vistas, verConsultora, hoy }: { vistas: VistaCliente[]; verConsultora: boolean; hoy: string }) {
  // Por mes de ingreso y el más nuevo arriba: es el orden en el que el equipo
  // piensa la cartera —"la camada de agosto"— y el que tiene la planilla.
  const meses = new Map<string, VistaCliente[]>();
  for (const v of vistas) {
    const clave = v.ctx.cliente.fechaAlta.slice(0, 7);
    const lista = meses.get(clave);
    if (lista) lista.push(v);
    else meses.set(clave, [v]);
  }
  const grupos = [...meses.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-4">
      {grupos.map(([clave, filas]) => {
        const conDeuda = filas.filter((v) => v.ctx.registros.pagos.some((p) => p.estado === 'vencido')).length;
        const pagosDelMes = filas.flatMap((v) => v.ctx.registros.pagos);
        const moneda = pagosDelMes[0]?.moneda;
        const cobrado = pagosDelMes.filter((p) => p.estado === 'pagado').reduce((a, p) => a + p.monto, 0);
        const total = pagosDelMes.reduce((a, p) => a + p.monto, 0);

        return (
          <section key={clave} className="overflow-hidden rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--shadow)' }}>
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-2/50 px-4 py-2.5">
              <h2 className="text-[14px] font-semibold">
                {nombreDeMes(clave)}
                <span className="ml-2 text-[12px] font-normal text-ink-3">
                  {filas.length} cliente{filas.length > 1 ? 's' : ''}
                </span>
                {conDeuda > 0 && (
                  <span className="ml-2 text-[12px] font-medium" style={{ color: 'var(--critical-ink)' }}>
                    {conDeuda} con cuota vencida
                  </span>
                )}
              </h2>
              {total > 0 && (
                <p className="tnum text-[12px] text-ink-2">
                  {plata(cobrado, moneda)} cobrado de {plata(total, moneda)}
                  <span className="text-ink-3"> · {Math.round((cobrado / total) * 100)}%</span>
                </p>
              )}
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    {verConsultora && <th className="px-3 py-2 font-medium">Consultora</th>}
                    <th className="px-3 py-2 font-medium">Plan</th>
                    <th className="px-3 py-2 font-medium">Cuotas pagas</th>
                    <th className="px-3 py-2 font-medium">Estado del pago</th>
                    <th className="px-3 py-2 font-medium">Semáforo</th>
                    <th className="px-3 py-2 text-right font-medium">Índice</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((v) => {
                    const c = v.ctx.cliente;
                    const pagos = v.ctx.registros.pagos;
                    const pagas = pagos.filter((p) => p.estado === 'pagado');
                    const cuotas = c.cantidadCuotas ?? pagos.length;
                    const est = estadoDePago(v, hoy);

                    return (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                        <td className="px-3 py-2">
                          <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                            {c.nombre}
                          </Link>
                          <div className="text-[11px] text-ink-3">día {v.ctx.dia}{c.tieneGarantia && ' · garantía'}</div>
                        </td>
                        {verConsultora && (
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <Avatar persona={v.consultora} size={20} />
                              <span className="text-[12px]">{v.consultora?.nombre ?? 'sin asignar'}</span>
                            </span>
                          </td>
                        )}
                        <td className="px-3 py-2 text-[12px]">
                          {cuotas > 1 ? (
                            <span>en <strong className="font-medium">{cuotas} cuotas</strong></span>
                          ) : cuotas === 1 ? (
                            <span className="text-ink-2">un pago</span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {cuotas ? (
                            <div className="flex items-center gap-2">
                              <span className="tnum text-[12.5px] font-medium">{pagas.length}/{cuotas}</span>
                              {/* Una cuota, un cuadrito: se lee sin leer el número. */}
                              <span className="flex gap-0.5">
                                {Array.from({ length: Math.min(cuotas, 8) }, (_, i) => {
                                  const p = pagos.find((x) => x.numeroCuota === i + 1);
                                  const color = !p
                                    ? 'var(--line-strong)'
                                    : p.estado === 'pagado'
                                      ? 'var(--good)'
                                      : p.estado === 'vencido'
                                        ? 'var(--critical)'
                                        : 'var(--line-strong)';
                                  return (
                                    <span
                                      key={i}
                                      className="inline-block h-3 w-3 rounded-[2px]"
                                      style={{ background: p?.estado === 'pendiente' || !p ? 'transparent' : color, border: `1px solid ${color}` }}
                                      title={p ? `Cuota ${i + 1} · ${formatShort(p.fechaVencimiento)} · ${p.estado}` : `Cuota ${i + 1} · sin cargar`}
                                    />
                                  );
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Chip tone={est.tono}>{est.label}</Chip>
                          <div className="mt-0.5 text-[11px] text-ink-3">{est.detalle}</div>
                        </td>
                        <td className="px-3 py-2">
                          <SemaforoCelda estado={v.semaforo} />
                        </td>
                        <td className="tnum px-3 py-2 text-right font-semibold" style={{ color: colorIndice(v.indice.valor) }}>
                          {v.indice.valor}
                          {v.indice.confianza !== 'alta' && <span className="ml-1 text-[10px] font-normal text-ink-3">?</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}

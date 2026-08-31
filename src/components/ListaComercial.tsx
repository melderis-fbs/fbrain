import Link from 'next/link';
import { Avatar, Chip, SemaforoCelda } from '@/components/ui';
import { colorIndice, plata } from '@/lib/ui';
import { ESTADO_DEUDA_LABEL, type EstadoDeuda } from '@/domain/types';
import type { VistaCliente } from '@/server/workspace';

/**
 * LA LECTURA COMERCIAL
 *
 * La misma cartera que el equipo ya mira en la planilla de finanzas: por mes
 * de ingreso, con quién cerró, cuánto, en cuántas cuotas y cómo viene el
 * cobro. Existe porque es el idioma en el que Founders viene leyendo su
 * cartera, y pedirle a alguien que abandone su lectura para adoptar otra es la
 * forma más rápida de que no use la herramienta.
 *
 * Lo que agrega, y es todo el punto: al lado de cada fila comercial está el
 * semáforo y el índice de avance. La planilla dice que un cliente pagó las
 * tres cuotas; esta pantalla dice además que hace 34 días que no tiene sesión.
 * Los dos datos juntos, en el mismo renglón, es algo que la planilla no puede
 * hacer.
 */

const MES = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** 'YYYY-MM' → 'agosto 2026', con la primera en mayúscula. */
function nombreDeMes(clave: string): string {
  const [a, m] = clave.split('-');
  const t = MES.format(new Date(Date.UTC(Number(a), Number(m) - 1, 1)));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const TONO_DEUDA: Record<EstadoDeuda, 'good' | 'warning' | 'critical' | 'neutral'> = {
  al_dia: 'good',
  deudor: 'warning',
  moroso: 'critical',
  en_tramite: 'warning',
  incobrable: 'critical',
};

export function ListaComercial({ vistas, verConsultora }: { vistas: VistaCliente[]; verConsultora: boolean }) {
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
        const contratado = filas.reduce((a, v) => a + (v.ctx.cliente.montoTotal ?? 0), 0);
        const cobrado = filas.reduce(
          (a, v) => a + v.ctx.registros.pagos.filter((p) => p.estado === 'pagado').reduce((x, p) => x + p.monto, 0),
          0,
        );

        return (
          <section key={clave} className="overflow-hidden rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--shadow)' }}>
            <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-2/50 px-4 py-2.5">
              <h2 className="text-[14px] font-semibold">
                {nombreDeMes(clave)}
                <span className="ml-2 text-[12px] font-normal text-ink-3">
                  {filas.length} cliente{filas.length > 1 ? 's' : ''}
                </span>
              </h2>
              {contratado > 0 && (
                <p className="tnum text-[12px] text-ink-2">
                  {plata(cobrado)} cobrado de {plata(contratado)}
                  <span className="text-ink-3"> · {Math.round((cobrado / contratado) * 100)}%</span>
                </p>
              )}
            </header>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] text-[13px]">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.07em] text-ink-3">
                    <th className="px-3 py-2 font-medium">Cliente</th>
                    <th className="px-3 py-2 font-medium">Programa</th>
                    <th className="px-3 py-2 font-medium">Fuente</th>
                    <th className="px-3 py-2 font-medium">Closer</th>
                    {verConsultora && <th className="px-3 py-2 font-medium">Consultora</th>}
                    <th className="px-3 py-2 text-right font-medium">Monto total</th>
                    <th className="px-3 py-2 text-center font-medium">Cuotas</th>
                    <th className="px-3 py-2 text-right font-medium">Pagado</th>
                    <th className="px-3 py-2 font-medium">Estado deuda</th>
                    {/* Las dos que la planilla no tiene y son la razón de esta app. */}
                    <th className="px-3 py-2 font-medium">Semáforo</th>
                    <th className="px-3 py-2 text-right font-medium">Índice</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((v) => {
                    const c = v.ctx.cliente;
                    const pagos = v.ctx.registros.pagos;
                    const pagas = pagos.filter((p) => p.estado === 'pagado');
                    const cobradoCliente = pagas.reduce((a, p) => a + p.monto, 0);
                    const total = c.cantidadCuotas ?? pagos.length;
                    const deuda = c.estadoDeuda ?? 'al_dia';
                    const moneda = pagos[0]?.moneda;

                    return (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-surface-2/40">
                        <td className="px-3 py-2">
                          <Link href={`/clientes/${c.id}`} className="font-medium hover:underline">
                            {c.nombre}
                          </Link>
                          <div className="text-[11px] text-ink-3">
                            día {v.ctx.dia}
                            {c.tieneGarantia && ' · garantía'}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Chip tone="neutral">{c.programa}</Chip>
                        </td>
                        <td className="px-3 py-2 text-[12px] text-ink-2">{c.fuente ?? '—'}</td>
                        <td className="px-3 py-2 text-[12px] text-ink-2">{c.closer ?? '—'}</td>
                        {verConsultora && (
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1.5">
                              <Avatar persona={v.consultora} size={20} />
                              <span className="text-[12px]">{v.consultora?.nombre ?? 'sin asignar'}</span>
                            </span>
                          </td>
                        )}
                        <td className="tnum px-3 py-2 text-right">
                          {c.montoTotal === undefined ? <span className="text-ink-3">—</span> : plata(c.montoTotal, moneda)}
                        </td>
                        <td className="tnum px-3 py-2 text-center text-[12px]">
                          {total ? (
                            <span className={pagas.length < total ? 'text-ink-2' : undefined}>
                              {pagas.length}/{total}
                            </span>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                        <td className="tnum px-3 py-2 text-right">
                          {pagos.length ? plata(cobradoCliente, moneda) : <span className="text-ink-3">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <Chip tone={TONO_DEUDA[deuda]}>{ESTADO_DEUDA_LABEL[deuda]}</Chip>
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

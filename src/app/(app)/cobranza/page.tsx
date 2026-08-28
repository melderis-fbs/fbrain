import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { bandejaCobranza, getWorkspace, type VistaCliente } from '@/server/workspace';
import { Avatar, Card, Chip, Empty, SectionTitle, Stat } from '@/components/ui';
import {
  COBRANZA_LABEL, PASOS_BAJA, PLANTILLAS, completar, plantilla,
  type LecturaCobranza,
} from '@/domain/cobranza';
import { formatDate, formatShort } from '@/lib/date';
import { plata } from '@/lib/ui';

export const metadata = { title: 'Cobranza · Founders Brain' };

/**
 * Esta pantalla no muestra el semáforo de ningún cliente, y es a propósito.
 * La instrucción de la revisión fue literal: la cobranza no discute el
 * servicio. Cada excepción es razonable de a una; juntas son la lista de
 * deudores.
 */

const TONO: Record<string, 'critical' | 'serious' | 'warning' | 'accent' | 'neutral'> = {
  corte_pendiente: 'critical',
  prorroga_vencida: 'critical',
  baja_en_curso: 'serious',
  en_gracia: 'warning',
  vence_hoy: 'warning',
  por_vencer: 'accent',
  prorroga_vigente: 'accent',
  sin_plan: 'neutral',
};

export default async function CobranzaPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/atencion');

  const ws = await getWorkspace();
  const items = bandejaCobranza(ws);
  const r = ws.cobranza;

  const hoyMismo = items.filter((v) =>
    ['corte_pendiente', 'prorroga_vencida'].includes(v.cobranza.estado),
  );
  const estaSemana = items.filter((v) =>
    ['en_gracia', 'vence_hoy', 'por_vencer'].includes(v.cobranza.estado),
  );
  const bajas = items.filter((v) => v.cobranza.estado === 'baja_en_curso');
  const resto = items.filter(
    (v) => !hoyMismo.includes(v) && !estaSemana.includes(v) && !bajas.includes(v),
  );

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Cobranza</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Este carril no mira el semáforo de nadie. La cuota vence igual para el cliente modelo y
          para el que está en rojo, y el margen es el que firmó cada uno: los contratos viejos tienen
          cinco días, los nuevos tres.
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><Stat label="Corte pendiente hoy" value={r.cortesPendientes} tone={r.cortesPendientes ? 'bad' : 'good'} sub="pasó el margen del contrato" /></Card>
        <Card><Stat label="Dentro del margen" value={r.enGracia} sub="todavía se puede resolver bien" /></Card>
        <Card><Stat label="En riesgo" value={plata(r.enRiesgo)} tone={r.enRiesgo ? 'bad' : 'neutral'} sub="deuda exigible hoy" /></Card>
        <Card>
          <Stat
            label="Prórrogas que terminaron en pago"
            value={r.tasaProrroga === null ? '—' : `${Math.round(r.tasaProrroga * 100)}%`}
            tone={r.tasaProrroga !== null && r.tasaProrroga < 0.5 ? 'bad' : 'neutral'}
            sub={`${r.prorrogasQuePagaron} de ${r.prorrogasOtorgadas} otorgadas`}
          />
        </Card>
      </div>

      {r.tasaProrroga !== null && (
        <div
          className="mb-5 rounded-xl border p-4"
          style={{ borderColor: 'var(--line)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            La cuenta que evita discutir la política cada vez
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            De las <strong>{r.prorrogasOtorgadas}</strong> prórrogas otorgadas,{' '}
            <strong>{r.prorrogasQuePagaron}</strong> terminaron en pago. Hasta ahora eso era una
            impresión —«creo que uno o dos cumplieron»— y por eso cada excepción se discutía de
            nuevo desde cero. Con el número a la vista, la decisión se toma una vez y se aplica.
          </p>
        </div>
      )}

      {!items.length && <Empty>Nadie con cuotas pendientes. Verificá que los planes de pago estén cargados.</Empty>}

      <Grupo titulo="Hoy · pasó el margen del contrato" items={hoyMismo} />
      <Grupo titulo="Esta semana · todavía dentro del margen" items={estaSemana} />
      <Grupo titulo="Bajas con el checklist sin terminar" items={bajas} />
      <Grupo titulo="Prórrogas vigentes y planes sin cargar" items={resto} />

      <section className="mt-8">
        <SectionTitle hint="Se mandan como están. Editarlos caso por caso es volver a improvisar.">
          Los mensajes, escritos de antemano
        </SectionTitle>
        <div className="space-y-2">
          {PLANTILLAS.map((p) => (
            <details key={p.key} className="rounded-xl border border-line bg-surface p-4">
              <summary className="cursor-pointer text-[13.5px] font-semibold">
                {p.nombre}{' '}
                <span className="font-normal text-ink-3">
                  · lo manda {p.desde === 'direccion' ? 'dirección' : 'administración'}
                </span>
              </summary>
              <p className="mt-1.5 text-[12px] text-ink-3">{p.cuando}</p>
              <p className="mt-2 whitespace-pre-line rounded-lg border border-line bg-surface-2/60 p-3 text-[13px] leading-relaxed">
                {p.texto}
              </p>
            </details>
          ))}
        </div>
        <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-ink-3">
          Los dos últimos no son cobranza y por eso están separados: al que se quiere ir se lo deja
          ir sin consultar con nadie, y al que dice que esto no es lo que compró no le contesta
          cobranza — eso abre una revisión de la llamada de venta, con otro responsable y otro plazo.
        </p>
      </section>

      <section className="mt-8">
        <SectionTitle hint="El paso que más se olvida está segundo, y no es casualidad.">
          El checklist de baja
        </SectionTitle>
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
          {PASOS_BAJA.map((p, i) => (
            <li key={p.key} className="flex gap-3 px-4 py-2.5">
              <span className="tnum w-5 shrink-0 text-[12px] text-ink-3">{i + 1}</span>
              <div>
                <div className="text-[13.5px] font-medium">{p.label}</div>
                <div className="text-[12px] text-ink-3">{p.detalle}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Grupo({ titulo, items }: { titulo: string; items: VistaCliente[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      <SectionTitle>
        {titulo} <span className="tnum text-ink-3">· {items.length}</span>
      </SectionTitle>
      <div className="space-y-2.5">
        {items.map((v) => (
          <Fila key={v.ctx.cliente.id} v={v} />
        ))}
      </div>
    </section>
  );
}

function Fila({ v }: { v: VistaCliente }) {
  const c: LecturaCobranza = v.cobranza;
  const p = c.plantillaSugerida ? plantilla(c.plantillaSugerida) : undefined;
  const mensaje = p
    ? completar(p, {
        nombre: v.ctx.cliente.nombre.split(' ')[0],
        cuota: c.cuota?.numeroCuota ?? '—',
        monto: c.cuota ? c.cuota.monto.toLocaleString('es-AR') : '—',
        moneda: c.moneda,
        fecha: formatDate(c.cuota?.fechaVencimiento),
        limite: formatDate(c.limite),
        gracia: c.diasGracia,
        deuda: c.deuda.toLocaleString('es-AR'),
      })
    : undefined;

  return (
    <article className="rounded-xl border border-line bg-surface p-4" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/clientes/${v.ctx.cliente.id}`} className="text-[15px] font-semibold hover:underline">
              {v.ctx.cliente.nombre}
            </Link>
            <Chip tone={TONO[c.estado] ?? 'neutral'}>{COBRANZA_LABEL[c.estado]}</Chip>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <Avatar persona={v.consultora} size={18} /> {v.consultora?.nombre}
            </span>
            <span className="tnum text-[12px] text-ink-3">
              margen del contrato: {c.diasGracia} días
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink-2">{c.titular}</p>
          <p className="mt-1.5 text-[13px] font-medium">{c.accion}</p>
          {c.estado === 'baja_en_curso' && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.pasosPendientes.map((k) => (
                <Chip key={k} tone="serious">{PASOS_BAJA.find((p) => p.key === k)?.label ?? k}</Chip>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="tnum text-[15px] font-semibold">{plata(c.deuda)}</div>
          {c.limite && (
            <div className="tnum text-[12px] text-ink-3">
              {c.diasParaLimite !== null && c.diasParaLimite < 0
                ? `corte vencido el ${formatShort(c.limite)}`
                : `corte el ${formatShort(c.limite)}`}
            </div>
          )}
        </div>
      </div>

      {mensaje && (
        <details className="mt-3 rounded-lg border border-line bg-surface-2/60 p-3">
          <summary className="cursor-pointer text-[12px] font-semibold text-ink-2">
            Mensaje a mandar · {p!.nombre}
          </summary>
          <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">{mensaje}</p>
        </details>
      )}
    </article>
  );
}

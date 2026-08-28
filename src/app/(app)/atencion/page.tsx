import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, triage } from '@/server/workspace';
import { Avatar, Chip, Empty, IndiceRing, SemaforoBadge } from '@/components/ui';
import { plata } from '@/lib/ui';
import { RESPONSABLE_LABEL } from '@/domain/atribucion';
import type { ItemTriage } from '@/domain/triage';

export const metadata = { title: '¿A quién ayudamos? · Founders Brain' };

export default async function AtencionPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();

  const items = triage(ws, (v) => veTodo(usuario.rol) || v.ctx.cliente.consultoraId === usuario.id)
    .filter((t) => t.semaforo !== 'verde' || t.indice.valor < 55);

  const corregible = items.filter((t) => t.carril === 'corregible');
  const contencion = items.filter((t) => t.carril === 'contencion');

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">¿A quién tenemos que ayudar?</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Ni el semáforo ordenado ni el índice ordenado alcanzan solos: hay clientes que se desvían
          sin que se haya abierto nada. La prioridad combina los dos y agrega el reloj, porque el
          mismo problema no vale lo mismo en el día 25 que en el día 85.
        </p>
      </header>

      <Carril
        titulo="Todavía se puede corregir"
        sub="queda margen de ejecución para cambiar el resultado del programa"
        items={corregible}
        vacio="Nadie en este carril."
      />
      <Carril
        titulo="Contención y cierre"
        sub="el resultado ya está definido; lo que se gestiona es la relación y la expectativa"
        items={contencion}
        vacio="Ningún cliente entrando en zona de contención."
      />

      <p className="text-[12px] leading-relaxed text-ink-3">
        Esta pantalla es una lista corta a propósito. Con 85 clientes, un triage de cuarenta casos no
        es un triage: es la cartera otra vez. Los que no entran siguen visibles en su expediente y en
        la bandeja de alertas.
      </p>
    </div>
  );
}

/** Ocho tarjetas completas por carril. El resto, en una línea. */
const LIMITE = 8;

function Carril({
  titulo,
  sub,
  items,
  vacio,
}: {
  titulo: string;
  sub: string;
  items: ItemTriage[];
  vacio: string;
}) {
  const primeros = items.slice(0, LIMITE);
  const resto = items.slice(LIMITE);
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-[14px] font-semibold">{titulo}</h2>
        <span className="tnum text-[12px] text-ink-3">{items.length}</span>
        <span className="text-[12px] text-ink-3">· {sub}</span>
      </div>
      <div className="space-y-3">
        {primeros.map((t, i) => (
          <Fila key={t.ctx.cliente.id} item={t} rank={i + 1} />
        ))}
        {!items.length && <Empty>{vacio}</Empty>}
      </div>
      {resto.length > 0 && (
        <details className="mt-3 rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer text-[13px] font-semibold">
            Otros {resto.length} en este carril
          </summary>
          <ul className="mt-2 space-y-1.5">
            {resto.map((t, i) => (
              <li key={t.ctx.cliente.id} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 text-[12.5px] last:border-0">
                <span className="tnum w-6 text-ink-3">#{LIMITE + i + 1}</span>
                <Link href={`/clientes/${t.ctx.cliente.id}`} className="font-medium hover:underline">
                  {t.ctx.cliente.nombre}
                </Link>
                <SemaforoBadge estado={t.semaforo} size="sm" />
                <span className="text-ink-3">índice {t.indice.valor}</span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{t.titular}</span>
                <span className="tnum text-[11px] text-ink-3">prioridad {t.prioridad}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Fila({ item, rank }: { item: ItemTriage; rank: number }) {
  const { ctx, indice } = item;
  const alerta = item.alertas.filter((a) => !a.cerradaAt)[0];
  return (
    <article className="rounded-xl border border-line bg-surface" style={{ boxShadow: 'var(--shadow)' }}>
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex items-center gap-3 sm:flex-col sm:gap-2">
          <span className="tnum text-[11px] font-semibold text-ink-3">#{rank}</span>
          <IndiceRing valor={indice.valor} size={60} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link href={`/clientes/${ctx.cliente.id}`} className="text-[16px] font-semibold tracking-tight hover:underline">
              {ctx.cliente.nombre}
            </Link>
            <SemaforoBadge estado={item.semaforo} size="sm" />
            {ctx.cliente.tieneGarantia && <Chip tone="warning">garantía</Chip>}
          </div>

          <p className="mt-1 text-[13px] font-medium text-ink-2">{item.titular}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {item.motivos.map((m) => (
              <Chip key={m} tone="neutral">{m}</Chip>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-line bg-surface-2/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Qué hacer</span>
              <Chip
                tone={
                  ['nosotros', 'ambos'].includes(item.atribucion.responsable)
                    ? 'critical'
                    : item.atribucion.responsable === 'cliente'
                      ? 'warning'
                      : 'neutral'
                }
              >
                {RESPONSABLE_LABEL[item.atribucion.responsable]}
              </Chip>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed">{item.accion}</p>
            {item.atribucion.queNoHacer && (
              <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: 'var(--critical-ink)' }}>
                <strong className="font-medium">Todavía no:</strong> {item.atribucion.queNoHacer}
              </p>
            )}
            <p className="mt-1.5 text-[12px] text-ink-3">
              <strong className="font-medium text-ink-2">Evidencia:</strong> {item.embudo.evidencia}
            </p>
            {alerta?.citaTextual && (
              <p className="mt-1.5 text-[12px] italic" style={{ color: 'var(--critical-ink)' }}>
                “{alerta.citaTextual}”
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-center gap-3 sm:w-44 sm:flex-col sm:items-end sm:gap-1.5 sm:text-right">
          <div className="flex items-center gap-1.5">
            <Avatar persona={item.consultora} size={22} />
            <span className="text-[12px] text-ink-2">{item.consultora?.nombre}</span>
          </div>
          <div className="tnum text-[12px] text-ink-3">Día {ctx.dia} · fase {ctx.fase}</div>
          <div className="tnum text-[12px] text-ink-3">
            {ctx.ventas} venta(s) · {plata(ctx.facturado)}
          </div>
          <div className="tnum text-[12px] text-ink-3">prioridad {item.prioridad}</div>
          <Link
            href={`/clientes/${ctx.cliente.id}/revision`}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium hover:border-accent"
          >
            Revisar el caso →
          </Link>
        </div>
      </div>
    </article>
  );
}

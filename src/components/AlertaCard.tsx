import Link from 'next/link';
import type { AlertaViva } from '@/domain/alertas';
import { fechaLimite, puedeCerrar } from '@/domain/alertas';
import type { Consultora } from '@/domain/types';
import { SemaforoBadge, Chip } from './ui';
import { CerrarAlerta } from './CerrarAlerta';
import { formatDate } from '@/lib/date';

const DESTINATARIO: Record<string, string> = {
  consultora: 'Consultora del caso',
  revision_externa: 'Revisión con alguien que no sea su consultora',
  admin: 'Administración',
};

/**
 * Las tres líneas completas, siempre. La cita textual es el contenido de la
 * alerta, no un detalle expandible: sin cita se discute, con cita se trabaja.
 */
export function AlertaCard({
  alerta,
  clienteNombre,
  clienteId,
  consultoraDelCaso,
  usuario,
  compacta,
}: {
  alerta: AlertaViva;
  clienteNombre: string;
  clienteId: string;
  consultoraDelCaso?: string;
  usuario: Consultora;
  compacta?: boolean;
}) {
  const permiso = puedeCerrar(alerta, usuario.id, usuario.rol, consultoraDelCaso);
  return (
    <article
      className="rounded-xl border bg-surface p-4"
      style={{
        borderColor: alerta.estadoSemaforo === 'negro' ? 'var(--critical)' : 'var(--line)',
        boxShadow: 'var(--shadow)',
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <SemaforoBadge estado={alerta.estadoSemaforo} size="sm" />
        <Link href={`/clientes/${clienteId}`} className="text-[14px] font-semibold hover:underline">
          {clienteNombre}
        </Link>
        <Chip tone="neutral">{alerta.codigo}</Chip>
        {alerta.vecesEmitida > 1 && <Chip tone="warning">{alerta.vecesEmitida}ª vez</Chip>}
        {alerta.diferida && <Chip tone="neutral">diferida</Chip>}
        {!alerta.condicionVigente && !alerta.cerradaAt && (
          <Chip tone="good">la condición ya no se cumple</Chip>
        )}
        <span className="tnum ml-auto text-[11px] text-ink-3">
          desde {formatDate(alerta.emitidaAt)} · vence {formatDate(fechaLimite(alerta))}
        </span>
      </div>

      <p className="mt-2 text-[13.5px] font-medium leading-snug">{alerta.titulo}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{alerta.cuerpo}</p>

      {alerta.citaTextual && (
        <p
          className="mt-2 rounded-lg px-3 py-2 text-[13px] italic leading-relaxed"
          style={{ background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}
        >
          Textual{alerta.fechaCita ? ` (${formatDate(alerta.fechaCita)})` : ''}: “{alerta.citaTextual}”
        </p>
      )}

      <p className="mt-2 text-[13px] leading-relaxed">
        <strong className="font-medium">Pedido:</strong> {alerta.pedido}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-ink-3">
        <span>Responsable: {DESTINATARIO[alerta.destinatario]}</span>
        <span>Plazo: {alerta.plazoHoras === 0 ? 'mismo día' : `${alerta.plazoHoras} h`}</span>
        <span>Prioridad {alerta.prioridad}</span>
      </div>

      {!compacta && (
        <div className="mt-3">
          {alerta.cerradaAt ? (
            <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
              Cerrada el {formatDate(alerta.cerradaAt)}: “{alerta.textoCierre}”
            </p>
          ) : (
            <CerrarAlerta
              alertaId={alerta.id}
              puede={permiso.puede}
              motivo={permiso.motivo}
              condicionVigente={alerta.condicionVigente}
            />
          )}
        </div>
      )}
    </article>
  );
}

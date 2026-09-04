import Link from 'next/link';
import { Avatar } from '@/components/ui';
import type { BloqueEtapa, EstadoEtapa } from '@/domain/tira';
import type { Consultora } from '@/domain/types';

/**
 * UNA FILA POR CLIENTE, PENSADA PARA ESCANEAR
 *
 * Reemplaza seis columnas de texto que decían lo mismo en las 167 filas. Todo
 * lo que cambia entre clientes está dibujado —la barra del semáforo, la tira
 * de etapas, los seis casilleros del expediente— y lo único que se lee son el
 * nombre y qué necesita.
 *
 * «Sin datos» tiene trama propia y no color de estado. Es la diferencia entre
 * «este cliente está bien» y «de este cliente no sabemos nada», que hoy en la
 * cartera se veían iguales.
 */

const ETAPA: Record<EstadoEtapa, { fondo: string; titulo: string }> = {
  cumplida: { fondo: 'var(--good)', titulo: 'cumplida' },
  en_curso: { fondo: 'var(--accent)', titulo: 'en curso' },
  atrasada: { fondo: 'var(--critical)', titulo: 'atrasada' },
  pendiente: { fondo: 'var(--line-2, var(--line))', titulo: 'todavía no' },
  sin_datos: { fondo: 'transparent', titulo: 'sin datos cargados' },
};

const TRAMA =
  'repeating-linear-gradient(45deg, var(--surface-2) 0 3px, var(--ink-3, #999) 3px 4px)';

const TONO: Record<string, string> = {
  critico: 'var(--critical-ink)',
  serio: 'var(--serious-ink, var(--critical-ink))',
  atencion: 'var(--warning-ink)',
  ok: 'var(--good-ink)',
  neutral: 'var(--ink-3)',
};

export interface FilaCliente {
  id: string;
  nombre: string;
  semana: number;
  dia: number;
  programa: string;
  sinFecha: boolean;
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'negro';
  etapas: BloqueEtapa[];
  /** Cuáles de los seis bloques del expediente están cargados. */
  bloques: { label: string; corto: string; cargado: boolean }[];
  necesita: { texto: string; tono: string };
  consultora?: Consultora;
}

const COLOR_SEMAFORO: Record<FilaCliente['semaforo'], string> = {
  verde: 'var(--good)',
  amarillo: 'var(--warning)',
  rojo: 'var(--critical)',
  negro: 'var(--ink)',
};

export function TiraCliente({ filas, verConsultora }: { filas: FilaCliente[]; verConsultora: boolean }) {
  return (
    <ul className="divide-y divide-line">
      {filas.map((f) => (
        <li key={f.id}>
          <Link
            href={`/clientes/${f.id}`}
            className="grid grid-cols-[3px_1fr] gap-x-3 py-2.5 hover:bg-surface-2/40 sm:grid-cols-[3px_minmax(0,1.5fr)_auto_auto_minmax(0,1.3fr)] sm:items-center sm:gap-x-4"
          >
            {/* El semáforo como borde, no como tarjeta: ocupa nada y se ve en la primera pasada. */}
            <span
              aria-hidden
              className="row-span-2 h-full min-h-[34px] rounded-full sm:row-span-1"
              style={{ background: COLOR_SEMAFORO[f.semaforo] }}
            />

            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium">{f.nombre}</span>
              <span className="tnum block text-[11px] text-ink-3">
                {f.sinFecha ? (
                  <span style={{ color: 'var(--warning-ink)' }}>sin fecha de inicio</span>
                ) : (
                  <>semana {f.semana} · día {f.dia}</>
                )}
                {' · '}{f.programa}
              </span>
            </span>

            {/* Las cinco etapas del negocio, siempre en el mismo lugar. */}
            <span className="mt-1.5 flex gap-[3px] sm:mt-0" title={f.etapas.map((e) => `${e.nombre}: ${ETAPA[e.estado].titulo}${e.detalle ? ` — ${e.detalle}` : ''}`).join(' · ')}>
              {f.etapas.map((e) => (
                <span
                  key={e.fase}
                  className="h-[9px] w-8 rounded-[2px] sm:w-9"
                  style={{
                    background: e.estado === 'sin_datos' ? TRAMA : ETAPA[e.estado].fondo,
                    opacity: e.estado === 'pendiente' ? 0.45 : 1,
                  }}
                />
              ))}
            </span>

            {/* El expediente: seis casilleros ocupan lo mismo que «0 de 6» y dicen cuál falta. */}
            <span
              className="mt-1.5 flex gap-[3px] sm:mt-0"
              title={`Expediente · ${f.bloques.map((b) => `${b.label}: ${b.cargado ? 'sí' : 'falta'}`).join(' · ')}`}
            >
              {f.bloques.map((b) => (
                <span
                  key={b.label}
                  className="h-[9px] w-[9px] rounded-[2px] border"
                  style={{
                    background: b.cargado ? 'var(--accent)' : 'transparent',
                    borderColor: b.cargado ? 'var(--accent)' : 'var(--line-2, var(--line))',
                  }}
                />
              ))}
            </span>

            <span className="mt-1 min-w-0 sm:mt-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
              <span
                className="block truncate text-[12px]"
                style={{ color: TONO[f.necesita.tono] ?? 'var(--ink-2)' }}
              >
                {f.necesita.texto}
              </span>
              {verConsultora && f.consultora && (
                <span className="mt-1 flex flex-none items-center gap-1.5 sm:mt-0">
                  <Avatar persona={f.consultora} size={18} />
                  <span className="text-[11.5px] text-ink-3">{f.consultora.nombre}</span>
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** La leyenda, una vez arriba de la lista y no repetida en cada fila. */
export function LeyendaTira() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 text-[11px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="flex gap-[2px]">
          {(['cumplida', 'en_curso', 'atrasada', 'pendiente', 'sin_datos'] as EstadoEtapa[]).map((e) => (
            <span
              key={e}
              className="h-[8px] w-5 rounded-[2px]"
              style={{
                background: e === 'sin_datos' ? TRAMA : ETAPA[e].fondo,
                opacity: e === 'pendiente' ? 0.45 : 1,
              }}
            />
          ))}
        </span>
        etapas: cumplida · en curso · atrasada · todavía no · sin datos
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-[8px] w-[8px] rounded-[2px]" style={{ background: 'var(--accent)' }} />
        cada cuadradito es un bloque del expediente
      </span>
    </div>
  );
}

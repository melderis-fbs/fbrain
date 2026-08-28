'use client';

import { useState } from 'react';
import { extraerFicha } from '@/server/acciones-motores';

/**
 * LA FICHA DEL CLIENTE
 *
 * Los cuatro bloques del expediente en un solo formulario, y arriba de todo la
 * caja donde el consultor pega lo que ya tiene. El orden importa: si el
 * formulario arranca en blanco, se llena a medias y el diagnóstico razona
 * sobre huecos. Si arranca pre-llenado desde la llamada de venta, el consultor
 * corrige en vez de tipear, que es un trabajo distinto y mucho más corto.
 *
 * Nada de lo que propone la extracción se guarda sin que alguien lo firme.
 */

type Campos = Record<string, string>;
type Fuente = { campo: string; cita: string };

const CLASE_INPUT =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent';

function Campo({
  name, label, valor, set, tipo = 'text', ancho = 'full', hint, area, opciones,
}: {
  name: string;
  label: string;
  valor: Campos;
  set: (k: string, v: string) => void;
  tipo?: string;
  ancho?: 'full' | 'half';
  hint?: string;
  area?: number;
  opciones?: { v: string; l: string }[];
}) {
  return (
    <label className={ancho === 'half' ? 'block sm:col-span-1' : 'block sm:col-span-2'}>
      <span className="mb-1 block text-[12px] font-medium">{label}</span>
      {opciones ? (
        <select name={name} value={valor[name] ?? ''} onChange={(e) => set(name, e.target.value)} className={CLASE_INPUT}>
          {opciones.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      ) : area ? (
        <textarea
          name={name}
          rows={area}
          value={valor[name] ?? ''}
          onChange={(e) => set(name, e.target.value)}
          className={CLASE_INPUT}
        />
      ) : (
        <input
          name={name}
          type={tipo}
          value={valor[name] ?? ''}
          onChange={(e) => set(name, e.target.value)}
          className={CLASE_INPUT}
        />
      )}
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

function Seccion({ n, titulo, hint, children }: { n: number; titulo: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-[14px] font-semibold">
        <span className="text-ink-3">{n} · </span>
        {titulo}
      </h2>
      <p className="mb-3 mt-0.5 text-[11.5px] leading-relaxed text-ink-3">{hint}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function FichaForm({
  clienteId,
  inicial,
  equipo,
  esAdmin,
  conectado,
  accion,
}: {
  clienteId: string;
  inicial: Campos;
  equipo: { id: string; nombre: string }[];
  esAdmin: boolean;
  conectado: boolean;
  accion: (clienteId: string, fd: FormData) => Promise<void>;
}) {
  const [campos, setCampos] = useState<Campos>(inicial);
  const [documento, setDocumento] = useState('');
  const [extrayendo, setExtrayendo] = useState(false);
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [contradicciones, setContradicciones] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setCampos((c) => ({ ...c, [k]: v }));

  async function extraer() {
    setExtrayendo(true);
    setError(null);
    setFuentes([]);
    setContradicciones([]);
    try {
      const r = await extraerFicha(documento);
      if (!r.ok) {
        setError([r.error, ...(r.errores ?? [])].join(' · '));
        return;
      }
      const f = r.ficha;
      // Sólo se pisan los campos vacíos: lo que ya cargó una persona gana.
      setCampos((prev) => {
        const next = { ...prev };
        const poner = (k: string, v: unknown) => {
          if (v === undefined || v === null || v === '') return;
          if ((next[k] ?? '') !== '') return;
          next[k] = Array.isArray(v) ? v.join(', ') : String(v);
        };
        poner('nombre', f.identidad.nombre);
        poner('email', f.identidad.email);
        poner('programa', f.identidad.programa);
        poner('fuente', f.identidad.fuente);
        poner('planPago', f.identidad.planPago);
        poner('horasRealesSemana', f.identidad.horasRealesSemana);
        poner('queVende', f.negocio.queVende);
        poner('aQuien', f.negocio.aQuien);
        poner('negocioPrecio', f.negocio.precio);
        poner('negocioMoneda', f.negocio.moneda);
        poner('comoEntrega', f.negocio.comoEntrega);
        poner('facturacionMensual', f.negocio.facturacionMensual);
        poner('cantidadClientes', f.negocio.cantidadClientes);
        poner('origenClientes', f.negocio.origenClientes);
        poner('queFunciono', f.negocio.queFunciono);
        poner('queNoFunciono', f.negocio.queNoFunciono);
        poner('haceExcepcionalmenteBien', f.autoridad.haceExcepcionalmenteBien);
        poner('experienciaProfesional', f.autoridad.experienciaProfesional);
        poner('resultadosPropios', f.autoridad.resultadosPropios);
        poner('resultadosTerceros', f.autoridad.resultadosTerceros);
        poner('industriasQueConoce', f.autoridad.industriasQueConoce);
        poner('autoridadDesperdiciada', f.autoridad.autoridadDesperdiciada);
        poner('clienteIdeal', f.estrategia.clienteIdeal);
        poner('problema', f.estrategia.problema);
        poner('deseo', f.estrategia.deseo);
        poner('promesa', f.estrategia.promesa);
        poner('oferta', f.estrategia.oferta);
        poner('mecanismo', f.estrategia.mecanismo);
        poner('canal', f.estrategia.canal);
        poner('estrategiaPrecio', f.estrategia.precio);
        poner('metaMensual', f.objetivo.metaMensual);
        poner('ticket', f.objetivo.ticket);
        return next;
      });
      setFuentes(f.fuentes);
      setContradicciones(f.contradicciones);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falló la extracción.');
    } finally {
      setExtrayendo(false);
    }
  }

  return (
    <form action={(fd) => accion(clienteId, fd)} className="space-y-4">
      {/* ------------------------------------------------ documentos */}
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">Arrancar desde lo que ya tenés</h2>
        <p className="mb-3 mt-0.5 text-[11.5px] leading-relaxed text-ink-3">
          Pegá la transcripción de la llamada de venta, el formulario de onboarding o lo que haya en
          Notion. El extractor completa los campos vacíos y deja la cita de dónde sacó cada cosa.
          {' '}No pisa nada que ya hayas escrito, y lo que no está en el documento lo deja en blanco.
        </p>
        <textarea
          rows={5}
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          placeholder="Pegá acá los documentos del cliente…"
          className={CLASE_INPUT}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={extraer}
            disabled={!conectado || extrayendo || documento.trim().length < 50}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            style={{ background: 'var(--accent)' }}
          >
            {extrayendo ? 'Leyendo…' : 'Extraer del documento'}
          </button>
          {!conectado && (
            <span className="text-[11.5px] text-ink-3">
              Sin <code>ANTHROPIC_API_KEY</code> la extracción está apagada. La carga a mano funciona igual.
            </span>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: 'var(--critical)', background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
            {error}
          </p>
        )}
        {contradicciones.length > 0 && (
          <div className="mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--warning)', background: 'var(--warning-soft)' }}>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--warning-ink)' }}>
              El documento se contradice. Estos campos quedaron vacíos a propósito:
            </p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
              {contradicciones.map((c, i) => <li key={i}>· {c}</li>)}
            </ul>
          </div>
        )}
        {fuentes.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] text-ink-2">
              De dónde salió cada dato ({fuentes.length})
            </summary>
            <ul className="mt-2 space-y-1 text-[11.5px] text-ink-3">
              {fuentes.map((f, i) => (
                <li key={i}>
                  <span className="font-medium text-ink-2">{f.campo}:</span> «{f.cita}»
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* ------------------------------------------------ 1 · identidad */}
      <Seccion n={1} titulo="Identidad" hint="Lo administrativo. Las horas reales son las que declaró en la sesión 1, no las del pitch: el plan se arma contra ese número.">
        <Campo name="nombre" label="Nombre" valor={campos} set={set} ancho="half" />
        <Campo name="programa" label="Programa" valor={campos} set={set} ancho="half" />
        <Campo name="email" label="Email" valor={campos} set={set} tipo="email" ancho="half" />
        <Campo name="telefono" label="Teléfono" valor={campos} set={set} ancho="half" />
        <Campo name="fechaAlta" label="Fecha de alta" valor={campos} set={set} tipo="date" ancho="half" />
        <Campo name="fechaFinPrevista" label="Fin previsto" valor={campos} set={set} tipo="date" ancho="half" />
        <Campo name="fuente" label="Fuente de captación" valor={campos} set={set} ancho="half" />
        <Campo name="planPago" label="Plan de pago" valor={campos} set={set} ancho="half" />
        <Campo name="horasRealesSemana" label="Horas reales por semana" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo
          name="diasGraciaPago" label="Días de gracia de pago" valor={campos} set={set} tipo="number" ancho="half"
          hint="Los que firmó ESTE contrato: 5 los viejos, 3 los nuevos."
        />
        <Campo
          name="estado" label="Estado" valor={campos} set={set} ancho="half"
          opciones={[
            { v: 'activo', l: 'Activo' }, { v: 'pausado', l: 'Pausado' },
            { v: 'finalizado', l: 'Finalizado' }, { v: 'perdido', l: 'Perdido' },
          ]}
        />
        {esAdmin && (
          <Campo
            name="consultoraId" label="Consultora asignada" valor={campos} set={set} ancho="half"
            opciones={[{ v: '', l: '— sin asignar —' }, ...equipo.map((c) => ({ v: c.id, l: c.nombre }))]}
          />
        )}
        <Campo name="nivelVendido" label="Qué se le vendió" valor={campos} set={set} ancho="half" hint="Para poder contrastarlo con lo que trajo." />
        <Campo name="driveFolderId" label="ID de carpeta en Drive" valor={campos} set={set} ancho="half" />
        <label className="flex items-center gap-2 sm:col-span-1">
          <input type="checkbox" name="tieneGarantia" defaultChecked={inicial.tieneGarantia === 'on'} />
          <span className="text-[12.5px]">Tiene garantía</span>
        </label>
        <label className="flex items-center gap-2 sm:col-span-1">
          <input type="checkbox" name="nivelDesalineado" defaultChecked={inicial.nivelDesalineado === 'on'} />
          <span className="text-[12.5px]">Nivel desalineado con lo que compró</span>
        </label>
      </Seccion>

      {/* ------------------------------------------------ 2 · negocio */}
      <Seccion n={2} titulo="Negocio" hint="Qué vende hoy, no qué le gustaría vender. Este bloque es el que hace que el diagnóstico hable de su negocio y no de un negocio genérico.">
        <Campo name="queVende" label="Qué vende" valor={campos} set={set} area={2} />
        <Campo name="aQuien" label="A quién" valor={campos} set={set} area={2} />
        <Campo name="negocioPrecio" label="Precio" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="negocioMoneda" label="Moneda" valor={campos} set={set} ancho="half" opciones={[{ v: 'ARS', l: 'ARS' }, { v: 'USD', l: 'USD' }]} />
        <Campo name="comoEntrega" label="Cómo entrega" valor={campos} set={set} area={2} />
        <Campo name="facturacionMensual" label="Facturación mensual" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="cantidadClientes" label="Cuántos clientes tiene" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="origenClientes" label="De dónde vienen esos clientes" valor={campos} set={set} area={2} />
        <Campo name="queFunciono" label="Qué probó que funcionó" valor={campos} set={set} area={2} />
        <Campo name="queNoFunciono" label="Qué probó que no funcionó" valor={campos} set={set} area={2} />
      </Seccion>

      {/* ------------------------------------------------ 3 · autoridad */}
      <Seccion n={3} titulo="Autoridad" hint="Lo que ya tiene y no está usando. La autoridad desperdiciada es, muchas veces, el activo más rápido de activar.">
        <Campo name="haceExcepcionalmenteBien" label="Qué hace excepcionalmente bien" valor={campos} set={set} area={2} />
        <Campo name="experienciaProfesional" label="Experiencia profesional" valor={campos} set={set} area={2} />
        <Campo name="resultadosPropios" label="Resultados propios" valor={campos} set={set} area={2} />
        <Campo name="resultadosTerceros" label="Resultados para terceros" valor={campos} set={set} area={2} />
        <Campo name="industriasQueConoce" label="Industrias que conoce" valor={campos} set={set} hint="Separadas por coma." />
        <Campo name="autoridadDesperdiciada" label="Autoridad desperdiciada" valor={campos} set={set} area={2} />
      </Seccion>

      {/* ------------------------------------------------ 4 · estrategia */}
      <Seccion n={4} titulo="Estrategia y meta" hint="Cada cambio acá es una versión nueva, no un UPDATE: el drift entre versiones es lo que mira el test de coherencia. La meta y el ticket son lo que hace posible la cuenta inversa; sin eso no hay KPI semanal.">
        <Campo name="clienteIdeal" label="Cliente ideal" valor={campos} set={set} area={2} />
        <Campo name="problema" label="Problema" valor={campos} set={set} area={2} />
        <Campo name="deseo" label="Deseo" valor={campos} set={set} area={2} />
        <Campo name="promesa" label="Promesa" valor={campos} set={set} area={2} />
        <Campo name="oferta" label="Oferta" valor={campos} set={set} area={2} />
        <Campo name="mecanismo" label="Mecanismo" valor={campos} set={set} area={2} />
        <Campo name="canal" label="Canal" valor={campos} set={set} ancho="half" />
        <Campo name="estrategiaPrecio" label="Precio de la oferta" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="metaMensual" label="Meta mensual" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="ticket" label="Ticket" valor={campos} set={set} tipo="number" ancho="half" />
        <Campo name="motivoCambio" label="Motivo del cambio" valor={campos} set={set} ancho="half" hint="Sólo si cambiaste algo de la estrategia." />
        <Campo
          name="iniciativa" label="¿De quién fue el cambio?" valor={campos} set={set} ancho="half"
          opciones={[{ v: 'consultora', l: 'De la consultora' }, { v: 'cliente', l: 'Del cliente' }]}
          hint="Un cambio de precio a iniciativa del cliente dispara alerta."
        />
      </Seccion>

      <div className="sticky bottom-3 flex items-center gap-3 rounded-xl border border-line bg-surface p-3" style={{ boxShadow: 'var(--shadow)' }}>
        <button type="submit" className="rounded-lg px-4 py-2 text-[13px] font-semibold text-white" style={{ background: 'var(--accent)' }}>
          Guardar la ficha
        </button>
        <span className="text-[11.5px] text-ink-3">
          Estrategia y meta se guardan como versión nueva sólo si cambiaron.
        </span>
      </div>
    </form>
  );
}

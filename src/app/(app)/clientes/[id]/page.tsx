import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { BLOQUE_COMO_LLENAR, BLOQUE_LABEL } from '@/domain/expediente';
import { calcularCuentaInversa, TASAS_ROJO, tasasDe } from '@/domain/cuenta-inversa';
import { BLOQUEO_DESCRIPCION, ESLABON_LABEL } from '@/domain/fases';
import { ESTADO_DEUDA_LABEL } from '@/domain/types';
import {
  Avatar, BarraExpectativa, Card, Chip, Empty, IndiceRing, SemaforoBadge,
  SectionTitle, SinDato, Stat,
} from '@/components/ui';
import { Hitos } from '@/components/Hitos';
import { Timeline } from '@/components/Timeline';
import { Tracker } from '@/components/Tracker';
import { AlertaCard } from '@/components/AlertaCard';
import { ChatCliente } from '@/components/ChatCliente';
import { hayModelo } from '@/server/modelo';
import { colorIndice, plata } from '@/lib/ui';
import { formatDate, formatDateLong } from '@/lib/date';

const PERCEPCION: Record<string, string> = {
  muy_bien: 'Muy bien',
  bien: 'Bien',
  atencion: 'Necesita atención',
  riesgo: 'En riesgo',
};

export default async function ExpedientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');

  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx, indice, embudo } = v;
  const c = ctx.cliente;
  const abiertas = v.alertasAbiertas;
  const cerradas = v.alertas.filter((a) => a.cerradaAt);
  const ci = ctx.objetivo ? calcularCuentaInversa(ctx.objetivo.metaMensual, ctx.objetivo.ticket, tasasDe(ctx.objetivo)) : null;
  const ciRojo = ctx.objetivo ? calcularCuentaInversa(ctx.objetivo.metaMensual, ctx.objetivo.ticket, TASAS_ROJO) : null;
  const bloquesVacios = Object.entries(ctx.bloques).filter(([, ok]) => !ok) as [keyof typeof BLOQUE_LABEL, boolean][];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href="/mis-clientes" className="hover:underline">← Clientes</Link>
      </div>

      {/* ---------------------------------------------------------------- */}
      <Card className="mb-4">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <div className="flex items-start gap-4">
            <IndiceRing valor={indice.valor} size={80} />
            <div>
              <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{c.nombre}</h1>
              <p className="text-[13px] text-ink-2">
                {c.programa} · día {ctx.dia} · fase {ctx.fase}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <SemaforoBadge estado={v.semaforo} />
                <Chip tone="neutral">
                  <Avatar persona={v.consultora} size={16} /> {v.consultora?.nombre ?? 'sin consultora'}
                </Chip>
                {c.tieneGarantia && <Chip tone="warning">garantía firmada</Chip>}
                {(c.renovaciones ?? 0) > 0 && (
                  <Chip tone="good">
                    renovó{(c.renovaciones ?? 0) > 1 ? ` ${c.renovaciones} veces` : ''}
                    {c.ultimaRenovacion ? ` · ${formatDate(c.ultimaRenovacion)}` : ''}
                  </Chip>
                )}
                <Chip tone={indice.confianza === 'alta' ? 'good' : 'warning'}>dato {indice.confianza}</Chip>
                {c.fechaAltaProvisional && (
                  <Chip tone="warning">sin fecha de inicio · no se le miden hitos</Chip>
                )}
              </div>
            </div>
          </div>

          <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-3 text-[12px] sm:grid-cols-4">
            <div>
              <dt className="text-ink-3">Alta</dt>
              <dd className="font-medium">
                {formatDateLong(c.fechaAlta)}
                {c.fechaAltaProvisional && (
                  <span className="block text-[11px] font-normal" style={{ color: 'var(--warning-ink)' }}>
                    estimada · falta la fecha real
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Horas reales / semana</dt>
              <dd className="font-medium">{c.horasRealesSemana ?? '— sin dato'}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Primera venta</dt>
              <dd className="font-medium">
                {ctx.primeraVentaDia ? `día ${ctx.primeraVentaDia}` : ctx.dia >= 60 ? 'todavía no' : 'aún no vencida'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Expediente</dt>
              <dd className="font-medium">
                {ctx.bloquesCargados} de 6 ·{' '}
                <span style={{ color: ctx.habilitaDiagnostico ? 'var(--good-ink)' : 'var(--critical-ink)' }}>
                  {ctx.habilitaDiagnostico ? 'habilita diagnóstico' : 'no habilita diagnóstico'}
                </span>
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-4">
              <dt className="mb-1 flex justify-between text-ink-3">
                <span>Índice de avance · {indice.lectura}</span>
                <span className="tnum">{indice.valor}/100</span>
              </dt>
              <dd className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${indice.valor}%`, background: colorIndice(indice.valor) }} />
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Link
            href={`/clientes/${id}/sesion`}
            className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            Cerrar sesión
          </Link>
          <Link href={`/clientes/${id}/preparar`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Preparar sesión
          </Link>
          <Link href={`/clientes/${id}/revision`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Revisar el caso
          </Link>
          <Link href={`/clientes/${id}/diagnostico`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            ✳ Diagnóstico
          </Link>
          <Link href={`/clientes/${id}/coherencia`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Test de coherencia
          </Link>
          <Link href={`/clientes/${id}/ficha`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Editar la ficha
          </Link>
          <Link href={`/clientes/${id}/tracker`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Cargar la semana
          </Link>
          <Link href={`/clientes/${id}/documentos`} className="rounded-lg border border-line px-3 py-2 text-[12.5px] font-medium hover:border-accent">
            Documentos{v.ctx.registros.documentos.length > 0 && ` (${v.ctx.registros.documentos.length})`}
          </Link>
        </div>
      </Card>

      <div className="mb-4">
        <ChatCliente clienteId={id} nombre={v.ctx.cliente.nombre} conectado={hayModelo()} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* ------------------------------------------------ lectura */}
          <Card>
            <SectionTitle hint="Lo que se puede afirmar con aritmética, antes de gastar un peso en tokens">
              Lectura del sistema
            </SectionTitle>
            <div className="rounded-lg border border-line bg-surface-2/60 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Eslabón roto
              </div>
              <p className="mt-1 text-[15px] font-semibold">
                {embudo.titulo}
                <span className="ml-2 text-[12px] font-normal text-ink-3">
                  {ESLABON_LABEL[embudo.eslabon]} · {BLOQUEO_DESCRIPCION[embudo.tipoBloqueo].toLowerCase()}
                </span>
              </p>
              <p className="mt-1 text-[12.5px] text-ink-2">{embudo.evidencia}</p>
              {!embudo.concluyente && (
                <p className="mt-1.5 text-[12px]" style={{ color: 'var(--warning-ink)' }}>
                  La muestra no alcanza para concluir. Antes de cambiar nada, juntar dato.
                </p>
              )}
              <p className="mt-2 text-[13px]"><strong className="font-medium">Acción:</strong> {embudo.accion}</p>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--critical-ink)' }}>
                <strong className="font-medium">Qué no hacer:</strong> {embudo.queNoHacer}
              </p>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {indice.pilares.map((p) => (
                <div key={p.key} className="rounded-lg border border-line px-3 py-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] font-medium">{p.label}</span>
                    <span className="tnum text-[12px] text-ink-2">
                      {p.valor === null ? 'n/a' : Math.round(p.valor)}
                      <span className="text-ink-3"> · peso {Math.round(p.peso * 100)}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${p.valor ?? 0}%`,
                        background: p.valor === null ? 'var(--line-strong)' : colorIndice(p.valor),
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-3">{p.detalle}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-ink-3">{indice.motivoConfianza}.</p>
          </Card>

          {/* ------------------------------------------------ cuenta inversa */}
          <Card>
            <SectionTitle hint="Lo primero de la sesión 1 y lo que más se saltea">
              Cuenta inversa desde la meta
            </SectionTitle>
            {ctx.objetivo && ci && ciRojo && ctx.kpiSemanal ? (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Meta mensual" value={plata(ctx.objetivo.metaMensual, ctx.objetivo.moneda)} />
                  <Stat label="Ticket" value={plata(ctx.objetivo.ticket, ctx.objetivo.moneda)} />
                  <Stat label="KPI semanal" value={`${ctx.kpiSemanal.dms} DMs`} sub={`${ctx.kpiSemanal.agendas} agendas por semana`} />
                  <Stat label="Alcance necesario" value={ci.alcanceSemana.toLocaleString('es-AR')} sub="por semana" />
                </div>
                <p className="mt-3 rounded-lg bg-surface-2/70 px-3 py-2 text-[12.5px] leading-relaxed">
                  Con el embudo en objetivo necesita <strong>{ci.dmsSemana} DMs</strong> y{' '}
                  <strong>{ci.alcanceSemana.toLocaleString('es-AR')}</strong> de alcance por semana. Con el
                  embudo en rojo, <strong>{ciRojo.dmsSemana} DMs</strong> y{' '}
                  <strong>{ciRojo.alcanceSemana.toLocaleString('es-AR')}</strong> de alcance{' '}
                  <em>para facturar exactamente lo mismo</em>. Ese es el argumento que hace que deje de
                  pedir más alcance y se ocupe del seguimiento.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <BarraExpectativa label="DMs acumulados" actual={ctx.totales.dmsIniciados.valor} esperado={ctx.esperado?.dms ?? 0} sinDato={!ctx.totales.dmsIniciados.confiable} />
                  <BarraExpectativa label="Conversaciones que avanzan" actual={ctx.totales.conversacionesAvanzadas.valor} esperado={ctx.esperado?.conversaciones ?? 0} sinDato={!ctx.totales.conversacionesAvanzadas.confiable} />
                  <BarraExpectativa label="Agendas" actual={ctx.totales.agendas.valor} esperado={ctx.esperado?.agendas ?? 0} sinDato={!ctx.totales.agendas.confiable} />
                  <BarraExpectativa label="Ventas" actual={ctx.ventas} esperado={ctx.esperado?.ventas ?? 0} sinDato={!ctx.totales.ventas.confiable} />
                </div>
              </>
            ) : (
              <SinDato
                que="no hay cuenta inversa cargada"
                comoLlenar="Sin meta y ticket no hay KPI semanal, y sin KPI el sistema no puede decir si el volumen alcanza. Es la primera media hora de la sesión 1."
              />
            )}
            <div className="mt-5">
              <Tracker metricas={ctx.registros.metricas} kpi={ctx.kpiSemanal ? { dms: ctx.kpiSemanal.dms, agendas: ctx.kpiSemanal.agendas } : undefined} />
            </div>
          </Card>

          {/* ------------------------------------------------ hitos */}
          <Card>
            <SectionTitle hint="El módulo mide avance de programa; esto mide avance de negocio">
              Hitos y fase del negocio
            </SectionTitle>
            <Hitos ctx={ctx} />
          </Card>

          {/* ------------------------------------------------ bloques */}
          <Card>
            <SectionTitle hint="Con menos de 4 bloques los motores de criterio no corren">
              Expediente · {ctx.bloquesCargados} de 6 bloques
            </SectionTitle>
            <div className="mb-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
              {Object.entries(ctx.bloques).map(([k, ok]) => (
                <div key={k} className="flex-1" style={{ background: ok ? 'var(--good)' : 'var(--line-strong)' }} title={BLOQUE_LABEL[k as keyof typeof BLOQUE_LABEL]} />
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <BloqueTexto titulo="Negocio" ok={ctx.bloques.negocio} filas={[
                ['Qué vende', ctx.registros.negocio?.queVende],
                ['A quién', ctx.registros.negocio?.aQuien],
                ['Precio', ctx.registros.negocio?.precio ? plata(ctx.registros.negocio.precio, ctx.registros.negocio.moneda) : undefined],
                ['Factura hoy', ctx.registros.negocio?.facturacionMensual ? plata(ctx.registros.negocio.facturacionMensual) : undefined],
              ]} />
              <BloqueTexto titulo="Autoridad" ok={ctx.bloques.autoridad} filas={[
                ['Hace muy bien', ctx.registros.autoridad?.haceExcepcionalmenteBien],
                ['Experiencia', ctx.registros.autoridad?.experienciaProfesional],
                ['Resultados propios', ctx.registros.autoridad?.resultadosPropios],
                ['Autoridad desperdiciada', ctx.registros.autoridad?.autoridadDesperdiciada],
              ]} />
              <BloqueTexto titulo={`Estrategia vigente${ctx.estrategia ? ` · v${ctx.estrategia.version}` : ''}`} ok={ctx.bloques.estrategia} filas={[
                ['Cliente ideal', ctx.estrategia?.clienteIdeal],
                ['Problema', ctx.estrategia?.problema],
                ['Promesa', ctx.estrategia?.promesa],
                ['Oferta', ctx.estrategia?.oferta],
                ['Precio', ctx.estrategia?.precio ? plata(ctx.estrategia.precio, ctx.estrategia.moneda) : undefined],
              ]} />
              <div>
                <h3 className="mb-1.5 text-[12px] font-semibold">Versiones anteriores</h3>
                {ctx.estrategiasPrevias.length ? (
                  <ul className="space-y-1.5 text-[12px]">
                    {ctx.estrategiasPrevias.map((e) => (
                      <li key={e.id} className="rounded-md border border-line px-2.5 py-1.5">
                        <div className="flex justify-between">
                          <span>v{e.version} · desde {formatDate(e.vigenteDesde)}</span>
                          <span className="text-ink-3">iniciativa {e.iniciativa ?? '—'}</span>
                        </div>
                        {e.precio && <div className="tnum text-ink-2">precio {plata(e.precio, e.moneda)}</div>}
                        {e.motivoCambio && <div className="text-ink-3">{e.motivoCambio}</div>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-ink-3">Una sola versión. Sin historial no hay detección de drift.</p>
                )}
              </div>
            </div>

            {bloquesVacios.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {bloquesVacios.map(([k]) => (
                  <SinDato key={k} que={BLOQUE_LABEL[k]} comoLlenar={BLOQUE_COMO_LLENAR[k]} />
                ))}
              </div>
            )}
          </Card>

          {/* ------------------------------------------------ timeline */}
          <Card>
            <SectionTitle hint="Derivada de todo lo demás. Nadie escribe un solo evento.">
              Línea de tiempo
            </SectionTitle>
            <Timeline eventos={v.timeline} />
          </Card>
        </div>

        {/* ---------------------------------------------------------------- */}
        <div className="space-y-4">
          <Card>
            <SectionTitle hint={`${abiertas.length} abierta(s)`}>Alertas</SectionTitle>
            <div className="space-y-3">
              {abiertas.map((a) => (
                <AlertaCard
                  key={a.id}
                  alerta={a}
                  clienteId={c.id}
                  clienteNombre={c.nombre}
                  consultoraDelCaso={c.consultoraId}
                  usuario={usuario}
                />
              ))}
              {!abiertas.length && <Empty>Sin alertas abiertas.</Empty>}
            </div>
            {cerradas.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[12px] text-ink-3">
                  {cerradas.length} alerta(s) cerrada(s)
                </summary>
                <ul className="mt-2 space-y-2 text-[12px]">
                  {cerradas.map((a) => (
                    <li key={a.id} className="rounded-lg border border-line px-2.5 py-2">
                      <div className="font-medium">{a.codigo} · {a.titulo}</div>
                      <div className="text-ink-3">Cerrada {formatDate(a.cerradaAt)}: “{a.textoCierre}”</div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>

          <Card>
            <SectionTitle hint="El juicio que ninguna transcripción detecta. Emite alertas, no puntaje.">
              Lectura de la consultora
            </SectionTitle>
            {ctx.lectura ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tone={ctx.lectura.percepcion === 'riesgo' ? 'critical' : ctx.lectura.percepcion === 'atencion' ? 'warning' : 'good'}>
                    {PERCEPCION[ctx.lectura.percepcion]}
                  </Chip>
                  {ctx.lectura.necesitaIntervencion && <Chip tone="critical">pidió intervención</Chip>}
                </div>
                <dl className="space-y-1.5 text-[12px]">
                  <Fila k="Bloqueo declarado" v={ctx.lectura.bloqueoDeclarado} />
                  <Fila k="Potencial de renovación" v={ctx.lectura.potencialRenovacion} />
                  <Fila k="Actualizada" v={formatDate(ctx.lectura.fecha)} />
                </dl>
                {ctx.lectura.comentario && (
                  <p className="rounded-lg bg-surface-2/70 px-3 py-2 text-[12.5px] italic leading-relaxed">
                    “{ctx.lectura.comentario}”
                  </p>
                )}
              </div>
            ) : (
              <SinDato que="sin lectura de la consultora" comoLlenar="Se carga en cuatro toques al cerrar la sesión." />
            )}
          </Card>

          <Card>
            <SectionTitle>Compromisos</SectionTitle>
            {ctx.registros.compromisos.length ? (
              <ul className="space-y-1.5 text-[12.5px]">
                {ctx.registros.compromisos.slice(0, 8).map((k) => {
                  const vencido = k.estado === 'pendiente' && k.fechaVencimiento < ws.hoy;
                  return (
                    <li key={k.id} className="flex items-start gap-2">
                      <span aria-hidden style={{ color: k.estado === 'cumplido' ? 'var(--good)' : vencido ? 'var(--critical)' : 'var(--ink-3)' }}>
                        {k.estado === 'cumplido' ? '✓' : vencido ? '!' : '○'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block leading-snug">{k.descripcion}</span>
                        <span className="text-[11px] text-ink-3">
                          {formatDate(k.fechaVencimiento)} · {vencido ? 'vencido' : k.estado}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Sin compromisos registrados.</Empty>
            )}
          </Card>

          <Card>
            <SectionTitle>Pagos y garantía</SectionTitle>

            {/*
              Lo comercial arriba de las cuotas: qué se contrató y cómo lo ve
              finanzas. El estado de deuda puede no coincidir con la aritmética
              de vencimientos —se puede tener una cuota vencida y estar «en
              trámite»— y por eso se muestran los dos, no uno derivado del otro.
            */}
            {(c.montoTotal !== undefined || c.closer || c.estadoDeuda) && (
              <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 border-b border-line pb-3 text-[12px]">
                {c.montoTotal !== undefined && (
                  <div>
                    <dt className="text-ink-3">Contratado</dt>
                    <dd className="tnum font-medium">
                      {plata(c.montoTotal, ctx.registros.pagos[0]?.moneda)}
                      {c.cantidadCuotas ? <span className="text-ink-3"> · {c.cantidadCuotas} cuotas</span> : null}
                    </dd>
                  </div>
                )}
                {c.estadoDeuda && (
                  <div>
                    <dt className="text-ink-3">Estado de deuda</dt>
                    <dd><Chip tone={c.estadoDeuda === 'al_dia' ? 'good' : c.estadoDeuda === 'deudor' || c.estadoDeuda === 'en_tramite' ? 'warning' : 'critical'}>{ESTADO_DEUDA_LABEL[c.estadoDeuda]}</Chip></dd>
                  </div>
                )}
                {c.closer && (
                  <div>
                    <dt className="text-ink-3">Cerró</dt>
                    <dd className="font-medium">{c.closer}{c.setter && <span className="text-ink-3"> · agendó {c.setter}</span>}</dd>
                  </div>
                )}
                {c.fuente && (
                  <div>
                    <dt className="text-ink-3">Fuente</dt>
                    <dd className="font-medium">{c.fuente}</dd>
                  </div>
                )}
              </dl>
            )}

            <div className="space-y-2 text-[12.5px]">
              {ctx.registros.pagos.length === 0 && (
                <Empty>Sin cuotas cargadas. Entran desde la planilla.</Empty>
              )}
              {ctx.registros.pagos.length > 0 && (() => {
                const pagas = ctx.registros.pagos.filter((p) => p.estado === 'pagado');
                const vencidas = ctx.registros.pagos.filter((p) => p.estado === 'vencido');
                return (
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
                    <span className="text-ink-2">
                      {pagas.length} de {ctx.registros.pagos.length} cuotas pagas
                      {vencidas.length > 0 && (
                        <span style={{ color: 'var(--critical-ink)' }}> · {vencidas.length} vencida{vencidas.length > 1 ? 's' : ''}</span>
                      )}
                    </span>
                    <span className="tnum font-medium">
                      {plata(pagas.reduce((n, p) => n + p.monto, 0), ctx.registros.pagos[0].moneda)}
                      <span className="text-ink-3"> de {plata(ctx.registros.pagos.reduce((n, p) => n + p.monto, 0), ctx.registros.pagos[0].moneda)}</span>
                    </span>
                  </div>
                );
              })()}
              {ctx.registros.pagos.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span>Cuota {p.numeroCuota} · {formatDate(p.fechaVencimiento)}</span>
                  <span
                    className="font-medium"
                    style={{ color: p.estado === 'vencido' ? 'var(--critical-ink)' : p.estado === 'pagado' ? 'var(--good-ink)' : undefined }}
                  >
                    {plata(p.monto, p.moneda)} · {p.estado}
                  </span>
                </div>
              ))}
              {c.notas && (
                <div className="mt-3 border-t border-line pt-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Notas</div>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-2">{c.notas}</p>
                </div>
              )}
              {c.tieneGarantia && (
                <p className="mt-2 rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--warning-soft)', color: 'var(--warning-ink)' }}>
                  Garantía firmada: 90% de asistencia 1:1, 2 mentorías por semana, reporte semanal y
                  cuotas en término. Asistencias a mentorías en 3 semanas: {ctx.asistenciaMentorias3sem}.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <SectionTitle>Sesiones</SectionTitle>
            <ul className="space-y-2 text-[12.5px]">
              {ctx.registros.sesiones.filter((s) => s.fecha <= ws.hoy).slice(0, 6).map((s) => {
                const sinRegistro = !s.transcripcionTexto && !s.reporte;
                return (
                  <li key={s.id} className="rounded-lg border border-line px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{formatDate(s.fecha)}</span>
                      {s.estadoAgenda !== 'realizada' && <Chip tone="critical">{s.estadoAgenda.replace('_', ' ')}</Chip>}
                      {sinRegistro && s.estadoAgenda === 'realizada' && <Chip tone="critical">sin registro</Chip>}
                      {s.satisfaccion !== undefined && <Chip tone="neutral">satisfacción {s.satisfaccion}/10</Chip>}
                    </div>
                    {s.reporte && <p className="mt-1 text-ink-2">{s.reporte}</p>}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function BloqueTexto({ titulo, ok, filas }: { titulo: string; ok: boolean; filas: [string, string | undefined][] }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold">
        {titulo}
        {!ok && <span className="text-[10px] font-normal uppercase tracking-wide" style={{ color: 'var(--warning-ink)' }}>incompleto</span>}
      </h3>
      <dl className="space-y-1 text-[12px]">
        {filas.map(([k, val]) => (
          <div key={k}>
            <dt className="text-ink-3">{k}</dt>
            <dd className={val ? '' : 'italic text-ink-3'}>{val ?? 'sin dato'}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{k}</dt>
      <dd className="text-right font-medium capitalize">{v.replace('_', ' ')}</dd>
    </div>
  );
}

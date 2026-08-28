import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, type VistaCliente } from '@/server/workspace';
import { Avatar, Card, Chip, Empty, SectionTitle, SemaforoCelda, SinDato, Stat } from '@/components/ui';
import { FASES } from '@/domain/fases';
import { colorIndice } from '@/lib/ui';
import { daysBetween, formatDate } from '@/lib/date';

export const metadata = { title: 'Consultoras · Founders Brain' };

/** Un caso merece pensamiento estratégico, no sólo seguimiento. */
function necesitaPensar(v: VistaCliente) {
  return (
    v.semaforo === 'rojo' ||
    v.semaforo === 'negro' ||
    v.ctx.gatesVencidos.length > 0 ||
    v.indice.valor < 55 ||
    Boolean(v.ctx.lectura?.necesitaIntervencion)
  );
}

export default async function ConsultorasPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const ws = await getWorkspace();
  const sp = await searchParams;
  const id = sp.c ?? ws.consultoras[0]?.id;
  const consultora = ws.equipo.find((c) => c.id === id);

  const activos = ws.vistas.filter((v) => v.ctx.cliente.estado === 'activo');
  const mios = activos.filter((v) => v.ctx.cliente.consultoraId === id);
  const paraPensar = mios.filter(necesitaPensar);

  // ---- indicadores de cartera (no de persona) -----------------------------
  const elegibles60 = mios.filter((v) => v.ctx.dia >= 60);
  // Numerador dentro del denominador: sólo los que ya pasaron el día 60.
  const vendieron60 = elegibles60.filter((v) => (v.ctx.primeraVentaDia ?? 999) <= 60);
  const elegibles90 = mios.filter((v) => v.ctx.dia >= 90);
  const vendieron90 = elegibles90.filter((v) => v.ctx.ventas > 0);

  const alertasAbiertas = mios.flatMap((v) => v.alertasAbiertas);
  const alertasCerradas = mios.flatMap((v) => v.alertas.filter((a) => a.cerradaAt));
  const demoraCierre = alertasCerradas.length
    ? Math.round(
        alertasCerradas.reduce((a, x) => a + daysBetween(x.emitidaAt, x.cerradaAt!), 0) / alertasCerradas.length,
      )
    : null;
  const amarillasViejas = alertasAbiertas.filter(
    (a) => a.estadoSemaforo === 'amarillo' && daysBetween(a.emitidaAt, ws.hoy) > 14,
  );

  const cadenciaRota = mios.filter((v) => (v.ctx.diasSinSesion ?? 999) > 14).length;
  const sinRegistro = mios.reduce((a, v) => a + v.ctx.sesionesSinRegistro.length, 0);
  const diagnosticos = mios.flatMap((v) => v.ctx.registros.diagnosticos);
  const aciertos = diagnosticos.filter((d) => d.coincidio === true).length;

  const satisfacciones = mios.flatMap((v) =>
    v.ctx.registros.sesiones.map((s) => s.satisfaccion).filter((x): x is number => x !== undefined),
  );

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Consultoras</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Herramienta de dirección, no evaluación de desempeño. Todo lo que se muestra acá describe
          una cartera; ninguna cartera es comparable con otra sin conocer los casos que recibió.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        {ws.consultoras.map((c) => (
          <Link
            key={c.id}
            href={`/consultoras?c=${c.id}`}
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px]"
            style={{
              borderColor: c.id === id ? 'var(--accent)' : 'var(--line)',
              background: c.id === id ? 'var(--accent-soft)' : 'transparent',
              color: c.id === id ? 'var(--accent-ink)' : undefined,
              fontWeight: c.id === id ? 600 : 400,
            }}
          >
            <Avatar persona={c} size={20} />
            {c.nombre}
            <span className="tnum text-ink-3">{activos.filter((v) => v.ctx.cliente.consultoraId === c.id).length}</span>
          </Link>
        ))}
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card>
          <SectionTitle hint="El techo acordado es 12">Carga</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Clientes activos"
              value={mios.length}
              sub={`techo ${consultora?.cupoMaximo}`}
              tone={mios.length > (consultora?.cupoMaximo ?? 12) ? 'bad' : 'neutral'}
            />
            <Stat label="Acepta nuevos" value={consultora?.aceptaNuevos ? 'Sí' : 'No'} />
          </div>
          {mios.length > (consultora?.cupoMaximo ?? 12) && (
            <p className="mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed" style={{ background: 'var(--critical-soft)', color: 'var(--critical-ink)' }}>
              {mios.length - (consultora?.cupoMaximo ?? 12)} clientes por encima del techo. A esta altura
              el problema de asignación no es del caso individual: es de capacidad del equipo.
            </p>
          )}

          {/*
            La sobrecarga la declara ella, no la deduce el sistema. Se puede
            estar al tope del cupo y bien, o con ocho clientes y fundida — el
            cupo mide clientes, no cabeza.
          */}
          {consultora?.manoLevantadaAt ? (
            <div className="mt-3 rounded-lg px-3 py-2" style={{ background: 'var(--warning-soft)' }}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--warning-ink)' }}>
                Levantó la mano · {formatDate(consultora.manoLevantadaAt)}
              </div>
              {consultora.manoLevantadaNota && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                  «{consultora.manoLevantadaNota}»
                </p>
              )}
              <p className="mt-1.5 text-[12px] text-ink-3">
                Esto no se calcula: lo declara ella. Se puede estar al tope del cupo y bien, o con
                ocho clientes y fundida.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-ink-3">
              No levantó la mano. La sobrecarga se declara, no se deduce del cupo.
            </p>
          )}

          {Boolean(consultora?.sesionesBackToBack) && (
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'var(--serious-ink)' }}>
              {consultora!.sesionesBackToBack} sesiones pegadas sin margen en los últimos 14 días.
              Una llamada que arranca tarde porque la anterior se estiró es la forma más barata de
              que un cliente sienta que es uno más de una lista.
            </p>
          )}
        </Card>

        <Card>
          <SectionTitle hint="El único número que dice si el acompañamiento funciona">Resultados de la cartera</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Vendieron antes del día 60"
              value={elegibles60.length ? `${vendieron60.length}/${elegibles60.length}` : '—'}
              tone={elegibles60.length && vendieron60.length / elegibles60.length >= 0.5 ? 'good' : 'bad'}
            />
            <Stat
              label="Vendieron antes del día 90"
              value={elegibles90.length ? `${vendieron90.length}/${elegibles90.length}` : '—'}
            />
          </div>
        </Card>

        <Card>
          <SectionTitle hint="Si cierra lo que abre">Alertas de su cartera</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Abiertas" value={alertasAbiertas.length} />
            <Stat label="Cerradas" value={alertasCerradas.length} />
            <Stat label="Demora media de cierre" value={demoraCierre !== null ? `${demoraCierre} d` : '—'} />
            <Stat
              label="Amarillas de +14 días"
              value={amarillasViejas.length}
              tone={amarillasViejas.length ? 'bad' : 'good'}
              sub="el patrón de los casos perdidos"
            />
          </div>
        </Card>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        <Card>
          <SectionTitle hint="Cadencia real, no declarada">Proceso</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Clientes sin sesión +14 días" value={cadenciaRota} tone={cadenciaRota ? 'bad' : 'good'} />
            <Stat label="Sesiones sin registro" value={sinRegistro} tone={sinRegistro ? 'bad' : 'good'} />
          </div>
        </Card>

        <Card>
          <SectionTitle hint="Sale de comparar su hipótesis previa con el diagnóstico">
            Acierto de cuello de botella
          </SectionTitle>
          {diagnosticos.length >= 3 ? (
            <Stat
              label="Coincidencias"
              value={`${aciertos}/${diagnosticos.length}`}
              sub="el dato de management que hoy no existe en ningún lado"
            />
          ) : (
            <SinDato
              que={`sólo ${diagnosticos.length} diagnóstico(s) corridos`}
              comoLlenar="Con menos de 3 no se puede leer nada. Se llena solo a medida que el equipo usa el motor."
            />
          )}
        </Card>

        <Card>
          <SectionTitle hint="Hoy no se mide">Satisfacción de sus clientes</SectionTitle>
          {satisfacciones.length >= 5 ? (
            <Stat
              label="Promedio"
              value={(satisfacciones.reduce((a, b) => a + b, 0) / satisfacciones.length).toFixed(1)}
              sub={`${satisfacciones.length} respuestas`}
            />
          ) : (
            <SinDato
              que={`${satisfacciones.length} respuestas cargadas`}
              comoLlenar="Es una sola pregunta al cerrar la sesión. No se pone en el tablero hasta que haya volumen: un promedio de tres respuestas no dice nada y quema la métrica."
            />
          )}
        </Card>
      </div>

      {/* ------------------------------------------------ revisión por fase */}
      <Card>
        <SectionTitle
          hint="La reunión no repasa los 30 clientes: separa los que necesitan pensamiento estratégico de los que sólo necesitan seguimiento"
          action={
            <span className="flex gap-2">
              <Chip tone="serious">{paraPensar.length} para pensar</Chip>
              <Chip tone="good">{mios.length - paraPensar.length} sólo seguimiento</Chip>
            </span>
          }
        >
          Revisión por fase
        </SectionTitle>

        <div className="space-y-4">
          {FASES.map((fase) => {
            const enFase = mios.filter((v) => v.ctx.fase === fase.key);
            if (!enFase.length) return null;
            return (
              <div key={fase.key}>
                <div className="mb-2 flex flex-wrap items-baseline gap-2">
                  <h3 className="text-[13px] font-semibold capitalize">{fase.nombre}</h3>
                  <span className="text-[11.5px] text-ink-3">{fase.pregunta}</span>
                  <span className="tnum ml-auto text-[11.5px] text-ink-3">{enFase.length}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
                        <th className="py-2 pr-3 font-medium">Cliente</th>
                        <th className="py-2 pr-3 font-medium">Semáforo</th>
                        <th className="py-2 pr-3 text-right font-medium">Índice</th>
                        <th className="py-2 pr-3 text-right font-medium">Día</th>
                        <th className="py-2 pr-3 text-right font-medium">Ventas</th>
                        <th className="py-2 font-medium">Foco de la revisión</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enFase
                        .sort((a, b) => a.indice.valor - b.indice.valor)
                        .map((v) => (
                          <tr
                            key={v.ctx.cliente.id}
                            className="border-b border-line last:border-0"
                            style={necesitaPensar(v) ? { background: 'var(--warning-soft)' } : undefined}
                          >
                            <td className="py-2 pr-3">
                              <Link href={`/clientes/${v.ctx.cliente.id}`} className="font-medium hover:underline">
                                {v.ctx.cliente.nombre}
                              </Link>
                            </td>
                            <td className="w-[110px] py-2 pr-3"><SemaforoCelda estado={v.semaforo} /></td>
                            <td className="tnum py-2 pr-3 text-right font-semibold" style={{ color: colorIndice(v.indice.valor) }}>
                              {v.indice.valor}
                            </td>
                            <td className="tnum py-2 pr-3 text-right">{v.ctx.dia}</td>
                            <td className="tnum py-2 pr-3 text-right">{v.ctx.ventas}</td>
                            <td className="py-2 text-ink-2">
                              {necesitaPensar(v) ? v.embudo.titulo : 'Seguimiento'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {!mios.length && <Empty>Esta consultora no tiene clientes activos.</Empty>}
        </div>
      </Card>
    </div>
  );
}

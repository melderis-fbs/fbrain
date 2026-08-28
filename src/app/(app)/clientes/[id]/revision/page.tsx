import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Avatar, Card, Chip, SectionTitle, SemaforoBadge } from '@/components/ui';
import { RESPONSABLE_LABEL, DESVIO_LABEL } from '@/domain/atribucion';
import { COBRANZA_LABEL } from '@/domain/cobranza';
import { formatDate, formatDateLong, relativeDays } from '@/lib/date';
import { plata } from '@/lib/ui';

export const metadata = { title: 'Revisión de caso · Founders Brain' };

/**
 * LA PELÍCULA COMPLETA
 *
 * Hoy revisar un caso es: escuchar al coach, leer el resumen, ir a las
 * llamadas, analizarlas, y después escuchar al cliente. Media jornada por
 * caso, y por eso se revisan los que ya explotaron.
 *
 * Esta pantalla no reemplaza ese criterio: le arma el material. Todo lo que
 * hay acá ya existía disperso; lo único que agrega es ponerlo junto, en orden
 * cronológico, con la pregunta de la atribución arriba de todo y el veredicto
 * abajo, para que la revisión termine en una decisión escrita y no en una
 * conversación.
 */
export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx, atribucion, desvio, cobranza, indice, embudo, guion } = v;
  const abiertas = v.alertasAbiertas;
  const sesiones = ctx.sesionesRealizadas.slice(0, 5);
  const revisionPrevia = ctx.registros.revisiones[0];

  const tono =
    atribucion.responsable === 'nosotros' || atribucion.responsable === 'ambos'
      ? 'critical'
      : atribucion.responsable === 'cliente'
        ? 'warning'
        : 'neutral';

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {ctx.cliente.nombre}</Link>
      </div>

      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Revisión de caso</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-2">
          <span className="font-medium text-ink">{ctx.cliente.nombre}</span>
          <SemaforoBadge estado={v.semaforo} size="sm" />
          <span>día {ctx.dia} · fase {ctx.fase} · índice {indice.valor}</span>
          <span className="inline-flex items-center gap-1.5">
            <Avatar persona={v.consultora} size={18} /> {v.consultora?.nombre}
          </span>
        </p>
      </header>

      {/* ------------------------------------------------- la pregunta */}
      <div
        className="mb-5 rounded-xl border p-5"
        style={{
          borderColor: tono === 'critical' ? 'var(--critical)' : 'var(--line)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
          ¿Es el cliente o somos nosotros?
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[18px] font-semibold tracking-tight">
            {RESPONSABLE_LABEL[atribucion.responsable]}
          </span>
          <Chip tone={tono}>{DESVIO_LABEL[desvio.estado]}</Chip>
          <Chip tone="neutral">confianza {atribucion.confianza}</Chip>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{atribucion.titular}</p>

        <div className="mt-3 rounded-lg border border-line bg-surface-2/60 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">Qué hacer</div>
          <p className="mt-1 text-[13.5px] leading-relaxed">{atribucion.accion}</p>
          {atribucion.queNoHacer && (
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: 'var(--critical-ink)' }}>
              <strong className="font-semibold">Todavía no:</strong> {atribucion.queNoHacer}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Lado
            titulo="De nuestro lado"
            vacio="Nada pendiente. El acompañamiento está al día."
            senales={atribucion.senalesNosotros}
            color="var(--critical-ink)"
          />
          <Lado
            titulo="Del lado del cliente"
            vacio="Nada que reprocharle con los datos cargados."
            senales={atribucion.senalesCliente}
            color="var(--warning-ink)"
          />
        </div>
      </div>

      {/* ------------------------------------------------- el guion */}
      <Card className="mb-5">
        <SectionTitle hint={guion.usable ? 'Habilitado: nuestro lado está al día' : 'Bloqueado'}>
          Guion de confrontación
        </SectionTitle>
        {!guion.usable ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            No se usa en esta sesión. {guion.motivoNoUsable}
          </p>
        ) : (
          <div className="space-y-3 text-[13.5px] leading-relaxed">
            <p><strong className="font-semibold">Lo que acordamos:</strong> {guion.acordado}</p>
            {guion.falta.length > 0 && (
              <div>
                <strong className="font-semibold">Lo que a esta altura debería estar y no está:</strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
                  {guion.falta.slice(0, 5).map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            <p><strong className="font-semibold">Lo que le toca:</strong> {guion.pedidoSemana}</p>
            <p className="text-ink-3">{guion.cierre}</p>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------- la película */}
      <Card className="mb-5">
        <SectionTitle hint="Lo que hoy hay que ir a buscar a cinco lugares">Los últimos 60 días</SectionTitle>

        <Bloque titulo="Números">
          <p>
            {ctx.ventas} venta(s) por {plata(ctx.facturado)}.{' '}
            {ctx.kpiSemanal
              ? `Necesita ${ctx.kpiSemanal.dms} DMs y ${ctx.kpiSemanal.agendas} agendas por semana para su meta.`
              : 'Sin cuenta inversa: no hay número acordado contra el cual medir.'}
          </p>
          <p className="text-ink-3">
            Tracker: {ctx.diasDesdeMetricas === null
              ? 'ninguna semana cargada'
              : `última carga ${relativeDays(ctx.diasDesdeMetricas)}`}
            {' · '}
            {ctx.totales.dmsIniciados.semanasSinDato} semana(s) sin cargar de{' '}
            {ctx.totales.dmsIniciados.semanasConDato + ctx.totales.dmsIniciados.semanasSinDato}.
          </p>
          <p className="text-ink-3">Eslabón roto: {embudo.titulo} — {embudo.evidencia}</p>
        </Bloque>

        <Bloque titulo="Sesiones">
          {sesiones.length ? (
            <ul className="space-y-1.5">
              {sesiones.map((s) => (
                <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="tnum shrink-0 text-ink-3">{formatDate(s.fecha)}</span>
                  <span className="min-w-0 flex-1">
                    {s.reporte ?? <em className="text-ink-3">sin reporte ni transcripción</em>}
                  </span>
                  {s.satisfaccion !== undefined && (
                    <Chip tone={s.satisfaccion >= 8 ? 'good' : s.satisfaccion >= 6 ? 'warning' : 'critical'}>
                      satisfacción {s.satisfaccion}
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">No hay sesiones realizadas registradas.</p>
          )}
          <p className="mt-2 text-ink-3">
            {ctx.cadenciaUltimos30} sesión(es) en los últimos 30 días ·{' '}
            {ctx.sesionesSinRegistro.length} sin registro ·{' '}
            última {relativeDays(ctx.diasSinSesion)}.
          </p>
        </Bloque>

        <Bloque titulo="Lo que dijo el cliente, textual">
          {abiertas.filter((a) => a.citaTextual).length ? (
            <ul className="space-y-1.5">
              {abiertas.filter((a) => a.citaTextual).map((a) => (
                <li key={a.id} className="italic" style={{ color: 'var(--critical-ink)' }}>
                  «{a.citaTextual}» <span className="not-italic text-ink-3">— {a.codigo}, {formatDate(a.fechaCita)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3">
              Ninguna cita registrada. Sin transcripciones procesadas, esta sección queda vacía y la
              revisión pierde justamente la parte que no está en los números.
            </p>
          )}
        </Bloque>

        <Bloque titulo="Historia con el equipo">
          <p>
            {ctx.traspasoReciente
              ? `Cambio de consultora el ${formatDate(ctx.traspasoReciente.fecha)}. ${ctx.registros.traspasos.length} traspaso(s) en total.`
              : ctx.registros.traspasos.length
                ? `${ctx.registros.traspasos.length} traspaso(s), ninguno reciente.`
                : 'Siempre con la misma consultora.'}
          </p>
          {ctx.cliente.nivelDesalineado && (
            <p style={{ color: 'var(--serious-ink)' }}>
              Compró {ctx.cliente.nivelVendido} y trajo un negocio de otra etapa. El desajuste se
              produjo en la venta, no en el acompañamiento.
            </p>
          )}
          {ctx.lectura && (
            <p className="text-ink-3">
              Última lectura de la consultora ({formatDate(ctx.lectura.fecha)}): {ctx.lectura.percepcion}
              , bloqueo {ctx.lectura.bloqueoDeclarado}
              {ctx.lectura.comentario ? ` — «${ctx.lectura.comentario}»` : ''}.
            </p>
          )}
        </Bloque>

        <Bloque titulo="Dinero">
          <p>
            {COBRANZA_LABEL[cobranza.estado]}. {cobranza.titular}
          </p>
          <p className="text-ink-3">
            Margen del contrato: {cobranza.diasGracia} días.
            {ctx.cliente.tieneGarantia ? ' Tiene cláusula de garantía.' : ''}
          </p>
          <p className="text-[12px] text-ink-3">
            Esto es contexto de la revisión, no un argumento de cobranza: los dos carriles corren por
            separado.
          </p>
        </Bloque>
      </Card>

      {/* ------------------------------------------------- veredicto */}
      <Card>
        <SectionTitle hint="Sin esto, la revisión fue una charla">El veredicto</SectionTitle>
        {revisionPrevia ? (
          <div className="space-y-2 text-[13.5px] leading-relaxed">
            <p className="text-[12px] text-ink-3">
              Última revisión: {formatDateLong(revisionPrevia.fecha)} por {revisionPrevia.revisadaPor}
            </p>
            <p><strong className="font-semibold">Veredicto:</strong> {revisionPrevia.veredicto}</p>
            <p><strong className="font-semibold">Acción:</strong> {revisionPrevia.accionAcordada} — {revisionPrevia.responsableAccion}</p>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Este caso todavía no fue revisado. El veredicto se escribe al final de la revisión, con
            responsable y fecha de seguimiento: es lo único que distingue una reunión de casos de una
            conversación sobre casos.
          </p>
        )}
      </Card>
    </div>
  );
}

function Lado({
  titulo, senales, vacio, color,
}: {
  titulo: string;
  senales: { clave: string; texto: string; correccion: string }[];
  vacio: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color }}>
        {titulo}
      </div>
      {senales.length ? (
        <ul className="mt-1.5 space-y-2">
          {senales.map((s) => (
            <li key={s.clave} className="text-[12.5px] leading-relaxed">
              {s.texto}
              <div className="mt-0.5 text-ink-3">{s.correccion}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-ink-3">{vacio}</p>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{titulo}</div>
      <div className="space-y-1 text-[13px] leading-relaxed">{children}</div>
    </div>
  );
}

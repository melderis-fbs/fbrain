import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Card, Chip, SectionTitle } from '@/components/ui';
import { porcentajeCobrado, resumenContrato } from '@/domain/contrato';
import { parsearBrief } from '@/server/ghl-ficha';
import { formatDate } from '@/lib/date';

export const metadata = { title: 'Antes de la reunión · Founders Brain' };

/**
 * ANTES DE LA PRIMERA REUNIÓN
 *
 * Dos cosas que una consultora necesita y hoy no tiene a mano: lo que el
 * cliente contestó en el onboarding, y qué compró exactamente.
 *
 * Las dos son datos ya cargados, así que la página no llama al modelo y se
 * puede abrir siempre. Y el formulario se muestra **con las palabras del
 * cliente**: antes de conocerlo, el «me da vergüenza cobrar más» textual es
 * el dato, y un resumen lo borra.
 */
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx } = v;
  const cliente = ctx.cliente;
  const contrato = resumenContrato(cliente, ctx.registros.pagos, ws.hoy);
  const cobrado = porcentajeCobrado(contrato);

  const onboarding = ctx.registros.documentos.find((d) => d.tipo === 'formulario_onboarding');
  const bloques = onboarding ? parsearBrief(onboarding.contenido) : [];

  const moneda = contrato.cuotas[0]?.moneda ?? 'USD';
  const plata = (n: number) => `${moneda} ${n.toLocaleString('es-AR')}`;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {cliente.nombre}</Link>
      </div>

      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Antes de la reunión</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Lo que {cliente.nombre} contestó en el onboarding, y qué compró. Todo con sus palabras:
          acá no resume nadie.
        </p>
      </header>

      {/* --- qué compró --------------------------------------------------- */}
      <Card className="mb-4">
        <SectionTitle hint="Lo que ya se prometió y hay que cumplir">Qué compró</SectionTitle>

        <div className="flex flex-wrap gap-2">
          {contrato.programa && <Chip tone="accent">{contrato.programa}</Chip>}
          {contrato.tipo && <Chip>{contrato.tipo}</Chip>}
          {contrato.duracionMeses !== undefined && (
            <Chip>{contrato.duracionMeses} meses</Chip>
          )}
          {contrato.tieneGarantia && <Chip tone="warning">Con garantía</Chip>}
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
          <Dato rotulo="Empezó" valor={formatDate(contrato.inicio)}
                nota={contrato.inicioEstimado ? 'fecha estimada' : undefined} />
          <Dato rotulo="Termina" valor={formatDate(contrato.fin)}
                nota={
                  contrato.semanasRestantes === undefined
                    ? undefined
                    : contrato.semanasRestantes >= 0
                      ? `quedan ${contrato.semanasRestantes} semanas`
                      : `se pasó hace ${Math.abs(contrato.semanasRestantes)} semanas`
                } />
          <Dato rotulo="Monto total" valor={contrato.montoTotal ? plata(contrato.montoTotal) : '—'} />
          <Dato
            rotulo="Cobrado"
            valor={contrato.montoCobrado !== undefined ? plata(contrato.montoCobrado) : '—'}
            nota={cobrado !== undefined ? `${cobrado}% del contrato` : undefined}
          />
          <Dato
            rotulo="Cuotas"
            valor={
              contrato.cuotas.length
                ? `${contrato.cuotas.filter((c) => c.pagada).length} de ${contrato.cuotasPactadas ?? contrato.cuotas.length} pagas`
                : contrato.cuotasPactadas
                  ? `${contrato.cuotasPactadas} pactadas, ninguna cargada`
                  : '—'
            }
          />
          <Dato
            rotulo="Próximo vencimiento"
            valor={contrato.proximoVencimiento ? formatDate(contrato.proximoVencimiento.vence) : '—'}
            nota={contrato.proximoVencimiento ? plata(contrato.proximoVencimiento.monto) : undefined}
          />
        </dl>

        {contrato.cuotas.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="text-ink-3">
                <tr>
                  <th className="py-1 pr-3 font-medium">Cuota</th>
                  <th className="py-1 pr-3 font-medium">Monto</th>
                  <th className="py-1 pr-3 font-medium">Vence</th>
                  <th className="py-1 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {contrato.cuotas.map((c) => (
                  <tr key={c.numero} className="border-t border-line">
                    <td className="py-1.5 pr-3">{c.numero}</td>
                    <td className="py-1.5 pr-3">{plata(c.monto)}</td>
                    <td className="py-1.5 pr-3">{formatDate(c.vence)}</td>
                    <td className="py-1.5">
                      {c.pagada
                        ? <span className="text-ink-2">Pagada {c.fechaPago ? formatDate(c.fechaPago) : ''}</span>
                        : <span className="text-ink-3">Pendiente</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {contrato.beneficiosExtra && (
          <div className="mt-4 rounded-lg bg-surface-2 p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Beneficios extras
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">
              {contrato.beneficiosExtra}
            </p>
            <p className="mt-2 text-[12px] text-ink-3">
              Esto ya se prometió: hay que cumplirlo, y no hace falta volver a ofrecerlo.
            </p>
          </div>
        )}

        {contrato.linkContrato && (
          <p className="mt-3 text-[12.5px]">
            <a href={contrato.linkContrato} target="_blank" rel="noopener noreferrer"
               className="underline decoration-line hover:decoration-ink-2">
              Abrir el contrato firmado
            </a>
          </p>
        )}

        {contrato.sinDatos.length > 0 && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Lo que no sabemos
            </p>
            <ul className="mt-1.5 space-y-1 text-[12.5px] leading-relaxed text-ink-2">
              {contrato.sinDatos.map((s) => <li key={s}>· {s}</li>)}
            </ul>
            <p className="mt-2 text-[12px] text-ink-3">
              Está escrito para que nadie lo dé por supuesto en una reunión.
            </p>
          </div>
        )}
      </Card>

      {/* --- el formulario ------------------------------------------------ */}
      {bloques.length === 0 ? (
        <Card>
          <SectionTitle>El formulario de onboarding</SectionTitle>
          <p className="text-[13px] leading-relaxed text-ink-2">
            Todavía no está cargado. Entra solo desde GHL cuando el cliente lo completa: se trae
            con el botón <em>Traer de GHL</em> de la pantalla de fuentes.
          </p>
        </Card>
      ) : (
        bloques.map((b) => (
          <Card key={b.titulo} className="mb-4">
            <SectionTitle>{b.titulo}</SectionTitle>
            <div className="space-y-4">
              {b.lineas.map((l, i) => (
                <div key={i}>
                  <p className="text-[12.5px] font-medium text-ink-2">{l.pregunta}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-relaxed">
                    {l.respuesta}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function Dato({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-[12px] text-ink-3">{rotulo}</dt>
      <dd className="mt-0.5 font-medium">{valor}</dd>
      {nota && <dd className="text-[12px] text-ink-3">{nota}</dd>}
    </div>
  );
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Card, Chip, SectionTitle } from '@/components/ui';
import { RESPONSABLE_LABEL } from '@/domain/atribucion';
import { BLOQUE_LABEL } from '@/domain/expediente';
import { formatDate } from '@/lib/date';

export const metadata = { title: 'Preparar sesión · Founders Brain' };

/**
 * Una página imprimible que se genera con un botón. No permite una reunión que
 * termine sólo en conversación: obliga a que salga una decisión.
 */
export default async function PrepararPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx, embudo, indice, atribucion, guion } = v;
  const compromisoAnterior = ctx.registros.compromisos
    .filter((c) => c.fechaVencimiento <= ws.hoy)
    .sort((a, b) => b.fechaVencimiento.localeCompare(a.fechaVencimiento))[0];

  const preguntas = construirPreguntas(v);
  const faltantes = Object.entries(ctx.bloques).filter(([, ok]) => !ok).map(([k]) => BLOQUE_LABEL[k as keyof typeof BLOQUE_LABEL]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {ctx.cliente.nombre}</Link>
      </div>

      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Preparar sesión</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {ctx.cliente.nombre} · día {ctx.dia} · fase {ctx.fase} · índice {indice.valor}
        </p>
      </header>

      {compromisoAnterior && (
        <Card className="mb-4">
          <SectionTitle hint="Arriba de todo, siempre">Compromiso de la sesión anterior</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px]">{compromisoAnterior.descripcion}</span>
            <Chip tone={compromisoAnterior.estado === 'cumplido' ? 'good' : compromisoAnterior.estado === 'no_cumplido' ? 'critical' : 'warning'}>
              {compromisoAnterior.estado === 'pendiente' && compromisoAnterior.fechaVencimiento < ws.hoy
                ? 'vencido sin cerrar'
                : compromisoAnterior.estado}
            </Chip>
            <span className="ml-auto text-[12px] text-ink-3">vencía {formatDate(compromisoAnterior.fechaVencimiento)}</span>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            Abrir la sesión repasando esto. Una sesión que abre sin repasar el compromiso anterior es
            una alerta de proceso por sí sola.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <SectionTitle
          hint={guion.usable ? 'Nuestro lado está al día' : 'Antes de pedirle nada al cliente'}
        >
          ¿Es el cliente o somos nosotros?
        </SectionTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            tone={
              ['nosotros', 'ambos'].includes(atribucion.responsable)
                ? 'critical'
                : atribucion.responsable === 'cliente'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {RESPONSABLE_LABEL[atribucion.responsable]}
          </Chip>
          <span className="text-[13px] text-ink-2">{atribucion.titular}</span>
        </div>
        {!guion.usable ? (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--critical-ink)' }}>
            El guion de confrontación no se usa en esta sesión. {guion.motivoNoUsable}
          </p>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg border border-line bg-surface-2/60 p-3 text-[13px] leading-relaxed">
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              Guion de confrontación
            </div>
            <p><strong className="font-medium">Lo acordado:</strong> {guion.acordado}</p>
            {guion.falta.length > 0 && (
              <div>
                <strong className="font-medium">Lo que debería estar y no está:</strong>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
                  {guion.falta.slice(0, 4).map((f) => <li key={f}>{f}</li>)}
                </ul>
              </div>
            )}
            <p><strong className="font-medium">Lo que le toca:</strong> {guion.pedidoSemana}</p>
            <p className="text-ink-3">{guion.cierre}</p>
          </div>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle>Objetivo de la sesión</SectionTitle>
        <p className="text-[15px] font-medium leading-relaxed">
          {embudo.eslabon === 'entrega'
            ? 'Recuperar el contacto y volver a la cadencia semanal.'
            : `Mover ${embudo.titulo.toLowerCase()} y salir con una decisión tomada.`}
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle hint="Lo que el sistema puede afirmar hoy">Diagnóstico actual</SectionTitle>
        <p className="text-[13.5px] leading-relaxed">{embudo.evidencia}</p>
        <p className="mt-2 text-[13px]"><strong className="font-medium">Acción propuesta:</strong> {embudo.accion}</p>
        <p className="mt-1 text-[13px]" style={{ color: 'var(--critical-ink)' }}>
          <strong className="font-medium">Qué no hacer:</strong> {embudo.queNoHacer}
        </p>
        {indice.motores.length > 0 && (
          <ul className="mt-3 space-y-1 text-[12.5px] text-ink-2">
            {indice.motores.map((m) => <li key={m}>· {m}</li>)}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <SectionTitle hint="Las que mayor información producirían en esta sesión">Cinco preguntas</SectionTitle>
        <ol className="list-decimal space-y-2 pl-5 text-[13.5px] leading-relaxed">
          {preguntas.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </Card>

      <Card className="mb-4">
        <SectionTitle>La decisión que tiene que salir de la sesión</SectionTitle>
        <p className="text-[13.5px] leading-relaxed">
          {embudo.concluyente
            ? `Si se ataca ${embudo.titulo.toLowerCase()}: qué cambia exactamente esta semana, quién lo hace y cómo lo vamos a medir el ${formatDate(ws.hoy)} + 7.`
            : 'Con qué muestra se va a decidir. No se cambia estrategia sobre dos llamadas.'}
        </p>
      </Card>

      <Card className="mb-4">
        <SectionTitle hint="Los próximos 7 días">Próximo sprint</SectionTitle>
        <ul className="space-y-1.5 text-[13.5px]">
          <li>· {embudo.accion}</li>
          {ctx.kpiSemanal && <li>· Sostener {ctx.kpiSemanal.dms} DMs y {ctx.kpiSemanal.agendas} agendas esta semana.</li>}
          {faltantes.length > 0 && <li>· Completar el bloque de {faltantes[0].toLowerCase()} del expediente.</li>}
        </ul>
        <p className="mt-2 text-[12px] text-ink-3">Máximo tres. Nunca 25 recomendaciones simultáneas.</p>
      </Card>

      <p className="text-[12px] text-ink-3">
        Esta página está pensada para imprimirse o abrirse al lado de la llamada. No se guarda nada:
        se genera cada vez con el estado del expediente.
      </p>
    </div>
  );
}

function construirPreguntas(v: Awaited<ReturnType<typeof getWorkspace>>['vistas'][number]): string[] {
  const { ctx, embudo } = v;
  const q: string[] = [];

  if (!ctx.cliente.horasRealesSemana) {
    q.push('¿Cuántas horas por semana tenés realmente para esto? (No las del pitch: las reales.)');
  }
  if (!ctx.objetivo) {
    q.push('¿Cuál es tu meta de facturación mensual y con qué ticket pensás llegar? Hacemos la cuenta inversa acá mismo.');
  }
  switch (embudo.eslabon) {
    case 'cliente':
    case 'problema':
      q.push('Describime al último buen cliente que tuviste: ¿qué le pasaba cuando te contrató?');
      q.push('¿Qué mercados tenés abiertos hoy y cuál cerramos esta semana?');
      break;
    case 'oferta':
    case 'promesa':
      q.push('Explicame tu oferta en 30 segundos, en voz alta, sin leer.');
      q.push('¿Qué resultado concreto compra el cliente, y en cuánto tiempo?');
      break;
    case 'mensaje':
    case 'lead':
      q.push('Mostrame los últimos diez chats: ¿en qué punto exacto se caen?');
      q.push('¿Qué tipo de persona se sentiría profundamente identificada con lo que estás publicando?');
      break;
    case 'canal':
      q.push('¿Cuántas conversaciones abriste esta semana y en qué momento del día las hacés?');
      q.push('¿Qué te frena a llegar al número acordado: tiempo, incomodidad o no saber a quién escribirle?');
      break;
    case 'setting':
      q.push('¿Cómo estás proponiendo la llamada? Decime la frase exacta que usás.');
      q.push('¿Confirmás la reunión antes? ¿Con cuánta anticipación agendás?');
      break;
    case 'venta':
      q.push('Escuchemos los primeros cinco minutos de tu última llamada. ¿Cuánto hablaste vos?');
      q.push('¿Qué objeción aparece siempre y qué respondés hoy?');
      break;
    case 'entrega':
      q.push('¿Qué pasó estas semanas? Necesito entender antes de proponerte nada.');
      q.push('¿Qué necesitás para sostener la cadencia semanal?');
      break;
    default:
      q.push('¿Qué de lo que hicimos este mes te movió la aguja de verdad?');
      q.push('¿Qué te está costando sostener?');
  }
  q.push('Si sólo pudiéramos resolver una cosa esta semana, ¿cuál elegirías vos y por qué?');
  return q.slice(0, 5);
}

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Diagnostico } from '@/components/Diagnostico';
import { borradorLocal, construirPromptDiagnostico } from '@/domain/motores/diagnostico';
import { BLOQUEO_LABEL } from '@/domain/fases';
import { BLOQUE_COMO_LLENAR, BLOQUE_LABEL } from '@/domain/expediente';
import { Chip } from '@/components/ui';
import { formatDate } from '@/lib/date';

export const metadata = { title: 'Diagnóstico · Founders Brain' };

export default async function DiagnosticoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx } = v;
  const payload = borradorLocal(ctx, v.alertas);
  const { system, user, version } = construirPromptDiagnostico(ctx, v.alertas);
  const prompt = [
    '### SYSTEM · constitución del rol (recortada acá para la vista; se envía completa)',
    system[0].slice(0, 1200) + '\n[…]',
    '',
    '### SYSTEM · prompt del motor',
    system[1],
    '',
    '### USER',
    user.join('\n\n'),
  ].join('\n');

  const faltantes = Object.entries(ctx.bloques)
    .filter(([, ok]) => !ok)
    .map(([k]) => `${BLOQUE_LABEL[k as keyof typeof BLOQUE_LABEL]}: ${BLOQUE_COMO_LLENAR[k as keyof typeof BLOQUE_COMO_LLENAR]}`);

  const previos = ctx.registros.diagnosticos;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {ctx.cliente.nombre}</Link>
      </div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Diagnóstico</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
          {ctx.cliente.nombre} · día {ctx.dia}
          <Chip tone="neutral">expediente {ctx.bloquesCargados}/6</Chip>
          <Chip tone="neutral">prompt {version}</Chip>
        </p>
      </header>

      <Diagnostico
        payload={payload}
        prompt={prompt}
        bloqueos={Object.entries(BLOQUEO_LABEL).map(([v2, l]) => ({ v: v2, l }))}
        habilitado={ctx.habilitaDiagnostico}
        faltantes={faltantes}
        conectado={false}
      />

      {previos.length > 0 && (
        <section className="mt-6 rounded-xl border border-line bg-surface p-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Diagnósticos anteriores
          </h2>
          <ul className="mt-2 space-y-2 text-[12.5px]">
            {previos.map((d) => (
              <li key={d.id} className="rounded-lg border border-line px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{formatDate(d.createdAt)}</span>
                  <Chip tone="neutral">{d.tipoBloqueo}</Chip>
                  <Chip tone={d.coincidio ? 'good' : 'serious'}>
                    {d.coincidio ? 'coincidió con la consultora' : 'se separaron'}
                  </Chip>
                </div>
                <p className="mt-1 text-ink-2">{d.cuelloBotella}</p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] text-ink-3">
            La tasa de acierto por consultora sale de acá. Es el dato de management que hoy no existe
            en ningún lado.
          </p>
        </section>
      )}
    </div>
  );
}

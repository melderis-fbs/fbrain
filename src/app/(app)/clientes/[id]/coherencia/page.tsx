import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { Coherencia } from '@/components/Coherencia';
import { PROMPT_COHERENCIA_A, PROMPT_COHERENCIA_B } from '@/domain/motores/otros';

export const metadata = { title: 'Test de coherencia · Founders Brain' };

export default async function CoherenciaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const e = v.ctx.estrategia;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {v.ctx.cliente.nombre}</Link>
      </div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Test de coherencia</h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-ink-2">
          Resuelve el problema más frecuente de la cartera: el cliente comunica y le llega otro tipo
          de cliente. Primero leemos el material a ciegas; recién después miramos qué dice la
          estrategia.
        </p>
      </header>

      <Coherencia
        clienteIdeal={e?.clienteIdeal}
        precio={e?.precio}
        moneda={e?.moneda}
        promptA={PROMPT_COHERENCIA_A}
        promptB={PROMPT_COHERENCIA_B}
      />
    </div>
  );
}

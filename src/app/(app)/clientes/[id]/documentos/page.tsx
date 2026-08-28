import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Documentos } from '@/components/Documentos';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { borrarDocumento, subirDocumento } from './actions';

export const metadata = { title: 'Documentos · Founders Brain' };

export default async function DocumentosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:border-accent">← {v.ctx.cliente.nombre}</Link>
      </div>

      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight">Documentos</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Todo lo que tengas del cliente: la llamada de venta, el formulario de onboarding, las
          transcripciones. <strong>El diagnóstico y el chat leen esto</strong>, así que lo que se
          carga acá es lo que hace que el motor hable de este caso y no de un negocio genérico.
        </p>
      </div>

      <Documentos
        clienteId={id}
        documentos={v.ctx.registros.documentos}
        hoy={ws.hoy}
        subir={subirDocumento}
        borrar={borrarDocumento}
      />
    </div>
  );
}

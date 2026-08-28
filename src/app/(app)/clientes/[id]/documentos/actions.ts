'use server';

import { redirect } from 'next/navigation';
import { nuevoId } from '@/lib/id';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import type { DocumentoCliente, TipoDocumento } from '@/domain/types';

async function permiso(clienteId: string) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(clienteId);
  if (!v) throw new Error('Cliente inexistente.');
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');
  return { usuario, v };
}

/**
 * Un documento sin contenido no es un documento, y uno sin fecha no se puede
 * ordenar contra la línea de tiempo del caso. Las dos cosas se piden acá y no
 * se completan solas: la fecha de carga no es la fecha del hecho.
 */
export async function subirDocumento(clienteId: string, formData: FormData) {
  const { usuario } = await permiso(clienteId);

  const contenido = String(formData.get('contenido') ?? '').trim();
  const titulo = String(formData.get('titulo') ?? '').trim();
  const fecha = String(formData.get('fecha') ?? '').trim();
  if (contenido.length < 20) return { ok: false as const, error: 'El documento está vacío o es demasiado corto.' };
  if (!titulo) return { ok: false as const, error: 'Ponele un título: después hay que poder encontrarlo.' };
  if (!fecha) return { ok: false as const, error: 'Falta la fecha del documento. La de carga no sirve: una transcripción es de su sesión.' };

  const doc: DocumentoCliente = {
    id: nuevoId(),
    clienteId,
    tipo: (String(formData.get('tipo') ?? 'otro') as TipoDocumento),
    titulo,
    contenido,
    fecha,
    subidoPor: usuario.id,
    creadoAt: hoyIso(),
    archivo: String(formData.get('archivo') ?? '') || undefined,
  };

  await getRepo().guardarDocumento(doc);
  revalidatePath(`/clientes/${clienteId}/documentos`);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true as const, id: doc.id };
}

export async function borrarDocumento(clienteId: string, id: string) {
  await permiso(clienteId);
  await getRepo().borrarDocumento(id);
  revalidatePath(`/clientes/${clienteId}/documentos`);
  revalidatePath(`/clientes/${clienteId}`);
}

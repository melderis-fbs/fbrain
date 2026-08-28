'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getUsuario, veTodo } from '@/server/auth';
import { hoyIso } from '@/server/workspace';
import { sincronizar, type Reporte } from '@/server/planilla';

/**
 * Sincronizar es de administración. No por celo: una consultora que dispara
 * una importación puede reescribir la cartera entera de otras seis, y eso es
 * exactamente el tipo de accidente que hace que un equipo deje de confiar en
 * la app la primera semana.
 */
export async function sincronizarAhora(): Promise<Reporte> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const reporte = await sincronizar(hoyIso());
  revalidatePath('/cartera');
  revalidatePath('/grilla');
  revalidatePath('/planilla');
  return reporte;
}

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getUsuario, veTodo } from '@/server/auth';
import { hoyIso } from '@/server/workspace';
import { sincronizar, type Reporte } from '@/server/planilla';
import { sincronizarNotion } from '@/server/notion';
import { sincronizarDrive } from '@/server/drive-sync';

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

/**
 * Notion se corre después de la planilla, y el orden importa: las dos fuentes
 * comparten el estado del cliente y la fecha de alta, y la que manda en eso es
 * Notion, porque es donde el equipo lo mantiene al día.
 */
export async function sincronizarNotionAhora(): Promise<Reporte> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const reporte = await sincronizarNotion(hoyIso());
  revalidatePath('/cartera');
  revalidatePath('/grilla');
  revalidatePath('/mis-clientes');
  revalidatePath('/planilla');
  return reporte;
}

/**
 * Drive va tercero y no es casual: la carpeta de cada cliente la trae Notion,
 * así que sin Notion corrido antes no hay a dónde ir a buscar.
 *
 * Cada corrida toma una tanda de clientes —los que menos documentos tienen— y
 * lo ya traído no se vuelve a bajar. Se aprieta el botón varias veces hasta
 * que el reporte deja de avisar que quedaron clientes por procesar.
 */
export async function sincronizarDriveAhora(): Promise<Reporte> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const reporte = await sincronizarDrive(hoyIso());
  revalidatePath('/cartera');
  revalidatePath('/planilla');
  return reporte;
}

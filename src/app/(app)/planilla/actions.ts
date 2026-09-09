'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getUsuario, veTodo } from '@/server/auth';
import { hoyIso } from '@/server/workspace';
import { sincronizar, type Reporte } from '@/server/planilla';
import { sincronizarDrive } from '@/server/drive-sync';
import { proponerFichas } from '@/server/ficha-masiva';

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
 * Cada cliente declara su carpeta en su ficha; sin eso no hay a dónde ir a
 * buscar, y la corrida lo dice con nombre y apellido.
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

/**
 * El extractor, sobre toda la cartera.
 *
 * Va cuarto porque lee los documentos: primero tienen que estar cargados, de
 * Drive o subidos a mano. No escribe ninguna ficha — deja un borrador por
 * cliente que la consultora ve al abrir la ficha y decide.
 */
export async function proponerFichasAhora(): Promise<Reporte> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const reporte = await proponerFichas(hoyIso());
  revalidatePath('/cartera');
  revalidatePath('/planilla');
  return reporte;
}

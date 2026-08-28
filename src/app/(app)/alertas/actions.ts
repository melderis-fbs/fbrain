'use server';

import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { puedeCerrar, validarCierre } from '@/domain/alertas';
import { getUsuario } from '@/server/auth';
import { alertaPorId, getWorkspace, hoyIso } from '@/server/workspace';

export interface EstadoCierre {
  ok: boolean;
  error?: string;
}

/**
 * Cerrar una alerta es escribir qué se hizo. Nunca "marcar como resuelto".
 * Las dos validaciones de Brain se aplican acá y también en la base:
 * texto mínimo y quién puede cerrar una roja.
 */
export async function cerrarAlerta(
  _previo: EstadoCierre | null,
  formData: FormData,
): Promise<EstadoCierre> {
  const usuario = await getUsuario();
  if (!usuario) return { ok: false, error: 'Sesión vencida.' };

  const alertaId = String(formData.get('alertaId') ?? '');
  const texto = String(formData.get('texto') ?? '');

  const validacion = validarCierre(texto);
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const ws = await getWorkspace();
  const encontrada = alertaPorId(ws, alertaId);
  if (!encontrada) return { ok: false, error: 'No se encontró la alerta.' };

  const permiso = puedeCerrar(
    encontrada.alerta,
    usuario.id,
    usuario.rol,
    encontrada.vista.ctx.cliente.consultoraId,
  );
  if (!permiso.puede) return { ok: false, error: permiso.motivo };

  await getRepo().cerrarAlerta({ alertaId, texto: texto.trim(), cerradaPor: usuario.id }, hoyIso());
  revalidatePath('/alertas');
  revalidatePath(`/clientes/${encontrada.vista.ctx.cliente.id}`);
  return { ok: true };
}

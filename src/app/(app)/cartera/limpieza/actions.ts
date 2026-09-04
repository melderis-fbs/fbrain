'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import type { Baja, EstadoCliente, MotivoBaja } from '@/domain/types';

/**
 * Dar de baja a varios de una vez.
 *
 * Es de administración y no por celo: baja sesenta clientes de un click. Pero
 * tampoco es destructivo — el cliente no se borra, cambia de estado y queda
 * una fila de baja con la fecha, el motivo y quién la firmó. Si mañana alguien
 * se dio cuenta de que uno seguía activo, se corrige desde su ficha y la baja
 * queda igual en el historial, que es como tiene que ser: lo que pasó, pasó.
 */
export async function darDeBajaEnLote(
  ids: string[],
  motivo: MotivoBaja,
): Promise<{ ok: true; bajas: number } | { ok: false; error: string }> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  if (!ids.length) return { ok: false, error: 'No seleccionaste ninguno.' };

  const ws = await getWorkspace();
  const repo = getRepo();
  const hoy = hoyIso();

  /**
   * Fin de programa es «finalizó», el resto es «perdido». La diferencia no es
   * de vocabulario: la retención se mide contra los que se fueron antes de
   * terminar, y meter ahí a los que completaron el programa hace ver una
   * mortandad que no existe.
   */
  const estado: EstadoCliente = motivo === 'fin_programa' ? 'finalizado' : 'perdido';

  let bajas = 0;
  const fallaron: string[] = [];

  for (const id of ids) {
    const v = ws.porId.get(id);
    if (!v) continue;
    try {
      const baja: Baja = {
        id: nuevoId(),
        clienteId: id,
        fecha: hoy,
        motivo,
        solicitadaPor: 'founders',
        pidioReembolso: false,
        nota: 'Baja en lote desde la limpieza de cartera.',
        pasos: [],
      };
      await repo.guardarBaja(baja);
      await repo.guardarCliente({ ...v.ctx.cliente, estado });
      bajas++;
    } catch (e) {
      fallaron.push(`${v.ctx.cliente.nombre}: ${e instanceof Error ? e.message : 'error'}`);
    }
  }

  revalidatePath('/cartera');
  revalidatePath('/cartera/limpieza');
  revalidatePath('/alertas');
  revalidatePath('/grilla');
  revalidatePath('/mis-clientes');

  // Que algunas hayan entrado y otras no es peor que un fallo entero: hay que
  // decir exactamente cuántas y cuáles, o la próxima corrida las duplica.
  if (fallaron.length) {
    return { ok: false, error: `Se dieron de baja ${bajas}. Fallaron ${fallaron.length}: ${fallaron.slice(0, 3).join(' · ')}` };
  }
  return { ok: true, bajas };
}

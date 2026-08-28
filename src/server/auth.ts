import { cookies } from 'next/headers';
import { cache } from 'react';
import { getRepo } from '@/data';
import { clienteSupabase, haySupabase } from '@/data/supabase/client';
import type { Consultora } from '@/domain/types';
import { hoyIso } from './workspace';

export const COOKIE_SESION = 'brain_usuario';

/**
 * En producción la identidad viene de Supabase Auth y los permisos los aplica
 * Postgres con RLS: la app no filtra "por las dudas", filtra porque la base no
 * le devuelve otra cosa. En demostración se elige el usuario desde el login
 * para poder recorrer Brain con cada rol.
 */
export const getUsuario = cache(async (): Promise<Consultora | null> => {
  const store = await cookies();
  const repo = getRepo();

  if (repo.modo === 'supabase' && haySupabase()) {
    const sb = await clienteSupabase();
    const { data } = await sb.auth.getUser();
    if (!data.user) return null;
    const { data: fila } = await sb.from('consultoras').select('*').eq('auth_user_id', data.user.id).single();
    if (!fila) return null;
    return {
      id: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      rol: fila.rol,
      cupoMaximo: fila.cupo_maximo,
      aceptaNuevos: fila.acepta_nuevos,
      activa: fila.activa,
      color: fila.color ?? '#4a3aa7',
    };
  }

  const id = store.get(COOKIE_SESION)?.value;
  if (!id) return null;
  const d = await repo.cargarTodo(hoyIso());
  return d.equipo.find((c) => c.id === id) ?? null;
});

export const ROL_LABEL: Record<Consultora['rol'], string> = {
  consultora: 'Consultora',
  admin: 'Administración',
};

export function veTodo(rol: Consultora['rol']) {
  return rol === 'admin';
}

export function inicioDe(rol: Consultora['rol']) {
  return rol === 'admin' ? '/cartera' : '/mis-clientes';
}

import { cookies } from 'next/headers';
import { cache } from 'react';
import { getDataset, getRepo } from '@/data';
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

    /**
     * `getClaims` valida el token con la clave pública del proyecto, en
     * memoria. `getUser` hacía lo mismo preguntándole al servidor de auth: un
     * viaje de red por request, y el middleware ya había hecho otro igual
     * para refrescar la sesión. Tres viajes secuenciales antes de leer un solo
     * dato es lo que hacía que cada pantalla arrancara con medio segundo de
     * retraso.
     */
    const { data: claims } = await sb.auth.getClaims();
    const authUserId = claims?.claims?.sub;
    if (!authUserId) return null;

    // El equipo ya viene en la carga general del request, así que buscarlo
    // acá no cuesta una consulta más.
    const d = await getDataset(hoyIso());
    return d.equipo.find((c) => c.authUserId === authUserId) ?? null;
  }

  const id = store.get(COOKIE_SESION)?.value;
  if (!id) return null;
  const d = await getDataset(hoyIso());
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

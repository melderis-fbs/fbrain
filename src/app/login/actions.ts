'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getRepo } from '@/data';
import { clienteSupabase, haySupabase } from '@/data/supabase/client';
import { COOKIE_SESION, inicioDe } from '@/server/auth';
import { hoyIso } from '@/server/workspace';

/**
 * ENTRAR.
 *
 * En producción la identidad viene de Supabase Auth y los permisos los aplica
 * Postgres con RLS. En demostración se elige el usuario de una lista, para
 * poder recorrer Brain con cada rol sin levantar una base.
 *
 * Los dos caminos terminan igual: el rol decide en qué pantalla arranca cada
 * uno. Administración en la cartera, la consultora en sus clientes.
 */

export async function entrarConEmail(_previo: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Faltan el email o la contraseña.' };
  }

  const sb = await clienteSupabase();
  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    // El mensaje del SDK viene en inglés y es genérico a propósito, para no
    // revelar si el email existe. Se traduce sin agregar información.
    const msg = /invalid login credentials/i.test(error.message)
      ? 'Email o contraseña incorrectos.'
      : /email not confirmed/i.test(error.message)
        ? 'Ese usuario está sin confirmar. En Supabase, Authentication → Users, hay que crearlo con "Auto Confirm User" activado.'
        : error.message;
    return { error: msg };
  }

  // Autenticó, pero eso todavía no dice quién es dentro del equipo. Sin fila en
  // `consultoras` enlazada por `auth_user_id`, RLS no le devuelve nada y la app
  // se vería completamente vacía. Es mejor decirlo acá que dejarlo entrar a una
  // pantalla en blanco.
  const { data: usuario } = await sb.auth.getUser();
  const { data: fila } = await sb
    .from('consultoras')
    .select('rol')
    .eq('auth_user_id', usuario.user?.id ?? '')
    .maybeSingle();

  if (!fila) {
    await sb.auth.signOut();
    return {
      error:
        'Tu usuario existe pero no está enlazado con ninguna consultora. ' +
        'En el SQL Editor de Supabase falta correr el update que enlaza ' +
        '`consultoras.auth_user_id` con `auth.users`.',
    };
  }

  redirect(inicioDe(fila.rol));
}

/** El camino de la demostración: se elige a quién encarnar, sin contraseña. */
export async function entrarComoDemo(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  const store = await cookies();
  store.set(COOKIE_SESION, id, { path: '/', httpOnly: true, sameSite: 'lax' });

  const d = await getRepo().cargarTodo(hoyIso());
  const p = d.equipo.find((x) => x.id === id);
  redirect(p ? inicioDe(p.rol) : '/cartera');
}

export async function salir() {
  if (haySupabase()) {
    const sb = await clienteSupabase();
    await sb.auth.signOut();
  }
  const store = await cookies();
  store.delete(COOKIE_SESION);
  redirect('/login');
}

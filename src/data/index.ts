import { cache } from 'react';
import type { Repo } from './repo';
import { demoRepo } from './demo/repo';
import { haySupabase } from './supabase/client';
import { supabaseRepo } from './supabase/repo';

/**
 * Con credenciales de Supabase, Brain corre contra Postgres.
 * Sin credenciales, corre en modo demostración con la cartera generada.
 * Una sola línea de configuración separa los dos mundos.
 */
export function getRepo(): Repo {
  if (haySupabase() && process.env.NEXT_PUBLIC_MODO_DATOS !== 'demo') return supabaseRepo;
  return demoRepo;
}

/**
 * El dataset del request, cargado una sola vez.
 *
 * Antes lo pedían por separado `getUsuario` y `getWorkspace`, así que una
 * pantalla podía leer la base entera dos veces para mostrarse una. `cache` de
 * React memoiza por request: la segunda llamada devuelve la misma promesa, y
 * entre requests no se comparte nada — que es lo que hace falta, porque con
 * RLS cada usuario ve un conjunto distinto de filas.
 */
export const getDataset = cache((hoy: string) => getRepo().cargarTodo(hoy));

export type { Repo, Dataset } from './repo';

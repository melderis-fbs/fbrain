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

export type { Repo, Dataset } from './repo';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function haySupabase() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Cliente de servidor que respeta la sesión del usuario y, por lo tanto, RLS. */
export async function clienteSupabase() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Server Component: el middleware ya refresca la sesión.
          }
        },
      },
    },
  );
}

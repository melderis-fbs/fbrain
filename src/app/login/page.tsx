import { getRepo } from '@/data';
import { haySupabase } from '@/data/supabase/client';
import { ROL_LABEL } from '@/server/auth';
import { hoyIso } from '@/server/workspace';
import { Avatar } from '@/components/ui';
import { LoginForm } from '@/components/LoginForm';
import { entrarComoDemo } from './actions';

/**
 * Dos caminos según cómo esté configurada la app, y la pantalla lo dice:
 * con Supabase, email y contraseña; sin Supabase, se elige un rol de la lista
 * para poder recorrer Brain sin levantar una base.
 */
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const conectado = haySupabase();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="mb-8">
        <div className="mb-6 flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-white"
            style={{ background: 'var(--accent)' }}
          >
            B
          </div>
          <span className="text-[15px] font-semibold tracking-tight">FOUNDERS BRAIN</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          El expediente de cada cliente, las reglas que avisan antes de que se queje, y los motores
          de criterio del método.
        </p>
      </div>

      {conectado ? <LoginForm /> : <SelectorDemo />}

      <p className="mt-8 text-[12px] leading-relaxed text-ink-3">
        {conectado ? (
          <>
            La identidad la resuelve Supabase Auth y los permisos los aplica Postgres con RLS: cada
            consultora sólo ve sus clientes porque la base no le devuelve otra cosa.
          </>
        ) : (
          <>
            Modo demostración: elegís con qué rol entrar, sobre una cartera ficticia. Con
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code> y
            <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> cargadas, esta pantalla pasa
            sola a pedir email y contraseña.
          </>
        )}
      </p>
    </main>
  );
}

async function SelectorDemo() {
  const data = await getRepo().cargarTodo(hoyIso());

  return (
    <form action={entrarComoDemo} className="space-y-2">
      {data.equipo.map((p) => (
        <button
          key={p.id}
          name="id"
          value={p.id}
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-left transition hover:border-accent"
        >
          <Avatar persona={p} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">{p.nombre}</span>
            <span className="block text-[12px] text-ink-3">
              {ROL_LABEL[p.rol]}
              {p.rol === 'consultora' ? ` · cupo ${p.cupoMaximo}` : ''}
            </span>
          </span>
          <span className="text-[12px] text-ink-3">→</span>
        </button>
      ))}
    </form>
  );
}

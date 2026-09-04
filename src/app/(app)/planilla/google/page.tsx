import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { modoDrive } from '@/server/drive';

export const metadata = { title: 'Conectar Drive · Founders Brain' };

/**
 * La conexión con Drive, sin cuenta de servicio.
 *
 * Existe porque la política de Google de Founders bloquea las claves de cuenta
 * de servicio. Acá la app entra con la cuenta de una persona —que ya ve todas
 * las carpetas—, así que no hay clave que bloquear ni carpetas que compartir.
 */
export default async function GooglePage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  const redirectUri = `${proto}://${host}/planilla/google/callback`;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID ?? '';
  const modo = modoDrive();

  const autorizar =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      // `offline` es lo que hace que Google entregue un refresh token, y
      // `consent` fuerza la pantalla de permisos: sin eso, en el segundo
      // intento Google devuelve un access token sin refresh y no sirve.
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href="/planilla" className="hover:border-accent">← Las fuentes</Link>
      </div>

      <h1 className="text-[22px] font-semibold tracking-tight">Conectar Drive con tu cuenta</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Sirve cuando la cuenta de servicio no se puede: Google bloquea por defecto la creación de
        claves en las organizaciones nuevas, y en Founders esa política está puesta. Acá la app
        entra con <strong>tu propia cuenta</strong>, que ya ve todas las carpetas — no hay clave que
        la política pueda bloquear y no hay que compartirle nada a nadie.
      </p>

      {modo !== 'sin_conectar' && (
        <p className="mt-4 rounded-lg border px-3 py-2 text-[12.5px]" style={{ borderColor: 'var(--good)', background: 'var(--good-soft)', color: 'var(--good-ink)' }}>
          Drive ya está conectado{modo === 'oauth' ? ' con una cuenta de Google' : ' con una cuenta de servicio'}.
          Sólo hacé lo de abajo si querés reemplazar la conexión.
        </p>
      )}

      <section className="mt-5 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">1 · Crear las credenciales, una sola vez</h2>
        <ol className="mt-2 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
          <li>
            <strong>1.</strong> En{' '}
            <a className="underline decoration-line hover:decoration-ink-2" href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noreferrer">
              Pantalla de consentimiento
            </a>
            , elegí <strong>Interno</strong>. Interno es la palabra importante: la app queda
            disponible sólo para cuentas de Founders y <strong>la autorización no vence</strong>.
            Nombre de la app: <code>Founders Brain</code>. Guardar.
          </li>
          <li>
            <strong>2.</strong> En{' '}
            <a className="underline decoration-line hover:decoration-ink-2" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">
              Credenciales
            </a>{' '}
            → <em>Crear credenciales → ID de cliente de OAuth</em> → tipo{' '}
            <strong>Aplicación web</strong>.
          </li>
          <li>
            <strong>3.</strong> En <em>URI de redireccionamiento autorizados</em>, agregá esta,
            exacta:
            <code className="mt-1 block select-all rounded-lg bg-surface-2 px-2 py-1.5 text-[11.5px]">
              {redirectUri}
            </code>
          </li>
          <li>
            <strong>4.</strong> Copiá el <em>ID de cliente</em> y el <em>secreto</em> y ponelos en
            Vercel como <code>GOOGLE_OAUTH_CLIENT_ID</code> y{' '}
            <code>GOOGLE_OAUTH_CLIENT_SECRET</code>. <strong>Redeployá</strong> y volvé a esta
            pantalla.
          </li>
        </ol>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          El secreto no lleva <code>NEXT_PUBLIC_</code>. Ese prefijo lo mandaría al navegador de
          cualquiera que abra la app.
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">2 · Autorizar</h2>
        {clientId ? (
          <>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              Google va a pedirte permiso para <strong>ver</strong> tu Drive. La app no puede
              escribir ni borrar nada: el permiso que pide es de sólo lectura. Al volver te va a
              mostrar un código para pegar en Vercel.
            </p>
            <a
              href={autorizar}
              className="mt-3 inline-block rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
              style={{ background: 'var(--accent)' }}
            >
              Autorizar con Google
            </a>
          </>
        ) : (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">
            Falta <code>GOOGLE_OAUTH_CLIENT_ID</code> en el entorno. Hacé el paso 1, redeployá y
            volvé: el botón aparece solo.
          </p>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">3 · Pegar el último valor</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          La pantalla de vuelta te muestra un <strong>refresh token</strong>. Va en Vercel como{' '}
          <code>GOOGLE_OAUTH_REFRESH_TOKEN</code>, y después un redeploy más. Con eso Drive queda
          conectado y el botón <em>Traer de Drive</em> empieza a funcionar.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
          Ese token da acceso de sólo lectura a tu Drive y no vence. Si alguna vez hay que cortarlo,
          se revoca en{' '}
          <a className="underline decoration-line hover:decoration-ink-2" href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            tu cuenta de Google → Aplicaciones con acceso
          </a>
          , y se saca uno nuevo desde acá.
        </p>
      </section>
    </div>
  );
}

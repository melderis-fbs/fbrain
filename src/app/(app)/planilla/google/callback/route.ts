import { NextResponse, type NextRequest } from 'next/server';
import { redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';

/**
 * La vuelta de Google con el código, y el canje por el refresh token.
 *
 * El token se muestra en pantalla una sola vez para que se pegue en Vercel. No
 * se guarda en la base a propósito: sería un secreto más viviendo en un lugar
 * donde no vive ningún otro, y la app ya tiene un lugar para secretos —las
 * variables de entorno—. Es la misma decisión que con la key de Anthropic.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  const pagina = (titulo: string, cuerpo: string) =>
    new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>${titulo}</title>` +
        '<style>body{font:15px/1.6 system-ui,sans-serif;max-width:44rem;margin:8vh auto;padding:0 1.5rem;color:#1b1b1f}' +
        'code{font:13px ui-monospace,monospace;background:#f2f1f6;padding:.15em .35em;border-radius:4px}' +
        'pre{background:#f2f1f6;padding:1rem;border-radius:10px;overflow-x:auto;font:12px ui-monospace,monospace;user-select:all}' +
        'a{color:#4a3bd1}</style>' +
        `<h1 style="font-size:1.4rem">${titulo}</h1>${cuerpo}`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
    );

  if (error) {
    return pagina(
      'Google no autorizó',
      `<p>Devolvió <code>${error}</code>. Si dice <code>access_denied</code>, se canceló la pantalla de permisos. Volvé a empezar desde <a href="/planilla/google">/planilla/google</a>.</p>`,
    );
  }
  if (!code) return pagina('Falta el código', '<p>Google no mandó ningún código. Volvé a empezar desde <a href="/planilla/google">/planilla/google</a>.</p>');

  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secreto = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secreto) {
    return pagina('Faltan las credenciales', '<p>No están <code>GOOGLE_OAUTH_CLIENT_ID</code> y <code>GOOGLE_OAUTH_CLIENT_SECRET</code> en el entorno.</p>');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secreto,
      redirect_uri: `${url.origin}/planilla/google/callback`,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as {
    refresh_token?: string; error?: string; error_description?: string;
  };

  if (!res.ok || !json.refresh_token) {
    const detalle = json.error_description ?? json.error ?? String(res.status);
    return pagina(
      'No se pudo canjear el código',
      `<p>Google contestó: <code>${detalle}</code>.</p>` +
        '<p>Si dice <code>redirect_uri_mismatch</code>, en Google Cloud falta agregar esta URI exacta a las autorizadas:</p>' +
        `<pre>${url.origin}/planilla/google/callback</pre>` +
        '<p>Si no vino ningún <code>refresh_token</code>, es porque Google sólo lo entrega la primera vez que autorizás. Volvé a intentar desde <a href="/planilla/google">/planilla/google</a>: ese botón fuerza la pantalla de permisos otra vez.</p>',
    );
  }

  return pagina(
    'Listo. Copiá esto y pegalo en Vercel',
    '<p>Este es el <strong>refresh token</strong>. Copialo entero y ponelo en Vercel como la variable ' +
      '<code>GOOGLE_OAUTH_REFRESH_TOKEN</code>, tildada para Production. Después <strong>redeployá</strong>: ' +
      'una variable nueva no entra en un deploy que ya está corriendo.</p>' +
      `<pre>${json.refresh_token}</pre>` +
      '<p>Es una credencial: da acceso de <strong>sólo lectura</strong> a tu Drive y no vence. No la pegues en un chat ' +
      'ni en el repositorio. Si alguna vez se filtra, se revoca desde tu cuenta de Google en ' +
      '<a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">Aplicaciones con acceso</a> ' +
      'y se saca una nueva desde acá.</p>' +
      '<p>Cuando termines: <a href="/planilla">volver a Las fuentes</a> y apretar <em>Traer de Drive</em>.</p>',
  );
}

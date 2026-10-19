import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * EL CLIENTE DE SUPABASE PARA LOS AVISOS QUE LLEGAN DE AFUERA
 *
 * Un aviso de GHL no trae cookies: no hay sesión, `auth.uid()` es null, y las
 * políticas de `clientes` —`fn_es_admin() or consultora_id = fn_consultora_id()`—
 * descartan el insert. En silencio, porque el cliente de Supabase no lanza
 * excepciones: devuelve `{ error }`. Es exactamente el bug que arregló la
 * migración 0012, y volvería a pasar por otra puerta.
 *
 * La salida que NO se usa es la `service_role`: esa clave se saltea RLS
 * entera, y una clave así en una variable de entorno de Vercel es la llave
 * maestra de la cartera de 194 clientes.
 *
 * La salida que sí se usa es un **usuario de Supabase dedicado a la
 * integración**, con rol de administración en la tabla `consultoras`. El
 * endpoint inicia sesión con sus credenciales y escribe como ese usuario.
 * RLS queda intacta, las políticas son las mismas que para una persona, y las
 * altas quedan atribuidas a una identidad visible en vez de a nadie.
 *
 * Se crea una vez, a mano:
 *
 *   1. En Supabase → Authentication → Add user: un mail de la casa, por
 *      ejemplo `integracion-ghl@foundersbs.com`, con una contraseña larga.
 *   2. Una fila en `consultoras` con ese `auth_user_id`, `rol` de
 *      administración y `activa = false` —no es una persona y no debe
 *      aparecer para asignarle clientes.
 *   3. Las dos credenciales en el entorno del servidor. Nunca con prefijo
 *      `NEXT_PUBLIC_`: eso las publicaría en el navegador.
 */

export function hayIntegracion(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_INTEGRACION_EMAIL &&
      process.env.SUPABASE_INTEGRACION_PASSWORD,
  );
}

/**
 * Inicia sesión como el usuario de integración y devuelve su cliente.
 *
 * Sin persistencia de sesión: cada aviso es un request suelto y corto, y
 * guardar la sesión en un proceso que Vercel recicla no serviría de nada.
 */
export async function clienteDeIntegracion() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await sb.auth.signInWithPassword({
    email: process.env.SUPABASE_INTEGRACION_EMAIL!,
    password: process.env.SUPABASE_INTEGRACION_PASSWORD!,
  });
  if (error) {
    throw new Error(
      `El usuario de integración no pudo entrar a Supabase: ${error.message}. Revisá SUPABASE_INTEGRACION_EMAIL y SUPABASE_INTEGRACION_PASSWORD.`,
    );
  }
  return sb;
}

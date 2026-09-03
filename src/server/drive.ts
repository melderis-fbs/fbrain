import 'server-only';
import { createSign } from 'node:crypto';

/**
 * DRIVE · LEER LA CARPETA DE CADA CLIENTE
 *
 * Founders ya tiene las transcripciones: son los documentos que genera Gemini
 * después de cada sesión, guardados en la carpeta del cliente en Drive. Y
 * Notion ya sabe cuál es esa carpeta —lo dice la columna «carpeta automatica
 * de drive», llena en 104 de los 113 clientes activos—.
 *
 * Con esas dos cosas no hay nada que adivinar: la app abre la carpeta que
 * Notion indica y lo que encuentra adentro es de ese cliente. Es la diferencia
 * con deducir el cliente del título del documento —«Sesión 4 (Maria -
 * Angie)»—, que obligaría a apostar a que «Maria» es «Maria Bidegain».
 *
 * Sin esto, cargar el expediente de la cartera son cien copiar y pegar. Y sin
 * expediente cargado el diagnóstico no puede citar textual, que es lo que el
 * método exige antes de emitir cualquier cosa.
 */

const OAUTH = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';

/** Sólo lectura. La app no escribe en Drive ni tiene por qué poder. */
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export function hayDrive(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
}

type Credenciales = { client_email: string; private_key: string };

function credenciales(): Credenciales {
  const crudo = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ?? '';
  let json: Partial<Credenciales>;
  try {
    json = JSON.parse(crudo);
  } catch {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON no es un JSON válido. Tiene que ser el archivo completo que descarga Google al crear la clave de la cuenta de servicio, pegado tal cual.',
    );
  }
  if (!json.client_email || !json.private_key) {
    throw new Error('Al JSON de la cuenta de servicio le falta `client_email` o `private_key`.');
  }
  // Al pegar el JSON en un panel de variables, los saltos de línea de la clave
  // suelen quedar escapados. Sin esto la firma falla con un error de OpenSSL
  // que no dice nada sobre la causa real.
  return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, '\n') };
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Un token de acceso a partir de la cuenta de servicio.
 *
 * Se firma un JWT con la clave privada y Google lo canjea. Lo hace `crypto` de
 * Node, así que no hace falta ninguna librería con binarios nativos —que es
 * justamente lo que no se puede ejecutar en varios entornos de despliegue.
 */
async function token(): Promise<string> {
  const { client_email, private_key } = credenciales();
  const ahora = Math.floor(Date.now() / 1000);

  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(
    JSON.stringify({ iss: client_email, scope: SCOPE, aud: OAUTH, iat: ahora, exp: ahora + 3600 }),
  );

  const firma = createSign('RSA-SHA256').update(`${cabecera}.${cuerpo}`).sign(private_key);
  const jwt = `${cabecera}.${cuerpo}.${b64url(firma)}`;

  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google no aceptó las credenciales: ${json.error_description ?? json.error ?? res.status}. ` +
        'Si dice «invalid_grant», casi siempre es la clave privada mal pegada. Si dice que la API está deshabilitada, hay que habilitar Google Drive API en el proyecto de Google Cloud.',
    );
  }
  return json.access_token;
}

// ------------------------------------------------------------------ archivos

export type ArchivoDrive = {
  id: string;
  nombre: string;
  mimeType: string;
  modificado?: string;
};

/** Los tipos que sabemos convertir a texto. El resto se informa y se saltea. */
const EXPORTABLES = new Set([
  'application/vnd.google-apps.document',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

/**
 * Lo que hay en una carpeta, incluidas sus subcarpetas.
 *
 * Recursivo porque las carpetas de cliente suelen tener una por mes o por
 * módulo, y una transcripción en una subcarpeta es igual de válida. Con un
 * tope de profundidad, para que una carpeta con un atajo circular no cuelgue
 * la sincronización.
 */
export async function listarCarpeta(
  carpetaId: string,
  acceso?: string,
  profundidad = 0,
): Promise<ArchivoDrive[]> {
  const t = acceso ?? (await token());
  if (profundidad > 3) return [];

  const salida: ArchivoDrive[] = [];
  let cursor: string | undefined;

  do {
    const q = new URLSearchParams({
      q: `'${carpetaId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: '200',
      // Las carpetas de Founders viven en una unidad compartida: sin estos dos
      // parámetros la API contesta 200 con la lista vacía, que es el peor de
      // los errores porque parece que la carpeta no tiene nada.
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      ...(cursor ? { pageToken: cursor } : {}),
    });

    const res = await fetch(`${API}/files?${q}`, {
      headers: { Authorization: `Bearer ${t}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '');
      throw new Error(
        res.status === 404
          ? `Drive no encuentra la carpeta ${carpetaId}, o la cuenta de servicio no tiene permiso para verla. Hay que compartirle la carpeta al email de la cuenta de servicio, como se comparte con una persona.`
          : `Drive devolvió ${res.status} al listar la carpeta. ${cuerpo.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      files?: { id: string; name: string; mimeType: string; modifiedTime?: string }[];
      nextPageToken?: string;
    };

    for (const f of json.files ?? []) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        salida.push(...(await listarCarpeta(f.id, t, profundidad + 1)));
      } else {
        salida.push({ id: f.id, nombre: f.name, mimeType: f.mimeType, modificado: f.modifiedTime });
      }
    }
    cursor = json.nextPageToken;
  } while (cursor);

  return salida;
}

export const sePuedeLeer = (mimeType: string) => EXPORTABLES.has(mimeType);

/**
 * El texto de un archivo de Drive.
 *
 * Un documento de Google se exporta como texto plano; el resto se descarga y
 * se pasa por el mismo extractor que usa la subida a mano, para que un PDF
 * cargado desde Drive y uno cargado desde la ficha den el mismo resultado.
 */
export async function textoDeArchivo(a: ArchivoDrive, acceso?: string): Promise<string> {
  const t = acceso ?? (await token());

  if (a.mimeType === 'application/vnd.google-apps.document') {
    const res = await fetch(
      `${API}/files/${a.id}/export?mimeType=text/plain&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${t}` }, cache: 'no-store' },
    );
    if (!res.ok) throw new Error(`No se pudo exportar «${a.nombre}»: Drive devolvió ${res.status}.`);
    return (await res.text()).trim();
  }

  const res = await fetch(`${API}/files/${a.id}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${t}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`No se pudo bajar «${a.nombre}»: Drive devolvió ${res.status}.`);

  const { extraerTextoDeArchivo } = await import('./extraer-archivo');
  const r = await extraerTextoDeArchivo(a.nombre, await res.arrayBuffer());
  if (!r.ok) throw new Error(r.error);
  return r.texto;
}

/** Un solo token para toda la corrida, en vez de uno por archivo. */
export const tokenDeAcceso = token;

import 'server-only';
import mammoth from 'mammoth';
import { extractText, getDocumentProxy } from 'unpdf';

/**
 * SACAR EL TEXTO DE UN ARCHIVO
 *
 * Hasta ahora sólo entraban archivos de texto plano, y un PDF o un .docx había
 * que copiarlo y pegarlo a mano. El motivo era real pero ya no aplica: se
 * escribió cuando la app corría en WebContainer, donde no hay forma de ejecutar
 * estas librerías. En un servidor de Node corren sin problema.
 *
 * Importa porque lo que Founders tiene de sus clientes son justamente esos
 * formatos: las notas de sesión son documentos de Google, los contratos son
 * PDFs, el formulario de onboarding es un .docx. Obligar a copiar y pegar cada
 * uno es la clase de fricción que hace que nadie cargue nada, y sin documentos
 * el diagnóstico no puede citar textual — que es lo que el método exige.
 *
 * Esto extrae texto, no interpreta: lo que sale va a la pantalla para que la
 * consultora lo revise antes de guardarlo. Un PDF escaneado devuelve poco o
 * nada, y eso hay que decirlo en vez de guardar un documento vacío.
 */

/** 20 MB. Un contrato son 200 KB; arriba de esto es un escaneo o un video. */
const MAXIMO = 20 * 1024 * 1024;

export type Extraccion = { ok: true; texto: string; nota?: string } | { ok: false; error: string };

function extension(nombre: string): string {
  const i = nombre.lastIndexOf('.');
  return i < 0 ? '' : nombre.slice(i).toLowerCase();
}

/** Los que entran tal cual, sin extraer nada. */
const PLANOS = ['.txt', '.md', '.csv', '.vtt', '.srt', '.json', '.log'];

export const EXTENSIONES_ACEPTADAS = [...PLANOS, '.pdf', '.docx'].join(',');

export async function extraerTextoDeArchivo(nombre: string, datos: ArrayBuffer): Promise<Extraccion> {
  if (datos.byteLength > MAXIMO) {
    return { ok: false, error: `«${nombre}» pesa más de 20 MB. Si es un PDF escaneado, no hay texto que extraer: hay que pasarlo por un OCR antes.` };
  }

  const ext = extension(nombre);

  try {
    if (PLANOS.includes(ext)) {
      return { ok: true, texto: new TextDecoder().decode(datos) };
    }

    if (ext === '.pdf') {
      const pdf = await getDocumentProxy(new Uint8Array(datos));
      const { text, totalPages } = await extractText(pdf, { mergePages: true });
      const texto = (Array.isArray(text) ? text.join('\n\n') : text).trim();

      // Un PDF de imágenes no tiene capa de texto y devuelve casi nada. Es
      // mejor decirlo que guardar un documento vacío que después el motor
      // "lee" sin encontrar nada.
      if (texto.length < 40) {
        return {
          ok: false,
          error: `De «${nombre}» no salió texto (${totalPages} página${totalPages === 1 ? '' : 's'}). Casi seguro es un PDF escaneado, que es una imagen: no tiene texto adentro. Hay que pasarlo por un OCR, o copiar y pegar lo que diga.`,
        };
      }
      return { ok: true, texto, nota: `${totalPages} página${totalPages === 1 ? '' : 's'}` };
    }

    if (ext === '.docx') {
      const { value, messages } = await mammoth.extractRawText({ buffer: Buffer.from(datos) });
      const texto = value.trim();
      if (!texto) return { ok: false, error: `«${nombre}» no tiene texto adentro.` };
      // mammoth avisa de lo que no supo convertir. No es un fallo: es lo que
      // quedó afuera, y conviene que se sepa antes de firmar el documento.
      const perdido = messages.filter((m) => m.type === 'warning').length;
      return { ok: true, texto, nota: perdido ? `${perdido} elemento(s) del documento no se pudieron convertir` : undefined };
    }

    if (ext === '.doc') {
      return { ok: false, error: '.doc es el formato viejo de Word y no se puede leer. Abrilo y guardalo como .docx, o copiá y pegá el texto.' };
    }

    return { ok: false, error: `No sé leer «${ext || 'un archivo sin extensión'}». Entran ${EXTENSIONES_ACEPTADAS}, o el texto pegado a mano.` };
  } catch (e) {
    return { ok: false, error: `No se pudo leer «${nombre}»: ${e instanceof Error ? e.message : 'error desconocido'}. Si está protegido con contraseña, hay que sacársela primero.` };
  }
}

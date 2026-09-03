import 'server-only';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import { hayDrive, listarCarpeta, sePuedeLeer, textoDeArchivo, tokenDeAcceso, type ArchivoDrive } from './drive';
import type { DocumentoCliente, TipoDocumento } from '@/domain/types';
import type { Reporte, ReporteSolapa } from './planilla';

/**
 * TRAER LAS TRANSCRIPCIONES DE DRIVE
 *
 * Por cada cliente que tiene carpeta —la que trajo Notion— se lee lo que hay
 * adentro y se guarda como documento del expediente. Nada se adivina: el
 * documento es del cliente cuya carpeta lo contiene.
 *
 * Tres reglas, las mismas que las otras dos fuentes:
 *
 *  1. Se guarda el ID del archivo de Drive, así que volver a sincronizar trae
 *     sólo lo nuevo. Sin eso, la segunda corrida duplicaría el corpus entero
 *     y el diagnóstico citaría la misma frase tres veces como si fueran tres.
 *  2. Un archivo que no se puede leer se informa con su nombre y su motivo. No
 *     se guarda un documento vacío, porque un documento vacío es peor que
 *     ninguno: el motor lo lee y no encuentra nada.
 *  3. Lo que cargó una persona a mano no se toca.
 */

/** Cuántos clientes por corrida. Evita que un timeout deje todo a medias. */
const TOPE_CLIENTES = Number(process.env.DRIVE_CLIENTES_POR_CORRIDA) || 25;

/**
 * De qué tipo es el documento, según su nombre.
 *
 * No es adivinar el cliente —eso no se hace— sino clasificar el papel del
 * documento, que es reversible desde la pantalla y sirve para que el motor
 * sepa si está leyendo una llamada de venta o la sesión ocho.
 */
export function tipoPorNombre(nombre: string): TipoDocumento {
  const n = nombre.toLowerCase();
  if (/onboarding/.test(n)) return 'formulario_onboarding';
  if (/venta|closing|cierre/.test(n)) return 'llamada_venta';
  if (/contrato/.test(n)) return 'contrato';
  if (/sesi[oó]n|sync|mentor/.test(n)) return 'transcripcion';
  if (/reporte|informe/.test(n)) return 'reporte';
  return 'otro';
}

/**
 * La fecha del hecho, no la de la carga.
 *
 * Los títulos que genera Gemini la traen: «Sesión 4 (Maria - Angie):
 * 2026/06/26 16:30». Es la fecha de la sesión, y es la que importa: una
 * transcripción de junio cargada en septiembre sigue siendo de junio, y el
 * expediente se lee en orden cronológico.
 */
export function fechaPorNombre(nombre: string): string | undefined {
  const m =
    nombre.match(/(\d{4})[/-](\d{2})[/-](\d{2})/) ??
    nombre.match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (!m) return undefined;
  const [a, b, c] = m.slice(1);
  const iso = a.length === 4 ? `${a}-${b}-${c}` : `${c}-${b}-${a}`;
  return Number.isNaN(new Date(iso).getTime()) ? undefined : iso;
}

/** El título que se ve en el expediente, sin el ruido del generador. */
export function tituloLimpio(nombre: string): string {
  return nombre
    .replace(/\s*-\s*Notas de Gemini\s*$/i, '')
    .replace(/\s*GMT[+-]\d{2}:\d{2}\s*/i, ' ')
    .replace(/\.(pdf|docx|txt|md)$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function sincronizarDrive(hoy: string): Promise<Reporte> {
  const r: ReporteSolapa = { solapa: 'Transcripciones de Drive', leidas: 0, aplicadas: 0, salteadas: [] };

  if (!hayDrive()) {
    return {
      at: hoy,
      solapas: [{ ...r, error: 'Falta `GOOGLE_SERVICE_ACCOUNT_JSON` en el entorno.' }],
    };
  }

  const repo = getRepo();
  // Lectura directa, no `getDataset`: eso memoiza por request, y acá se
  // escribe y se vuelve a leer dentro del mismo request. Un snapshot viejo
  // haría que la corrida no vea lo que ella misma acaba de guardar.
  const dataset = await repo.cargarTodo(hoy);

  // Lo ya importado, por ID de archivo de Drive.
  const yaEstan = new Set(
    dataset.documentos.map((d) => d.archivo).filter((x): x is string => Boolean(x)),
  );

  const conCarpeta = dataset.clientes.filter((c) => c.driveFolderId);
  const sinCarpeta = dataset.clientes.filter((c) => !c.driveFolderId && c.estado === 'activo');

  if (!conCarpeta.length) {
    return {
      at: hoy,
      solapas: [{
        ...r,
        error:
          'Ningún cliente tiene carpeta de Drive registrada. La carpeta la trae Notion, de la columna «carpeta automatica de drive»: hay que sincronizar Notion primero.',
      }],
    };
  }

  try {
    const acceso = await tokenDeAcceso();

    // Primero los que menos documentos tienen: son los que más lo necesitan, y
    // así una corrida cortada por tiempo igual avanza donde más falta.
    const cuantosTiene = new Map<string, number>();
    for (const d of dataset.documentos) {
      cuantosTiene.set(d.clienteId, (cuantosTiene.get(d.clienteId) ?? 0) + 1);
    }
    const orden = [...conCarpeta].sort(
      (a, b) => (cuantosTiene.get(a.id) ?? 0) - (cuantosTiene.get(b.id) ?? 0),
    );
    const tanda = orden.slice(0, TOPE_CLIENTES);

    for (const cliente of tanda) {
      let archivos: ArchivoDrive[];
      try {
        archivos = await listarCarpeta(cliente.driveFolderId!, acceso);
      } catch (e) {
        r.salteadas.push({
          fila: 0,
          motivo: `«${cliente.nombre}»: ${e instanceof Error ? e.message : 'no se pudo leer la carpeta'}`,
        });
        continue;
      }

      r.leidas += archivos.length;

      for (const a of archivos) {
        if (yaEstan.has(a.id)) continue;

        if (!sePuedeLeer(a.mimeType)) {
          // Las grabaciones de video son la mitad de estas carpetas y no son un
          // error: es lo que la nota de texto ya resume.
          if (!a.mimeType.startsWith('video/') && !a.mimeType.startsWith('audio/')) {
            r.salteadas.push({ fila: 0, motivo: `«${cliente.nombre}» · ${a.nombre}: no sé leer ${a.mimeType}.` });
          }
          continue;
        }

        let texto: string;
        try {
          texto = await textoDeArchivo(a, acceso);
        } catch (e) {
          r.salteadas.push({ fila: 0, motivo: `«${cliente.nombre}» · ${a.nombre}: ${e instanceof Error ? e.message : 'no se pudo leer'}` });
          continue;
        }

        if (texto.length < 40) {
          r.salteadas.push({ fila: 0, motivo: `«${cliente.nombre}» · ${a.nombre}: no salió texto. Si es un PDF escaneado, es una imagen y hay que pasarlo por un OCR.` });
          continue;
        }

        const doc: DocumentoCliente = {
          id: nuevoId(),
          clienteId: cliente.id,
          tipo: tipoPorNombre(a.nombre),
          titulo: tituloLimpio(a.nombre),
          contenido: texto,
          fecha: fechaPorNombre(a.nombre) ?? (a.modificado ?? hoy).slice(0, 10),
          creadoAt: hoy,
          archivo: a.id,
        };
        await repo.guardarDocumento(doc);
        yaEstan.add(a.id);
        r.aplicadas++;
      }
    }

    if (orden.length > tanda.length) {
      r.restantes = orden.length - tanda.length;
      r.nota =
        `Se procesaron ${tanda.length} de ${orden.length} clientes con carpeta. ` +
        'Volvé a sincronizar para seguir: cada corrida arranca por los que tienen menos documentos, y lo ya traído no se vuelve a bajar.';
    }
    if (sinCarpeta.length) {
      r.salteadas.push({
        fila: 0,
        motivo: `${sinCarpeta.length} cliente(s) activos no tienen carpeta de Drive en Notion, así que no se les pudo traer nada. Se completa la columna «carpeta automatica de drive» y entran en la próxima corrida.`,
      });
    }
  } catch (e) {
    r.error = e instanceof Error ? e.message : 'Error desconocido.';
  }

  return { at: hoy, solapas: [r] };
}

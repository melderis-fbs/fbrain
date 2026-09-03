import 'server-only';
import { getRepo } from '@/data';
import { hayModelo } from './modelo';
import { extraerDeDocumentos } from './ficha-extractor';
import type { DocumentoCliente, PropuestaFicha } from '@/domain/types';
import type { Reporte, ReporteSolapa } from './planilla';

/**
 * LA FICHA, PROPUESTA DESDE LOS DOCUMENTOS
 *
 * El extractor ya existía, pero atado a un botón dentro de la ficha de un
 * cliente. Con 104 clientes eso son 104 vueltas, y por eso la cartera entera
 * quedaba con el expediente vacío mientras las transcripciones estaban ahí,
 * cargadas, sin que nadie las leyera.
 *
 * Esto lo corre sobre todos los clientes que tienen documentos y expediente
 * incompleto, y guarda el resultado como borrador.
 *
 * **No aplica nada.** La propuesta espera a que una persona la lea, y no es
 * prolijidad: la meta mensual y el ticket propuestos alimentan la cuenta
 * inversa y el KPI semanal de ese cliente. Un número mal deducido, aplicado
 * solo, deja de ser un dato flojo y se convierte en el objetivo que la
 * consultora persigue toda la semana.
 */

/**
 * Cuántos clientes por corrida.
 *
 * Bajo a propósito y en paralelo: cada cliente es una llamada al modelo de
 * decenas de segundos, y el tope de ejecución de una función serverless se
 * mide en segundos, no en minutos. La pantalla vuelve a llamar sola hasta
 * terminar, así que el número chico no cuesta clics — cuesta requests.
 */
const TOPE_CLIENTES = Number(process.env.FICHA_CLIENTES_POR_CORRIDA) || 4;

/**
 * Qué le falta al expediente de este cliente.
 *
 * Cuenta bloques ausentes, no campos: el extractor devuelve los cuatro
 * bloques de una vez, así que lo que importa es si hay alguno en cero. Sirve
 * también para ordenar la cola por necesidad.
 */
export function faltantes(
  clienteId: string,
  d: {
    negocios: { clienteId: string; queVende?: string }[];
    autoridades: { clienteId: string; haceExcepcionalmenteBien?: string }[];
    estrategias: { clienteId: string }[];
    objetivos: { clienteId: string }[];
  },
): number {
  let n = 0;
  if (!d.negocios.some((x) => x.clienteId === clienteId && x.queVende)) n++;
  if (!d.autoridades.some((x) => x.clienteId === clienteId && x.haceExcepcionalmenteBien)) n++;
  if (!d.estrategias.some((x) => x.clienteId === clienteId)) n++;
  if (!d.objetivos.some((x) => x.clienteId === clienteId)) n++;
  return n;
}

export async function proponerFichas(hoy: string): Promise<Reporte> {
  const r: ReporteSolapa = {
    solapa: 'Ficha propuesta desde los documentos',
    leidas: 0,
    aplicadas: 0,
    salteadas: [],
  };

  if (!hayModelo()) {
    return {
      at: hoy,
      solapas: [{ ...r, error: 'Falta `ANTHROPIC_API_KEY` en el entorno: sin modelo no hay nada que extraer.' }],
    };
  }

  const repo = getRepo();
  // Lectura directa y no `getDataset`: acá se escribe y se vuelve a leer
  // dentro del mismo request, y un snapshot memoizado no vería lo propio.
  const dataset = await repo.cargarTodo(hoy);

  const porCliente = new Map<string, DocumentoCliente[]>();
  for (const d of dataset.documentos) {
    const lista = porCliente.get(d.clienteId) ?? [];
    lista.push(d);
    porCliente.set(d.clienteId, lista);
  }

  const yaTienen = new Set(dataset.propuestas.map((p) => p.clienteId));

  const candidatos = dataset.clientes
    .filter((c) => (porCliente.get(c.id)?.length ?? 0) > 0)
    .filter((c) => !yaTienen.has(c.id))
    .map((c) => ({ cliente: c, falta: faltantes(c.id, dataset) }))
    .filter((x) => x.falta > 0);

  if (!candidatos.length) {
    const conDocumentos = porCliente.size;
    return {
      at: hoy,
      solapas: [{
        ...r,
        nota: conDocumentos
          ? `Los ${conDocumentos} clientes con documentos ya tienen su propuesta o su ficha completa. No hay nada que extraer.`
          : 'Ningún cliente tiene documentos cargados todavía. El extractor lee lo que hay en el expediente: primero entran los documentos —de Drive o subidos a mano— y después esto propone la ficha.',
      }],
    };
  }

  // Primero a los que más les falta, y entre esos a los que más documentos
  // tienen: una propuesta hecha sobre seis documentos vale más que una hecha
  // sobre uno, y así una corrida cortada avanza donde más rinde.
  const orden = candidatos.sort(
    (a, b) =>
      b.falta - a.falta ||
      (porCliente.get(b.cliente.id)?.length ?? 0) - (porCliente.get(a.cliente.id)?.length ?? 0),
  );
  const tanda = orden.slice(0, TOPE_CLIENTES);

  // En paralelo: son llamadas al modelo, no consultas a la base. Secuencial,
  // cuatro clientes tardarían cuatro veces más y el timeout llegaría antes.
  const resultados = await Promise.all(
    tanda.map(async ({ cliente }) => {
      const docs = (porCliente.get(cliente.id) ?? []).slice();
      try {
        const salida = await extraerDeDocumentos(docs);
        if (!salida.ok) {
          return { cliente, error: [salida.error, ...(salida.errores ?? [])].join(' · ') };
        }
        const propuesta: PropuestaFicha = {
          clienteId: cliente.id,
          datos: salida.ficha,
          // Cuántos leyó, no cuántos hay: el extractor de ficha se queda con
          // el arranque del caso, y decir «seis» cuando leyó dos sería mentir
          // sobre en qué se apoya la propuesta.
          documentos: salida.incluidos,
          motorVersion: 'ficha',
          creadoAt: hoy,
        };
        return { cliente, propuesta };
      } catch (e) {
        return { cliente, error: e instanceof Error ? e.message : 'falló la extracción' };
      }
    }),
  );

  for (const x of resultados) {
    r.leidas++;
    if ('propuesta' in x && x.propuesta) {
      // La escritura va secuencial y después de todas las llamadas: si algo
      // falla acá es la base, y conviene que el error salga con nombre propio.
      try {
        await repo.guardarPropuestaFicha(x.propuesta);
        r.aplicadas++;
      } catch (e) {
        r.salteadas.push({
          fila: 0,
          motivo: `«${x.cliente.nombre}»: la propuesta salió bien pero no se pudo guardar. ${e instanceof Error ? e.message : ''}`,
        });
      }
    } else {
      r.salteadas.push({ fila: 0, motivo: `«${x.cliente.nombre}»: ${x.error}` });
    }
  }

  const restantes = orden.length - tanda.length;
  if (restantes > 0) {
    r.restantes = restantes;
    r.nota =
      `Quedan ${restantes} clientes por leer. La pantalla sigue sola: cada corrida toma ${TOPE_CLIENTES}, ` +
      'arrancando por los que tienen el expediente más vacío.';
  }

  return { at: hoy, solapas: [r] };
}

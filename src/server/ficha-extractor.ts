import 'server-only';
import { fichaExtraidaSchema, PROMPT_FICHA, VERSION_FICHA } from '@/domain/motores/ficha';
import { correrMotor } from './modelo';
import { documentosParaFicha } from './contexto-documentos';
import type { DocumentoCliente } from '@/domain/types';

/**
 * EL EXTRACTOR DE FICHA, UNA SOLA VEZ
 *
 * Lo llaman tres lugares —el botón de la ficha, el texto pegado a mano y el
 * barrido de toda la cartera— y los tres tienen que leer lo mismo con el mismo
 * criterio. Cuando cada uno armaba su propio contexto, el botón mandaba el
 * expediente entero desde el navegador: cien mil palabras de ida, decenas de
 * segundos de espera, y una propuesta peor, porque el "cliente ideal" que
 * proponía salía de la última sesión y no del arranque.
 *
 * Dos decisiones de velocidad, las dos deliberadas:
 *
 *  - **Menos material.** Sólo el arranque del caso, con tope propio. Ver
 *    `documentosParaFicha`.
 *  - **Esfuerzo bajo.** Extraer no es razonar: es copiar lo que dice el
 *    documento y dejar vacío lo que no dice. El esfuerzo alto acá compra
 *    deliberación que no hace falta y se paga en segundos de espera.
 */

export type Extraido = Awaited<ReturnType<typeof correrFicha>>;

async function correrFicha(contexto: string) {
  const r = await correrMotor({
    motor: 'ficha',
    promptMotor: PROMPT_FICHA,
    contexto,
    schema: fichaExtraidaSchema,
    promptVersion: VERSION_FICHA,
    tipo: 'extraccion',
    esfuerzo: 'low',
  });
  if (!r.ok) return { ok: false as const, error: r.error, errores: r.errores };
  return { ok: true as const, ficha: r.datos, uso: r.uso };
}

/** El camino de pegar un documento a mano. */
export async function extraerDeTexto(texto: string) {
  const limpio = texto.trim();
  if (limpio.length < 50) {
    return {
      ok: false as const,
      error: 'Pegá el documento completo: con menos de 50 caracteres no hay nada que extraer.',
      errores: undefined as string[] | undefined,
    };
  }
  return correrFicha(`## DOCUMENTOS DEL CLIENTE\n\n${limpio}`);
}

/**
 * El camino normal: los documentos que el cliente ya tiene en el expediente.
 *
 * Devuelve también qué leyó y qué dejó afuera, para que la pantalla lo diga.
 * Un extractor que en silencio lee tres de once documentos es un extractor en
 * el que nadie puede confiar.
 */
export async function extraerDeDocumentos(docs: DocumentoCliente[]) {
  if (!docs.length) {
    return {
      ok: false as const,
      error: 'Este cliente no tiene documentos cargados. Primero entran los documentos —de Drive o subidos a mano— y después esto propone la ficha.',
      errores: undefined as string[] | undefined,
    };
  }
  const { texto, incluidos, omitidos } = documentosParaFicha(docs);
  const r = await correrFicha(texto);
  return r.ok ? { ...r, incluidos, omitidos } : r;
}

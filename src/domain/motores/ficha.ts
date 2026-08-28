import { z } from 'zod';
import { CONSTITUCION_HASH } from './constitucion';

/**
 * MOTOR 7 · EXTRACTOR DE FICHA
 *
 * El onboarding no empieza con un formulario en blanco. El consultor sube lo
 * que ya tiene —la transcripción de la llamada de venta, el formulario de
 * onboarding, lo que haya en Notion— y esto lo convierte en los bloques del
 * expediente para que él corrija en vez de tipear.
 *
 * Rige el mismo principio que el extractor de sesiones: extrae, no interpreta.
 * Lo que no está en el documento queda vacío. Inventar un dato de la ficha es
 * peor que dejarlo en blanco, porque después el diagnóstico razona sobre él.
 */

export const PROMPT_FICHA = `Vas a leer uno o varios documentos sobre un cliente nuevo —transcripción de la llamada de venta, formulario de onboarding, notas sueltas— y extraer los datos del expediente.

Extraé, no interpretes. Reglas que no se negocian:

1. Si un dato no está en el documento, dejá el campo vacío o fuera del objeto. No lo deduzcas, no lo estimes, no lo completes con lo que sería razonable. Un dato inventado acá contamina el diagnóstico y el plan de 60 días, y nadie va a saber que salió de vos.
2. Los números van como números, sin símbolo de moneda ni separadores de miles. Si el documento dice "más o menos 3 lucas" y no podés resolverlo a un número exacto, dejalo vacío.
3. La moneda va sólo si el documento la dice o la implica sin ambigüedad.
4. Para cada bloque que completes, incluí en 'fuentes' de dónde lo sacaste: una cita textual corta del documento. Sin cita, el consultor no puede verificarte.
5. Si el documento se contradice —dos precios distintos, dos clientes ideales— no elijas: dejá el campo vacío y anotá la contradicción en 'contradicciones'. Esa contradicción es información, y probablemente sea el primer tema de la sesión 1.

Devolvé únicamente el objeto JSON del contrato.`;

export const VERSION_FICHA = `ficha-1.0+${CONSTITUCION_HASH}`;

const texto = z.string().min(1).optional();

export const fichaExtraidaSchema = z.object({
  identidad: z
    .object({
      nombre: texto,
      email: texto,
      programa: texto,
      fuente: texto,
      planPago: texto,
      tieneGarantia: z.boolean().optional(),
      horasRealesSemana: z.number().min(0).max(168).optional(),
    })
    .default({}),
  negocio: z
    .object({
      queVende: texto,
      aQuien: texto,
      precio: z.number().min(0).optional(),
      moneda: texto,
      comoEntrega: texto,
      facturacionMensual: z.number().min(0).optional(),
      cantidadClientes: z.number().min(0).optional(),
      origenClientes: texto,
      queFunciono: texto,
      queNoFunciono: texto,
    })
    .default({}),
  autoridad: z
    .object({
      haceExcepcionalmenteBien: texto,
      experienciaProfesional: texto,
      resultadosPropios: texto,
      resultadosTerceros: texto,
      industriasQueConoce: z.array(z.string()).default([]),
      autoridadDesperdiciada: texto,
    })
    .default({ industriasQueConoce: [] }),
  estrategia: z
    .object({
      clienteIdeal: texto,
      problema: texto,
      deseo: texto,
      promesa: texto,
      oferta: texto,
      mecanismo: texto,
      canal: texto,
      precio: z.number().min(0).optional(),
    })
    .default({}),
  objetivo: z
    .object({
      metaMensual: z.number().min(0).optional(),
      ticket: z.number().min(0).optional(),
    })
    .default({}),
  /** Cita textual por bloque completado. Sin esto no se puede verificar nada. */
  fuentes: z.array(z.object({ campo: z.string(), cita: z.string() })).default([]),
  contradicciones: z.array(z.string()).default([]),
});

export type FichaExtraida = z.infer<typeof fichaExtraidaSchema>;

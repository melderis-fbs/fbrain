import type { DocumentoCliente } from '@/domain/types';

/**
 * LOS DOCUMENTOS, PARA EL PROMPT
 *
 * El expediente serializado dice qué pasó en números; los documentos dicen qué
 * se dijo. Un diagnóstico sobre los números solos no puede citar textual, y sin
 * cita textual el método no emite nada.
 *
 * Van del más nuevo al más viejo, porque si algo hay que dejar afuera es lo
 * viejo. Y si algo queda afuera se dice: truncar en silencio es la forma más
 * rápida de que el modelo concluya sobre la mitad del caso y nadie se entere.
 */

const TIPO_LABEL: Record<DocumentoCliente['tipo'], string> = {
  transcripcion: 'Transcripción de sesión',
  llamada_venta: 'Llamada de venta',
  formulario_onboarding: 'Formulario de onboarding',
  contrato: 'Contrato',
  reporte: 'Reporte',
  otro: 'Documento',
};

/**
 * Tope de seguridad, no de costo: la ventana del modelo es mucho más grande
 * que esto. Existe para que un pegado accidental de medio Drive no dispare una
 * llamada de un millón de tokens sin que nadie lo haya decidido.
 */
const TOPE_CARACTERES = 400_000;

export type ContextoDocumentos = {
  texto: string;
  incluidos: number;
  omitidos: { titulo: string; fecha: string }[];
};

export function documentosParaPrompt(docs: DocumentoCliente[]): ContextoDocumentos {
  if (!docs.length) {
    return {
      texto:
        '## DOCUMENTOS DEL CLIENTE\n\n' +
        'No hay ninguno cargado. No tenés transcripciones ni la llamada de venta: ' +
        'no cites textual lo que no está y decí explícitamente que falta ese material ' +
        'si tu conclusión lo necesitaría.',
      incluidos: 0,
      omitidos: [],
    };
  }

  const ordenados = [...docs].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const partes: string[] = [];
  const omitidos: { titulo: string; fecha: string }[] = [];
  let usados = 0;

  for (const d of ordenados) {
    const bloque = `### ${TIPO_LABEL[d.tipo] ?? 'Documento'} · ${d.titulo} · ${d.fecha}\n\n${d.contenido.trim()}`;
    if (usados + bloque.length > TOPE_CARACTERES && partes.length > 0) {
      omitidos.push({ titulo: d.titulo, fecha: d.fecha });
      continue;
    }
    partes.push(bloque);
    usados += bloque.length;
  }

  const aviso = omitidos.length
    ? `\n\nATENCIÓN: quedaron ${omitidos.length} documento(s) afuera por tamaño y NO los estás viendo: ` +
      `${omitidos.map((o) => `«${o.titulo}» (${o.fecha})`).join(', ')}. ` +
      'Tenelo en cuenta antes de afirmar que algo no está en el material.'
    : '';

  return {
    texto:
      '## DOCUMENTOS DEL CLIENTE\n\n' +
      'Material textual del caso. Las citas del diagnóstico salen de acá, literales.' +
      aviso +
      '\n\n' +
      partes.join('\n\n---\n\n'),
    incluidos: partes.length,
    omitidos,
  };
}

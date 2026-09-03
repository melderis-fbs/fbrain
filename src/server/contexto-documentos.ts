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

// ------------------------------------------------------------------- la ficha

/**
 * Tope propio para el extractor de ficha, mucho más bajo que el del
 * diagnóstico. Con veinte mil tokens alcanza y sobra, y la diferencia se
 * siente: la llamada tarda una fracción de lo que tardaba leyendo el
 * expediente entero.
 */
const TOPE_FICHA = 80_000;

/**
 * Qué documento sirve para llenar la ficha, y en qué orden.
 *
 * La ficha describe **el punto de partida** del caso: qué vende, a quién, qué
 * autoridad tiene, qué estrategia trajo. Eso está en el formulario de
 * onboarding y en la llamada de venta, no en la sesión catorce — y lo que
 * cambió después no va acá: va como versión nueva de estrategia, que es lo que
 * el test de coherencia compara.
 *
 * Por eso mandarle las cien mil palabras del expediente completo era pagar
 * tiempo y plata por material que además empeora la extracción: el modelo
 * termina proponiendo como "cliente ideal" el que se discutió en la última
 * sesión, no el que el cliente declaró al entrar.
 */
const PRIORIDAD: Record<DocumentoCliente['tipo'], number> = {
  formulario_onboarding: 0,
  llamada_venta: 1,
  contrato: 2,
  transcripcion: 3,
  reporte: 4,
  otro: 5,
};

export function documentosParaFicha(docs: DocumentoCliente[]): ContextoDocumentos {
  if (!docs.length) return documentosParaPrompt(docs);

  // Dentro de un mismo tipo, primero los viejos: la ficha es el arranque.
  const ordenados = [...docs].sort(
    (a, b) => PRIORIDAD[a.tipo] - PRIORIDAD[b.tipo] || a.fecha.localeCompare(b.fecha),
  );

  const partes: string[] = [];
  const omitidos: { titulo: string; fecha: string }[] = [];
  let usados = 0;

  for (const d of ordenados) {
    const bloque = `### ${TIPO_LABEL[d.tipo] ?? 'Documento'} · ${d.titulo} · ${d.fecha}\n\n${d.contenido.trim()}`;
    if (usados + bloque.length > TOPE_FICHA && partes.length > 0) {
      omitidos.push({ titulo: d.titulo, fecha: d.fecha });
      continue;
    }
    partes.push(bloque);
    usados += bloque.length;
  }

  const aviso = omitidos.length
    ? `\n\nATENCIÓN: ${omitidos.length} documento(s) quedaron afuera y NO los estás viendo. ` +
      'Si un dato de la ficha no aparece en lo que sí tenés, dejalo vacío: no lo dedúzcas.'
    : '';

  return {
    texto:
      '## DOCUMENTOS DEL CLIENTE\n\n' +
      'El material del arranque del caso. Cada dato que propongas tiene que estar acá, textual.' +
      aviso +
      '\n\n' +
      partes.join('\n\n---\n\n'),
    incluidos: partes.length,
    omitidos,
  };
}

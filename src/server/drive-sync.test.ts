import { describe, expect, it } from 'vitest';
import { fechaPorNombre, tipoPorNombre, tituloLimpio } from './drive-sync';

/**
 * Los nombres son los reales de la carpeta de Founders. Son los que genera
 * Gemini después de cada reunión, y de ellos salen tres cosas que el
 * expediente necesita: qué clase de documento es, de cuándo, y cómo se llama
 * cuando alguien lo mira en la app.
 */
const REALES = [
  'Founders Sesión 4 (Maria - Angie): 2026/06/26 08:56 GMT-03:00 - Notas de Gemini',
  'Tamara Esquivel x Onboarding Angie: 2026/06/29 15:59 GMT-03:00 - Notas de Gemini',
  'Sesión 9 (Gaspar - Angie): 2026/06/23 15:58 GMT-03:00 - Notas de Gemini',
  'Sync 1:1 Coti - Angie: 2026/06/04 10:02 GMT-03:00 - Notas de Gemini',
];

describe('leer el nombre de un documento de Drive', () => {
  it('saca la fecha del hecho, no la de la carga', () => {
    expect(fechaPorNombre(REALES[0])).toBe('2026-06-26');
    expect(fechaPorNombre(REALES[1])).toBe('2026-06-29');
    // Una transcripción de junio cargada en septiembre sigue siendo de junio:
    // el expediente se lee en orden cronológico y el motor cuenta días.
    expect(fechaPorNombre('Contrato Founders.pdf')).toBeUndefined();
  });

  it('acepta también el formato dd/mm/aaaa', () => {
    expect(fechaPorNombre('Llamada de venta 04/03/2026.docx')).toBe('2026-03-04');
  });

  it('clasifica el papel del documento', () => {
    expect(tipoPorNombre(REALES[0])).toBe('transcripcion');
    expect(tipoPorNombre(REALES[1])).toBe('formulario_onboarding');
    expect(tipoPorNombre(REALES[3])).toBe('transcripcion');
    expect(tipoPorNombre('Llamada de venta - Marco')).toBe('llamada_venta');
    expect(tipoPorNombre('Contrato firmado.pdf')).toBe('contrato');
    expect(tipoPorNombre('foto del pizarrón')).toBe('otro');
  });

  it('limpia el título de lo que agrega el generador', () => {
    expect(tituloLimpio(REALES[0])).toBe('Founders Sesión 4 (Maria - Angie): 2026/06/26 08:56');
    expect(tituloLimpio('Contrato Founders.pdf')).toBe('Contrato Founders');
  });

  it('no inventa una fecha cuando no hay ninguna', () => {
    // Preferimos la fecha de modificación del archivo antes que una inventada,
    // y eso lo decide el sincronizador. Acá lo importante es no devolver algo.
    expect(fechaPorNombre('notas sueltas')).toBeUndefined();
    expect(fechaPorNombre('sesion 4')).toBeUndefined();
  });
});

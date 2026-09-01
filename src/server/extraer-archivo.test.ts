import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extraerTextoDeArchivo } from './extraer-archivo';

/**
 * Se prueba contra un PDF y un .docx de verdad, generados con las librerías
 * que los generan en la vida real. Un test con bytes inventados sólo probaría
 * que la función no explota.
 */
const bytes = (n: string): ArrayBuffer => {
  const b = readFileSync(path.resolve(__dirname, '__fixtures__', n));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const texto = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe('extraerTextoDeArchivo', () => {
  it('saca el texto de un PDF', async () => {
    const r = await extraerTextoDeArchivo('contrato.pdf', bytes('contrato.pdf'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toContain('Maria Bidegain');
    expect(r.texto).toContain('3 cuotas');
    expect(r.nota).toContain('1 página');
  });

  it('saca el texto de un .docx', async () => {
    const r = await extraerTextoDeArchivo('sesion.docx', bytes('sesion.docx'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.texto).toContain('11 DMs');
    expect(r.texto).toContain('20 conversaciones nuevas');
  });

  it('un archivo de texto entra tal cual', async () => {
    const r = await extraerTextoDeArchivo('notas.md', texto('# Sesión\n\nQuedó pendiente la oferta.'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toContain('Quedó pendiente la oferta.');
  });

  it('un PDF sin capa de texto lo dice, en vez de guardar un documento vacío', async () => {
    // Un PDF válido y sin texto: es lo que devuelve un escaneo.
    const vacio = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
        'trailer<</Root 1 0 R>>',
    );
    const r = await extraerTextoDeArchivo('escaneo.pdf', vacio.buffer.slice(vacio.byteOffset, vacio.byteOffset + vacio.byteLength) as ArrayBuffer);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/escaneado|OCR|no se pudo leer/i);
  });

  it('con un .doc viejo dice cómo convertirlo', async () => {
    const r = await extraerTextoDeArchivo('viejo.doc', texto('cualquier cosa'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('.docx');
  });

  it('un archivo enorme se rechaza antes de intentar leerlo', async () => {
    const r = await extraerTextoDeArchivo('video.pdf', new ArrayBuffer(21 * 1024 * 1024));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('20 MB');
  });
});

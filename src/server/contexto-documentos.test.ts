import { describe, expect, it } from 'vitest';
import { documentosParaPrompt } from './contexto-documentos';
import type { DocumentoCliente } from '@/domain/types';

const doc = (over: Partial<DocumentoCliente>): DocumentoCliente => ({
  id: 'd1', clienteId: 'c1', tipo: 'transcripcion', titulo: 'Sesión 1',
  contenido: 'texto', fecha: '2026-03-10', creadoAt: '2026-03-10', ...over,
});

describe('documentosParaPrompt', () => {
  it('sin documentos, se lo dice al modelo en vez de callarse', () => {
    const r = documentosParaPrompt([]);
    expect(r.incluidos).toBe(0);
    expect(r.texto).toContain('No hay ninguno cargado');
    expect(r.texto).toContain('no cites textual lo que no está');
  });

  it('ordena del más nuevo al más viejo', () => {
    const r = documentosParaPrompt([
      doc({ id: 'a', titulo: 'Vieja', fecha: '2026-01-05' }),
      doc({ id: 'b', titulo: 'Nueva', fecha: '2026-04-01' }),
    ]);
    expect(r.incluidos).toBe(2);
    expect(r.texto.indexOf('Nueva')).toBeLessThan(r.texto.indexOf('Vieja'));
  });

  it('etiqueta cada documento con su tipo, título y fecha', () => {
    const r = documentosParaPrompt([doc({ tipo: 'llamada_venta', titulo: 'Venta', fecha: '2026-02-02' })]);
    expect(r.texto).toContain('### Llamada de venta · Venta · 2026-02-02');
  });

  it('si algo queda afuera por tamaño lo dice, en vez de truncar en silencio', () => {
    const gigante = 'x'.repeat(300_000);
    const r = documentosParaPrompt([
      doc({ id: 'a', titulo: 'Nuevo', fecha: '2026-04-01', contenido: gigante }),
      doc({ id: 'b', titulo: 'Otro', fecha: '2026-03-01', contenido: gigante }),
      doc({ id: 'c', titulo: 'Viejo', fecha: '2026-02-01', contenido: gigante }),
    ]);
    expect(r.incluidos).toBe(1);
    expect(r.omitidos.map((o) => o.titulo)).toEqual(['Otro', 'Viejo']);
    expect(r.texto).toContain('ATENCIÓN');
    expect(r.texto).toContain('«Otro»');
    expect(r.texto).toContain('NO los estás viendo');
  });

  it('un solo documento enorme entra igual: el tope no puede dejar el contexto vacío', () => {
    const r = documentosParaPrompt([doc({ contenido: 'y'.repeat(900_000) })]);
    expect(r.incluidos).toBe(1);
    expect(r.omitidos).toEqual([]);
  });
});

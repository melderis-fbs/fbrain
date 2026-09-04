import { describe, expect, it } from 'vitest';
import { motivosDeBaja, hayActividad } from './limpieza';
import type { Cliente } from './types';

/**
 * Lo que se prueba es que la lista no proponga dar de baja a alguien que está
 * trabajando. Un falso positivo acá no es un dato mal mostrado: es un cliente
 * activo que desaparece del tablero y que nadie vuelve a mirar.
 */

const cliente = (p: Partial<Cliente> = {}): Cliente => ({
  id: 'c1',
  nombre: 'Ana',
  programa: 'M1',
  fechaAlta: '2026-01-10',
  estado: 'activo',
  consultoraId: 'k1',
  tieneGarantia: false,
  ...p,
});

const nada = { sesiones: 0, metricas: 0, documentos: 0, lecturas: 0, compromisos: 0 };

describe('motivosDeBaja', () => {
  it('un cliente con una sola métrica cargada no es candidato', () => {
    // Aunque esté en el día 400: alguien lo está trabajando, y el largo del
    // programa se arregla con una prórroga, no dándolo de baja.
    const m = motivosDeBaja(cliente(), 400, { ...nada, metricas: 1 });
    expect(m).not.toContain('sin_actividad');
  });

  it('el programa terminado se mide contra su duración, no contra un número fijo', () => {
    // Un M2 de seis meses en el día 200 está en curso; un M1 de cuatro, no.
    expect(motivosDeBaja(cliente(), 200, nada, 6)).not.toContain('programa_terminado');
    expect(motivosDeBaja(cliente(), 200, nada, 4)).toContain('programa_terminado');
  });

  it('un mes de gracia después del final, para no barrer al que recién terminó', () => {
    expect(motivosDeBaja(cliente(), 125, nada, 4)).not.toContain('programa_terminado');
    expect(motivosDeBaja(cliente(), 160, nada, 4)).toContain('programa_terminado');
  });

  it('quien ya está de baja no vuelve a la lista', () => {
    expect(motivosDeBaja(cliente({ estado: 'finalizado' }), 400, nada)).toEqual([]);
    expect(motivosDeBaja(cliente({ estado: 'perdido' }), 400, nada)).toEqual([]);
  });

  it('el pausado sí: es el estado donde se esconde el que se fue sin avisar', () => {
    expect(motivosDeBaja(cliente({ estado: 'pausado' }), 400, nada).length).toBeGreaterThan(0);
  });

  it('sin consultora pero con documentos cargados no es «fila fantasma»', () => {
    const m = motivosDeBaja(cliente({ consultoraId: undefined }), 30, { ...nada, documentos: 2 });
    expect(m).not.toContain('sin_consultora');
    expect(m).not.toContain('sin_actividad');
  });
});

describe('hayActividad', () => {
  it('cualquier rastro cuenta', () => {
    expect(hayActividad(nada)).toBe(false);
    for (const k of ['sesiones', 'metricas', 'documentos', 'lecturas', 'compromisos'] as const) {
      expect(hayActividad({ ...nada, [k]: 1 })).toBe(true);
    }
  });
});

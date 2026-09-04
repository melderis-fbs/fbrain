import { describe, expect, it } from 'vitest';
import { hayConQueEvaluar, queNecesita, tiraDeEtapas } from './tira';
import type { ContextoCliente } from './expediente';

/**
 * Lo que se prueba es la distinción que la lista se venía comiendo: «este
 * cliente está bien» y «de este cliente no sabemos nada» tienen que verse
 * distinto. Pintar el segundo como el primero es la razón por la que medio
 * tablero estaba en verde sobre una base vacía.
 */

const ctx = (p: Partial<ContextoCliente> = {}) =>
  ({
    fase: 'volumen',
    cliente: { id: 'c1', nombre: 'Ana', estado: 'activo' },
    hitos: new Map(),
    registros: { metricas: [], sesiones: [] },
    ...p,
  }) as unknown as ContextoCliente;

describe('tiraDeEtapas', () => {
  it('sin nada cargado, las cinco etapas son «sin datos»', () => {
    const t = tiraDeEtapas(ctx(), []);
    expect(t).toHaveLength(5);
    expect(t.every((e) => e.estado === 'sin_datos')).toBe(true);
  });

  it('una sola métrica cargada ya alcanza para evaluar', () => {
    const c = ctx({ registros: { metricas: [{}], sesiones: [] } } as never);
    expect(hayConQueEvaluar(c)).toBe(true);
    expect(tiraDeEtapas(c, []).some((e) => e.estado === 'sin_datos')).toBe(false);
  });

  it('lo anterior a la etapa en curso queda cumplido, lo posterior pendiente', () => {
    const c = ctx({ registros: { metricas: [{}], sesiones: [] } } as never);
    const t = tiraDeEtapas(c, []);
    expect(t[0].estado).toBe('cumplida');   // definición
    expect(t[1].estado).toBe('cumplida');   // mensaje
    expect(t[2].estado).toBe('en_curso');   // volumen
    expect(t[3].estado).toBe('pendiente');  // conversión
  });

  it('un hito atrasado pinta su etapa, aunque sea anterior a la actual', () => {
    const c = ctx({ registros: { metricas: [{}], sesiones: [] } } as never);
    const t = tiraDeEtapas(c, [
      { hito: { key: 'oferta', fase: 'definicion', label: 'Oferta cerrada' }, incipiente: false },
    ]);
    expect(t[0].estado).toBe('atrasada');
    expect(t[0].detalle).toContain('Oferta cerrada');
  });
});

describe('queNecesita', () => {
  const alerta = (titulo: string, estadoSemaforo: string, prioridad: number) =>
    ({ titulo, estadoSemaforo, prioridad });

  it('manda la alerta más prioritaria, no la primera', () => {
    const r = queNecesita(ctx({ registros: { metricas: [{}], sesiones: [] } } as never), [
      alerta('Tracker sin cargar', 'amarillo', 40),
      alerta('Cuota vencida', 'rojo', 95),
    ]);
    expect(r.texto).toBe('Cuota vencida');
    expect(r.tono).toBe('critico');
  });

  it('sin alertas y sin expediente dice que falta el expediente, no «en orden»', () => {
    expect(queNecesita(ctx(), []).texto).toBe('sin expediente cargado');
  });

  it('nunca queda vacío: una celda en blanco se lee como «no pasa nada»', () => {
    const c = ctx({ registros: { metricas: [{}], sesiones: [] } } as never);
    expect(queNecesita(c, []).texto).toBe('en orden');
  });
});

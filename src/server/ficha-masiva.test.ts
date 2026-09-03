import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentosParaFicha } from './contexto-documentos';
import type { DocumentoCliente } from '@/domain/types';

/**
 * Lo que se prueba es lo que costaría plata y tiempo sin que nadie lo note:
 * que el extractor lea el arranque del caso y no el expediente entero, y que
 * el barrido no vuelva a proponer donde ya hay una propuesta ni escriba una
 * ficha por su cuenta.
 */

const HOY = '2026-09-02';

const doc = (
  tipo: DocumentoCliente['tipo'],
  fecha: string,
  titulo: string,
  largo = 200,
): DocumentoCliente => ({
  id: `${tipo}-${fecha}`,
  clienteId: 'c1',
  tipo,
  titulo,
  contenido: 'x'.repeat(largo),
  fecha,
  creadoAt: HOY,
});

describe('documentosParaFicha', () => {
  it('lee el arranque del caso antes que la última sesión', () => {
    const r = documentosParaFicha([
      doc('transcripcion', '2026-08-01', 'Sesión 12'),
      doc('formulario_onboarding', '2026-03-01', 'Onboarding'),
      doc('llamada_venta', '2026-02-20', 'Llamada de venta'),
    ]);
    const orden = ['Onboarding', 'Llamada de venta', 'Sesión 12'].map((t) => r.texto.indexOf(t));
    // El "cliente ideal" de la ficha es el que declaró al entrar. Si la sesión
    // 12 va primero, el modelo propone el que se discutió la semana pasada.
    expect(orden[0]).toBeLessThan(orden[1]);
    expect(orden[1]).toBeLessThan(orden[2]);
  });

  it('entre sesiones, primero las viejas', () => {
    const r = documentosParaFicha([
      doc('transcripcion', '2026-08-01', 'Sesión 12'),
      doc('transcripcion', '2026-04-01', 'Sesión 1'),
    ]);
    expect(r.texto.indexOf('Sesión 1')).toBeLessThan(r.texto.indexOf('Sesión 12'));
  });

  it('corta por tamaño y avisa qué no vio', () => {
    const muchos = Array.from({ length: 12 }, (_, i) =>
      doc('transcripcion', `2026-0${(i % 9) + 1}-01`, `Sesión ${i}`, 20_000),
    );
    const r = documentosParaFicha(muchos);

    // Sin este tope, cada cliente eran cien mil palabras de entrada: decenas
    // de segundos de espera por una ficha que sale del arranque del caso.
    expect(r.incluidos).toBeLessThan(12);
    expect(r.omitidos.length).toBe(12 - r.incluidos);
    // Callar lo que quedó afuera es peor que dejarlo afuera.
    expect(r.texto).toContain('ATENCIÓN');
  });

  it('un solo documento gigante entra igual', () => {
    const r = documentosParaFicha([doc('llamada_venta', '2026-02-01', 'Llamada', 500_000)]);
    expect(r.incluidos).toBe(1);
    expect(r.omitidos).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- el barrido

const extractor = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('./ficha-extractor', () => ({ extraerDeDocumentos: extractor.fn }));

const FICHA_VACIA = {
  identidad: {}, negocio: {}, autoridad: { industriasQueConoce: [] }, estrategia: {},
  objetivo: { metaMensual: 8000, ticket: 2000 },
  fuentes: [{ campo: 'objetivo.metaMensual', cita: 'quiero llegar a ocho mil por mes' }],
  contradicciones: [],
};

beforeEach(() => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'clave-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_MODO_DATOS', 'demo');
  extractor.fn.mockReset();
  extractor.fn.mockResolvedValue({ ok: true, ficha: FICHA_VACIA, incluidos: 2, omitidos: [], uso: {} });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('proponerFichas', () => {
  /** Dos clientes con documentos y ficha incompleta, y nadie más. */
  async function conDocumentos(cuantos = 2) {
    const { getRepo } = await import('@/data');
    const repo = getRepo();
    const d = await repo.cargarTodo(HOY);
    const elegidos = d.clientes.slice(0, cuantos);

    for (const c of elegidos) {
      // La cartera de demostración viene con la ficha llena; se vacía para que
      // estos clientes sean los candidatos y nadie más lo sea.
      await repo.guardarNegocio({ clienteId: c.id, moneda: 'USD', actualizadoAt: HOY });
      await repo.guardarDocumento({
        id: `d-${c.id}`, clienteId: c.id, tipo: 'formulario_onboarding',
        titulo: 'Onboarding', contenido: 'x'.repeat(300), fecha: '2026-03-01', creadoAt: HOY,
      });
    }
    return { repo, elegidos };
  }

  it('propone, y no escribe la ficha', async () => {
    const { repo, elegidos } = await conDocumentos();
    const { proponerFichas } = await import('./ficha-masiva');

    const r = await proponerFichas(HOY);
    expect(r.solapas[0].error).toBeUndefined();
    expect(r.solapas[0].aplicadas).toBeGreaterThan(0);

    const d = await repo.cargarTodo(HOY);
    const p = d.propuestas.find((x) => x.clienteId === elegidos[0].id)!;
    expect(p.datos.objetivo.metaMensual).toBe(8000);
    expect(p.aplicadaAt).toBeUndefined();
    // Lo que importa: la meta propuesta NO quedó como objetivo del cliente.
    // Si se aplicara sola, sería el número que la consultora persigue toda la
    // semana sin que nadie lo haya leído.
    const objetivos = d.objetivos.filter((o) => o.clienteId === elegidos[0].id);
    expect(objetivos.every((o) => o.metaMensual !== 8000)).toBe(true);
  });

  it('correr dos veces no vuelve a llamar al modelo', async () => {
    await conDocumentos();
    const { proponerFichas } = await import('./ficha-masiva');

    await proponerFichas(HOY);
    const primeras = extractor.fn.mock.calls.length;
    const segunda = await proponerFichas(HOY);

    // Cada llamada de más son segundos de espera y centavos de dólar por un
    // borrador que ya estaba escrito.
    expect(extractor.fn.mock.calls.length).toBe(primeras);
    expect(segunda.solapas[0].aplicadas).toBe(0);
    expect(segunda.solapas[0].nota).toBeTruthy();
  });

  it('trabaja por tandas y dice cuántos quedan', async () => {
    vi.stubEnv('FICHA_CLIENTES_POR_CORRIDA', '1');
    await conDocumentos(3);
    const { proponerFichas } = await import('./ficha-masiva');

    const r = await proponerFichas(HOY);
    expect(r.solapas[0].aplicadas).toBe(1);
    // Sin este número la pantalla no sabe que tiene que seguir, y alguien se
    // queda pensando que la cartera entera está procesada.
    expect(r.solapas[0].restantes).toBe(2);
  });

  it('un cliente que falla no se lleva la tanda puesta', async () => {
    vi.stubEnv('FICHA_CLIENTES_POR_CORRIDA', '2');
    await conDocumentos(2);
    extractor.fn
      .mockResolvedValueOnce({ ok: false, error: 'el contrato no se cumplió' })
      .mockResolvedValue({ ok: true, ficha: FICHA_VACIA, incluidos: 1, omitidos: [], uso: {} });

    const { proponerFichas } = await import('./ficha-masiva');
    const r = await proponerFichas(HOY);

    expect(r.solapas[0].aplicadas).toBe(1);
    expect(r.solapas[0].salteadas[0].motivo).toContain('el contrato no se cumplió');
  });

  it('sin key lo dice y no intenta nada', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const { proponerFichas } = await import('./ficha-masiva');
    const r = await proponerFichas(HOY);
    expect(r.solapas[0].error).toContain('ANTHROPIC_API_KEY');
    expect(extractor.fn).not.toHaveBeenCalled();
  });
});

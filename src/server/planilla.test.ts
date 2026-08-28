import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El importador se prueba contra las plantillas reales de `paquete/planilla/`.
 * Si alguien cambia una plantilla y rompe el mapeo, esto lo dice acá y no tres
 * semanas después, cuando alguien note que la cartera tiene un cliente de menos.
 */

const PLANTILLA = (nombre: string) =>
  readFileSync(path.resolve(__dirname, '../../paquete/planilla', `${nombre}.csv`), 'utf8');

function mockearDrive(solapas: Record<string, string>) {
  vi.stubGlobal('fetch', async (url: string | URL) => {
    const u = String(url);
    const solapa = decodeURIComponent(u.split('sheet=')[1] ?? '');
    const csv = solapas[solapa];
    if (csv === undefined) return new Response('', { status: 404 });
    return new Response(csv, { status: 200, headers: { 'Content-Type': 'text/csv' } });
  });
}

const HOY = '2026-05-20';

beforeEach(() => {
  vi.stubEnv('SHEETS_PLANILLA_ID', 'planilla-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_MODO_DATOS', 'demo');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('sincronizar', () => {
  it('importa las plantillas del paquete sin saltear nada', async () => {
    mockearDrive({
      Clientes: PLANTILLA('Clientes'),
      Pagos: PLANTILLA('Pagos'),
      Asistencias: PLANTILLA('Asistencias'),
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);

    const porSolapa = Object.fromEntries(r.solapas.map((s) => [s.solapa, s]));
    expect(porSolapa.Clientes.error).toBeUndefined();
    expect(porSolapa.Clientes.aplicadas).toBe(1);
    expect(porSolapa.Pagos.aplicadas).toBe(3);
    expect(porSolapa.Asistencias.aplicadas).toBe(2);
    for (const s of r.solapas) expect(s.salteadas).toEqual([]);
  });

  it('deja los datos en la base con las cuotas y su estado', async () => {
    mockearDrive({
      Clientes: PLANTILLA('Clientes'),
      Pagos: PLANTILLA('Pagos'),
      Asistencias: PLANTILLA('Asistencias'),
    });
    const { sincronizar } = await import('./planilla');
    const { demoRepo } = await import('@/data/demo/repo');
    await sincronizar(HOY);
    const d = await demoRepo.cargarTodo(HOY);

    const ana = d.clientes.find((c) => c.nombre === 'Ana Pérez');
    expect(ana).toBeDefined();
    expect(ana!.telefono).toBe('+54 11 5555-0000');
    expect(ana!.horasRealesSemana).toBe(7);
    expect(ana!.tieneGarantia).toBe(true);
    expect(ana!.diasGraciaPago).toBe(3);

    const cuotas = d.pagos.filter((p) => p.clienteId === ana!.id).sort((a, b) => a.numeroCuota - b.numeroCuota);
    expect(cuotas).toHaveLength(3);
    expect(cuotas.map((c) => c.estado)).toEqual(['pagado', 'pagado', 'pendiente']);
    expect(cuotas[0].monto).toBe(1000);
    expect(cuotas[2].fechaVencimiento).toBe('2026-05-04');

    const negocio = d.negocios.find((n) => n.clienteId === ana!.id);
    expect(negocio?.facturacionMensual).toBe(4500);
    expect(negocio?.precio).toBe(900);

    const autoridad = d.autoridades.find((a) => a.clienteId === ana!.id);
    expect(autoridad?.industriasQueConoce).toEqual(['salud', 'nutrición']);

    const objetivo = d.objetivos.filter((o) => o.clienteId === ana!.id).at(-1);
    expect(objetivo?.metaMensual).toBe(9000);
    expect(objetivo?.ticket).toBe(900);
  });

  it('saltea la fila con cliente no identificable en vez de adivinar', async () => {
    mockearDrive({
      Clientes: PLANTILLA('Clientes'),
      Pagos: 'Cliente,Cuota,Monto,Vencimiento,Estado\nQuien Sabe,1,100,04/03/2026,pagado\nAna Pérez,1,1000,04/03/2026,pagado',
      Asistencias: PLANTILLA('Asistencias'),
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    const pagos = r.solapas.find((s) => s.solapa === 'Pagos')!;

    expect(pagos.aplicadas).toBe(1);
    expect(pagos.salteadas).toHaveLength(1);
    expect(pagos.salteadas[0].motivo).toContain('Quien Sabe');
    expect(pagos.salteadas[0].fila).toBe(2);
  });

  it('no toca las métricas semanales: viven en la base del CRM', async () => {
    mockearDrive({
      Clientes: PLANTILLA('Clientes'),
      Pagos: PLANTILLA('Pagos'),
      Asistencias: PLANTILLA('Asistencias'),
      // Si alguien agrega una solapa Metricas a la planilla, se ignora.
      Metricas: 'Cliente,Semana,Ventas\nAna Pérez,16/03/2026,99',
    });
    const { sincronizar } = await import('./planilla');
    const { demoRepo } = await import('@/data/demo/repo');
    const r = await sincronizar(HOY);
    const d = await demoRepo.cargarTodo(HOY);
    const ana = d.clientes.find((c) => c.nombre === 'Ana Pérez')!;

    expect(r.solapas.map((s) => s.solapa)).toEqual(['Clientes', 'Pagos', 'Asistencias']);
    expect(d.metricas.find((m) => m.clienteId === ana.id && m.semanaIso === '2026-03-16')).toBeUndefined();
  });

  it('avisa con un mensaje accionable cuando la planilla no está compartida', async () => {
    vi.stubGlobal('fetch', async () => new Response('<!DOCTYPE html><html>...', { status: 200 }));
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    expect(r.solapas[0].error).toContain('no está compartida');
  });

  it('sin SHEETS_PLANILLA_ID no intenta nada y lo dice', async () => {
    vi.stubEnv('SHEETS_PLANILLA_ID', '');
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    expect(r.solapas[0].error).toContain('SHEETS_PLANILLA_ID');
  });
});

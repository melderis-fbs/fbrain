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
  // Los defaults apuntan a la planilla real de Founders. Estas pruebas son las
  // de la plantilla genérica del paquete, así que nombran sus tres solapas.
  vi.stubEnv('SHEETS_SOLAPA_CLIENTES', 'Clientes');
  vi.stubEnv('SHEETS_SOLAPA_PAGOS', 'Pagos');
  vi.stubEnv('SHEETS_SOLAPA_ASISTENCIAS', 'Asistencias');
  vi.stubEnv('SHEETS_MONEDA', 'ARS');
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

/**
 * LA PLANILLA REAL DE FOUNDERS.
 *
 * «Control de ingresos | FOUNDERS 2026» no tiene la forma de la plantilla del
 * paquete: es una planilla de finanzas con 18 solapas, los estados de cuota son
 * casillas TRUE/FALSE, el encabezado de la consultora es «Consultor/a», el
 * estado del cliente se llama «Estatus» y la deuda «Estado deuda», y no hay
 * solapa de pagos ni de asistencias.
 *
 * El fixture reproduce ese encabezado exacto —las 39 columnas, en su orden— con
 * filas inventadas: los clientes de Founders son personas reales y sus nombres,
 * mails y teléfonos no van a un repositorio.
 */
describe('sincronizar · la planilla real de Founders', () => {
  const SEGUIMIENTO = PLANTILLA('Seguimiento clientes');

  function mockearFounders() {
    vi.stubEnv('SHEETS_SOLAPA_CLIENTES', 'Seguimiento clientes');
    vi.stubEnv('SHEETS_SOLAPA_PAGOS', '');
    vi.stubEnv('SHEETS_SOLAPA_ASISTENCIAS', '');
    vi.stubEnv('SHEETS_MONEDA', 'USD');
    mockearDrive({ 'Seguimiento clientes': SEGUIMIENTO });
  }

  it('lee el encabezado real: «Consultor/a», «Estatus» y las cuotas TRUE/FALSE', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    await sincronizar(HOY);

    const d = await getRepo().cargarTodo(HOY);
    const ada = d.clientes.find((c) => c.nombre === 'Ada Lovelace');
    expect(ada).toBeDefined();

    // «Consultor/a» normaliza a "consultor a", que no matcheaba ningún alias.
    const kathe = d.equipo.find((p) => p.nombre === 'Kathe');
    expect(ada!.consultoraId).toBe(kathe!.id);

    // «Fecha alta» está vacía en las 160 filas: la fecha real es la del 1er pago.
    expect(ada!.fechaAlta).toBe('2026-03-04');

    const cuotas = d.pagos
      .filter((p) => p.clienteId === ada!.id)
      .sort((a, b) => a.numeroCuota - b.numeroCuota);
    expect(cuotas.map((c) => c.estado)).toEqual(['pagado', 'pagado', 'vencido']);
    expect(cuotas.map((c) => c.moneda)).toEqual(['USD', 'USD', 'USD']);
  });

  it('FALSE en una cuota ya vencida es «vencido», no «pendiente»', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    await sincronizar(HOY);

    const d = await getRepo().cargarTodo(HOY);
    const alan = d.clientes.find((c) => c.nombre === 'Alan Turing')!;
    const cuotas = d.pagos
      .filter((p) => p.clienteId === alan.id)
      .sort((a, b) => a.numeroCuota - b.numeroCuota);

    // La 1 está en TRUE. La 2 está en FALSE y vence el 05/06, después de HOY:
    // todavía no está vencida. Si FALSE se tradujera a un estado fijo, las dos
    // caerían en el mismo y la cobranza no podría distinguirlas.
    expect(cuotas.map((c) => c.estado)).toEqual(['pagado', 'pendiente']);
  });

  it('«Estatus: Baja» da de baja al cliente', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    await sincronizar(HOY);

    const d = await getRepo().cargarTodo(HOY);
    expect(d.clientes.find((c) => c.nombre === 'Grace Hopper')!.estado).toBe('perdido');
    expect(d.clientes.find((c) => c.nombre === 'Ada Lovelace')!.estado).toBe('activo');
  });

  it('con dos filas del mismo nombre aplica la primera e informa la segunda', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    const s = r.solapas.find((x) => x.solapa === 'Seguimiento clientes')!;

    expect(s.leidas).toBe(5);
    expect(s.aplicadas).toBe(3);

    const dup = s.salteadas.find((x) => x.fila === 4)!;
    expect(dup.motivo).toContain('ya apareció más arriba');
    expect(s.salteadas.some((x) => x.fila === 5 && /sin nombre/i.test(x.motivo))).toBe(true);
  });

  it('una consultora que no está en el equipo se informa, y el cliente entra sin asignar', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    const r = await sincronizar(HOY);

    const s = r.solapas.find((x) => x.solapa === 'Seguimiento clientes')!;
    expect(s.salteadas.some((x) => x.motivo.includes('Quien No Existe'))).toBe(true);

    const d = await getRepo().cargarTodo(HOY);
    expect(d.clientes.find((c) => c.nombre === 'Alan Turing')!.consultoraId).toBeUndefined();
  });

  it('sin solapa de pagos ni de asistencias lo dice, y no lo reporta como error', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);

    const faltantes = r.solapas.filter((s) => s.nota);
    expect(faltantes).toHaveLength(2);
    for (const s of faltantes) expect(s.error).toBeUndefined();
  });
});

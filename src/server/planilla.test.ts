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
    // Las tres del primer contrato. La cuarta es del segundo, que en el
    // fixture es una renovación y se prueba aparte.
    expect(cuotas.slice(0, 3).map((c) => c.estado)).toEqual(['pagado', 'pagado', 'vencido']);
    expect(cuotas.slice(0, 3).map((c) => c.moneda)).toEqual(['USD', 'USD', 'USD']);
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

  it('una segunda fila con el mismo nombre es una renovación: acumula, no se pierde', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    const r = await sincronizar(HOY);
    const s = r.solapas.find((x) => x.solapa === 'Seguimiento clientes')!;

    expect(s.leidas).toBe(5);
    // Las cuatro con nombre entran; sólo la que no tiene nombre queda afuera.
    expect(s.aplicadas).toBe(4);
    expect(s.salteadas.some((x) => x.fila === 5 && /sin nombre/i.test(x.motivo))).toBe(true);

    const aviso = s.salteadas.find((x) => x.fila === 4)!;
    expect(aviso.motivo).toContain('RENOVACIÓN');

    const d = await getRepo().cargarTodo(HOY);
    const ada = d.clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.renovaciones).toBe(1);
    expect(ada.ultimaRenovacion).toBe('2026-04-10');
    // El día 1 del programa sigue siendo el del primer contrato.
    expect(ada.fechaAlta).toBe('2026-03-04');
    // Lo contratado es la suma de los dos contratos.
    expect(ada.montoTotal).toBe(10000);
    expect(ada.cantidadCuotas).toBe(4);

    // Y las cuotas del segundo contrato siguen numerando a las del primero.
    const cuotas = d.pagos
      .filter((p) => p.clienteId === ada.id)
      .sort((a, b) => a.numeroCuota - b.numeroCuota);
    expect(cuotas.map((c) => c.numeroCuota)).toEqual([1, 2, 3, 4]);
    expect(cuotas[3].monto).toBe(5000);
  });

  it('sincronizar dos veces no duplica las cuotas', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');

    await sincronizar(HOY);
    const primera = (await getRepo().cargarTodo(HOY)).pagos.length;

    mockearFounders();
    await sincronizar(HOY);
    const segunda = (await getRepo().cargarTodo(HOY)).pagos.length;

    // Antes cada corrida creaba filas nuevas con id nuevo y la deuda de la
    // cartera entera se duplicaba en silencio.
    expect(segunda).toBe(primera);
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

  it('guarda lo comercial: closer, monto, cuotas, estado de deuda y notas', async () => {
    mockearFounders();
    const { sincronizar } = await import('./planilla');
    const { getRepo } = await import('@/data');
    await sincronizar(HOY);

    const d = await getRepo().cargarTodo(HOY);
    const grace = d.clientes.find((c) => c.nombre === 'Grace Hopper')!;
    expect(grace.closer).toBe('Vicky');
    expect(grace.setter).toBe('Kevin');
    expect(grace.montoTotal).toBe(4900);
    expect(grace.cantidadCuotas).toBe(3);
    expect(grace.estadoDeuda).toBe('moroso');
    expect(grace.notas).toBe('Pidió pausa');

    // La celda vacía de «Estado deuda» es el caso normal: al día. Es lo que
    // pasa en 151 de las 160 filas, y por eso nadie lo escribe.
    expect(d.clientes.find((c) => c.nombre === 'Ada Lovelace')!.estadoDeuda).toBe('al_dia');
    expect(d.clientes.find((c) => c.nombre === 'Alan Turing')!.estadoDeuda).toBe('deudor');
  });

  it('si Google devuelve otra solapa lo dice, en vez de mandar a arreglar una planilla que está bien', async () => {
    vi.stubEnv('SHEETS_SOLAPA_CLIENTES', 'Seguimiento clientes');
    vi.stubEnv('SHEETS_SOLAPA_PAGOS', '');
    vi.stubEnv('SHEETS_SOLAPA_ASISTENCIAS', '');
    // Lo que devuelve Google cuando el nombre pedido no existe: la primera
    // solapa del archivo, que acá es la de totales de finanzas.
    mockearDrive({
      'Seguimiento clientes': 'Por pagos,Venta PU,%PU,Total\nEnero,0,0%,48001\nFebrero,14000,20%,70500\n',
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    const s = r.solapas[0];

    // Ni una sola fila salteada por «sin nombre»: un error, y explicado.
    expect(s.salteadas).toEqual([]);
    expect(s.error).toContain('ninguna columna de nombre de cliente');
    expect(s.error).toContain('por pagos');
    expect(s.error).toContain('SHEETS_GID_CLIENTES');
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

describe('sincronizar · una tabla parcial no borra el expediente', () => {
  /**
   * La forma normal de cargar 194 fichas es por tandas: una tabla con el
   * negocio, otra con la estrategia, otra con la meta. Si la segunda tanda
   * borra lo que cargó la primera, la herramienta es peor que no tenerla — y
   * no se nota hasta que alguien abre una ficha que estaba llena.
   */
  const csv = (encabezado: string, fila: string) => `${encabezado}\n${fila}`;

  beforeEach(() => {
    vi.stubEnv('SHEETS_SOLAPA_PAGOS', '');
    vi.stubEnv('SHEETS_SOLAPA_ASISTENCIAS', '');
  });

  it('la segunda subida completa, no reemplaza', async () => {
    const { getRepo } = await import('@/data');
    const repo = getRepo();

    // Tanda 1 · el negocio y la estrategia
    mockearDrive({
      Clientes: csv(
        'nombre,fecha alta,que vende,a quien,cliente ideal,oferta',
        'Ana Prueba,2026-02-10,Consultoría de marca,Estudios de arquitectura,Arquitecto con estudio propio,Programa de 12 semanas',
      ),
    });
    const { sincronizar } = await import('./planilla');
    await sincronizar(HOY);

    // Tanda 2 · sólo la meta y el ticket, como saldría de otra planilla. Sin
    // fecha de alta, que es lo normal: el cliente ya existe y la trae de antes.
    mockearDrive({
      Clientes: csv('nombre,meta mensual,ticket', 'Ana Prueba,9000,3000'),
    });
    await sincronizar(HOY);

    const d = await repo.cargarTodo(HOY);
    const cliente = d.clientes.find((c) => c.nombre === 'Ana Prueba')!;
    const negocio = d.negocios.find((n) => n.clienteId === cliente.id)!;
    const estrategias = d.estrategias.filter((e) => e.clienteId === cliente.id);
    const objetivo = d.objetivos.filter((o) => o.clienteId === cliente.id).at(-1)!;

    // Lo de la tanda 1 sigue ahí.
    expect(negocio.queVende).toBe('Consultoría de marca');
    expect(negocio.aQuien).toBe('Estudios de arquitectura');
    // Y la estrategia no quedó vaciada por una v2 con celdas en blanco: esa v2
    // sería la vigente, la que usa el diagnóstico y contra la que el test de
    // coherencia mide el drift.
    expect(estrategias.at(-1)!.clienteIdeal).toBe('Arquitecto con estudio propio');
    expect(estrategias.at(-1)!.oferta).toBe('Programa de 12 semanas');
    // Sin campos de estrategia en la fila, tampoco hay versión nueva.
    expect(estrategias).toHaveLength(1);
    // Y lo nuevo entró.
    expect(objetivo.metaMensual).toBe(9000);
    expect(objetivo.ticket).toBe(3000);
  });

  it('una tabla con los 32 campos del expediente entra de una', async () => {
    const { getRepo } = await import('@/data');
    const repo = getRepo();
    mockearDrive({
      Clientes: csv(
        [
          'nombre', 'fecha alta', 'que vende', 'a quien', 'precio', 'moneda', 'como entrega',
          'facturacion mensual', 'cantidad clientes', 'origen clientes',
          'que funciono', 'que no funciono', 'hace excepcionalmente bien',
          'experiencia profesional', 'resultados propios', 'resultados terceros',
          'industrias que conoce', 'autoridad desperdiciada', 'cliente ideal',
          'problema', 'deseo', 'promesa', 'oferta', 'mecanismo', 'canal',
          'precio estrategia', 'meta mensual', 'ticket',
        ].join(','),
        [
          'Beto Prueba', '2026-03-01', 'Mentoría', 'Coaches', '1500', 'USD', 'Sesiones semanales',
          '6000', '4', 'Referidos', 'Los referidos', 'Los anuncios',
          'Diagnosticar rápido', '12 años en ventas', 'Facturó 20k en un mes',
          'Tres clientes a 10k', 'ventas coaching', 'Su cartera de exalumnos',
          'Coach con clientes', 'No consigue reuniones', 'Agenda llena',
          'Diez reuniones al mes', 'Programa de 8 semanas', 'Método de outbound',
          'Instagram', '2000', '12000', '2000',
        ].join(','),
      ),
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);
    expect(r.solapas[0].error).toBeUndefined();
    expect(r.solapas[0].salteadas).toEqual([]);
    expect(r.solapas[0].aplicadas).toBe(1);

    const d = await repo.cargarTodo(HOY);
    const cliente = d.clientes.find((c) => c.nombre === 'Beto Prueba')!;
    const negocio = d.negocios.find((n) => n.clienteId === cliente.id)!;
    const autoridad = d.autoridades.find((a) => a.clienteId === cliente.id)!;
    const estrategia = d.estrategias.filter((e) => e.clienteId === cliente.id).at(-1)!;
    const objetivo = d.objetivos.filter((o) => o.clienteId === cliente.id).at(-1)!;

    expect(negocio.facturacionMensual).toBe(6000);
    expect(autoridad.industriasQueConoce).toEqual(['ventas coaching']);
    expect(estrategia.mecanismo).toBe('Método de outbound');
    expect(objetivo.metaMensual).toBe(12000);
    // La moneda de la fila manda sobre el default del entorno (que acá es ARS).
    expect(negocio.moneda).toBe('USD');
  });
});

describe('sincronizar · la solapa «Ficha»', () => {
  /**
   * La forma de cargar el expediente de la cartera entera: una tabla con una
   * fila por cliente. Lo que se prueba es que complete sin dar de alta a nadie
   * y que lo que no matchea se informe en vez de adivinarse.
   */
  const csv = (encabezado: string, ...filas: string[]) => [encabezado, ...filas].join('\n');

  beforeEach(() => {
    vi.stubEnv('SHEETS_SOLAPA_PAGOS', '');
    vi.stubEnv('SHEETS_SOLAPA_ASISTENCIAS', '');
    vi.stubEnv('SHEETS_SOLAPA_FICHA', 'Ficha');
  });

  it('carga el expediente de varios clientes de una tabla', async () => {
    const { getRepo } = await import('@/data');
    const repo = getRepo();
    mockearDrive({
      Clientes: csv(
        'nombre,fecha alta',
        'Ana Ficha,2026-01-10',
        'Beto Ficha,2026-01-11',
      ),
      Ficha: csv(
        'nombre,que vende,cliente ideal,meta mensual,ticket',
        'Ana Ficha,Consultoría de marca,Arquitecto con estudio,9000,3000',
        'Beto Ficha,Mentoría de ventas,Coach con clientes,12000,2000',
      ),
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);

    const ficha = r.solapas.find((x) => x.solapa === 'Ficha')!;
    expect(ficha.error).toBeUndefined();
    expect(ficha.aplicadas).toBe(2);
    expect(ficha.salteadas).toEqual([]);

    const d = await repo.cargarTodo(HOY);
    const ana = d.clientes.find((c) => c.nombre === 'Ana Ficha')!;
    expect(d.negocios.find((n) => n.clienteId === ana.id)!.queVende).toBe('Consultoría de marca');
    expect(d.estrategias.filter((e) => e.clienteId === ana.id).at(-1)!.clienteIdeal).toBe('Arquitecto con estudio');
    expect(d.objetivos.filter((o) => o.clienteId === ana.id).at(-1)!.metaMensual).toBe(9000);
  });

  it('un nombre que no existe se informa: completa fichas, no da de alta', async () => {
    const { getRepo } = await import('@/data');
    const repo = getRepo();
    const antes = (await repo.cargarTodo(HOY)).clientes.length;

    mockearDrive({
      Clientes: csv('nombre,fecha alta', 'Ana Ficha,2026-01-10'),
      Ficha: csv('nombre,que vende', 'Ana Fica,Consultoría'),
    });
    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);

    const ficha = r.solapas.find((x) => x.solapa === 'Ficha')!;
    expect(ficha.aplicadas).toBe(0);
    // Con su nombre tal como vino, para que se vea el error de tipeo.
    expect(ficha.salteadas[0].motivo).toContain('Ana Fica');
    // Y sin crear un cliente fantasma por una letra de diferencia.
    expect((await repo.cargarTodo(HOY)).clientes.length).toBe(antes + 1);
  });

  it('sin la solapa creada no miente: Google devuelve la primera y hay que detectarlo', async () => {
    mockearDrive({
      // Sólo existe la de clientes. Google, pedida «Ficha», devuelve esta.
      Clientes: csv('nombre,fecha alta,monto total', 'Ana Ficha,2026-01-10,5000'),
    });
    vi.stubGlobal('fetch', async (url: string | URL) => {
      const csvClientes = csv('nombre,fecha alta,monto total', 'Ana Ficha,2026-01-10,5000');
      void url;
      return new Response(csvClientes, { status: 200, headers: { 'Content-Type': 'text/csv' } });
    });

    const { sincronizar } = await import('./planilla');
    const r = await sincronizar(HOY);

    const ficha = r.solapas.find((x) => x.solapa === 'Ficha')!;
    // Lo importante: no dice «1 ficha aplicada» sobre la solapa de finanzas.
    expect(ficha.aplicadas).toBe(0);
    expect(ficha.nota).toContain('solapa');
    expect(ficha.error).toBeUndefined();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * El importador de Notion se prueba contra la forma real que devuelve la API:
 * cada valor envuelto en su tipo, y la paginación de a 100. Las dos cosas son
 * las que romperían en silencio —media cartera sin importar, o todos los
 * campos vacíos— y ninguna se nota mirando la pantalla.
 */

const HOY = '2026-08-31';

function pagina(filas: Record<string, unknown>[], next?: string) {
  return {
    results: filas.map((props) => ({ properties: props, url: 'https://notion.so/x' })),
    has_more: Boolean(next),
    next_cursor: next ?? null,
  };
}

const titulo = (s: string) => ({ type: 'title', title: [{ plain_text: s }] });
const rico = (s: string) => ({ type: 'rich_text', rich_text: [{ plain_text: s }] });
const select = (s: string | null) => ({ type: 'select', select: s ? { name: s } : null });
const fecha = (s: string | null) => ({ type: 'date', date: s ? { start: s } : null });
const numero = (n: number | null) => ({ type: 'number', number: n });
const url = (s: string | null) => ({ type: 'url', url: s });

function cliente(over: Record<string, unknown> = {}) {
  return {
    Cliente: titulo('Ada Lovelace'),
    Email: rico('ada@ejemplo.com'),
    'Teléfono': rico('+54 11 5555-0001'),
    Consultor: select('Kathe'),
    Estado: select('Activo'),
    Programa: select('M1 / Growth'),
    'Fecha Inicio Programa': fecha('2026-03-04'),
    'Duracion Programa Meses': numero(6),
    Nota: rico('Viene de un referido.'),
    'carpeta automatica de drive': url('https://drive.google.com/drive/folders/ABC123xyz_-'),
    ...over,
  };
}

function mockearNotion(...paginas: ReturnType<typeof pagina>[]) {
  let i = 0;
  vi.stubGlobal('fetch', async () => {
    const p = paginas[Math.min(i++, paginas.length - 1)];
    return new Response(JSON.stringify(p), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

beforeEach(() => {
  vi.stubEnv('NOTION_TOKEN', 'ntn_de_prueba');
  vi.stubEnv('NOTION_DB_CLIENTES', 'db-de-prueba');
  vi.stubEnv('NEXT_PUBLIC_MODO_DATOS', 'demo');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('sincronizarNotion', () => {
  it('desenvuelve cada tipo de propiedad y asigna al consultor', async () => {
    mockearNotion(pagina([cliente()]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].error).toBeUndefined();
    expect(r.solapas[0].aplicadas).toBe(1);

    const d = await getRepo().cargarTodo(HOY);
    const ada = d.clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.email).toBe('ada@ejemplo.com');
    expect(ada.telefono).toBe('+54 11 5555-0001');
    expect(ada.programa).toBe('M1 / Growth');
    expect(ada.fechaAlta).toBe('2026-03-04');
    expect(ada.estado).toBe('activo');
    expect(ada.notas).toBe('Viene de un referido.');
    // Del link de la carpeta se guarda el ID, que es lo que usa el expediente.
    expect(ada.driveFolderId).toBe('ABC123xyz_-');
    // Seis meses desde el 4 de marzo.
    expect(ada.fechaFinPrevista).toBe('2026-09-04');

    const kathe = d.equipo.find((p) => p.nombre === 'Kathe')!;
    expect(ada.consultoraId).toBe(kathe.id);
  });

  it('sigue el cursor: sin paginar, media cartera no entraría', async () => {
    mockearNotion(
      pagina([cliente()], 'cursor-2'),
      pagina([cliente({ Cliente: titulo('Grace Hopper') })]),
    );
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].leidas).toBe(2);
    expect(r.solapas[0].aplicadas).toBe(2);
  });

  it('traduce los cuatro estados de Notion', async () => {
    mockearNotion(
      pagina([
        cliente({ Cliente: titulo('Uno'), Estado: select('Activo') }),
        cliente({ Cliente: titulo('Dos'), Estado: select('Pausado') }),
        cliente({ Cliente: titulo('Tres'), Estado: select('Abandono') }),
        cliente({ Cliente: titulo('Cuatro'), Estado: select('Finalizó') }),
      ]),
    );
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    await sincronizarNotion(HOY);

    const d = await getRepo().cargarTodo(HOY);
    const de = (n: string) => d.clientes.find((c) => c.nombre === n)!.estado;
    expect([de('Uno'), de('Dos'), de('Tres'), de('Cuatro')]).toEqual([
      'activo', 'pausado', 'perdido', 'finalizado',
    ]);
  });

  it('un consultor que no está en el equipo deja al cliente sin asignar y lo informa', async () => {
    mockearNotion(pagina([cliente({ Consultor: select('Angie') })]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].aplicadas).toBe(1);
    expect(r.solapas[0].salteadas[0].motivo).toContain('Angie');

    const d = await getRepo().cargarTodo(HOY);
    expect(d.clientes.find((c) => c.nombre === 'Ada Lovelace')!.consultoraId).toBeUndefined();
  });

  it('sin fecha de inicio no inventa el día 1: saltea y dice dónde arreglarlo', async () => {
    mockearNotion(pagina([cliente({ 'Fecha Inicio Programa': fecha(null) })]));
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].aplicadas).toBe(0);
    expect(r.solapas[0].salteadas[0].motivo).toContain('Completar Fechas de Inicio');
  });

  it('no pisa lo que ya cargó la consultora en la app', async () => {
    mockearNotion(pagina([cliente()]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');

    const repo = getRepo();
    const previo = (await repo.cargarTodo(HOY)).clientes[0];
    await repo.guardarCliente({
      ...previo,
      nombre: 'Ada Lovelace',
      horasRealesSemana: 7,
      diasGraciaPago: 3,
      closer: 'Kevin',
      montoTotal: 5000,
      tieneGarantia: true,
    });

    await sincronizarNotion(HOY);
    const ada = (await repo.cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!;

    // Notion no sabe nada de esto y por lo tanto no lo toca.
    expect(ada.horasRealesSemana).toBe(7);
    expect(ada.diasGraciaPago).toBe(3);
    expect(ada.closer).toBe('Kevin');
    expect(ada.montoTotal).toBe(5000);
    expect(ada.tieneGarantia).toBe(true);
    // Y lo suyo sí lo actualiza.
    expect(ada.fechaAlta).toBe('2026-03-04');
  });

  it('un cambio de coach hecho en la app le gana a Notion, y lo informa', async () => {
    mockearNotion(pagina([cliente({ Consultor: select('Nati') })]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    const repo = getRepo();

    const d0 = await repo.cargarTodo(HOY);
    const kathe = d0.equipo.find((p) => p.nombre === 'Kathe')!;
    const base = d0.clientes[0];

    // El cliente existe y alguien lo reasignó a Kathe desde la app.
    await repo.guardarCliente({ ...base, nombre: 'Ada Lovelace', consultoraId: kathe.id });
    await repo.guardarTraspaso({
      id: 'tr-prueba',
      clienteId: base.id,
      consultoraDestinoId: kathe.id,
      fecha: '2026-08-20',
      motivo: 'Sobrecarga de la anterior.',
    });

    const r = await sincronizarNotion(HOY);

    // Notion dice Nati, pero el traspaso se hizo acá: manda la app.
    const ada = (await repo.cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.consultoraId).toBe(kathe.id);

    // Y la divergencia no se esconde.
    const aviso = r.solapas[0].salteadas.find((x) => x.motivo.includes('Mandó la app'))!;
    expect(aviso.motivo).toContain('Kathe');
    expect(aviso.motivo).toContain('Nati');
  });

  it('sin traspaso en la app, Notion reasigna con libertad', async () => {
    mockearNotion(pagina([cliente({ Consultor: select('Nati') })]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    const repo = getRepo();

    const d0 = await repo.cargarTodo(HOY);
    const kathe = d0.equipo.find((p) => p.nombre === 'Kathe')!;
    const nati = d0.equipo.find((p) => p.nombre === 'Nati')!;
    await repo.guardarCliente({ ...d0.clientes[0], nombre: 'Ada Lovelace', consultoraId: kathe.id });

    await sincronizarNotion(HOY);
    const ada = (await repo.cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.consultoraId).toBe(nati.id);
  });

  it('explica cómo se arregla un 404, que es el error que todos cometen', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);
    expect(r.solapas[0].error).toContain('Conexiones');
  });

  it('sin token no intenta nada y lo dice', async () => {
    vi.stubEnv('NOTION_TOKEN', '');
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);
    expect(r.solapas[0].error).toContain('NOTION_TOKEN');
  });
});

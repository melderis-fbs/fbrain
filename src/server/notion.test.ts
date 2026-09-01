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
    results: filas.map((props) => ({
      properties: props,
      url: 'https://notion.so/x',
      created_time: '2026-02-11T13:00:00.000Z',
    })),
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

/**
 * Responde por cursor y no por orden de llamada, que es como se comporta
 * Notion. Importa: el importador hace una llamada de sondeo para descubrir con
 * qué endpoint hablar, y un mock que devuelve las páginas en orden le
 * entregaría la primera a ese sondeo y perdería una página de datos.
 */
function mockearNotion(...paginas: ReturnType<typeof pagina>[]) {
  const porCursor = new Map<string, ReturnType<typeof pagina>>();
  let clave: string | undefined = undefined;
  for (const p of paginas) {
    porCursor.set(clave ?? '', p);
    clave = p.next_cursor ?? undefined;
  }

  vi.stubGlobal('fetch', async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as { start_cursor?: string }) : {};
    const p = porCursor.get(body.start_cursor ?? '') ?? paginas[0];
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

  it('sin fecha de inicio el cliente entra igual, con la fecha marcada como provisional', async () => {
    mockearNotion(pagina([cliente({ 'Fecha Inicio Programa': fecha(null) })]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    const r = await sincronizarNotion(HOY);

    // No importarlo era peor: un cliente que no existe no se puede asignar,
    // ni abrir, ni corregir, y su consultora no lo ve en la cartera.
    expect(r.solapas[0].aplicadas).toBe(1);
    expect(r.solapas[0].salteadas[0].motivo).toContain('Completar Fechas de Inicio');

    const ada = (await getRepo().cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.fechaAltaProvisional).toBe(true);
    // La fecha de creación de la fila en Notion, que es lo mejor que hay.
    expect(ada.fechaAlta).toBe('2026-02-11');
  });

  it('cuando llega la fecha real, la marca se apaga sola', async () => {
    mockearNotion(pagina([cliente({ 'Fecha Inicio Programa': fecha(null) })]));
    const { sincronizarNotion } = await import('./notion');
    const { getRepo } = await import('@/data');
    await sincronizarNotion(HOY);
    expect((await getRepo().cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!.fechaAltaProvisional).toBe(true);

    // Alguien completa la fecha en Notion y se vuelve a sincronizar.
    mockearNotion(pagina([cliente()]));
    await sincronizarNotion(HOY);
    const ada = (await getRepo().cargarTodo(HOY)).clientes.find((c) => c.nombre === 'Ada Lovelace')!;
    expect(ada.fechaAltaProvisional).toBe(false);
    expect(ada.fechaAlta).toBe('2026-03-04');
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

  it('si la base es del modelo nuevo, resuelve su data source y consulta por ahí', async () => {
    // Notion 2025-09-03 partió las bases en «data sources». Una base migrada
    // rechaza el endpoint clásico con un 404 que, leído de afuera, es idéntico
    // a «el ID está mal» — y mandaría a buscar el problema donde no está.
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: { body?: string }) => {
      llamadas.push(url);
      if (url.includes('/databases/') && url.endsWith('/query')) {
        return new Response('{"object":"error","code":"object_not_found"}', { status: 404 });
      }
      if (url.includes('/databases/')) {
        return new Response(JSON.stringify({ data_sources: [{ id: 'ds-98a5' }] }), { status: 200 });
      }
      const body = init?.body ? (JSON.parse(init.body) as { page_size?: number }) : {};
      // El sondeo pide una fila; la lectura real pide cien.
      return new Response(JSON.stringify(pagina(body.page_size === 1 ? [] : [cliente()])), { status: 200 });
    });

    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].error).toBeUndefined();
    expect(r.solapas[0].aplicadas).toBe(1);
    expect(llamadas.some((u) => u.includes('/data_sources/ds-98a5/query'))).toBe(true);
  });

  it('un 401 no reintenta con el otro endpoint: el token no lo arregla el endpoint', async () => {
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      llamadas.push(url);
      return new Response('{"code":"unauthorized"}', { status: 401 });
    });

    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);

    expect(r.solapas[0].error).toContain('token');
    expect(llamadas).toHaveLength(1);
  });

  it('el 404 manda primero a Conexiones, que es lo que falla casi siempre', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);

    const e = r.solapas[0].error!;
    expect(e).toContain('Conexiones');
    // El ID se menciona después, no antes: mandar a revisarlo primero hace
    // perder media hora buscando un problema que no está ahí.
    expect(e.indexOf('Conexiones')).toBeLessThan(e.indexOf('NOTION_DB_CLIENTES'));
  });

  it('sin token no intenta nada y lo dice', async () => {
    vi.stubEnv('NOTION_TOKEN', '');
    const { sincronizarNotion } = await import('./notion');
    const r = await sincronizarNotion(HOY);
    expect(r.solapas[0].error).toContain('NOTION_TOKEN');
  });
});

import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La sincronización entera, con Drive simulado. Lo que se prueba son las tres
 * cosas que fallarían en silencio: que no duplique, que no guarde documentos
 * vacíos, y que el documento quede atado al cliente de cuya carpeta salió.
 */

const HOY = '2026-09-02';

/** Una clave RSA de prueba, generada acá: no abre nada. */
function credencialesFalsas() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    client_email: 'brain@prueba.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  });
}

type Archivo = { id: string; name: string; mimeType: string; texto: string };

function mockearDrive(porCarpeta: Record<string, Archivo[]>) {
  const pedidos: string[] = [];
  vi.stubGlobal('fetch', async (url: string | URL) => {
    const u = String(url);
    pedidos.push(u);

    if (u.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'token-de-prueba' }), { status: 200 });
    }
    if (u.includes('/files?')) {
      // La query viaja como querystring: los espacios son `+`, no %20.
      const pedido = decodeURIComponent(u).replace(/\+/g, ' ');
      const carpeta = pedido.match(/'([^']+)' in parents/)?.[1] ?? '';
      const files = (porCarpeta[carpeta] ?? []).map((a) => ({
        id: a.id, name: a.name, mimeType: a.mimeType, modifiedTime: '2026-06-26T00:00:00Z',
      }));
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    if (u.includes('/export')) {
      const id = u.match(/files\/([^/]+)\/export/)?.[1] ?? '';
      const a = Object.values(porCarpeta).flat().find((x) => x.id === id);
      return new Response(a?.texto ?? '', { status: 200 });
    }
    return new Response('no-esperado', { status: 404 });
  });
  return pedidos;
}

const doc = (id: string, name: string, texto: string): Archivo => ({
  id, name, mimeType: 'application/vnd.google-apps.document', texto,
});

const LARGO = 'Repasamos el tracker de la semana: once DMs contra los veintiuno que necesita para su meta. Quedó el compromiso de abrir veinte conversaciones nuevas.';

beforeEach(() => {
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', credencialesFalsas());
  vi.stubEnv('NEXT_PUBLIC_MODO_DATOS', 'demo');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('sincronizarDrive', () => {
  /**
   * La cartera de demostración viene con carpeta en todos los clientes, que
   * para estas pruebas es ruido: se sincronizarían 25 carpetas de las que la
   * prueba no dice nada. Se deja sin ninguna y se declaran las dos que importan.
   */
  async function sinCarpetas() {
    const { getRepo } = await import('@/data');
    const repo = getRepo();
    const d = await repo.cargarTodo(HOY);
    for (const c of d.clientes) {
      if (c.driveFolderId) await repo.guardarCliente({ ...c, driveFolderId: undefined });
    }
    return { repo, clientes: d.clientes };
  }

  async function conCarpetas() {
    const { repo, clientes } = await sinCarpetas();
    const [a, b] = clientes;
    await repo.guardarCliente({ ...a, driveFolderId: 'carpeta-A' });
    await repo.guardarCliente({ ...b, driveFolderId: 'carpeta-B' });
    return { repo, a, b };
  }

  it('cada documento queda con el cliente de cuya carpeta salió', async () => {
    const { repo, a, b } = await conCarpetas();
    mockearDrive({
      'carpeta-A': [doc('f1', 'Sesión 4 (X - Angie): 2026/06/26 - Notas de Gemini', LARGO)],
      'carpeta-B': [doc('f2', 'Onboarding: 2026/05/25 - Notas de Gemini', LARGO)],
    });

    const { sincronizarDrive } = await import('./drive-sync');
    const r = await sincronizarDrive(HOY);
    expect(r.solapas[0].error).toBeUndefined();
    expect(r.solapas[0].aplicadas).toBe(2);

    const d = await repo.cargarTodo(HOY);
    const deA = d.documentos.find((x) => x.archivo === 'f1')!;
    const deB = d.documentos.find((x) => x.archivo === 'f2')!;
    // Nada se dedujo del título: el documento es de quien tiene la carpeta.
    expect(deA.clienteId).toBe(a.id);
    expect(deB.clienteId).toBe(b.id);
    expect(deA.fecha).toBe('2026-06-26');
    expect(deB.tipo).toBe('formulario_onboarding');
  });

  it('correr dos veces no duplica el corpus', async () => {
    const { repo } = await conCarpetas();
    const archivos = { 'carpeta-A': [doc('f1', 'Sesión 4: 2026/06/26', LARGO)], 'carpeta-B': [] };

    mockearDrive(archivos);
    const { sincronizarDrive } = await import('./drive-sync');
    await sincronizarDrive(HOY);
    const primera = (await repo.cargarTodo(HOY)).documentos.length;

    mockearDrive(archivos);
    const r2 = await sincronizarDrive(HOY);
    const segunda = (await repo.cargarTodo(HOY)).documentos.length;

    // Sin esto el diagnóstico citaría la misma frase tres veces como si
    // fueran tres fuentes distintas.
    expect(segunda).toBe(primera);
    expect(r2.solapas[0].aplicadas).toBe(0);
  });

  it('un documento sin texto se informa, no se guarda vacío', async () => {
    const { repo } = await conCarpetas();
    mockearDrive({ 'carpeta-A': [doc('f9', 'Escaneo del contrato: 2026/06/26', '   ')], 'carpeta-B': [] });

    const { sincronizarDrive } = await import('./drive-sync');
    const r = await sincronizarDrive(HOY);

    expect(r.solapas[0].aplicadas).toBe(0);
    expect(r.solapas[0].salteadas.some((x) => /no salió texto|OCR/i.test(x.motivo))).toBe(true);
    expect((await repo.cargarTodo(HOY)).documentos.some((d) => d.archivo === 'f9')).toBe(false);
  });

  it('los videos de la reunión no se reportan como error', async () => {
    await conCarpetas();
    mockearDrive({
      'carpeta-A': [
        { id: 'v1', name: 'Sesión 4 - Recording.mp4', mimeType: 'video/mp4', texto: '' },
        doc('f1', 'Sesión 4: 2026/06/26', LARGO),
      ],
      'carpeta-B': [],
    });

    const { sincronizarDrive } = await import('./drive-sync');
    const r = await sincronizarDrive(HOY);

    expect(r.solapas[0].aplicadas).toBe(1);
    // La grabación es lo que la nota de texto ya resume: no es un problema.
    expect(r.solapas[0].salteadas.some((x) => /\.mp4/.test(x.motivo))).toBe(false);
  });

  it('sin carpetas cargadas dice que hay que sincronizar Notion primero', async () => {
    await sinCarpetas();
    mockearDrive({});
    const { sincronizarDrive } = await import('./drive-sync');
    const r = await sincronizarDrive(HOY);
    expect(r.solapas[0].error).toContain('Notion');
  });

  it('sin credenciales no intenta nada y lo dice', async () => {
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', '');
    const { sincronizarDrive } = await import('./drive-sync');
    const r = await sincronizarDrive(HOY);
    expect(r.solapas[0].error).toContain('GOOGLE_SERVICE_ACCOUNT_JSON');
  });
});

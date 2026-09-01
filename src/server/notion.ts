import 'server-only';
import { nuevoId } from '@/lib/id';
import { getRepo } from '@/data';
import { normalizarEncabezado as normalizar } from '@/lib/csv';
import { isoDate, toDate } from '@/lib/date';
import type { Cliente, EstadoCliente } from '@/domain/types';
import type { Reporte, ReporteSolapa } from './planilla';

/**
 * NOTION · AUDITORÍA CLIENTES
 *
 * La segunda fuente, y la que manda sobre quién atiende a quién.
 *
 * Founders lleva dos sistemas en paralelo y cada uno es bueno en algo
 * distinto. La planilla de finanzas sabe de plata: cuotas, montos, fechas de
 * vencimiento. La base de Notion sabe del programa: qué consultor tiene cada
 * cliente, si está activo, cuándo arrancó y cuánto dura. Pedirle a alguien que
 * abandone uno de los dos para unificar es la forma más rápida de que la
 * información deje de estar al día en los dos lados.
 *
 * Así que se leen los dos, y cada uno escribe sólo lo suyo:
 *
 *   Notion   → consultor, estado, fecha de alta, programa, carpeta de Drive
 *   Planilla → cuotas, montos, closer, fuente
 *   La app   → métricas, sesiones, compromisos, estrategia, diagnósticos
 *
 * Cuando los dos tienen el mismo campo —estado y fecha de alta— manda Notion,
 * porque es donde el equipo lo mantiene. Por eso conviene correr esta
 * sincronización DESPUÉS de la de la planilla; la pantalla lo dice y el orden
 * de los botones lo refleja.
 *
 * Las tres reglas de ingesta son las mismas que las de la planilla: vacío no
 * es cero, una fila no identificable se saltea y se informa, y nada de lo que
 * cargó una consultora en la app se pisa desde acá.
 */

const API = 'https://api.notion.com/v1';

/**
 * Notion partió las bases en dos con la versión 2025-09-03: lo que antes era
 * una base ahora es una base con una o más «data sources», y el endpoint para
 * consultarla cambió. Cuál de los dos anda depende de cuándo se creó la base y
 * de si el workspace ya migró, y desde afuera no hay forma de saberlo.
 *
 * Así que se prueban los dos, en orden, y el que conteste gana. Es una llamada
 * de más una sola vez, contra un error que desde el mensaje de Notion es
 * indistinguible de «el ID está mal».
 */
const VERSION_CLASICA = '2022-06-28';
const VERSION_NUEVA = '2025-09-03';

export function hayNotion(): boolean {
  return Boolean(process.env.NOTION_TOKEN && process.env.NOTION_DB_CLIENTES);
}

/**
 * Los nombres de las propiedades en Notion. Van acá y no repartidos por el
 * archivo porque renombrar una columna en Notion no debería obligar a leer
 * código: se cambia el nombre en esta lista y listo. Se comparan normalizados,
 * así que «Teléfono» y «telefono» son la misma.
 */
export const PROPS = {
  nombre: ['cliente', 'nombre'],
  email: ['email', 'correo'],
  telefono: ['telefono', 'tel'],
  consultor: ['consultor', 'coach', 'consultora'],
  estado: ['estado'],
  programa: ['programa'],
  fechaInicio: ['fecha inicio programa', 'fecha de inicio', 'fecha inicio'],
  duracionMeses: ['duracion programa meses', 'duracion meses'],
  nota: ['nota', 'notas'],
  carpetaDrive: ['carpeta automatica de drive', 'carpeta de drive', 'carpeta'],
} as const;

/** Los cuatro estados de Notion, y qué significan acá. */
export const ESTADO_NOTION: Record<string, EstadoCliente> = {
  activo: 'activo',
  pausado: 'pausado',
  abandono: 'perdido',
  finalizo: 'finalizado',
};

// ------------------------------------------------------------------ lectura

type Prop = Record<string, unknown>;
type Fila = { props: Record<string, Prop>; url?: string };

/**
 * Notion devuelve cada valor envuelto en su tipo. Esto lo desenvuelve a texto
 * plano, que es todo lo que necesitamos: los tipos ricos —menciones, personas,
 * fórmulas— no se usan en las columnas que leemos, y tratar de soportarlos
 * todos sería inventar trabajo.
 */
function texto(p?: Prop): string {
  if (!p) return '';
  const t = p.type as string;
  switch (t) {
    case 'title':
    case 'rich_text':
      return ((p[t] as { plain_text?: string }[]) ?? []).map((x) => x.plain_text ?? '').join('').trim();
    case 'select':
      return ((p.select as { name?: string } | null)?.name ?? '').trim();
    case 'status':
      return ((p.status as { name?: string } | null)?.name ?? '').trim();
    case 'multi_select':
      return ((p.multi_select as { name?: string }[]) ?? []).map((x) => x.name ?? '').join(', ');
    case 'date':
      return ((p.date as { start?: string } | null)?.start ?? '').trim();
    case 'number':
      return p.number === null || p.number === undefined ? '' : String(p.number);
    case 'url':
    case 'email':
    case 'phone_number':
      return ((p[t] as string | null) ?? '').trim();
    case 'checkbox':
      return p.checkbox ? 'true' : '';
    default:
      return '';
  }
}

function leer(fila: Fila, alias: readonly string[]): string {
  for (const a of alias) {
    const v = texto(fila.props[normalizar(a)]);
    if (v !== '') return v;
  }
  return '';
}

/**
 * Notion pagina de a 100. Con 160 clientes eso son dos páginas, y sin seguir
 * el cursor la mitad de la cartera no entraría nunca — en silencio, que es lo
 * peor que puede hacer una importación.
 */
type Respuesta = { ok: boolean; status: number; cuerpo: string; json?: unknown };

async function pedir(url: string, version: string, body?: unknown): Promise<Respuesta> {
  const res = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': version,
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  const cuerpo = await res.text().catch(() => '');
  let json: unknown;
  try { json = JSON.parse(cuerpo); } catch { /* Notion siempre manda JSON; si no, el texto alcanza. */ }
  return { ok: res.ok, status: res.status, cuerpo, json };
}

/**
 * Decide una sola vez con qué endpoint se va a consultar, probando el clásico
 * y, si no anda, resolviendo la data source de la base para usar el nuevo.
 */
async function resolverConsulta(): Promise<{ url: string; version: string }> {
  const id = process.env.NOTION_DB_CLIENTES;

  const clasico = await pedir(`${API}/databases/${id}/query`, VERSION_CLASICA, { page_size: 1 });
  if (clasico.ok) return { url: `${API}/databases/${id}/query`, version: VERSION_CLASICA };

  // Un 401 es del token y no lo arregla cambiar de endpoint: cortar acá evita
  // un segundo intento inútil y un mensaje de error peor.
  if (clasico.status === 401) throw new Error(mensajeDeError(401, clasico.cuerpo));

  // Puede ser una base del modelo nuevo. Se le pregunta por sus data sources.
  const meta = await pedir(`${API}/databases/${id}`, VERSION_NUEVA);
  const fuentes = (meta.json as { data_sources?: { id: string }[] } | undefined)?.data_sources;
  if (meta.ok && fuentes?.length) {
    return { url: `${API}/data_sources/${fuentes[0].id}/query`, version: VERSION_NUEVA };
  }

  // Puede ser que lo configurado ya sea el ID de una data source.
  const directo = await pedir(`${API}/data_sources/${id}/query`, VERSION_NUEVA, { page_size: 1 });
  if (directo.ok) return { url: `${API}/data_sources/${id}/query`, version: VERSION_NUEVA };

  throw new Error(mensajeDeError(clasico.status, clasico.cuerpo));
}

async function bajarTodo(): Promise<Fila[]> {
  const { url, version } = await resolverConsulta();
  const filas: Fila[] = [];
  let cursor: string | undefined;

  do {
    const res = await pedir(url, version, cursor ? { page_size: 100, start_cursor: cursor } : { page_size: 100 });
    if (!res.ok) throw new Error(mensajeDeError(res.status, res.cuerpo));

    const json = (res.json ?? {}) as {
      results?: { properties?: Record<string, Prop>; url?: string }[];
      has_more?: boolean;
      next_cursor?: string | null;
    };

    for (const r of json.results ?? []) {
      const props: Record<string, Prop> = {};
      for (const [k, v] of Object.entries(r.properties ?? {})) props[normalizar(k)] = v;
      filas.push({ props, url: r.url });
    }

    cursor = json.has_more ? (json.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return filas;
}

/** Los errores que se cometen al conectar Notion, dichos como se arreglan. */
function mensajeDeError(status: number, cuerpo: string): string {
  if (status === 401) {
    return 'Notion rechazó el token. Revisá `NOTION_TOKEN`: tiene que ser el "Internal Integration Secret" de la integración, y empieza con `ntn_` o `secret_`.';
  }
  if (status === 404) {
    // Notion contesta lo mismo para «no existe» y para «existe pero vos no la
    // ves», a propósito. Y lo segundo es lo que pasa el 90% de las veces, así
    // que va primero: mandar a revisar el ID hace perder media hora buscando
    // un problema que no está ahí.
    return (
      'Notion dice que no encuentra la base, pero devuelve lo mismo cuando la base existe y la integración no tiene permiso de verla — que es lo que pasa casi siempre. ' +
      'PRIMERO: abrí «Auditoría Clientes» en Notion → botón ••• arriba a la derecha → Conexiones (o Connections) → agregá tu integración. Hay que hacerlo desde la página de la base, no desde Settings. ' +
      'Recién si eso ya está hecho, revisá `NOTION_DB_CLIENTES`: son los 32 caracteres de la URL de la base, sin guiones y sin el `?v=...` del final.'
    );
  }
  return `Notion devolvió ${status}. ${cuerpo.slice(0, 300)}`;
}

// ---------------------------------------------------------------- sincronía

/** Suma meses a una fecha ISO respetando fines de mes cortos. */
function sumarMeses(iso: string, meses: number): string {
  const d = toDate(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return isoDate(d);
}

/** De la URL de la carpeta al ID, que es lo que guarda el expediente. */
function idDeCarpeta(url: string): string | undefined {
  const m = url.match(/\/folders\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : undefined;
}

export async function sincronizarNotion(hoy: string): Promise<Reporte> {
  const r: ReporteSolapa = { solapa: 'Auditoría Clientes (Notion)', leidas: 0, aplicadas: 0, salteadas: [] };

  if (!hayNotion()) {
    return {
      at: hoy,
      solapas: [{ ...r, error: 'Faltan `NOTION_TOKEN` y/o `NOTION_DB_CLIENTES` en el entorno.' }],
    };
  }

  const repo = getRepo();
  const dataset = await repo.cargarTodo(hoy);
  const porNombre = new Map(dataset.clientes.map((c) => [normalizar(c.nombre), c]));
  const consultoraPorNombre = new Map(dataset.equipo.map((c) => [normalizar(c.nombre), c]));
  const nombreDeConsultora = new Map(dataset.equipo.map((c) => [c.id, c.nombre]));

  /**
   * El último traspaso de cada cliente. Es lo que permite distinguir una
   * asignación que la app heredó de Notion —y que Notion puede actualizar
   * libremente— de una que alguien cambió a mano acá, que no se puede pisar
   * sin deshacerle el trabajo a quien la hizo.
   */
  const ultimoTraspaso = new Map<string, { destino: string; fecha: string }>();
  for (const t of dataset.traspasos) {
    const previo = ultimoTraspaso.get(t.clienteId);
    if (!previo || t.fecha >= previo.fecha) {
      ultimoTraspaso.set(t.clienteId, { destino: t.consultoraDestinoId, fecha: t.fecha });
    }
  }

  try {
    const filas = await bajarTodo();
    r.leidas = filas.length;

    const vistos = new Set<string>();

    for (const [i, f] of filas.entries()) {
      // El número de fila de Notion no existe: se numeran en el orden en que
      // la API las devuelve, que es el mismo de la vista por defecto.
      const fila = i + 1;

      const nombre = leer(f, PROPS.nombre);
      if (!nombre) { r.salteadas.push({ fila, motivo: 'Fila sin nombre de cliente.' }); continue; }

      const clave = normalizar(nombre);
      if (vistos.has(clave)) {
        r.salteadas.push({ fila, motivo: `«${nombre}» aparece dos veces en la base. Se aplicó la primera; ésta se salteó.` });
        continue;
      }
      vistos.add(clave);

      const previo = porNombre.get(clave);

      // La fecha de inicio es la de la primera sesión de onboarding, y es la
      // que la app usa como día 1 del programa. Sin ella y sin un cliente
      // previo no hay contra qué contar los días, así que la fila espera.
      const inicio = leer(f, PROPS.fechaInicio).slice(0, 10);
      const alta = /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? inicio : previo?.fechaAlta;
      if (!alta) {
        r.salteadas.push({ fila, motivo: `«${nombre}» no tiene Fecha Inicio Programa y es un cliente nuevo. En Notion hay una vista, «Completar Fechas de Inicio», que junta justo estos casos.` });
        continue;
      }

      // La asignación. Un nombre que no está en el equipo no se adivina por
      // parecido: el cliente entra sin asignar y el reporte lo dice, que es
      // recuperable. Asignárselo a la persona equivocada, no.
      const nombreConsultor = leer(f, PROPS.consultor);
      const consultora = nombreConsultor ? consultoraPorNombre.get(normalizar(nombreConsultor)) : undefined;
      if (nombreConsultor && !consultora) {
        r.salteadas.push({ fila, motivo: `«${nombre}» figura con el consultor «${nombreConsultor}», que no está en la tabla \`consultoras\`. El cliente entró sin asignar.` });
      } else if (consultora && !consultora.activa) {
        r.salteadas.push({ fila, motivo: `«${nombre}» sigue asignado a «${consultora.nombre}», que ya no está activo. Hay que reasignarlo.` });
      }

      /**
       * Un cambio de consultora hecho en la app le gana a Notion, y esto es
       * deliberado: si no, la próxima sincronización le devolvería el cliente
       * a la consultora anterior en silencio, y quien hizo el cambio se
       * enteraría cuando alguien preguntara por qué sigue sin atenderlo.
       *
       * La divergencia no se esconde: se informa, para que alguien la corrija
       * también en Notion. El día que lo haga, este renglón desaparece solo.
       */
      const traspaso = previo ? ultimoTraspaso.get(previo.id) : undefined;
      const fijadaEnLaApp = Boolean(
        traspaso && previo?.consultoraId === traspaso.destino && consultora && consultora.id !== traspaso.destino,
      );
      if (fijadaEnLaApp) {
        r.salteadas.push({
          fila,
          motivo: `«${nombre}» está asignado en la app a «${nombreDeConsultora.get(traspaso!.destino) ?? 'alguien'}» desde el ${traspaso!.fecha}, y en Notion figura «${consultora!.nombre}». Mandó la app: el traspaso se hizo acá. Actualizá Notion para que dejen de diferir.`,
        });
      }

      const estadoCrudo = normalizar(leer(f, PROPS.estado));
      const estado = ESTADO_NOTION[estadoCrudo];
      if (estadoCrudo && !estado) {
        r.salteadas.push({ fila, motivo: `«${nombre}» tiene un estado que no reconozco: «${leer(f, PROPS.estado)}». Quedó como estaba.` });
      }

      const meses = Number(leer(f, PROPS.duracionMeses));
      const carpeta = idDeCarpeta(leer(f, PROPS.carpetaDrive));

      const cliente: Cliente = {
        // Todo lo que Notion no sabe se conserva: las cuotas vienen de la
        // planilla y el resto del expediente lo carga la consultora.
        ...previo,
        id: previo?.id ?? nuevoId(),
        nombre,
        email: leer(f, PROPS.email) || previo?.email,
        telefono: leer(f, PROPS.telefono) || previo?.telefono,
        programa: leer(f, PROPS.programa) || previo?.programa || 'Founders',
        fechaAlta: alta,
        fechaFinPrevista: Number.isFinite(meses) && meses > 0 ? sumarMeses(alta, meses) : previo?.fechaFinPrevista,
        consultoraId: fijadaEnLaApp ? previo?.consultoraId : (consultora?.id ?? previo?.consultoraId),
        estado: estado ?? previo?.estado ?? 'activo',
        driveFolderId: carpeta ?? previo?.driveFolderId,
        notas: leer(f, PROPS.nota) || previo?.notas,
        tieneGarantia: previo?.tieneGarantia ?? false,
      };

      await repo.guardarCliente(cliente);
      porNombre.set(clave, cliente);
      r.aplicadas++;
    }
  } catch (e) {
    r.error = e instanceof Error ? e.message : 'Error desconocido.';
  }

  return { at: hoy, solapas: [r] };
}

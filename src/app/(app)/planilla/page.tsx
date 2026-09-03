import { redirect } from 'next/navigation';
import { Planilla } from '@/components/Planilla';
import { getUsuario, veTodo } from '@/server/auth';
import { hayPlanilla } from '@/server/planilla';
import { hayNotion } from '@/server/notion';
import { hayDrive } from '@/server/drive';
import { hayModelo } from '@/server/modelo';
import { CLIENTES, CUOTAS, esDePlanilla, SOLAPAS } from '@/server/planilla-mapeo';
import { proponerFichasAhora, sincronizarAhora, sincronizarDriveAhora, sincronizarNotionAhora } from './actions';

export const metadata = { title: 'Las fuentes · Founders Brain' };

/**
 * Las importaciones son largas por naturaleza: leen una planilla de 160 filas,
 * cien carpetas de Drive o llaman al modelo una vez por cliente. Con el tope
 * por defecto de la plataforma, la corrida se corta a mitad de camino y el
 * reporte no llega nunca. Cada corrida igual trabaja por tandas, así que un
 * corte no pierde lo hecho — pero conviene que no se corte.
 */
export const maxDuration = 300;

export default async function PlanillaPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[22px] font-semibold tracking-tight">Las fuentes</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        Founders ya tiene la información cargada en tres lugares y cada uno es bueno en algo
        distinto. La app lee los tres y ninguno tiene que migrar a ningún lado: la{' '}
        <em>planilla de finanzas</em> sabe de plata, <em>Auditoría Clientes</em> en Notion sabe del
        programa, y en <em>Drive</em> están las transcripciones de cada sesión. Nadie carga dos
        veces, y nadie copia y pega cien documentos.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        Las <strong>métricas semanales no están acá</strong>: viven en la base del CRM y se cargan
        desde el tracker de cada cliente. Tenerlas en los dos lados obliga a decidir cuál gana cada
        vez que difieren, y la que cargó la consultora mirando el caso es justamente la que una
        importación diaria pisaría sin avisar.
      </p>

      <section className="mt-5 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">1 · La planilla de finanzas</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          De acá salen las <strong>cuotas</strong>: cuántas, de cuánto, cuándo vencen y cuáles
          están pagas. También el closer y la fuente de captación.
        </p>
        <div className="mt-3">
          <Planilla configurada={hayPlanilla()} sincronizar={sincronizarAhora} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">2 · Auditoría Clientes, en Notion</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          De acá sale <strong>quién atiende a quién</strong>, más el estado del cliente, la fecha
          en que arrancó el programa, su duración y el link a su carpeta de Drive. Es la fuente que
          decide la asignación: sin esto nadie ve su cartera.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          <strong>Correla después de la planilla.</strong> Las dos fuentes tienen el estado del
          cliente y la fecha de alta, y en esos dos campos manda Notion, porque es donde el equipo
          los mantiene al día. Al revés, la planilla los pisaría con lo que tenga.
        </p>
        <div className="mt-3">
          <Planilla
            configurada={hayNotion()}
            sincronizar={sincronizarNotionAhora}
            etiqueta="Sincronizar Notion"
            etiquetaCorriendo="Leyendo Notion…"
            faltante="NOTION_TOKEN / NOTION_DB_CLIENTES"
          />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">3 · Las transcripciones, en Drive</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          De acá sale el <strong>expediente</strong>: las notas que deja Gemini después de cada
          sesión, el formulario de onboarding, la llamada de venta. Es lo que le permite al
          diagnóstico <strong>citar textual</strong> en vez de opinar, que es lo que el método
          exige antes de emitir cualquier cosa.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          <strong>Correla después de Notion.</strong> La carpeta de cada cliente la trae Notion, de
          la columna «carpeta automatica de drive»: sin eso no hay a dónde ir a buscar. Nada se
          adivina por el título — el documento es del cliente cuya carpeta lo contiene.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          Cada corrida toma una tanda, arrancando por los clientes que menos documentos tienen, y
          lo ya traído no se vuelve a bajar. Si el reporte avisa que quedaron clientes, se aprieta
          otra vez: es para que un corte por tiempo no deje todo a medias.
        </p>
        <div className="mt-3">
          <Planilla
            configurada={hayDrive()}
            sincronizar={sincronizarDriveAhora}
            etiqueta="Traer de Drive"
            etiquetaCorriendo="Bajando documentos…"
            faltante="GOOGLE_SERVICE_ACCOUNT_JSON"
            repetir
          />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">4 · La ficha, desde los documentos</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
          Los documentos entran como texto, y eso todavía no llena una ficha. Esto lee el
          expediente de cada cliente y <strong>propone</strong> los campos que están vacíos: qué
          vende, a quién, precio, qué funcionó, autoridad, cliente ideal, promesa, oferta, canal,
          meta y ticket. Con la cita de dónde salió cada cosa.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          <strong>No guarda ninguna ficha.</strong> Deja un borrador por cliente; la consultora lo
          ve al abrir la ficha, corrige lo que haga falta y guarda. No es prolijidad: la meta y el
          ticket alimentan la cuenta inversa y el KPI semanal, así que un número mal deducido, si
          se aplicara solo, dejaría de ser un dato flojo y sería el objetivo que ella persigue toda
          la semana.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          Va de a cuatro clientes por vuelta y la pantalla sigue sola hasta terminar. Arranca por
          los que tienen el expediente más vacío, y no vuelve a gastar una llamada en un cliente
          que ya tiene su propuesta.
        </p>
        <div className="mt-3">
          <Planilla
            configurada={hayModelo()}
            sincronizar={proponerFichasAhora}
            etiqueta="Proponer las fichas"
            etiquetaCorriendo="Leyendo expedientes…"
            faltante="ANTHROPIC_API_KEY"
            repetir
          />
        </div>
      </section>

      <details className="mt-4 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[13px] font-semibold">
          Cómo se conecta Drive · veinte minutos, una sola vez
        </summary>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
          Es lo único que no se resuelve pegando un valor que ya existe. Hay que crearle a la app
          un usuario propio de Google —una <em>cuenta de servicio</em>— y compartirle las carpetas
          como se le comparten a una persona.
        </p>
        <ol className="mt-3 space-y-2 text-[12.5px] leading-relaxed text-ink-2">
          <li>
            <strong>1.</strong> En{' '}
            <a
              className="underline decoration-line hover:decoration-ink-2"
              href="https://console.cloud.google.com"
              target="_blank"
              rel="noreferrer"
            >
              console.cloud.google.com
            </a>
            , crear un proyecto. El nombre no importa.
          </li>
          <li>
            <strong>2.</strong> <em>APIs y servicios → Biblioteca</em> → buscar{' '}
            <strong>Google Drive API</strong> → <em>Habilitar</em>. Si falta este paso, la
            credencial se emite igual y el error recién aparece al leer la primera carpeta.
          </li>
          <li>
            <strong>3.</strong> <em>IAM y administración → Cuentas de servicio → Crear cuenta de
            servicio</em>. <strong>No le des ningún rol</strong>: el permiso para ver las carpetas
            no lo da Google Cloud, lo da Drive en el paso 5.
          </li>
          <li>
            <strong>4.</strong> Abrirla → <em>Claves → Agregar clave → Crear nueva → JSON</em>. Se
            descarga un archivo: su contenido <strong>entero</strong> va en{' '}
            <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> en Vercel, pegado tal cual.
          </li>
          <li>
            <strong>5.</strong> En Drive, compartir la carpeta que contiene las carpetas de los
            clientes con el email de la cuenta de servicio —el <code>client_email</code> del JSON,
            termina en <code>.iam.gserviceaccount.com</code>— como <strong>Lector</strong>.{' '}
            <strong>Sin este paso Drive contesta 404</strong> aunque todo lo demás esté bien.
          </li>
        </ol>
        <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
          Ese JSON es una credencial: no va al repositorio ni a un chat. Si se filtra, se borra la
          clave en el paso 4 y se crea otra. Lo que se pide es <strong>sólo lectura</strong>: la app
          no puede escribir ni borrar nada en Drive.
        </p>
      </details>

      <section className="mt-6 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">Cómo se conecta la planilla</h2>
        <ol className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
          <li>
            <strong>1.</strong> En Drive, compartir la planilla como{' '}
            <em>cualquiera con el enlace puede ver</em>. No hace falta service account ni credencial
            de Google: se lee por el export CSV.
          </li>
          <li>
            <strong>2.</strong> Copiar el ID del enlace —el pedazo entre <code>/d/</code> y{' '}
            <code>/edit</code>— y ponerlo en <code>SHEETS_PLANILLA_ID</code>.
          </li>
          <li>
            <strong>3.</strong> La solapa de clientes es <code>{SOLAPAS.clientes}</code>. Si algún
            día se le cambia el nombre, se ajusta en <code>SHEETS_SOLAPA_CLIENTES</code> sin tocar
            código.
          </li>
          <li>
            <strong>4.</strong> Las solapas de pagos y de asistencias{' '}
            {SOLAPAS.pagos || SOLAPAS.asistencias ? (
              <>
                son <code>{SOLAPAS.pagos || '—'}</code> y{' '}
                <code>{SOLAPAS.asistencias || '—'}</code>.
              </>
            ) : (
              <>
                no existen todavía y por eso se saltean. Las cuotas igual entran: están en columnas
                dentro de la solapa de clientes. Las asistencias a mentorías, en cambio, no están
                en ninguna parte de la planilla — hasta que exista esa solapa, la regla de
                ausencias no tiene con qué correr.
              </>
            )}
          </li>
          <li>
            <strong>5.</strong> Los encabezados se comparan sin acentos ni mayúsculas, y cada campo
            acepta varios nombres. Los alias viven en <code>src/server/planilla-mapeo.ts</code>:
            cambiar una columna en Drive no requiere tocar ningún otro archivo.
          </li>
        </ol>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">Las tres reglas de la ingesta</h2>
        <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-ink-2">
          <li>
            · <strong>Celda vacía no es cero.</strong> Vacío se guarda como sin dato. Un cero
            significa que se midió y dio cero; vacío significa que nadie lo midió, y el motor los
            trata distinto en todos lados.
          </li>
          <li>
            · <strong>Una fila con cliente no identificable se saltea y se informa.</strong> No se
            adivina por parecido de nombre. Todo lo salteado aparece arriba con su motivo.
          </li>
          <li>
            · <strong>La planilla no pisa lo que se carga en la app.</strong> Las métricas
            semanales, las sesiones, los reportes, los compromisos, las lecturas y las alertas no
            se tocan desde acá.
          </li>
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-semibold">Las cuotas</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          La planilla de finanzas tiene las cuotas en columnas —primer pago, segundo, tercero,
          cuarto— y la app las guarda como {CUOTAS.length} filas de pago por cliente, con su
          vencimiento y su estado.
          {SOLAPAS.pagos
            ? <> Si preferís una fila por cuota, la solapa <code>{SOLAPAS.pagos}</code> hace lo mismo en formato largo y gana sobre las columnas.</>
            : <> El día que exista una solapa con una fila por cuota, se nombra en <code>SHEETS_SOLAPA_PAGOS</code> y gana sobre las columnas.</>}
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
          Cuando una cuota no trae estado, se deduce del vencimiento: vencida si ya pasó, pendiente
          si no. Los días de gracia salen del contrato de cada cliente, no de una constante.
        </p>
      </section>

      <details className="mt-4 rounded-xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[13px] font-semibold">
          Los encabezados que reconoce la solapa {SOLAPAS.clientes}
        </summary>

        <p className="mt-2 text-[12px] leading-relaxed text-ink-2">
          Cada campo acepta varios nombres y se comparan sin acentos ni mayúsculas, así que{' '}
          <code>Teléfono</code> y <code>telefono</code> son el mismo. Alcanza con que la planilla
          tenga <strong>uno</strong> de los nombres de cada renglón.
        </p>

        <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          De la planilla de finanzas
        </p>
        <ul className="mt-1 grid gap-1 text-[11.5px] text-ink-2 sm:grid-cols-2">
          {Object.entries(CLIENTES).filter(([c]) => esDePlanilla(c)).map(([campo, alias]) => (
            <li key={campo}>
              <span className="font-medium">{campo}</span>{' '}
              <span className="text-ink-3">← {alias.join(' · ')}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
          Del expediente · se cargan desde la ficha
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
          Estos <strong>no hacen falta en la planilla</strong> y no pasa nada si no están: son el
          negocio, la autoridad, la estrategia y el objetivo comercial de cada cliente, que los
          carga la consultora en la ficha o los propone el extractor a partir de un documento.
          Están listados por si alguna vez conviene traer alguno ya cargado.
        </p>
        <ul className="mt-1 grid gap-1 text-[11.5px] text-ink-2 sm:grid-cols-2">
          {Object.entries(CLIENTES).filter(([c]) => !esDePlanilla(c)).map(([campo, alias]) => (
            <li key={campo}>
              <span className="font-medium">{campo}</span>{' '}
              <span className="text-ink-3">← {alias.join(' · ')}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

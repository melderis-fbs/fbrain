import { daysBetween } from '@/lib/date';
import type { AlertaViva } from './alertas';
import type { ContextoCliente } from './expediente';
import { HITOS, type HitoDef } from './fases';

/**
 * ¿ES EL CLIENTE O SOMOS NOSOTROS?
 *
 * La pregunta de la revisión de cartera, textual: «okay, fulanito, fulanito,
 * fulanito ya están retrasados. Veamos qué está pasando. ¿Es el cliente o
 * somos nosotros?»
 *
 * Un atraso sin responsable es una observación, no una decisión. Y las dos
 * ramas terminan en acciones opuestas: si es el cliente, la consultora tiene
 * que confrontarlo con el roadmap que él mismo aceptó; si somos nosotros,
 * confrontarlo es injusto y además no arregla nada.
 *
 * ────────────────────────────────────────────────────────────────────────
 * LA REGLA QUE ORDENA TODO EL MÓDULO — y la parte que Founders no me pidió:
 *
 *   No se puede atribuir un atraso al cliente mientras haya una falla nuestra
 *   sin corregir.
 *
 * Si hace 37 días que nadie tuvo una sesión con él, no sabemos si ejecutó:
 * no fuimos a preguntar. Si el tracker no se carga hace un mes, el «volumen
 * bajo» es una hipótesis sobre un dato que no existe. Atribuir al cliente en
 * esas condiciones es cómodo, se siente objetivo porque hay números, y es
 * exactamente el mecanismo por el que un equipo deja de mejorar.
 *
 * Por eso el motor evalúa primero nuestro lado. Si nuestro lado está limpio,
 * recién ahí el atraso es del cliente — y entonces sí, con toda la letra.
 * ────────────────────────────────────────────────────────────────────────
 */

export type Responsable = 'cliente' | 'nosotros' | 'ambos' | 'sin_datos' | 'ninguno';

export interface Senal {
  lado: 'cliente' | 'nosotros';
  clave: string;
  /** Evidencia con número y fecha. Sin número no entra. */
  texto: string;
  /** Qué corrige esta señal en concreto */
  correccion: string;
  peso: number;
}

export interface Atribucion {
  responsable: Responsable;
  titular: string;
  senalesNosotros: Senal[];
  senalesCliente: Senal[];
  accion: string;
  /** Lo que explícitamente NO corresponde hacer todavía */
  queNoHacer?: string;
  confianza: 'alta' | 'media' | 'baja';
  /** Cuando alguien la corrigió a mano, gana la persona y queda registrado */
  manual?: { responsable: Responsable; texto: string; por: string; at: string };
}

export const RESPONSABLE_LABEL: Record<Responsable, string> = {
  cliente: 'Es el cliente',
  nosotros: 'Somos nosotros',
  ambos: 'Los dos, y primero nosotros',
  sin_datos: 'No se puede atribuir',
  ninguno: 'Sin desvío atribuible',
};

/** Para tablas y chips, donde la etiqueta larga rompe la fila. */
export const RESPONSABLE_CORTO: Record<Responsable, string> = {
  cliente: 'Cliente',
  nosotros: 'Nosotros',
  ambos: 'Los dos',
  sin_datos: 'Sin datos',
  ninguno: 'En tiempo',
};

// ---------------------------------------------------------------------------
// Desvío de hitos · el «naranja» de la revisión
// ---------------------------------------------------------------------------

export type EstadoDesvio = 'en_tiempo' | 'incipiente' | 'atrasado' | 'grave';

/**
 * «Está en la tercera semana y no avanzó con contenidos. Todavía no es una red
 * flag, pero yo ya lo marcaría naranja.»
 *
 * Ese naranja es un estado real y hasta ahora no existía: entre "va bien" y
 * "hay una alerta abierta" pasan tres semanas en las que todavía se puede
 * corregir barato. El margen es más corto para los gates, porque un gate
 * bloquea todo lo que viene después.
 */
export const MARGEN_DIAS = 12;

export interface DesvioHitos {
  estado: EstadoDesvio;
  /** Vencidos y no cumplidos, ordenados por antigüedad del atraso */
  atrasados: { hito: HitoDef; diasDeAtraso: number; incipiente: boolean }[];
  /** El más viejo sin cumplir: el que hay que destrabar primero */
  primero?: HitoDef;
  diasDeAtrasoMax: number;
  titular: string;
}

export function desvioDeHitos(ctx: ContextoCliente): DesvioHitos {
  const atrasados = HITOS.filter((h) => h.dia < ctx.dia)
    .filter((h) => ctx.hitos.get(h.key)?.estado !== 'cumplido')
    .map((h) => {
      const diasDeAtraso = ctx.dia - h.dia;
      const margen = h.gate ? Math.round(MARGEN_DIAS / 2) : MARGEN_DIAS;
      return { hito: h, diasDeAtraso, incipiente: diasDeAtraso <= margen };
    })
    .sort((a, b) => b.diasDeAtraso - a.diasDeAtraso);

  const diasDeAtrasoMax = atrasados[0]?.diasDeAtraso ?? 0;
  const firmes = atrasados.filter((a) => !a.incipiente);
  const gateFirme = firmes.some((a) => a.hito.gate);

  /**
   * Un atraso viejo sobre un hito de proceso no es grave si el cliente ya
   * consiguió lo que el programa promete. Sin esta condición, el que vendió
   * ocho veces y tiene el hito de KPI sin tildar encabeza la lista de
   * atrasados por encima del que va al día 90 sin vender — y la primera vez
   * que eso pasa, el equipo deja de mirar la pantalla.
   */
  let estado: EstadoDesvio = 'en_tiempo';
  if (!atrasados.length) estado = 'en_tiempo';
  else if (!firmes.length) estado = 'incipiente';
  else if (gateFirme || firmes.length >= 3 || (diasDeAtrasoMax > 30 && ctx.ventas === 0)) estado = 'grave';
  else estado = 'atrasado';

  const primero = firmes[0]?.hito ?? atrasados[0]?.hito;
  const titular =
    estado === 'en_tiempo'
      ? 'En tiempo y forma'
      : estado === 'incipiente'
        ? `Empezando a retrasarse: ${primero!.label.toLowerCase()} lleva ${diasDeAtrasoMax} días de más`
        : `${firmes.length} hito(s) atrasados. El más viejo: ${primero!.label.toLowerCase()}, ${diasDeAtrasoMax} días`;

  return { estado, atrasados, primero, diasDeAtrasoMax, titular };
}

export const DESVIO_LABEL: Record<EstadoDesvio, string> = {
  en_tiempo: 'En tiempo',
  incipiente: 'Empezando a retrasarse',
  atrasado: 'Atrasado',
  grave: 'Atraso grave',
};

// ---------------------------------------------------------------------------
// Las señales
// ---------------------------------------------------------------------------

const N = (clave: string, texto: string, correccion: string, peso: number): Senal => ({
  lado: 'nosotros', clave, texto, correccion, peso,
});
const C = (clave: string, texto: string, correccion: string, peso: number): Senal => ({
  lado: 'cliente', clave, texto, correccion, peso,
});

/** Nuestro lado. Todo lo que acá aparece es una obligación de Founders, no del cliente. */
function senalesNuestras(ctx: ContextoCliente, alertas: AlertaViva[]): Senal[] {
  const s: Senal[] = [];

  if (ctx.diasSinSesion === null && !ctx.esNuevo) {
    s.push(N('cadencia', `No hay ninguna sesión realizada registrada en ${ctx.dia} días de programa.`,
      'Agendar la primera sesión hoy y confirmar horario fijo.', 100));
  } else if (ctx.diasSinSesion !== null && ctx.diasSinSesion > 21) {
    s.push(N('cadencia', `Última sesión hace ${ctx.diasSinSesion} días. La cadencia acordada es semanal y la agenda la llevamos nosotros.`,
      'Contacto el mismo día y próxima sesión con fecha, no "cuando puedas".', 100));
  }

  if (ctx.traspasoReciente) {
    const post = ctx.sesionesRealizadas.filter((x) => x.fecha >= ctx.traspasoReciente!.fecha);
    const d = daysBetween(ctx.traspasoReciente.fecha, ctx.hoy);
    if (!post.length && d >= 7) {
      s.push(N('traspaso', `Cambio de consultora hace ${d} días y todavía no hubo una sesión con la nueva.`,
        'Sesión de transición esta semana: repasar el expediente delante del cliente para que no tenga que contar todo otra vez.', 95));
    }
  }

  if (ctx.dia > 30 && !ctx.estrategia) {
    s.push(N('estrategia', `Día ${ctx.dia} y no hay ninguna versión de estrategia cargada.`,
      'Cerrar cliente ideal y oferta, y cargarlas como versión 1 con fecha.', 90));
  }

  if (ctx.dia > 14 && ctx.hitos.get('cuenta_inversa')?.estado !== 'cumplido') {
    s.push(N('cuenta_inversa', `Día ${ctx.dia} y la cuenta inversa nunca se hizo con el cliente.`,
      'Hacerla en la próxima sesión: sin ella el cliente no sabe contra qué número mide su semana.', 85));
  }

  if (ctx.diasDesdeMetricas === null && ctx.dia > 21) {
    s.push(N('tracker', 'El tracker no tiene ni una semana cargada. Cualquier lectura de volumen es una hipótesis.',
      'Cargar las últimas cuatro semanas al cerrar la próxima sesión. Son dos minutos.', 88));
  } else if (ctx.diasDesdeMetricas !== null && ctx.diasDesdeMetricas > 21) {
    s.push(N('tracker', `El tracker no se carga hace ${ctx.diasDesdeMetricas} días. Se carga al cerrar la sesión: es nuestro, no del cliente.`,
      'Cargar las semanas faltantes antes de la próxima sesión.', 80));
  }

  if (ctx.sesionesSinRegistro.length >= 3) {
    s.push(N('registro', `${ctx.sesionesSinRegistro.length} sesiones realizadas sin transcripción ni reporte.`,
      'Subir la grabación o escribir el reporte. Lo que no se registra no se puede revisar después.', 70));
  }

  const rojaVieja = alertas
    .filter((a) => !a.cerradaAt && (a.estadoSemaforo === 'rojo' || a.estadoSemaforo === 'negro'))
    .map((a) => ({ a, d: daysBetween(a.emitidaAt, ctx.hoy) }))
    .filter((x) => x.d > 7)
    .sort((x, y) => y.d - x.d)[0];
  if (rojaVieja) {
    s.push(N('alerta_abierta', `Alerta ${rojaVieja.a.codigo} abierta hace ${rojaVieja.d} días sin texto de cierre.`,
      'Cerrarla escribiendo qué se hizo, o escalarla. Una roja de dos semanas dejó de ser una alerta.', 92));
  }

  if (ctx.cliente.nivelDesalineado) {
    s.push(N('nivel', 'El negocio que trajo no corresponde al nivel del producto que compró: entró en la etapa equivocada.',
      'Revisar la llamada de venta y definir con administración si se recolocá el producto o se ajusta el acompañamiento.', 96));
  }

  return s.sort((a, b) => b.peso - a.peso);
}

/** El lado del cliente. Sólo se lee si el nuestro está limpio. */
function senalesDelCliente(ctx: ContextoCliente): Senal[] {
  const s: Senal[] = [];

  const evaluados = ctx.registros.compromisos.filter(
    (c) => c.estado !== 'pendiente' && daysBetween(c.fechaVencimiento, ctx.hoy) <= 60,
  );
  if (ctx.cumplimientoCompromisos !== null && ctx.cumplimientoCompromisos < 0.5 && evaluados.length >= 3) {
    const ok = evaluados.filter((c) => c.estado === 'cumplido').length;
    s.push(C('compromisos', `Cumplió ${ok} de ${evaluados.length} compromisos de los últimos 60 días.`,
      'Reducir el compromiso a una sola acción y hacerla dentro de la sesión.', 95));
  }

  if (ctx.kpiSemanal && ctx.ultimas4.dmsIniciados.confiable) {
    const hechos = ctx.ultimas4.dmsIniciados.valor;
    const necesita = Math.round(ctx.kpiSemanal.dms * ctx.ultimas4.dmsIniciados.semanasConDato);
    if (necesita > 0 && hechos < necesita * 0.5) {
      const pct = Math.round((hechos / necesita) * 100);
      s.push(C('kpi', `${hechos} DMs en las últimas ${ctx.ultimas4.dmsIniciados.semanasConDato} semanas cargadas contra los ${necesita} que necesita para su meta: ${pct}%.`,
        'Confrontar con la cuenta inversa que él mismo aceptó y dejar el número de esta semana por escrito.', 92));
    }
  }

  const fallidas = ctx.registros.sesiones.filter(
    (x) => x.fecha <= ctx.hoy && daysBetween(x.fecha, ctx.hoy) <= 60 &&
      ['no_asistio', 'cancelada'].includes(x.estadoAgenda),
  );
  if (fallidas.length >= 2) {
    s.push(C('asistencia', `${fallidas.length} sesiones agendadas que el cliente no tomó en los últimos 60 días.`,
      'Decirlo con nombre: el programa tiene una cadencia y él la está rompiendo.', 88));
  }

  if (ctx.dia > 21 && ctx.asistenciaMentorias3sem === 0) {
    s.push(C('mentorias', 'No asistió a ninguna mentoría grupal en las últimas tres semanas.',
      'Recordarle que las mentorías son parte de lo que compró, no un extra.', 60));
  }

  if (ctx.ultimas4.contenidoPublicado.confiable && ctx.ultimas4.contenidoPublicado.valor === 0 && ctx.dia > 35) {
    s.push(C('contenido', `Cero contenido publicado en las ${ctx.ultimas4.contenidoPublicado.semanasConDato} semanas cargadas.`,
      'Una pieza esta semana, con fecha y hora acordadas en la sesión.', 75));
  }

  return s.sort((a, b) => b.peso - a.peso);
}

// ---------------------------------------------------------------------------
// El veredicto
// ---------------------------------------------------------------------------

export function atribuir(ctx: ContextoCliente, alertas: AlertaViva[]): Atribucion {
  const desvio = desvioDeHitos(ctx);
  const nuestras = senalesNuestras(ctx, alertas);
  const suyas = senalesDelCliente(ctx);

  const manual = ctx.registros.atribuciones?.[0];

  // Sin desvío y sin señales: no hay nada que atribuir. La pantalla no
  // inventa un culpable porque el cliente todavía no vendió.
  if (desvio.estado === 'en_tiempo' && !nuestras.length && !suyas.length) {
    return {
      responsable: 'ninguno',
      titular: 'Va en tiempo y forma. No hay atraso que atribuir.',
      senalesNosotros: [], senalesCliente: [],
      accion: 'Sostener la cadencia. Nada que corregir esta semana.',
      confianza: ctx.bloquesCargados >= 4 ? 'alta' : 'media',
      manual,
    };
  }

  /**
   * Hay atraso y ninguna señal lo explica: ni el cliente dejó de ejecutar ni
   * nosotros dejamos de acompañar. En la práctica eso significa una sola cosa
   * —el hito quedó sin mover en el tablero— y es nuestro, porque el tablero lo
   * lleva la consultora. Sin este caso el motor se quedaba sin veredicto justo
   * donde el atraso es puramente administrativo, que es el más frecuente.
   */
  if (!nuestras.length && !suyas.length && desvio.estado !== 'en_tiempo' && desvio.primero) {
    nuestras.push({
      lado: 'nosotros',
      clave: 'hitos_sin_actualizar',
      texto: `«${desvio.primero.label}» figura vencido hace ${desvio.diasDeAtrasoMax} días y ninguna otra señal lo explica: el cliente ejecuta y el acompañamiento está al día.`,
      correccion: 'Actualizar el estado del hito en la próxima sesión. Si en realidad está cumplido, el atraso era del tablero y no del cliente.',
      peso: 40,
    });
  }

  const ciego = ctx.bloquesCargados < 3 || (!ctx.ultimas4.dmsIniciados.confiable && !ctx.totales.ventas.confiable);

  let responsable: Responsable;
  if (nuestras.length && suyas.length) responsable = 'ambos';
  else if (nuestras.length) responsable = 'nosotros';
  else if (suyas.length) responsable = 'cliente';
  else if (ciego) responsable = 'sin_datos';
  else responsable = 'cliente';

  // Un expediente ciego no permite acusar a nadie, ni siquiera cuando los
  // números "dicen" algo: los números no existen.
  if (responsable === 'cliente' && ciego) responsable = 'sin_datos';

  const primeraN = nuestras[0];
  const primeraC = suyas[0];

  let titular: string;
  let accion: string;
  let queNoHacer: string | undefined;

  switch (responsable) {
    case 'nosotros':
      titular = primeraN.texto;
      accion = primeraN.correccion;
      queNoHacer = 'No confrontar al cliente con su atraso todavía. Este atraso lo produjo el acompañamiento, no él.';
      break;
    case 'ambos':
      titular = `${primeraN.texto} Y del otro lado: ${primeraC.texto.charAt(0).toLowerCase()}${primeraC.texto.slice(1)}`;
      accion = `Primero lo nuestro: ${primeraN.correccion} Recién con eso hecho, la conversación de ejecución con el cliente es legítima.`;
      queNoHacer = 'No abrir la sesión reclamando ejecución. Se abre reconociendo lo nuestro y después se pide lo suyo.';
      break;
    case 'cliente':
      titular = primeraC.texto;
      accion = `Nuestro lado está al día, así que el guion de confrontación se puede usar entero. ${primeraC.correccion}`;
      queNoHacer = 'No suavizarlo. Suavizar acá es lo que produce el reclamo del mes que viene.';
      break;
    case 'sin_datos':
      titular = `Expediente ${ctx.bloquesCargados}/6 y sin números confiables: sobre este cliente el sistema no puede concluir nada.`;
      accion = 'Cargar tracker y bloques faltantes antes de la próxima sesión. Hasta entonces, cualquier lectura es opinión.';
      queNoHacer = 'No usar este caso en la revisión de cartera como si fuera un dato.';
      break;
    default:
      titular = desvio.titular;
      accion = 'Sostener la cadencia.';
  }

  const confianza: Atribucion['confianza'] = ciego ? 'baja' : ctx.bloquesCargados >= 5 ? 'alta' : 'media';

  return {
    responsable: manual?.responsable ?? responsable,
    titular: manual ? `${manual.texto} — corregido a mano por ${manual.por}` : titular,
    senalesNosotros: nuestras,
    senalesCliente: suyas,
    accion,
    queNoHacer,
    confianza,
    manual,
  };
}

// ---------------------------------------------------------------------------
// El guion de confrontación
// ---------------------------------------------------------------------------

/**
 * «Recordá que en la sesión 1 vimos el roadmap. Hoy deberíamos estar en este
 * punto.» Eso es lo que la consultora necesita tener escrito antes de entrar,
 * y es la rama "es el cliente" de la atribución convertida en una conversación
 * concreta.
 *
 * No se habilita cuando el responsable somos nosotros. Ése es el punto.
 */
export interface Guion {
  usable: boolean;
  motivoNoUsable?: string;
  acordado: string;
  deberiaEstar: string[];
  estaEn: string[];
  falta: string[];
  pedidoSemana: string;
  cierre: string;
}

export function guionConfrontacion(ctx: ContextoCliente, atr: Atribucion): Guion {
  const desvio = desvioDeHitos(ctx);

  const acordado = ctx.kpiSemanal && ctx.objetivo
    ? `En la sesión 1 acordamos: meta de ${ctx.objetivo.moneda} ${ctx.objetivo.metaMensual.toLocaleString('es-AR')} por mes con un ticket de ${ctx.objetivo.moneda} ${ctx.objetivo.ticket.toLocaleString('es-AR')}. Esa cuenta da ${ctx.kpiSemanal.dms} DMs por semana, ${ctx.kpiSemanal.agendas} agendas y ${ctx.kpiSemanal.ventasMes} ventas por mes.`
    : 'La cuenta inversa no está hecha, así que no hay un número acordado contra el cual medir la semana. Ése es el primer punto de la sesión.';

  const deberiaEstar = HITOS.filter((h) => h.dia <= ctx.dia).map(
    (h) => `Día ${h.dia} · ${h.label}`,
  );
  const estaEn = ctx.hitosCumplidos.map((h) => h.label);
  const falta = desvio.atrasados.map(
    (a) => `${a.hito.label} — ${a.diasDeAtraso} días de más${a.hito.gate ? ' · gate' : ''}`,
  );

  const pedidoSemana = ctx.kpiSemanal
    ? `Esta semana: ${ctx.kpiSemanal.dms} conversaciones nuevas y ${ctx.kpiSemanal.agendas} agendas. Es el número que sale de su propia meta, no uno que le ponemos nosotros.`
    : 'Esta semana: cerrar la cuenta inversa y salir con el número de DMs escrito.';

  const usable = atr.responsable === 'cliente';

  return {
    usable,
    motivoNoUsable: usable
      ? undefined
      : atr.responsable === 'sin_datos'
        ? 'No hay datos para sostener el reclamo. Cargar el expediente primero.'
        : atr.responsable === 'ninguno'
          ? 'No hay atraso que confrontar.'
          : `Hay una falla nuestra sin corregir: ${atr.senalesNosotros[0]?.texto ?? ''} Corregirla antes de pedirle nada.`,
    acordado,
    deberiaEstar,
    estaEn,
    falta,
    pedidoSemana,
    cierre: 'El compromiso sale de la sesión escrito y con fecha. Si no tiene fecha, no es un compromiso.',
  };
}

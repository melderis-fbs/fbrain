import { daysBetween, mondayOf } from '@/lib/date';
import { esperadoAlDia, objetivoSemanal, type ObjetivoSemanal } from './cuenta-inversa';
import { FASES, HITOS, type FaseNegocio, type HitoDef } from './fases';
import type {
  DocumentoCliente,
  Alerta,
  AsistenciaMentoria,
  AtribucionManual,
  Autoridad,
  Baja,
  Cliente,
  Compromiso,
  Consultora,
  Diagnostico,
  EstrategiaVersion,
  HitoCliente,
  LecturaConsultora,
  MetricaSemanal,
  Negocio,
  ObjetivoComercial,
  Pago,
  Prorroga,
  RevisionCaso,
  Sesion,
  Traspaso,
} from './types';

/**
 * EL EXPEDIENTE
 *
 * Seis bloques. Con menos de cuatro cargados, los motores de criterio no
 * corren: devuelven qué falta y las preguntas para conseguirlo. Un diagnóstico
 * sobre un expediente vacío no es un diagnóstico, es una opinión.
 */

export interface RegistrosCliente {
  cliente: Cliente;
  negocio?: Negocio;
  autoridad?: Autoridad;
  estrategias: EstrategiaVersion[];
  objetivo?: ObjetivoComercial;
  metricas: MetricaSemanal[];
  sesiones: Sesion[];
  compromisos: Compromiso[];
  pagos: Pago[];
  asistencias: AsistenciaMentoria[];
  hitos: HitoCliente[];
  lecturas: LecturaConsultora[];
  alertas: Alerta[];
  traspasos: Traspaso[];
  diagnosticos: Diagnostico[];
  documentos: DocumentoCliente[];
  prorrogas: Prorroga[];
  bajas: Baja[];
  atribuciones: AtribucionManual[];
  revisiones: RevisionCaso[];
}

export interface Bloques {
  identidad: boolean;
  negocio: boolean;
  autoridad: boolean;
  estrategia: boolean;
  numeros: boolean;
  trazabilidad: boolean;
}

/** Suma que respeta la diferencia entre "cero" y "no sabemos". */
export interface Acumulado {
  valor: number;
  semanasConDato: number;
  semanasSinDato: number;
  /** null cuando ninguna semana tiene dato: no se puede concluir nada */
  confiable: boolean;
}

export type CampoMetrica =
  | 'contenidoPublicado' | 'alcanceTotal' | 'alcanceNoSeguidores' | 'dmsIniciados'
  | 'conversacionesAvanzadas' | 'leads' | 'leadsCalificados' | 'agendas'
  | 'asistencias' | 'cancelaciones' | 'llamadas' | 'ofertasRealizadas'
  | 'ventas' | 'facturado' | 'inversionAds';

function acumular(metricas: MetricaSemanal[], campo: CampoMetrica): Acumulado {
  let valor = 0;
  let con = 0;
  let sin = 0;
  for (const m of metricas) {
    const v = m[campo];
    if (v === null || v === undefined) sin += 1;
    else {
      valor += v;
      con += 1;
    }
  }
  return { valor, semanasConDato: con, semanasSinDato: sin, confiable: con > 0 };
}

export interface ContextoCliente {
  cliente: Cliente;
  consultora?: Consultora;
  hoy: string;
  /** Día 1 = primer día del programa */
  dia: number;
  semanasDesdeAlta: number;
  esNuevo: boolean;
  bloques: Bloques;
  bloquesCargados: number;
  habilitaDiagnostico: boolean;
  estrategia?: EstrategiaVersion;
  estrategiasPrevias: EstrategiaVersion[];
  objetivo?: ObjetivoComercial;
  kpiSemanal?: ObjetivoSemanal;
  esperado?: ReturnType<typeof esperadoAlDia>;
  totales: Record<CampoMetrica, Acumulado>;
  ultimas4: Record<CampoMetrica, Acumulado>;
  previas4: Record<CampoMetrica, Acumulado>;
  ultimaSemanaCargada?: MetricaSemanal;
  diasDesdeMetricas: number | null;
  ventas: number;
  facturado: number;
  primeraVentaDia: number | null;
  hitos: Map<string, HitoCliente>;
  hitosVencidos: HitoDef[];
  hitosCumplidos: HitoDef[];
  gatesVencidos: HitoDef[];
  fase: FaseNegocio;
  ultimaSesion?: Sesion;
  diasSinSesion: number | null;
  sesionesRealizadas: Sesion[];
  sesionesUltimos60: Sesion[];
  sesionesSinRegistro: Sesion[];
  cadenciaUltimos30: number;
  compromisosVencidos: Compromiso[];
  cumplimientoCompromisos: number | null;
  asistenciaMentorias3sem: number;
  cuotasVencidas: Pago[];
  diasCuotaMasVencida: number | null;
  traspasoReciente?: Traspaso;
  lectura?: LecturaConsultora;
  diasDesdeLectura: number | null;
  alertasAbiertas: Alerta[];
  registros: RegistrosCliente;
}

const CAMPOS: CampoMetrica[] = [
  'contenidoPublicado', 'alcanceTotal', 'alcanceNoSeguidores', 'dmsIniciados',
  'conversacionesAvanzadas', 'leads', 'leadsCalificados', 'agendas',
  'asistencias', 'cancelaciones', 'llamadas', 'ofertasRealizadas',
  'ventas', 'facturado', 'inversionAds',
];

function acumularTodos(metricas: MetricaSemanal[]): Record<CampoMetrica, Acumulado> {
  const out = {} as Record<CampoMetrica, Acumulado>;
  for (const c of CAMPOS) out[c] = acumular(metricas, c);
  return out;
}

export function construirContexto(
  registros: RegistrosCliente,
  hoy: string,
  consultora?: Consultora,
): ContextoCliente {
  const { cliente } = registros;
  const dia = Math.max(1, daysBetween(cliente.fechaAlta, hoy) + 1);
  const semanasDesdeAlta = dia / 7;
  const esNuevo = dia <= 14;

  // ------------------------------------------------------------- estrategia
  const estrategias = [...registros.estrategias].sort((a, b) => b.version - a.version);
  const estrategia = estrategias[0];
  const estrategiasPrevias = estrategias.slice(1);

  // ------------------------------------------------------------- métricas
  const metricas = [...registros.metricas].sort((a, b) => a.semanaIso.localeCompare(b.semanaIso));
  const lunes = mondayOf(hoy);
  const ultimas4 = metricas.filter((m) => daysBetween(m.semanaIso, lunes) < 28);
  const previas4 = metricas.filter((m) => {
    const d = daysBetween(m.semanaIso, lunes);
    return d >= 28 && d < 56;
  });
  const totales = acumularTodos(metricas);
  // "Cargada" es la última semana con algún dato real, no la última fila: una
  // fila con todos los campos en null significa que nadie la completó.
  const conDato = metricas.filter(
    (m) => m.dmsIniciados !== null || m.agendas !== null || m.ventas !== null,
  );
  const ultimaSemanaCargada = conDato[conDato.length - 1];
  const diasDesdeMetricas = ultimaSemanaCargada
    ? daysBetween(ultimaSemanaCargada.semanaIso, hoy)
    : null;

  const ventas = totales.ventas.valor;
  const facturado = totales.facturado.valor;
  const semanaPrimeraVenta = metricas.find((m) => (m.ventas ?? 0) > 0);
  const primeraVentaDia = semanaPrimeraVenta
    ? daysBetween(cliente.fechaAlta, semanaPrimeraVenta.semanaIso) + 1
    : null;

  // ------------------------------------------------------------- sesiones
  const sesiones = [...registros.sesiones].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const realizadas = sesiones.filter((s) => s.estadoAgenda === 'realizada' && s.fecha <= hoy);
  const ultimaSesion = realizadas[0];
  const diasSinSesion = ultimaSesion ? daysBetween(ultimaSesion.fecha, hoy) : null;
  const sesionesUltimos60 = sesiones.filter((s) => s.fecha <= hoy && daysBetween(s.fecha, hoy) <= 60);
  const cadenciaUltimos30 = realizadas.filter((s) => daysBetween(s.fecha, hoy) <= 30).length;
  const sesionesSinRegistro = realizadas.filter(
    (s) => !s.transcripcionTexto && !s.transcripcionPath && !s.reporte,
  );

  // ------------------------------------------------------------- compromisos
  const compromisosVencidos = registros.compromisos.filter(
    (c) => c.estado === 'pendiente' && c.fechaVencimiento < hoy,
  );
  const evaluados = registros.compromisos.filter(
    (c) => c.estado !== 'pendiente' && daysBetween(c.fechaVencimiento, hoy) <= 60,
  );
  const cumplimientoCompromisos = evaluados.length
    ? evaluados.filter((c) => c.estado === 'cumplido').length / evaluados.length
    : null;

  // ------------------------------------------------------------- mentorías
  const asistencia3sem = registros.asistencias.filter(
    (a) => a.asistio && daysBetween(a.fecha, hoy) <= 21,
  ).length;

  // ------------------------------------------------------------- pagos
  const cuotasVencidas = registros.pagos.filter(
    (p) => !p.fechaPago && p.fechaVencimiento < hoy && p.estado !== 'incobrable',
  );
  const diasCuotaMasVencida = cuotasVencidas.length
    ? Math.max(...cuotasVencidas.map((p) => daysBetween(p.fechaVencimiento, hoy)))
    : null;

  // ------------------------------------------------------------- traspaso
  const traspasoReciente = registros.traspasos
    .filter((t) => daysBetween(t.fecha, hoy) <= 30)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];

  // ------------------------------------------------------------- lectura
  const lecturas = [...registros.lecturas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lectura = lecturas[0];
  const diasDesdeLectura = lectura ? daysBetween(lectura.fecha, hoy) : null;

  // ------------------------------------------------------------- bloques
  const bloques: Bloques = {
    identidad: Boolean(cliente.programa && cliente.fechaAlta && cliente.consultoraId),
    negocio: Boolean(registros.negocio?.queVende && registros.negocio?.aQuien && registros.negocio?.precio),
    autoridad: Boolean(registros.autoridad?.haceExcepcionalmenteBien),
    estrategia: Boolean(estrategia?.clienteIdeal && estrategia?.oferta),
    numeros: metricas.some((m) => daysBetween(m.semanaIso, hoy) <= 28),
    trazabilidad: realizadas.some((s) => Boolean(s.transcripcionTexto || s.reporte)),
  };
  const bloquesCargados = Object.values(bloques).filter(Boolean).length;

  // ------------------------------------------------------------- hitos
  const hitos = new Map(registros.hitos.map((h) => [h.hitoKey, h]));
  // Los hitos automáticos se derivan de los datos: nadie los tilda a mano.
  const auto: Record<string, boolean> = {
    primera_venta: ventas >= 1,
    venta_repetida: ventas >= 2,
    primera_agenda: totales.agendas.valor >= 1,
    primera_llamada: totales.asistencias.valor >= 1,
    expediente: bloquesCargados >= 4,
  };
  for (const h of HITOS) {
    if (!h.automatico) continue;
    if (auto[h.automatico]) {
      const actual = hitos.get(h.key);
      if (!actual || actual.estado !== 'cumplido') {
        hitos.set(h.key, {
          clienteId: cliente.id,
          hitoKey: h.key,
          estado: 'cumplido',
          actualizadoAt: hoy,
          cumplidoAt: actual?.cumplidoAt ?? hoy,
        });
      }
    }
  }
  const hitosVencidos = HITOS.filter((h) => h.dia <= dia);
  const hitosCumplidos = HITOS.filter((h) => hitos.get(h.key)?.estado === 'cumplido');
  const gatesVencidos = hitosVencidos.filter(
    (h) => h.gate && hitos.get(h.key)?.estado !== 'cumplido',
  );

  // Fase = la primera cuyos hitos no están todos cumplidos
  let fase: FaseNegocio = 'escala';
  for (const f of FASES) {
    const deFase = HITOS.filter((h) => h.fase === f.key);
    if (deFase.some((h) => hitos.get(h.key)?.estado !== 'cumplido')) {
      fase = f.key;
      break;
    }
  }

  // ------------------------------------------------------------- objetivo
  const objetivo = registros.objetivo;
  const kpiSemanal = objetivo ? objetivoSemanal(objetivo) : undefined;
  const esperado = objetivo ? esperadoAlDia(objetivo, dia) : undefined;

  return {
    cliente,
    consultora,
    hoy,
    dia,
    semanasDesdeAlta,
    esNuevo,
    bloques,
    bloquesCargados,
    habilitaDiagnostico: bloquesCargados >= 4,
    estrategia,
    estrategiasPrevias,
    objetivo,
    kpiSemanal,
    esperado,
    totales,
    ultimas4: acumularTodos(ultimas4),
    previas4: acumularTodos(previas4),
    ultimaSemanaCargada,
    diasDesdeMetricas,
    ventas,
    facturado,
    primeraVentaDia,
    hitos,
    hitosVencidos,
    hitosCumplidos,
    gatesVencidos,
    fase,
    ultimaSesion,
    diasSinSesion,
    sesionesRealizadas: realizadas,
    sesionesUltimos60,
    sesionesSinRegistro,
    cadenciaUltimos30,
    compromisosVencidos,
    cumplimientoCompromisos,
    asistenciaMentorias3sem: asistencia3sem,
    cuotasVencidas,
    diasCuotaMasVencida,
    traspasoReciente,
    lectura,
    diasDesdeLectura,
    alertasAbiertas: registros.alertas.filter((a) => !a.cerradaAt),
    registros,
  };
}

export const BLOQUE_LABEL: Record<keyof Bloques, string> = {
  identidad: 'Identidad',
  negocio: 'Negocio',
  autoridad: 'Autoridad',
  estrategia: 'Estrategia vigente',
  numeros: 'Números',
  trazabilidad: 'Trazabilidad',
};

export const BLOQUE_COMO_LLENAR: Record<keyof Bloques, string> = {
  identidad: 'Asignar consultora y confirmar programa y fecha de alta.',
  negocio: 'Qué vende, a quién y a qué precio. Sale de la sesión 1.',
  autoridad: 'Qué hace excepcionalmente bien. Casi siempre el arranque más rápido sale de acá.',
  estrategia: 'Cerrar cliente ideal y oferta, y cargarlos como versión 1.',
  numeros: 'Cargar el tracker de las últimas semanas. Dos minutos al cerrar la sesión.',
  trazabilidad: 'Subir la transcripción o escribir el reporte de al menos una sesión.',
};

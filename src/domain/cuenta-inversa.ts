import type { ObjetivoComercial } from './types';

/**
 * LA CUENTA INVERSA DESDE LA META
 *
 * Es lo primero que hay que hacer en la sesión 1 con cada cliente y lo que más
 * se saltea. Y es la decisión de integración más importante de esta fusión:
 *
 * La versión anterior del CRM comparaba a cada cliente contra un benchmark
 * global por etapa ("20 conversaciones al mes 2"). Eso es un promedio que no le
 * queda bien a nadie: un cliente con ticket de USD 3.000 y otro con ticket de
 * USD 400 no necesitan el mismo embudo ni de lejos.
 *
 * Acá la expectativa sale de la meta y el ticket de cada cliente. Es la misma
 * cuenta que el método ya usa en la sesión 1, y produce el KPI operativo real:
 * "19 DMs y 5-6 agendas por semana".
 */

export interface TasasEmbudo {
  cierre: number;
  asistencia: number;
  agendamiento: number;
  avance: number;
  dmSobreAlcance: number;
}

/** Tasas de referencia con el embudo en objetivo. */
export const TASAS_OBJETIVO: TasasEmbudo = {
  cierre: 0.32,
  asistencia: 0.85,
  agendamiento: 0.45,
  avance: 0.6,
  dmSobreAlcance: 0.005,
};

/** Tasas de referencia con el embudo en rojo. Sirven para mostrar el costo de no arreglarlo. */
export const TASAS_ROJO: TasasEmbudo = {
  cierre: 0.21,
  asistencia: 0.7,
  agendamiento: 0.3,
  avance: 0.4,
  dmSobreAlcance: 0.005,
};

export interface CuentaInversa {
  ventasMes: number;
  asistenciasMes: number;
  agendasMes: number;
  conversacionesMes: number;
  dmsMes: number;
  dmsSemana: number;
  agendasSemana: number;
  alcanceSemana: number;
}

export function calcularCuentaInversa(
  metaMensual: number,
  ticket: number,
  tasas: TasasEmbudo,
): CuentaInversa {
  const safe = (n: number) => (n > 0 ? n : 1);
  const ventas = metaMensual / safe(ticket);
  const asistencias = ventas / safe(tasas.cierre);
  const agendas = asistencias / safe(tasas.asistencia);
  const conversaciones = agendas / safe(tasas.agendamiento);
  const dms = conversaciones / safe(tasas.avance);
  const alcanceSemana = dms / 4 / safe(tasas.dmSobreAlcance);

  return {
    ventasMes: Math.ceil(ventas),
    asistenciasMes: Math.ceil(asistencias),
    agendasMes: Math.ceil(agendas),
    conversacionesMes: Math.ceil(conversaciones),
    dmsMes: Math.ceil(dms),
    dmsSemana: Math.ceil(dms / 4),
    agendasSemana: Math.ceil(agendas / 4),
    alcanceSemana: Math.ceil(alcanceSemana),
  };
}

export function tasasDe(objetivo: ObjetivoComercial): TasasEmbudo {
  return {
    cierre: objetivo.tasaCierre,
    asistencia: objetivo.tasaAsistencia,
    agendamiento: objetivo.tasaAgendamiento,
    avance: objetivo.tasaAvance,
    dmSobreAlcance: objetivo.tasaDmSobreAlcance,
  };
}

export interface ObjetivoSemanal {
  dms: number;
  conversaciones: number;
  agendas: number;
  asistencias: number;
  ventasMes: number;
  alcance: number;
}

export function objetivoSemanal(objetivo: ObjetivoComercial): ObjetivoSemanal {
  const ci = calcularCuentaInversa(objetivo.metaMensual, objetivo.ticket, tasasDe(objetivo));
  return {
    dms: ci.dmsSemana,
    conversaciones: Math.ceil(ci.conversacionesMes / 4),
    agendas: ci.agendasSemana,
    asistencias: Math.ceil(ci.asistenciasMes / 4),
    ventasMes: ci.ventasMes,
    alcance: ci.alcanceSemana,
  };
}

/**
 * Acumulado esperado al día `dia` del programa.
 * No se espera nada antes de que el cliente empiece a prospectar: castigar a
 * alguien del día 20 por no tener conversaciones es el falso positivo que hace
 * que un equipo deje de mirar las alertas.
 */
export function esperadoAlDia(objetivo: ObjetivoComercial, dia: number) {
  const semanal = objetivoSemanal(objetivo);
  const semanasActivas = Math.max(0, (dia - objetivo.diaInicioProspeccion) / 7);
  return {
    semanasActivas,
    dms: semanal.dms * semanasActivas,
    conversaciones: semanal.conversaciones * semanasActivas,
    agendas: semanal.agendas * semanasActivas,
    asistencias: semanal.asistencias * semanasActivas,
    ventas: (semanal.ventasMes / 4) * semanasActivas,
    facturado: (semanal.ventasMes / 4) * semanasActivas * objetivo.ticket,
  };
}

/**
 * Diagnóstico por eslabón del embudo. El valor de esta tabla no son los
 * umbrales: es que cada rojo tiene una causa distinta y una acción distinta.
 */
export const UMBRALES = {
  /** Alcance que no es de seguidores, sobre el total */
  alcanceNoSeguidores: 0.4,
  /** Conversaciones que avanzan sobre DMs iniciados */
  avanceConversacion: 0.35,
  /** Agendas sobre conversaciones que avanzan */
  agendamiento: 0.3,
  /** Asistencias sobre agendas */
  asistencia: 0.7,
  /** Ventas sobre asistencias */
  cierre: 0.2,
  /** Muestra mínima para concluir sobre un eslabón */
  muestraMinima: 10,
  /** Porcentaje de ventas sin atribuir a partir del cual no se concluye sobre canal */
  sinAtribuirMax: 0.3,
} as const;

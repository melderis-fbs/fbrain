import type { Cliente, EstadoCliente } from './types';

/**
 * LIMPIEZA DE LA CARTERA
 *
 * La importación trajo la planilla entera, y la planilla tiene el histórico:
 * gente que terminó el programa hace un año, filas viejas de una migración
 * anterior. Todas entraron como activas, así que el tablero cuenta 167 activos
 * donde la cartera real es bastante menor.
 *
 * Eso no es un problema cosmético. Un cliente que ya no existe **dispara
 * alertas**: la regla del día 90 sin venta se cumple perfecto en alguien que
 * se fue hace ocho meses, y cada una de esas alertas le pide a una consultora
 * que haga una revisión de caso sobre una persona que no está. La bandeja se
 * llena de trabajo que no hay que hacer, y esa es la forma más rápida de que
 * un equipo deje de mirar la bandeja.
 *
 * Darlos de baja de a uno son 60 fichas. Esto arma la lista de candidatos con
 * el motivo por el que cada uno lo es, para revisarla y darlos de baja juntos.
 * No decide nada: propone, y una persona confirma.
 */

export type MotivoCandidato =
  | 'sin_actividad'
  | 'programa_terminado'
  | 'sin_consultora';

export interface Candidato {
  cliente: Cliente;
  /** Por qué aparece en la lista. Sin esto, es una lista de nombres a ciegas. */
  motivos: MotivoCandidato[];
  /** Días desde el alta. Un programa dura cuatro o seis meses. */
  dia: number;
  consultora?: string;
}

export interface SeñalesDeActividad {
  sesiones: number;
  metricas: number;
  documentos: number;
  lecturas: number;
  compromisos: number;
}

/** Cualquier rastro de que alguien trabajó este caso alguna vez. */
export function hayActividad(s: SeñalesDeActividad): boolean {
  return s.sesiones + s.metricas + s.documentos + s.lecturas + s.compromisos > 0;
}

/**
 * ¿Este cliente es candidato a baja, y por qué?
 *
 * Devuelve la lista de motivos —puede tener varios— o vacío si no lo es. Sólo
 * mira clientes que hoy figuran vivos: dar de baja a alguien que ya está de
 * baja no tiene sentido.
 *
 * El día del programa se compara contra su duración real más un mes de gracia,
 * no contra un número fijo: un M2 de seis meses en el día 200 está en curso, y
 * un M1 de cuatro meses en el día 200 terminó hace rato.
 */
export function motivosDeBaja(
  cliente: Cliente,
  dia: number,
  actividad: SeñalesDeActividad,
  duracionMeses = 4,
): MotivoCandidato[] {
  const vivo: EstadoCliente[] = ['activo', 'pausado'];
  if (!vivo.includes(cliente.estado)) return [];

  const motivos: MotivoCandidato[] = [];

  // El programa terminó hace más de un mes y nadie lo dio de baja.
  const largo = Math.round(duracionMeses * 30.4) + 30;
  if (dia > largo) motivos.push('programa_terminado');

  if (!hayActividad(actividad)) motivos.push('sin_actividad');

  // Sin consultora asignada y sin nada cargado: casi siempre es una fila que
  // entró de la planilla vieja y a la que nadie le puso el ojo nunca.
  if (!cliente.consultoraId && !hayActividad(actividad)) motivos.push('sin_consultora');

  return motivos;
}

export const ETIQUETA_MOTIVO: Record<MotivoCandidato, string> = {
  sin_actividad: 'sin ninguna actividad cargada',
  programa_terminado: 'el programa ya terminó',
  sin_consultora: 'sin consultora asignada',
};

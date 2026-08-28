import { SEVERIDAD, type AlertaViva } from './alertas';
import type { Semaforo } from './types';

/**
 * EL SEMÁFORO
 *
 * Se deriva de las alertas abiertas: manda la peor. Nada más lo mueve.
 *
 * Es deliberado. Un color que se calcula con una fórmula no tiene dueño ni se
 * puede cerrar; un color que sale de una alerta abierta tiene responsable,
 * plazo y un texto de cierre escrito por una persona. Verde no significa "todo
 * bien": significa "no hay nada abierto que alguien tenga que atender".
 * Para "¿va camino a vender?" está el índice de avance, que es otra cosa.
 */

export function calcularSemaforo(alertas: AlertaViva[]): Semaforo {
  const abiertas = alertas.filter((a) => !a.cerradaAt);
  if (!abiertas.length) return 'verde';
  return abiertas.reduce<Semaforo>(
    (peor, a) => (SEVERIDAD[a.estadoSemaforo] > SEVERIDAD[peor] ? a.estadoSemaforo : peor),
    'verde',
  );
}

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  verde: 'Verde',
  amarillo: 'Amarillo',
  rojo: 'Rojo',
  negro: 'Negro',
};

export const SEMAFORO_QUE_SIGNIFICA: Record<Semaforo, string> = {
  verde: 'En proceso, sin nada abierto para atender',
  amarillo: 'Un criterio abierto. Lo resuelve la consultora y queda registrado',
  rojo: 'Riesgo activo. Revisión con alguien que no sea su consultora, en 48 h',
  negro: 'Fuga verbalizada, reembolso o garantía. Administración, el mismo día',
};

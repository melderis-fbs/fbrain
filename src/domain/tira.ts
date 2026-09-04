import { FASES, type FaseNegocio } from './fases';
import type { ContextoCliente } from './expediente';

/**
 * LA TIRA DEL CLIENTE
 *
 * Una lista de 167 filas donde cada columna dice lo mismo no es una lista: es
 * un padrón. El ojo compara formas, no palabras, y «🟠 Rojo · índice 9? ·
 * nunca · sin compromiso vivo · 0 ventas» repetido 167 veces no tiene ninguna
 * forma que comparar.
 *
 * Esto convierte el estado del cliente en cinco bloques —las cinco etapas del
 * negocio— que se leen de un vistazo y en el mismo lugar en todas las filas.
 * Es la misma información que ya calcula la grilla, condensada para escanear.
 */

export type EstadoEtapa = 'cumplida' | 'atrasada' | 'en_curso' | 'pendiente' | 'sin_datos';

export interface BloqueEtapa {
  fase: FaseNegocio;
  nombre: string;
  estado: EstadoEtapa;
  /** Para el title: qué hito de esta etapa está atrasado. */
  detalle?: string;
}

/**
 * ¿Con qué se evalúa a este cliente?
 *
 * Si no hay ningún hito registrado, ninguna métrica y ninguna sesión, no es
 * que el cliente esté atrasado: es que no sabemos nada de él. Pintar eso del
 * color de «pendiente» —o peor, de verde— es el error que la app declara no
 * cometer con las celdas vacías, y que igual estaba cometiendo en pantalla.
 */
export function hayConQueEvaluar(ctx: ContextoCliente): boolean {
  return (
    ctx.hitos.size > 0 ||
    ctx.registros.metricas.length > 0 ||
    ctx.registros.sesiones.length > 0
  );
}

export function tiraDeEtapas(
  ctx: ContextoCliente,
  atrasados: { hito: { key: string; fase: FaseNegocio; label: string }; incipiente: boolean }[],
): BloqueEtapa[] {
  const ciego = !hayConQueEvaluar(ctx);
  const actual = ctx.fase;

  return FASES.map(({ key, nombre }) => {
    if (ciego) return { fase: key, nombre, estado: 'sin_datos' as const };

    const atraso = atrasados.find((a) => a.hito.fase === key);
    if (atraso) {
      return {
        fase: key,
        nombre,
        estado: 'atrasada' as const,
        detalle: `${atraso.hito.label}${atraso.incipiente ? ' · recién se pasó de fecha' : ''}`,
      };
    }

    // Cumplida es todo lo anterior a la etapa en curso sin nada atrasado: si
    // el cliente ya está en volumen, definición y mensaje quedaron atrás.
    const orden = FASES.findIndex((f) => f.key === key);
    const ordenActual = FASES.findIndex((f) => f.key === actual);
    if (orden < ordenActual) return { fase: key, nombre, estado: 'cumplida' as const };
    if (orden === ordenActual) return { fase: key, nombre, estado: 'en_curso' as const };
    return { fase: key, nombre, estado: 'pendiente' as const };
  });
}

/**
 * Lo único que hay que hacer con este cliente, en cinco palabras.
 *
 * Sale de la alerta abierta más prioritaria, que ya viene ordenada por el
 * motor. Si no hay ninguna, se dice lo que falta para poder opinar — y si no
 * falta nada, se dice que está en orden. Nunca queda vacío: una celda en
 * blanco se lee como «no pasa nada», que es distinto de «no sabemos».
 */
export function queNecesita(
  ctx: ContextoCliente,
  alertas: { titulo: string; estadoSemaforo: string; prioridad: number }[],
): { texto: string; tono: 'critico' | 'serio' | 'atencion' | 'neutral' | 'ok' } {
  const top = [...alertas].sort((a, b) => b.prioridad - a.prioridad)[0];
  if (top) {
    const tono =
      top.estadoSemaforo === 'negro' || top.estadoSemaforo === 'rojo'
        ? 'critico'
        : top.estadoSemaforo === 'amarillo'
          ? 'atencion'
          : 'neutral';
    return { texto: top.titulo, tono };
  }
  if (ctx.cliente.fechaAltaProvisional) return { texto: 'falta su fecha de inicio', tono: 'neutral' };
  if (!hayConQueEvaluar(ctx)) return { texto: 'sin expediente cargado', tono: 'neutral' };
  return { texto: 'en orden', tono: 'ok' };
}

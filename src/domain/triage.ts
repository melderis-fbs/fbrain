import { SEVERIDAD, type AlertaViva } from './alertas';
import type { Atribucion, DesvioHitos } from './atribucion';
import type { LecturaEmbudo } from './embudo';
import type { ContextoCliente } from './expediente';
import type { Indice } from './indice';
import type { Consultora, Semaforo } from './types';

/**
 * ¿A QUIÉN AYUDAMOS ESTA SEMANA?
 *
 * No es el semáforo ordenado, y no es el índice ordenado. Ninguno de los dos
 * solo alcanza: el semáforo dice qué está abierto, el índice dice quién se
 * está desviando, y hay clientes que se desvían sin que se haya abierto nada.
 *
 * La prioridad los combina y agrega el reloj: el mismo problema no vale lo
 * mismo en el día 25 que en el día 85, porque en un caso todavía se puede
 * cambiar el resultado y en el otro ya no.
 */

export type Carril = 'corregible' | 'contencion';

export interface ItemTriage {
  ctx: ContextoCliente;
  indice: Indice;
  semaforo: Semaforo;
  alertas: AlertaViva[];
  embudo: LecturaEmbudo;
  prioridad: number;
  carril: Carril;
  titular: string;
  motivos: string[];
  accion: string;
  consultora?: Consultora;
  atribucion: Atribucion;
  desvio: DesvioHitos;
}

/** Cuánto margen queda para que el resultado del programa todavía cambie. */
function urgencia(dia: number, ventas: number): number {
  if (ventas > 0) return 0.4;
  if (dia >= 90) return 1;
  if (dia >= 75) return 0.92;
  if (dia >= 60) return 0.82;
  if (dia >= 45) return 0.65;
  if (dia >= 30) return 0.5;
  return 0.3;
}

export interface EntradaTriage {
  ctx: ContextoCliente;
  indice: Indice;
  semaforo: Semaforo;
  alertas: AlertaViva[];
  embudo: LecturaEmbudo;
  consultora?: Consultora;
  atribucion: Atribucion;
  desvio: DesvioHitos;
}

export function armarItem(e: EntradaTriage): ItemTriage {
  const { ctx, indice, semaforo, alertas, embudo, consultora, atribucion, desvio } = e;
  const abiertas = alertas.filter((a) => !a.cerradaAt);

  const gravedadSemaforo = { verde: 0, amarillo: 0.45, rojo: 0.8, negro: 1 }[semaforo];
  const gravedadIndice = (100 - indice.valor) / 100;
  const u = urgencia(ctx.dia, ctx.ventas);
  const pesoAlertas = Math.min(1, abiertas.reduce((a, x) => a + SEVERIDAD[x.estadoSemaforo], 0) / 5);

  const prioridad = Math.round(
    (0.32 * gravedadSemaforo + 0.28 * gravedadIndice + 0.28 * u + 0.12 * pesoAlertas) * 100,
  );

  // Todavía se puede corregir mientras haya margen de ejecución comercial.
  const carril: Carril =
    ctx.ventas > 0 || ctx.dia < 75 ? 'corregible' : 'contencion';

  const motivos: string[] = [];
  motivos.push(`Día ${ctx.dia}`);
  if (desvio.estado !== 'en_tiempo') motivos.push(`${desvio.atrasados.length} hito(s) atrasados`);
  if (ctx.ventas === 0) motivos.push('sin ventas');
  else motivos.push(`${ctx.ventas} venta(s)${ctx.primeraVentaDia ? ` · primera el día ${ctx.primeraVentaDia}` : ''}`);
  if (ctx.gatesVencidos.length) motivos.push(`gate vencido: ${ctx.gatesVencidos[0].label.toLowerCase()}`);
  if (ctx.diasSinSesion !== null && ctx.diasSinSesion > 14) motivos.push(`${ctx.diasSinSesion} días sin sesión`);
  if (ctx.bloquesCargados < 4) motivos.push(`expediente ${ctx.bloquesCargados}/6`);
  if (ctx.cliente.tieneGarantia) motivos.push('con garantía');
  if (indice.confianza !== 'alta') motivos.push(`dato ${indice.confianza}`);

  const alertaTop = abiertas[0];
  const titular =
    carril === 'contencion'
      ? `Día ${ctx.dia} sin venta — gestionar el cierre y la expectativa`
      : alertaTop
        ? `${alertaTop.reglaTitulo}`
        : embudo.titulo;

  // La acción sale de la atribución, no de la alerta. Es la diferencia entre
  // "revisá este caso" y "corregí esto, y hasta que no esté no le reclames
  // nada al cliente".
  const accion =
    carril === 'contencion'
      ? 'Revisión de caso con administración: qué se logró, qué no, y qué se ofrece para no perder al cliente ni al referido.'
      : atribucion.responsable === 'ninguno'
        ? alertaTop?.pedido ?? embudo.accion
        : atribucion.accion;

  return {
    ctx,
    indice,
    semaforo,
    alertas,
    embudo,
    prioridad,
    carril,
    titular,
    motivos: motivos.slice(0, 5),
    accion,
    consultora,
    atribucion,
    desvio,
  };
}

export function ordenarTriage(items: ItemTriage[]): ItemTriage[] {
  return [...items].sort((a, b) => b.prioridad - a.prioridad);
}

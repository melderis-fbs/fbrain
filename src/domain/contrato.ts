import type { Cliente, Pago } from './types';
import { daysBetween } from '@/lib/date';

/**
 * LAS CONDICIONES QUE FIRMÓ ESTE CLIENTE
 *
 * Una consultora que entra a una reunión sin saber qué compró el cliente
 * negocia a ciegas: no sabe cuánto le queda de programa, si tiene garantía, ni
 * si le prometieron algo que hay que cumplir. Y esas tres cosas cambian lo que
 * se puede y no se puede ofrecer en esa misma reunión.
 *
 * Todo esto es aritmética sobre datos ya cargados. No llama al modelo, así que
 * se puede mostrar siempre: no cuesta nada.
 *
 * La regla que gobierna todo el módulo: **lo que no se sabe se dice, no se
 * estima.** Un contrato es un documento legal; un dato inventado acá es una
 * condición que alguien le va a afirmar al cliente en una reunión.
 */

export interface Cuota {
  numero: number;
  monto: number;
  moneda: string;
  vence: string;
  pagada: boolean;
  fechaPago?: string;
}

export interface ResumenContrato {
  programa?: string;
  tipo?: string;
  /** Meses, calculados de las fechas reales. `undefined` si falta alguna. */
  duracionMeses?: number;
  inicio?: string;
  fin?: string;
  /** La fecha de inicio es una estimación; el resto del cálculo no es firme. */
  inicioEstimado: boolean;
  /** Cuántas semanas quedan. Negativo significa que ya se pasó. */
  semanasRestantes?: number;
  cuotas: Cuota[];
  /** Las que declaró el contrato, que puede no coincidir con las cargadas. */
  cuotasPactadas?: number;
  montoTotal?: number;
  montoCobrado?: number;
  proximoVencimiento?: Cuota;
  tieneGarantia: boolean;
  /** Lo que se sumó fuera del programa: sesiones extra, accesos, bonos. */
  beneficiosExtra?: string;
  linkContrato?: string;
  /**
   * Lo que no se puede afirmar porque falta el dato. Se muestra tal cual: una
   * consultora que ve «no sabemos si tiene garantía» pregunta antes de
   * prometer; una que no ve nada, asume.
   */
  sinDatos: string[];
}

const MES = 30.44;

export function resumenContrato(cliente: Cliente, pagos: Pago[], hoy: string): ResumenContrato {
  const sinDatos: string[] = [];

  const cuotas: Cuota[] = [...pagos]
    .sort((a, b) => a.numeroCuota - b.numeroCuota)
    .map((p) => ({
      numero: p.numeroCuota,
      monto: p.monto,
      moneda: p.moneda,
      vence: p.fechaVencimiento,
      pagada: p.estado === 'pagado',
      fechaPago: p.fechaPago,
    }));

  const inicio = cliente.fechaAlta || undefined;
  const fin = cliente.fechaFinPrevista;

  let duracionMeses: number | undefined;
  if (inicio && fin) {
    const dias = daysBetween(inicio, fin);
    // Se redondea a medio mes: los programas son de cuatro o seis, y decir
    // «4,1 meses» es precisión falsa sobre dos fechas cargadas a mano.
    duracionMeses = Math.round((dias / MES) * 2) / 2;
  } else {
    sinDatos.push(
      !inicio
        ? 'No está la fecha de inicio, así que no se sabe cuánto dura ni cuánto queda.'
        : 'No está la fecha de fin, así que no se sabe cuánto dura ni cuánto queda.',
    );
  }

  const semanasRestantes = fin ? Math.round(daysBetween(hoy, fin) / 7) : undefined;

  const montoCobrado = cuotas.filter((c) => c.pagada).reduce((a, c) => a + c.monto, 0);
  const montoTotal = cliente.montoTotal;
  if (montoTotal === undefined) {
    sinDatos.push('No está el monto total del contrato. En GHL ese campo viene vacío: sale del contrato firmado.');
  }

  if (cliente.cantidadCuotas !== undefined && cliente.cantidadCuotas !== cuotas.length) {
    sinDatos.push(
      `El contrato dice ${cliente.cantidadCuotas} cuota(s) y hay ${cuotas.length} cargada(s). Faltan cargar las que no están.`,
    );
  }
  if (!cuotas.length && cliente.cantidadCuotas === undefined) {
    sinDatos.push('No hay ninguna cuota cargada ni se sabe en cuántas se pactó.');
  }

  const proximoVencimiento = cuotas.filter((c) => !c.pagada).sort((a, b) => a.vence.localeCompare(b.vence))[0];

  if (!cliente.linkContrato) {
    sinDatos.push('No está el link al contrato firmado.');
  }

  return {
    programa: cliente.programa && cliente.programa !== 'sin programa' ? cliente.programa : undefined,
    tipo: cliente.tipoContrato,
    duracionMeses,
    inicio,
    fin,
    inicioEstimado: Boolean(cliente.fechaAltaProvisional),
    semanasRestantes,
    cuotas,
    cuotasPactadas: cliente.cantidadCuotas,
    montoTotal,
    montoCobrado: cuotas.length ? montoCobrado : undefined,
    proximoVencimiento,
    tieneGarantia: cliente.tieneGarantia,
    beneficiosExtra: cliente.beneficiosExtra,
    linkContrato: cliente.linkContrato,
    sinDatos,
  };
}

/** Cuánto del contrato ya se cobró, para mostrarlo sin hacer la cuenta a ojo. */
export function porcentajeCobrado(r: ResumenContrato): number | undefined {
  if (!r.montoTotal || r.montoCobrado === undefined) return undefined;
  return Math.round((r.montoCobrado / r.montoTotal) * 100);
}

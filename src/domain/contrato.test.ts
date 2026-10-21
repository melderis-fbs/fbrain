import { describe, expect, it } from 'vitest';
import { porcentajeCobrado, resumenContrato } from './contrato';
import type { Cliente, Pago } from './types';

const cliente = (extra: Partial<Cliente> = {}): Cliente => ({
  id: 'c1',
  nombre: 'Adriana Hercovich',
  programa: 'M1',
  fechaAlta: '2026-06-01',
  fechaFinPrevista: '2026-10-01',
  tieneGarantia: false,
  estado: 'activo',
  ...extra,
});

const cuota = (n: number, monto: number, vence: string, pagada = false): Pago => ({
  id: `p${n}`,
  clienteId: 'c1',
  numeroCuota: n,
  monto,
  moneda: 'USD',
  fechaVencimiento: vence,
  fechaPago: pagada ? vence : undefined,
  estado: pagada ? 'pagado' : 'pendiente',
});

describe('cuánto dura el programa', () => {
  it('sale de las fechas reales, no de un supuesto por programa', () => {
    // No hay tabla de «M1 son cuatro meses» en ningún lado, y deducirla sería
    // afirmarle una fecha de fin a un cliente sin tenerla.
    const r = resumenContrato(cliente(), [], '2026-08-01');
    expect(r.duracionMeses).toBe(4);
  });

  it('dice cuántas semanas quedan, y cuántas se pasó', () => {
    expect(resumenContrato(cliente(), [], '2026-09-01').semanasRestantes).toBe(4);
    expect(resumenContrato(cliente(), [], '2026-11-01').semanasRestantes).toBe(-4);
  });

  it('sin fecha de fin no calcula la duración y lo dice', () => {
    const r = resumenContrato(cliente({ fechaFinPrevista: undefined }), [], '2026-08-01');
    expect(r.duracionMeses).toBeUndefined();
    expect(r.semanasRestantes).toBeUndefined();
    expect(r.sinDatos.join(' ')).toContain('fecha de fin');
  });

  it('avisa cuando la fecha de inicio es estimada', () => {
    const r = resumenContrato(cliente({ fechaAltaProvisional: true }), [], '2026-08-01');
    expect(r.inicioEstimado).toBe(true);
  });
});

describe('las cuotas', () => {
  const pagos = [cuota(1, 2000, '2026-06-01', true), cuota(2, 1500, '2026-07-01', true), cuota(3, 1500, '2026-08-01')];

  it('las ordena y marca cuál vence próximo', () => {
    const r = resumenContrato(cliente({ montoTotal: 5000, cantidadCuotas: 3 }), pagos, '2026-07-15');
    expect(r.cuotas.map((c) => c.numero)).toEqual([1, 2, 3]);
    expect(r.proximoVencimiento?.numero).toBe(3);
    expect(r.montoCobrado).toBe(3500);
    expect(porcentajeCobrado(r)).toBe(70);
  });

  it('avisa cuando faltan cuotas por cargar', () => {
    // El contrato dice una cosa y la base tiene otra. Es el caso normal, y
    // callarlo hace que la pantalla afirme una deuda que no es.
    const r = resumenContrato(cliente({ cantidadCuotas: 5 }), pagos, '2026-07-15');
    expect(r.sinDatos.join(' ')).toContain('5 cuota(s) y hay 3');
  });

  it('sin cuotas ni cantidad pactada no inventa un total cobrado', () => {
    const r = resumenContrato(cliente(), [], '2026-07-15');
    expect(r.montoCobrado).toBeUndefined();
    expect(porcentajeCobrado(r)).toBeUndefined();
    expect(r.sinDatos.join(' ')).toContain('ninguna cuota cargada');
  });
});

describe('lo que no se sabe se dice', () => {
  it('nombra cada dato que falta, en vez de mostrar un hueco', () => {
    // Una consultora que lee «no sabemos si tiene garantía» pregunta antes de
    // prometer. Una que no ve nada, asume.
    const r = resumenContrato(cliente({ fechaFinPrevista: undefined }), [], '2026-08-01');
    const todo = r.sinDatos.join(' ');
    expect(todo).toContain('monto total');
    expect(todo).toContain('link al contrato');
    expect(r.sinDatos.length).toBeGreaterThanOrEqual(3);
  });

  it('un contrato completo no tiene nada que advertir', () => {
    const r = resumenContrato(
      cliente({ montoTotal: 5000, cantidadCuotas: 2, linkContrato: 'https://x', beneficiosExtra: 'Dos sesiones extra' }),
      [cuota(1, 2500, '2026-06-01', true), cuota(2, 2500, '2026-07-01')],
      '2026-07-15',
    );
    expect(r.sinDatos).toEqual([]);
    expect(r.beneficiosExtra).toBe('Dos sesiones extra');
  });

  it('«sin programa» es no saber el programa, no un programa llamado así', () => {
    expect(resumenContrato(cliente({ programa: 'sin programa' }), [], '2026-08-01').programa).toBeUndefined();
  });
});

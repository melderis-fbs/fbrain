import { describe, expect, it } from 'vitest';
import { CAMPO, aCliente, estadoDesde, fechaDeArranque, type OportunidadGhl } from './ghl';
import { buscarConsultora, fusionar, resolver } from './ghl-sync';
import type { Cliente } from '@/domain/types';

/** Una oportunidad con la forma real que devuelve la API de la cuenta. */
const op = (campos: Record<string, unknown>[] = [], extra: Partial<OportunidadGhl> = {}): OportunidadGhl => ({
  id: 'op_1',
  contactId: 'ct_1',
  pipelineId: 'pipe_clientes',
  pipelineStageId: 'etapa_onboarding',
  createdAt: '2026-10-12T16:19:18.299Z',
  contact: { id: 'ct_1', name: 'Adriana Hercovich', email: 'adri@ejemplo.com', phone: '+5411' },
  customFields: campos as never,
  ...extra,
});

describe('qué fecha manda para contar las semanas', () => {
  it('prefiere Fecha Inicio cuando está cargada', () => {
    const o = op([
      { id: CAMPO.fechaInicio, type: 'date', fieldValueDate: Date.UTC(2026, 5, 1) },
      { id: CAMPO.fechaIngresoPrograma, type: 'date', fieldValueDate: Date.UTC(2026, 7, 20) },
    ]);
    expect(fechaDeArranque(o)).toEqual({ fecha: '2026-06-01', provisional: false });
  });

  it('cae a Fecha de Ingreso Programa, que es la que está cargada al arrancar', () => {
    // Medido sobre la cuenta: en Onboarding, Fecha Inicio está en 5 de 40 y
    // Fecha de Ingreso Programa en 29 de 40.
    const o = op([{ id: CAMPO.fechaIngresoPrograma, type: 'date', fieldValueDate: Date.UTC(2026, 7, 20) }]);
    expect(fechaDeArranque(o)).toEqual({ fecha: '2026-08-20', provisional: false });
  });

  it('sin ninguna de las dos, marca la fecha como provisional en vez de inventarla', () => {
    // Con `provisional` en true el cliente existe pero el reloj no corre: no
    // se le miden hitos ni se le emiten alertas contra un número inventado.
    expect(fechaDeArranque(op())).toEqual({ fecha: '2026-10-12', provisional: true });
  });
});

describe('de una oportunidad de GHL a un cliente', () => {
  it('toma el contacto como llave, no la oportunidad', () => {
    // Una renovación es el mismo contacto con otra oportunidad. Si la llave
    // fuera la oportunidad, entraría como un cliente nuevo.
    const r = aCliente(op([], { id: 'op_renovacion' }))!;
    expect(r.ghlContactId).toBe('ct_1');
    expect(r.ghlOpportunityId).toBe('op_renovacion');
  });

  it('no devuelve nada si falta el contacto o el nombre', () => {
    expect(aCliente(op([], { contactId: undefined, contact: undefined, name: 'Alguien' }))).toBeNull();
    expect(aCliente(op([], { contact: { id: 'ct_1' }, name: '  ' }))).toBeNull();
  });

  it('omite los campos que GHL no trajo en vez de mandarlos vacíos', () => {
    const r = aCliente(op())!;
    expect(r.campos.programa).toBeUndefined();
    expect(r.campos.montoTotal).toBeUndefined();
    expect('programa' in r.campos).toBe(false);
  });

  it('lee programa, garantía y montos cuando están', () => {
    const r = aCliente(op([
      { id: CAMPO.programa, type: 'string', fieldValueString: 'M1' },
      { id: CAMPO.garantia, type: 'string', fieldValueString: 'Si' },
      { id: CAMPO.montoTotal, type: 'number', fieldValueNumber: 4500 },
      { id: CAMPO.cantidadCuotas, type: 'number', fieldValueNumber: 3 },
    ]))!;
    expect(r.campos.programa).toBe('M1');
    expect(r.campos.tieneGarantia).toBe(true);
    expect(r.campos.montoTotal).toBe(4500);
    expect(r.campos.cantidadCuotas).toBe(3);
  });
});

describe('el estatus de GHL es el juicio de la consultora, no el cálculo', () => {
  it('traduce sólo lo que dice si el cliente sigue o no', () => {
    expect(estadoDesde('Finalizado')).toBe('finalizado');
    expect(estadoDesde('En Pausa')).toBe('pausado');
    expect(estadoDesde('Abandono')).toBe('perdido');
    expect(estadoDesde('Desaparecido')).toBe('perdido');
  });

  it('«Atrasado» y «En Riesgo» no cambian el estado: eso lo dice la comparación', () => {
    expect(estadoDesde('Atrasado')).toBe('activo');
    expect(estadoDesde('En Riesgo')).toBe('activo');
    expect(estadoDesde('Progresando')).toBe('activo');
    expect(estadoDesde(undefined)).toBe('activo');
  });
});

describe('fusionar lo que vino con lo que ya estaba', () => {
  const previo = {
    id: 'c1', nombre: 'Adriana Hercovich', programa: 'M1', fechaAlta: '2026-06-01',
    fechaAltaProvisional: false, tieneGarantia: true, estado: 'activo',
    notas: 'lo escribió una persona', montoTotal: 4500,
  } as Cliente;

  it('un campo vacío de GHL no borra lo que ya estaba cargado', () => {
    const out = fusionar(previo, { nombre: 'Adriana Hercovich', programa: undefined, notas: '' });
    expect(out.programa).toBe('M1');
    expect(out.notas).toBe('lo escribió una persona');
    expect(out.montoTotal).toBe(4500);
  });

  it('una fecha estimada no degrada a una firme', () => {
    const out = fusionar(previo, { fechaAlta: '2026-10-12', fechaAltaProvisional: true });
    expect(out.fechaAlta).toBe('2026-06-01');
    expect(out.fechaAltaProvisional).toBe(false);
  });

  it('una fecha real sí pisa a la estimada', () => {
    const estimado = { ...previo, fechaAlta: '2026-09-01', fechaAltaProvisional: true };
    const out = fusionar(estimado, { fechaAlta: '2026-06-01', fechaAltaProvisional: false });
    expect(out.fechaAlta).toBe('2026-06-01');
    expect(out.fechaAltaProvisional).toBe(false);
  });
});

describe('enlazar la coach de GHL con el equipo', () => {
  const equipo = [
    { id: 'u1', nombre: 'Catalina Gómez' },
    { id: 'u2', nombre: 'Victoria Becci' },
    { id: 'u3', nombre: 'Victoria Alonso' },
  ];

  it('enlaza por nombre completo y por nombre de pila cuando es único', () => {
    expect(buscarConsultora('Catalina Gómez', equipo)).toBe('u1');
    expect(buscarConsultora('Catalina', equipo)).toBe('u1');
  });

  it('no elige cuando el nombre de pila es ambiguo', () => {
    // Hay dos Victorias en la lista de GHL de esta cuenta. Un cliente sin
    // asignar es mejor que un cliente asignado a quien no es.
    expect(buscarConsultora('Victoria', equipo)).toBeUndefined();
    expect(buscarConsultora('Meri', equipo)).toBeUndefined();
    expect(buscarConsultora(undefined, equipo)).toBeUndefined();
  });
});

describe('resolver una oportunidad contra la cartera', () => {
  const equipo = [{ id: 'u1', nombre: 'Catalina Gómez' }];

  it('crea el cliente la primera vez', () => {
    const r = resolver(op([{ id: CAMPO.coach, type: 'string', fieldValueString: 'Catalina' }]), new Map(), equipo);
    expect('motivo' in r).toBe(false);
    if ('motivo' in r) return;
    expect(r.nuevo).toBe(true);
    expect(r.cliente.ghlContactId).toBe('ct_1');
    expect(r.cliente.consultoraId).toBe('u1');
  });

  it('la segunda vez actualiza el mismo cliente en vez de duplicarlo', () => {
    const previo = { id: 'c1', nombre: 'Adriana', programa: 'M1', fechaAlta: '2026-06-01',
      tieneGarantia: false, estado: 'activo', ghlContactId: 'ct_1' } as Cliente;
    const r = resolver(op([], { id: 'op_renovacion' }), new Map([['ct_1', previo]]), equipo);
    if ('motivo' in r) throw new Error(r.motivo);
    expect(r.nuevo).toBe(false);
    expect(r.cliente.id).toBe('c1');
    expect(r.cliente.ghlOpportunityId).toBe('op_renovacion');
  });

  it('informa la que no se pudo identificar, con su motivo', () => {
    const r = resolver(op([], { contactId: undefined, contact: undefined, name: 'Fulano' }), new Map(), equipo);
    expect('motivo' in r).toBe(true);
    if ('motivo' in r) expect(r.motivo).toContain('sin contacto');
  });
});

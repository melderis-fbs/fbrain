import { describe, expect, it } from 'vitest';
import { addDays, mondayOf } from '@/lib/date';
import { construirContexto, type RegistrosCliente } from './expediente';
import { calcularIndice } from './indice';
import { calcularSemaforo } from './semaforo';
import { leerEmbudo } from './embudo';
import { REGLAS, aplicarTechoSemanal, correrReglas, fuentesConDatos, fuentesFaltantes, puedeCerrar, validarCierre } from './alertas';
import { calcularCuentaInversa, esperadoAlDia, objetivoSemanal, TASAS_OBJETIVO } from './cuenta-inversa';
import { diagnosticoSchema, validar } from './motores/contratos';
import { borradorLocal } from './motores/diagnostico';
import { atribuir, desvioDeHitos, guionConfrontacion } from './atribucion';
import { leerCobranza, resumenCobranza, PASOS_BAJA } from './cobranza';
import { HITOS } from './fases';
import type { Cliente, MetricaSemanal, ObjetivoComercial, Pago, Sesion } from './types';

const HOY = '2026-08-27';

function cliente(over: Partial<Cliente> = {}): Cliente {
  const fechaAlta = over.fechaAlta ?? addDays(HOY, -40);
  return {
    id: 'c1',
    nombre: 'Cliente Prueba',
    programa: 'GROWTH M1',
    fechaAlta,
    tieneGarantia: false,
    consultoraId: 'con1',
    estado: 'activo',
    horasRealesSemana: 8,
    ...over,
  };
}

function objetivo(over: Partial<ObjetivoComercial> = {}): ObjetivoComercial {
  return {
    id: 'o1',
    clienteId: 'c1',
    metaMensual: 6000,
    ticket: 1500,
    moneda: 'USD',
    tasaCierre: 0.32,
    tasaAsistencia: 0.85,
    tasaAgendamiento: 0.45,
    tasaAvance: 0.6,
    tasaDmSobreAlcance: 0.005,
    diaInicioProspeccion: 30,
    vigenteDesde: HOY,
    ...over,
  };
}

function metrica(semana: string, over: Partial<MetricaSemanal> = {}): MetricaSemanal {
  return {
    id: `m-${semana}`,
    clienteId: 'c1',
    semanaIso: mondayOf(semana),
    contenidoPublicado: null,
    alcanceTotal: null,
    alcanceNoSeguidores: null,
    dmsIniciados: null,
    conversacionesAvanzadas: null,
    leads: null,
    leadsCalificados: null,
    agendas: null,
    asistencias: null,
    cancelaciones: null,
    llamadas: null,
    ofertasRealizadas: null,
    ventas: null,
    facturado: null,
    ticketPromedio: null,
    inversionAds: null,
    objeciones: [],
    origenOportunidades: {},
    ...over,
  };
}

function sesiones(desde: string, n: number, over: Partial<Sesion> = {}): Sesion[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    clienteId: 'c1',
    consultoraId: 'con1',
    fecha: addDays(desde, i * 7),
    estadoAgenda: 'realizada' as const,
    tieneGrabacion: true,
    reporte: 'Se trabajó el avance de la semana.',
    reporteCargadoAt: addDays(desde, i * 7),
    ...over,
  })).filter((s) => s.fecha <= HOY);
}

function registros(over: Partial<RegistrosCliente> = {}): RegistrosCliente {
  return {
    cliente: over.cliente ?? cliente(),
    estrategias: over.estrategias ?? [],
    metricas: over.metricas ?? [],
    sesiones: over.sesiones ?? [],
    compromisos: over.compromisos ?? [],
    pagos: over.pagos ?? [],
    asistencias: over.asistencias ?? [],
    hitos: over.hitos ?? [],
    lecturas: over.lecturas ?? [],
    alertas: over.alertas ?? [],
    traspasos: over.traspasos ?? [],
    diagnosticos: over.diagnosticos ?? [],
    documentos: [],
    prorrogas: over.prorrogas ?? [],
    bajas: over.bajas ?? [],
    atribuciones: over.atribuciones ?? [],
    revisiones: over.revisiones ?? [],
    negocio: over.negocio,
    autoridad: over.autoridad,
    objetivo: over.objetivo,
  };
}

// ---------------------------------------------------------------------------

describe('cuenta inversa', () => {
  it('produce el KPI operativo del cliente desde su meta y su ticket', () => {
    const ci = calcularCuentaInversa(10000, 1800, TASAS_OBJETIVO);
    expect(ci.ventasMes).toBe(6);
    expect(ci.dmsSemana).toBeGreaterThan(10);
    expect(ci.alcanceSemana).toBeGreaterThan(1000);
  });

  it('un ticket más alto baja el volumen necesario', () => {
    const barato = calcularCuentaInversa(10000, 500, TASAS_OBJETIVO);
    const caro = calcularCuentaInversa(10000, 3000, TASAS_OBJETIVO);
    expect(caro.dmsSemana).toBeLessThan(barato.dmsSemana);
  });

  it('no espera actividad antes de que el cliente empiece a prospectar', () => {
    const o = objetivo({ diaInicioProspeccion: 30 });
    expect(esperadoAlDia(o, 20).dms).toBe(0);
    expect(esperadoAlDia(o, 60).dms).toBeGreaterThan(0);
  });

  it('la expectativa crece con el tiempo y nunca decrece', () => {
    const o = objetivo();
    let prev = -1;
    for (let d = 1; d <= 150; d++) {
      const v = esperadoAlDia(o, d).dms;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('null no es cero', () => {
  it('una semana sin cargar no cuenta como una semana en cero', () => {
    const ctx = construirContexto(
      registros({
        metricas: [
          metrica(addDays(HOY, -14), { dmsIniciados: 20 }),
          metrica(addDays(HOY, -7)), // sin cargar
        ],
      }),
      HOY,
    );
    expect(ctx.totales.dmsIniciados.valor).toBe(20);
    expect(ctx.totales.dmsIniciados.semanasSinDato).toBe(1);
    expect(ctx.totales.dmsIniciados.confiable).toBe(true);
  });

  it('sin ninguna semana cargada el acumulado no es confiable', () => {
    const ctx = construirContexto(
      registros({ metricas: [metrica(addDays(HOY, -7))] }),
      HOY,
    );
    expect(ctx.totales.dmsIniciados.confiable).toBe(false);
    expect(ctx.diasDesdeMetricas).toBeNull();
  });

  it('el motor comercial no puntúa cuando no hay números cargados', () => {
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -70) }),
        objetivo: objetivo(),
        metricas: [metrica(addDays(HOY, -7))],
        sesiones: sesiones(addDays(HOY, -63), 9),
      }),
      HOY,
    );
    const indice = calcularIndice(ctx);
    expect(indice.pilares.find((p) => p.key === 'comercial')?.valor).toBeNull();
  });
});

describe('semáforo e índice son instrumentos distintos', () => {
  it('sin alertas abiertas el semáforo es verde aunque el índice sea bajo', () => {
    const ctx = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -10) }), sesiones: sesiones(addDays(HOY, -7), 1) }),
      HOY,
    );
    expect(calcularSemaforo([])).toBe('verde');
    expect(calcularIndice(ctx).valor).toBeGreaterThanOrEqual(0);
  });

  it('con la fecha de alta provisional, el reloj del programa no corre', () => {
    // Un cliente importado sin fecha de inicio entra con una estimada. Medir
    // los hitos contra esa fecha daría alertas que parecen un diagnóstico y no
    // lo son; con setenta clientes así, el equipo deja de leer la bandeja.
    const base = registros({
      cliente: cliente({ fechaAlta: addDays(HOY, -100) }),
      sesiones: sesiones(addDays(HOY, -14), 1),
    });
    expect(correrReglas(construirContexto(base, HOY)).length).toBeGreaterThan(0);

    const provisional = registros({
      cliente: cliente({ fechaAlta: addDays(HOY, -100), fechaAltaProvisional: true }),
      sesiones: sesiones(addDays(HOY, -14), 1),
    });
    expect(correrReglas(construirContexto(provisional, HOY))).toEqual([]);
  });

  it('manda la peor alerta abierta', () => {
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -100) }),
        sesiones: sesiones(addDays(HOY, -14), 1),
      }),
      HOY,
    );
    const alertas = correrReglas(ctx);
    expect(alertas.some((a) => a.codigo === 'RD-07')).toBe(true);
    expect(['rojo', 'negro']).toContain(calcularSemaforo(alertas));
  });

  it('el índice avisa cuando está bajo y no hay ninguna alerta', () => {
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -40) }),
        sesiones: sesiones(addDays(HOY, -35), 5),
      }),
      HOY,
    );
    const indice = calcularIndice(ctx);
    if (indice.valor < 45) {
      expect(indice.lectura).toContain('falta');
    }
    expect(indice.pilares).toHaveLength(5);
  });
});

describe('reglas duras', () => {
  const base = () =>
    registros({
      cliente: cliente({ fechaAlta: addDays(HOY, -60) }),
      objetivo: objetivo(),
      sesiones: sesiones(addDays(HOY, -56), 8),
    });

  it('un cliente nuevo no dispara alertas de proceso', () => {
    const ctx = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -5) }) }),
      HOY,
    );
    const alertas = correrReglas(ctx);
    expect(alertas.some((a) => a.codigo === 'RD-01')).toBe(false);
  });

  it('RD-01 se dispara a los 21 días sin sesión y escala a rojo pasados los 30', () => {
    const suave = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -60) }), sesiones: sesiones(addDays(HOY, -25), 1) }),
      HOY,
    );
    const grave = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -60) }), sesiones: sesiones(addDays(HOY, -40), 1) }),
      HOY,
    );
    expect(correrReglas(suave).find((a) => a.codigo === 'RD-01')?.estadoSemaforo).toBe('amarillo');
    expect(correrReglas(grave).find((a) => a.codigo === 'RD-01')?.estadoSemaforo).toBe('rojo');
  });

  it('RD-10 sólo dispara si el precio bajó por iniciativa del cliente', () => {
    const con = (iniciativa: 'cliente' | 'consultora') =>
      construirContexto(
        registros({
          ...base(),
          estrategias: [
            { id: 'e1', clienteId: 'c1', version: 1, precio: 20000, moneda: 'USD', vigenteDesde: addDays(HOY, -50), clienteIdeal: 'x', oferta: 'y' },
            { id: 'e2', clienteId: 'c1', version: 2, precio: 15000, moneda: 'USD', vigenteDesde: addDays(HOY, -10), iniciativa, clienteIdeal: 'x', oferta: 'y' },
          ],
        }),
        HOY,
      );
    expect(correrReglas(con('cliente')).some((a) => a.codigo === 'RD-10')).toBe(true);
    expect(correrReglas(con('consultora')).some((a) => a.codigo === 'RD-10')).toBe(false);
  });

  it('toda alerta abierta trae responsable, plazo y pedido', () => {
    const ctx = construirContexto(base(), HOY);
    for (const a of correrReglas(ctx).filter((x) => !x.cerradaAt)) {
      expect(a.destinatario).toBeTruthy();
      expect(a.pedido.length).toBeGreaterThan(15);
      expect(a.prioridad).toBeGreaterThan(0);
    }
  });

  it('es idempotente: no duplica una alerta ya abierta', () => {
    const ctx1 = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -100) }), sesiones: sesiones(addDays(HOY, -10), 1) }),
      HOY,
    );
    const primera = correrReglas(ctx1);
    const persistidas = primera.map(({ condicionVigente: _c, reglaTitulo: _t, familia: _f, ...a }) => a);
    const ctx2 = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -100) }),
        sesiones: sesiones(addDays(HOY, -10), 1),
        alertas: persistidas,
      }),
      HOY,
    );
    const segunda = correrReglas(ctx2);
    expect(new Set(segunda.map((a) => a.codigo)).size).toBe(segunda.length);
  });

  it('marca condicionVigente en false cuando la condición desapareció, sin cerrarla sola', () => {
    const persistida = {
      id: 'a1',
      clienteId: 'c1',
      codigo: 'RD-01',
      origen: 'regla_dura' as const,
      estadoSemaforo: 'amarillo' as const,
      titulo: 'Cadencia rota',
      cuerpo: 'x',
      pedido: 'y',
      destinatario: 'consultora' as const,
      plazoHoras: 72,
      prioridad: 70,
      emitidaAt: addDays(HOY, -20),
      emitidaEnSemana: mondayOf(addDays(HOY, -20)),
      diferida: false,
      vecesEmitida: 1,
    };
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -60) }),
        sesiones: sesiones(addDays(HOY, -3), 1),
        alertas: [persistida],
      }),
      HOY,
    );
    const a = correrReglas(ctx).find((x) => x.codigo === 'RD-01');
    expect(a).toBeDefined();
    expect(a!.cerradaAt).toBeUndefined();
    expect(a!.condicionVigente).toBe(false);
  });

  it('no emite reglas suprimidas por otra más específica', () => {
    const ctx = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -100) }), objetivo: objetivo(), sesiones: sesiones(addDays(HOY, -7), 1) }),
      HOY,
    );
    const codigos = correrReglas(ctx).map((a) => a.codigo);
    expect(codigos).toContain('RD-07');
    expect(codigos).not.toContain('RD-11');
  });

  it('cada regla declara sus supresiones contra códigos que existen', () => {
    const conocidos = new Set(REGLAS.map((r) => r.codigo));
    for (const r of REGLAS) {
      for (const c of r.suprimidaPor ?? []) expect(conocidos.has(c)).toBe(true);
    }
  });
});

describe('ciclo de vida de la alerta', () => {
  it('no se cierra sin texto de al menos 20 caracteres', () => {
    expect(validarCierre('ok').ok).toBe(false);
    expect(validarCierre('Llamé, retomamos la cadencia y quedó agendada.').ok).toBe(true);
  });

  it('una roja no la cierra la consultora del caso', () => {
    const roja = { estadoSemaforo: 'rojo' } as never;
    expect(puedeCerrar(roja, 'con1', 'consultora', 'con1').puede).toBe(false);
    expect(puedeCerrar(roja, 'con2', 'consultora', 'con1').puede).toBe(true);
    expect(puedeCerrar(roja, 'con1', 'admin', 'con1').puede).toBe(true);
  });

  it('una negra sólo la cierra administración', () => {
    const negra = { estadoSemaforo: 'negro' } as never;
    expect(puedeCerrar(negra, 'con2', 'consultora', 'con1').puede).toBe(false);
    expect(puedeCerrar(negra, 'vicky', 'admin', 'con1').puede).toBe(true);
  });

  it('el techo semanal difiere lo nuevo pero nunca las negras ni el arrastre', () => {
    const semana = mondayOf(HOY);
    const nuevas = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`, estadoSemaforo: 'amarillo', prioridad: 50 + i, emitidaEnSemana: semana,
    })) as never[];
    const negra = { id: 'k', estadoSemaforo: 'negro', prioridad: 99, emitidaEnSemana: semana } as never;
    const vieja = { id: 'v', estadoSemaforo: 'amarillo', prioridad: 10, emitidaEnSemana: mondayOf(addDays(HOY, -30)) } as never;
    const out = aplicarTechoSemanal([...nuevas, negra, vieja], 10, HOY);
    expect(out.find((a) => a.id === 'k')!.diferida).toBe(false);
    expect(out.find((a) => a.id === 'v')!.diferida).toBe(false);
    expect(out.filter((a) => a.diferida).length).toBe(15 - 9);
  });
});

describe('lectura del embudo', () => {
  // Estrategia y oferta cerradas: si no, gana el eslabón de arriba de la
  // cadena, que es justamente lo que el motor tiene que hacer.
  const conMetricas = (over: Partial<MetricaSemanal>, dia = 80) =>
    construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -dia) }),
        objetivo: objetivo(),
        estrategias: [
          { id: 'e1', clienteId: 'c1', version: 1, clienteIdeal: 'Dueños que facturan', oferta: 'Programa 12 semanas', moneda: 'USD', vigenteDesde: addDays(HOY, -dia + 12) },
        ],
        hitos: [
          { clienteId: 'c1', hitoKey: 'oferta', estado: 'cumplido', actualizadoAt: HOY, cumplidoAt: addDays(HOY, -dia + 30) },
        ],
        sesiones: sesiones(addDays(HOY, -7), 1),
        metricas: [metrica(addDays(HOY, -7), over)],
      }),
      HOY,
    );

  it('devuelve exactamente un eslabón roto', () => {
    const l = leerEmbudo(conMetricas({ dmsIniciados: 5 }));
    expect(typeof l.eslabon).toBe('string');
    expect(l.titulo.length).toBeGreaterThan(0);
  });

  it('no concluye sobre el cierre con muestra chica', () => {
    const l = leerEmbudo(conMetricas({ dmsIniciados: 60, conversacionesAvanzadas: 40, agendas: 12, asistencias: 9, ventas: 0 }));
    expect(l.concluyente).toBe(false);
    expect(l.evidencia.toLowerCase()).toContain('no se puede concluir');
  });

  it('con muestra suficiente sí concluye sobre el cierre', () => {
    const l = leerEmbudo(conMetricas({ dmsIniciados: 300, conversacionesAvanzadas: 180, agendas: 60, asistencias: 45, ventas: 1 }));
    expect(l.eslabon).toBe('venta');
    expect(l.concluyente).toBe(true);
  });

  it('el contacto perdido gana sobre cualquier lectura del embudo', () => {
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -80) }),
        objetivo: objetivo(),
        estrategias: [
          { id: 'e1', clienteId: 'c1', version: 1, clienteIdeal: 'x', oferta: 'y', moneda: 'USD', vigenteDesde: addDays(HOY, -60) },
        ],
        sesiones: sesiones(addDays(HOY, -40), 1),
        metricas: [metrica(addDays(HOY, -7), { dmsIniciados: 200, conversacionesAvanzadas: 10 })],
      }),
      HOY,
    );
    expect(leerEmbudo(ctx).titulo).toContain('Contacto');
  });

  it('sin números cargados no diagnostica el embudo', () => {
    const ctx = construirContexto(
      registros({ cliente: cliente({ fechaAlta: addDays(HOY, -60) }), sesiones: sesiones(addDays(HOY, -7), 1) }),
      HOY,
    );
    expect(leerEmbudo(ctx).concluyente).toBe(false);
  });
});

describe('expediente y motores', () => {
  it('con menos de cuatro bloques el diagnóstico no habilita', () => {
    const ctx = construirContexto(registros(), HOY);
    expect(ctx.bloquesCargados).toBeLessThan(4);
    expect(ctx.habilitaDiagnostico).toBe(false);
  });

  it('el borrador local valida contra el contrato del motor de diagnóstico', () => {
    const ctx = construirContexto(
      registros({
        cliente: cliente({ fechaAlta: addDays(HOY, -70) }),
        objetivo: objetivo(),
        sesiones: sesiones(addDays(HOY, -7), 1),
        metricas: [metrica(addDays(HOY, -7), { dmsIniciados: 30, conversacionesAvanzadas: 18, agendas: 6, asistencias: 4, ventas: 0 })],
      }),
      HOY,
    );
    const payload = borradorLocal(ctx, correrReglas(ctx));
    const r = validar(diagnosticoSchema, payload);
    if (!r.ok) console.error(r.errores);
    expect(r.ok).toBe(true);
  });

  it('el contrato rechaza dos cuellos de botella', () => {
    const r = validar(diagnosticoSchema, { cuelloBotella: ['uno', 'dos'] });
    expect(r.ok).toBe(false);
  });

  it('el contrato rechaza un hecho sin origen', () => {
    const base = {
      diagnostico: ['algo'],
      cuelloBotella: 'El volumen no alcanza',
      tipoBloqueo: 'adquisicion',
      eslabonRoto: 'canal',
      evidencia: [{ afirmacion: 'no hay volumen', tipo: 'hecho' }],
      queNoHaria: ['no tocar la oferta'],
      hipotesisPrincipal: 'subir el volumen',
      planAccion: [{ accion: 'cuota diaria', responsable: 'consultora' }],
      metricas: [{ metrica: 'DMs' }],
      checkpoint: '2026-09-10',
      criterioDecision: { continuar: 'a', corregir: 'b', replantear: 'c' },
      preguntasAbiertas: [],
      principioFounders: 'algo generalizable',
      porQue: 'porque el volumen no alcanza',
    };
    expect(validar(diagnosticoSchema, base).ok).toBe(false);
  });

  it('el contrato rechaza construir antes de validar', () => {
    const r = validar(diagnosticoSchema, {
      diagnostico: ['algo'],
      cuelloBotella: 'El volumen no alcanza',
      tipoBloqueo: 'adquisicion',
      eslabonRoto: 'canal',
      evidencia: [{ afirmacion: 'x', tipo: 'hipotesis' }],
      queNoHaria: ['no tocar la oferta'],
      hipotesisPrincipal: 'subir el volumen',
      planAccion: [{ accion: 'armar un funnel automatizado con CRM', responsable: 'consultora' }],
      metricas: [{ metrica: 'DMs' }],
      checkpoint: '2026-09-10',
      criterioDecision: { continuar: 'a1', corregir: 'b1', replantear: 'c1' },
      preguntasAbiertas: [],
      principioFounders: 'algo generalizable',
      porQue: 'porque el volumen no alcanza',
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errores.join(' ')).toMatch(/construir|validar/i);
  });
});

describe('objetivo semanal', () => {
  it('el KPI semanal es coherente con la cuenta inversa mensual', () => {
    const o = objetivo({ metaMensual: 12000, ticket: 2000 });
    const semanal = objetivoSemanal(o);
    const mensual = calcularCuentaInversa(12000, 2000, TASAS_OBJETIVO);
    expect(semanal.ventasMes).toBe(mensual.ventasMes);
    expect(semanal.dms).toBe(mensual.dmsSemana);
  });
});

// ===========================================================================
// Lo que agregó la revisión de cartera de agosto
// ===========================================================================

function pago(over: Partial<Pago> = {}): Pago {
  return {
    id: 'p1',
    clienteId: 'c1',
    numeroCuota: 2,
    monto: 1500,
    moneda: 'USD',
    fechaVencimiento: addDays(HOY, -4),
    estado: 'vencido',
    ...over,
  };
}

/** Un cliente que ejecuta y al que acompañamos bien: el caso de control. */
function sano(over: Partial<RegistrosCliente> = {}) {
  return registros({
    cliente: cliente({ fechaAlta: addDays(HOY, -45) }),
    objetivo: objetivo(),
    negocio: {
      clienteId: 'c1', queVende: 'Consultoría', aQuien: 'Dueños de pyme',
      precio: 1500, moneda: 'USD', actualizadoAt: HOY,
    },
    autoridad: {
      clienteId: 'c1', haceExcepcionalmenteBien: 'Diagnosticar rápido',
      industriasQueConoce: [], actualizadoAt: HOY,
    },
    estrategias: [{
      id: 'e1', clienteId: 'c1', version: 1, clienteIdeal: 'Dueños de pyme',
      oferta: 'Programa de 12 semanas', moneda: 'USD', vigenteDesde: addDays(HOY, -30),
    }],
    sesiones: sesiones(addDays(HOY, -42), 6),
    metricas: [0, 1, 2, 3].map((w) =>
      metrica(addDays(HOY, -w * 7), { dmsIniciados: 40, agendas: 4, ventas: w === 3 ? 1 : 0, contenidoPublicado: 3 }),
    ),
    hitos: HITOS.filter((h) => h.dia <= 45).map((h) => ({
      clienteId: 'c1', hitoKey: h.key, estado: 'cumplido' as const,
      actualizadoAt: HOY, cumplidoAt: addDays(HOY, -10),
    })),
    ...over,
  });
}

describe('atribución · ¿es el cliente o somos nosotros?', () => {
  it('con la cadencia rota nunca se le puede echar la culpa al cliente', () => {
    // Compromisos incumplidos por todos lados, pero hace 40 días que nadie lo ve.
    const ctx = construirContexto(sano({
      sesiones: sesiones(addDays(HOY, -80), 3),
      compromisos: [1, 2, 3, 4].map((i) => ({
        id: `k${i}`, clienteId: 'c1', descripcion: 'Abrir 20 conversaciones',
        responsable: 'cliente', fechaVencimiento: addDays(HOY, -i * 7),
        estado: 'no_cumplido' as const,
      })),
    }), HOY);
    const a = atribuir(ctx, correrReglas(ctx));
    expect(a.responsable).not.toBe('cliente');
    expect(a.senalesNosotros.some((s) => s.clave === 'cadencia')).toBe(true);
    expect(a.queNoHacer).toMatch(/no confrontar|no abrir la sesión/i);
  });

  it('con nuestro lado limpio, el incumplimiento sí es del cliente', () => {
    const ctx = construirContexto(sano({
      compromisos: [1, 2, 3, 4].map((i) => ({
        id: `k${i}`, clienteId: 'c1', descripcion: 'Abrir 20 conversaciones',
        responsable: 'cliente', fechaVencimiento: addDays(HOY, -i * 3),
        estado: i === 1 ? ('cumplido' as const) : ('no_cumplido' as const),
      })),
    }), HOY);
    const a = atribuir(ctx, correrReglas(ctx));
    expect(a.responsable).toBe('cliente');
    expect(a.senalesNosotros).toHaveLength(0);
  });

  it('el guion de confrontación no se habilita si la falla es nuestra', () => {
    const ctx = construirContexto(sano({ sesiones: sesiones(addDays(HOY, -80), 3) }), HOY);
    const a = atribuir(ctx, correrReglas(ctx));
    const g = guionConfrontacion(ctx, a);
    expect(g.usable).toBe(false);
    expect(g.motivoNoUsable).toMatch(/falla nuestra/i);
  });

  it('un expediente ciego no permite acusar a nadie', () => {
    const ctx = construirContexto(registros({
      cliente: cliente({ fechaAlta: addDays(HOY, -50) }),
      sesiones: sesiones(addDays(HOY, -14), 2),
    }), HOY);
    const a = atribuir(ctx, correrReglas(ctx));
    expect(['sin_datos', 'nosotros', 'ambos']).toContain(a.responsable);
  });
});

describe('desvío de hitos · el naranja que faltaba', () => {
  it('dentro del margen es incipiente, no atraso', () => {
    // Día 36: el hito de mensaje (día 35) recién se pasó por un día.
    const ctx = construirContexto(sano({
      cliente: cliente({ fechaAlta: addDays(HOY, -35) }),
      hitos: HITOS.filter((h) => h.dia <= 30).map((h) => ({
        clienteId: 'c1', hitoKey: h.key, estado: 'cumplido' as const,
        actualizadoAt: HOY, cumplidoAt: addDays(HOY, -10),
      })),
    }), HOY);
    expect(desvioDeHitos(ctx).estado).toBe('incipiente');
  });

  it('un gate vencido con holgura es grave', () => {
    const ctx = construirContexto(sano({
      cliente: cliente({ fechaAlta: addDays(HOY, -60) }),
      hitos: [],
      metricas: [],
    }), HOY);
    const d = desvioDeHitos(ctx);
    expect(d.estado).toBe('grave');
    expect(d.atrasados.some((a) => a.hito.gate && !a.incipiente)).toBe(true);
  });
});

describe('cobranza · el carril que no discute el servicio', () => {
  it('los días de gracia salen del contrato de cada cliente, no de una constante', () => {
    const venc = addDays(HOY, -4);
    const viejo = construirContexto(sano({
      cliente: cliente({ diasGraciaPago: 5 }), pagos: [pago({ fechaVencimiento: venc })],
    }), HOY);
    const nuevo = construirContexto(sano({
      cliente: cliente({ diasGraciaPago: 3 }), pagos: [pago({ fechaVencimiento: venc })],
    }), HOY);
    expect(leerCobranza(viejo).estado).toBe('en_gracia');
    expect(leerCobranza(nuevo).estado).toBe('corte_pendiente');
  });

  it('un cliente en negro y uno impecable con la misma cuota tienen la misma lectura', () => {
    const pagos = [pago({ fechaVencimiento: addDays(HOY, -10) })];
    const impecable = construirContexto(sano({ pagos }), HOY);
    const enCrisis = construirContexto(sano({
      pagos,
      sesiones: sesiones(addDays(HOY, -90), 2),
      alertas: [{
        id: 'a1', clienteId: 'c1', codigo: 'CT-N1', origen: 'criterio',
        estadoSemaforo: 'negro', titulo: 'Nombra irse', cuerpo: 'x',
        citaTextual: 'quiero el reembolso', pedido: 'y', destinatario: 'admin',
        plazoHoras: 0, prioridad: 99, emitidaAt: HOY, emitidaEnSemana: mondayOf(HOY),
        diferida: false, vecesEmitida: 1,
      }],
    }), HOY);
    expect(calcularSemaforo(correrReglas(enCrisis))).toBe('negro');
    expect(leerCobranza(enCrisis).estado).toBe(leerCobranza(impecable).estado);
    expect(leerCobranza(enCrisis).deuda).toBe(leerCobranza(impecable).deuda);
  });

  it('una prórroga vigente frena el corte; una vencida lo dispara', () => {
    const p = pago({ fechaVencimiento: addDays(HOY, -20) });
    const vigente = construirContexto(sano({
      pagos: [p],
      prorrogas: [{
        id: 'pr1', clienteId: 'c1', pagoId: 'p1', diasOtorgados: 25,
        autorizadaPor: 'Vicky', autorizadaAt: addDays(HOY, -19), nuevaFecha: addDays(HOY, 5),
      }],
    }), HOY);
    const vencida = construirContexto(sano({
      pagos: [p],
      prorrogas: [{
        id: 'pr1', clienteId: 'c1', pagoId: 'p1', diasOtorgados: 10,
        autorizadaPor: 'Vicky', autorizadaAt: addDays(HOY, -19), nuevaFecha: addDays(HOY, -8),
      }],
    }), HOY);
    expect(leerCobranza(vigente).estado).toBe('prorroga_vigente');
    expect(leerCobranza(vencida).estado).toBe('prorroga_vencida');
    expect(correrReglas(vencida).some((a) => a.codigo === 'RD-20')).toBe(true);
    expect(correrReglas(vigente).some((a) => a.codigo === 'RD-19')).toBe(false);
  });

  it('una baja con el checklist a medias sigue siendo un problema abierto', () => {
    const ctx = construirContexto(sano({
      bajas: [{
        id: 'b1', clienteId: 'c1', fecha: addDays(HOY, -9), motivo: 'falta_de_pago',
        solicitadaPor: 'founders', pidioReembolso: false,
        pasos: PASOS_BAJA.map((x) => ({
          key: x.key,
          hechoAt: x.key === 'accesos' ? addDays(HOY, -9) : undefined,
        })),
      }],
    }), HOY);
    const l = leerCobranza(ctx);
    expect(l.estado).toBe('baja_en_curso');
    expect(l.pasosPendientes).toContain('telegram');
    const a = correrReglas(ctx).find((x) => x.codigo === 'RD-21');
    expect(a?.estadoSemaforo).toBe('rojo');
  });

  it('la tasa de recupero de las prórrogas es un número, no una impresión', () => {
    const pr = (id: string, resultado?: 'pago' | 'no_pago') => ({
      id, clienteId: 'c1', pagoId: 'p1', diasOtorgados: 10, autorizadaPor: 'Vicky',
      autorizadaAt: addDays(HOY, -30), nuevaFecha: addDays(HOY, -20), resultado,
    });
    const ctx = construirContexto(sano({ pagos: [pago()] }), HOY);
    const r = resumenCobranza([
      { lectura: leerCobranza(ctx), prorrogas: [pr('a', 'pago'), pr('b', 'no_pago'), pr('c', 'no_pago'), pr('d')] },
    ]);
    expect(r.prorrogasOtorgadas).toBe(4);
    expect(r.prorrogasQuePagaron).toBe(1);
    expect(r.tasaProrroga).toBeCloseTo(1 / 3);
  });
});

describe('una regla sin su fuente no opina', () => {
  const vacio = {
    sesiones: [], metricas: [], pagos: [], asistencias: [], traspasos: [],
    compromisos: [], lecturas: [], estrategias: [], prorrogas: [], bajas: [], objetivos: [],
  };

  it('cada regla declara de dónde lee', () => {
    for (const r of REGLAS) expect(Array.isArray(r.fuentes)).toBe(true);
    // Las que leen de una tabla son la mayoría; si alguien agrega una regla
    // nueva sin fuente, esto no lo detecta — lo detecta la de abajo.
    expect(REGLAS.filter((r) => r.fuentes.length).length).toBeGreaterThan(15);
  });

  it('«día 90 sin ninguna venta» necesita métricas cargadas', () => {
    const rd07 = REGLAS.find((r) => r.codigo === 'RD-07')!;
    expect(rd07.fuentes).toContain('metricas');
    // Es la que disparaba 85 veces idénticas sobre una tabla vacía: sin una
    // sola métrica en la cartera, «cero ventas» no es un hallazgo del cliente,
    // es la importación que no llegó.
    expect(fuentesFaltantes(rd07, fuentesConDatos(vacio))).toEqual(['metricas']);
  });

  it('«cero asistencia a mentorías» necesita asistencias', () => {
    const rd09 = REGLAS.find((r) => r.codigo === 'RD-09')!;
    expect(fuentesFaltantes(rd09, fuentesConDatos(vacio))).toEqual(['asistencias']);
  });

  it('una sola fila en la cartera alcanza para conectar la fuente', () => {
    // Y esto es lo importante del otro lado: si la tabla tiene datos, que
    // ESTE cliente no tenga ninguno sí es un hallazgo. La pregunta es de
    // cartera, no de cliente.
    const con = fuentesConDatos({ ...vacio, asistencias: [{}] });
    expect(fuentesFaltantes(REGLAS.find((r) => r.codigo === 'RD-09')!, con)).toEqual([]);
  });

  it('las reglas que sólo miran la ficha corren siempre', () => {
    const sinFuente = REGLAS.filter((r) => !r.fuentes.length).map((r) => r.codigo);
    // El expediente ciego es la más importante de estas: con la cartera vacía
    // es justamente la que hay que ver.
    expect(sinFuente).toContain('RD-14');
    for (const c of sinFuente) {
      expect(fuentesFaltantes(REGLAS.find((r) => r.codigo === c)!, fuentesConDatos(vacio))).toEqual([]);
    }
  });
});

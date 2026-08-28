import type { ContextoCliente } from './expediente';

/**
 * ÍNDICE DE AVANCE
 *
 * Decisión de integración, y es la que más importa entender:
 *
 * En Brain el SEMÁFORO se deriva de las alertas abiertas. Eso está bien y no se
 * toca: hace que el color sea auditable, tenga dueño y se cierre con texto.
 * Pero el semáforo responde una pregunta chica — "¿hay algo abierto que
 * alguien tiene que atender?" — y no responde la que define el producto:
 * "¿este cliente va camino a vender antes del día 60?".
 *
 * El índice responde esa. Es determinístico, se calcula solo, no consume
 * tokens, y NO mueve el semáforo. Son dos instrumentos con dos preguntas
 * distintas, y cuando se contradicen eso mismo es información:
 *
 *   · índice bajo sin alertas   → el sistema no está viendo algo. Faltan datos
 *                                 o falta una regla.
 *   · alerta roja con índice alto → un evento puntual sobre un caso sano.
 *                                 Se atiende y se cierra, no se rediseña nada.
 */

export interface Pilar {
  key: 'hitos' | 'comercial' | 'ejecucion' | 'resultado' | 'relacion';
  label: string;
  valor: number | null;
  peso: number;
  detalle: string;
}

export interface Indice {
  valor: number;
  pilares: Pilar[];
  motores: string[];
  confianza: 'alta' | 'media' | 'baja';
  motivoConfianza: string;
  /** Lo que el índice dice y el semáforo no */
  lectura: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const p = (n: number) => Math.round(n);

const CREDITO: Record<string, number> = {
  cumplido: 1,
  en_progreso: 0.4,
  necesita_ajustes: 0.3,
  bloqueado: 0,
  sin_trabajar: 0,
};

function pilarHitos(ctx: ContextoCliente): Pilar {
  const vencidos = ctx.hitosVencidos;
  if (!vencidos.length) {
    return { key: 'hitos', label: 'Hitos del programa', valor: null, peso: 0.3, detalle: 'Todavía no venció ningún hito' };
  }
  const credito = vencidos.reduce(
    (a, h) => a + (CREDITO[ctx.hitos.get(h.key)?.estado ?? 'sin_trabajar'] ?? 0),
    0,
  );
  let valor = (credito / vencidos.length) * 100;
  if (ctx.gatesVencidos.length) valor = Math.min(valor, 45);
  const cumplidos = vencidos.filter((h) => ctx.hitos.get(h.key)?.estado === 'cumplido').length;
  return {
    key: 'hitos',
    label: 'Hitos del programa',
    valor: clamp(valor),
    peso: 0.3,
    detalle: ctx.gatesVencidos.length
      ? `${cumplidos}/${vencidos.length} · gate vencido: ${ctx.gatesVencidos[0].label.toLowerCase()}`
      : `${cumplidos}/${vencidos.length} hitos vencidos cumplidos`,
  };
}

function pilarComercial(ctx: ContextoCliente): Pilar {
  const esp = ctx.esperado;
  if (!esp || esp.semanasActivas < 1) {
    return {
      key: 'comercial',
      label: 'Motor comercial',
      valor: null,
      peso: 0.25,
      detalle: ctx.objetivo ? 'Todavía no empezó a prospectar' : 'Sin cuenta inversa cargada',
    };
  }
  const t = ctx.totales;
  if (!t.dmsIniciados.confiable && !t.agendas.confiable) {
    return {
      key: 'comercial',
      label: 'Motor comercial',
      valor: null,
      peso: 0.25,
      detalle: 'Sin números cargados: no se puede evaluar',
    };
  }
  const pares: [number, number, number][] = [
    [t.dmsIniciados.valor, esp.dms, 0.25],
    [t.conversacionesAvanzadas.valor, esp.conversaciones, 0.25],
    [t.agendas.valor, esp.agendas, 0.25],
    [t.ventas.valor, esp.ventas, 0.25],
  ];
  let acc = 0;
  let peso = 0;
  for (const [real, esperado, w] of pares) {
    if (esperado <= 0) continue;
    acc += Math.min(1, real / esperado) * w;
    peso += w;
  }
  const valor = peso > 0 ? (acc / peso) * 100 : 100;
  return {
    key: 'comercial',
    label: 'Motor comercial',
    valor: clamp(valor),
    peso: 0.25,
    detalle: `DMs ${t.dmsIniciados.valor}/${Math.round(esp.dms)} · agendas ${t.agendas.valor}/${Math.round(esp.agendas)} · ventas ${t.ventas.valor}/${esp.ventas.toFixed(1)}`,
  };
}

function pilarEjecucion(ctx: ContextoCliente): Pilar {
  const partes: number[] = [];
  const pesos: number[] = [];
  const bits: string[] = [];

  if (ctx.cumplimientoCompromisos !== null) {
    partes.push(ctx.cumplimientoCompromisos * 100);
    pesos.push(0.45);
    bits.push(`${p(ctx.cumplimientoCompromisos * 100)}% de compromisos`);
  }
  const cadencia = clamp((ctx.cadenciaUltimos30 / 4) * 100);
  partes.push(cadencia);
  pesos.push(0.35);
  bits.push(`${ctx.cadenciaUltimos30} sesiones/30d`);

  if (ctx.cliente.tieneGarantia) {
    // La garantía exige 2 mentorías por semana: 6 en tres semanas.
    const mentorias = clamp((ctx.asistenciaMentorias3sem / 6) * 100);
    partes.push(mentorias);
    pesos.push(0.2);
    bits.push(`${ctx.asistenciaMentorias3sem}/6 mentorías (garantía)`);
  }

  const suma = pesos.reduce((a, b) => a + b, 0);
  const valor = partes.reduce((a, x, i) => a + x * pesos[i], 0) / suma;
  return { key: 'ejecucion', label: 'Ejecución', valor: clamp(valor), peso: 0.2, detalle: bits.join(' · ') };
}

function pilarResultado(ctx: ContextoCliente): Pilar {
  if (ctx.dia < 30) {
    return { key: 'resultado', label: 'Resultado', valor: null, peso: 0.15, detalle: 'Todavía no se espera venta' };
  }
  if (ctx.ventas >= 2) {
    return { key: 'resultado', label: 'Resultado', valor: 100, peso: 0.15, detalle: `${ctx.ventas} ventas · venta repetida` };
  }
  if (ctx.ventas === 1) {
    const aTiempo = (ctx.primeraVentaDia ?? 999) <= 60;
    return {
      key: 'resultado',
      label: 'Resultado',
      valor: aTiempo ? 85 : 70,
      peso: 0.15,
      detalle: `Primera venta el día ${ctx.primeraVentaDia}${aTiempo ? ' (a tiempo)' : ' (tarde)'}`,
    };
  }
  // Sin ventas: la nota cae a medida que se acerca el día 60 y se desploma después del 90.
  const valor = ctx.dia >= 90 ? 0 : ctx.dia >= 60 ? 25 : clamp(100 - ((ctx.dia - 30) / 30) * 60);
  return {
    key: 'resultado',
    label: 'Resultado',
    valor,
    peso: 0.15,
    detalle: `Sin ventas al día ${ctx.dia}. El objetivo del programa es la primera venta antes del día 60.`,
  };
}

const PESO_ALERTA: Record<string, number> = { negro: 45, rojo: 30, amarillo: 12, verde: 0 };

function pilarRelacion(ctx: ContextoCliente): Pilar {
  const base = ctx.lectura
    ? { muy_bien: 100, bien: 82, atencion: 55, riesgo: 25 }[ctx.lectura.percepcion]
    : 70;
  const castigo = Math.min(
    70,
    ctx.alertasAbiertas.reduce((a, x) => a + (PESO_ALERTA[x.estadoSemaforo] ?? 0), 0),
  );
  const detalleBits = [
    ctx.lectura ? `lectura: ${ctx.lectura.percepcion.replace('_', ' ')}` : 'sin lectura de la consultora',
    `${ctx.alertasAbiertas.length} alerta(s) abierta(s)`,
  ];
  return {
    key: 'relacion',
    label: 'Relación y criterio',
    valor: clamp(base - castigo),
    peso: 0.1,
    detalle: detalleBits.join(' · '),
  };
}

export function calcularIndice(ctx: ContextoCliente): Indice {
  const pilares = [
    pilarHitos(ctx),
    pilarComercial(ctx),
    pilarEjecucion(ctx),
    pilarResultado(ctx),
    pilarRelacion(ctx),
  ];
  const activos = pilares.filter((x) => x.valor !== null);
  const suma = activos.reduce((a, x) => a + x.peso, 0) || 1;
  const valor = Math.round(
    clamp(activos.reduce((a, x) => a + (x.valor as number) * x.peso, 0) / suma),
  );

  const stale: string[] = [];
  if (ctx.diasDesdeMetricas === null || ctx.diasDesdeMetricas > 21) stale.push('números');
  if (ctx.diasSinSesion === null || ctx.diasSinSesion > 21) stale.push('sesiones');
  if (ctx.bloquesCargados < 4) stale.push('expediente incompleto');
  const confianza = stale.length >= 2 ? 'baja' : stale.length === 1 ? 'media' : 'alta';

  const motores = activos
    .filter((x) => (x.valor as number) < 65)
    .sort((a, b) => (a.valor as number) - (b.valor as number))
    .map((x) => `${x.label}: ${Math.round(x.valor as number)}/100 — ${x.detalle}`)
    .slice(0, 3);

  const sinAlertas = ctx.alertasAbiertas.length === 0;
  const lectura =
    valor < 45 && sinAlertas
      ? 'Índice bajo y ninguna alerta abierta: o falta cargar datos, o falta una regla que capture lo que está pasando.'
      : valor >= 75 && ctx.alertasAbiertas.some((a) => a.estadoSemaforo === 'rojo' || a.estadoSemaforo === 'negro')
        ? 'Caso sano con un evento puntual abierto. Se atiende la alerta; no se rediseña la estrategia.'
        : valor >= 75
          ? 'Va donde tiene que ir a esta altura del programa.'
          : valor >= 55
            ? 'Avanza, pero por debajo de lo que su propia cuenta inversa necesita.'
            : 'Se está desviando de lo que necesita para vender a tiempo.';

  return {
    valor,
    pilares,
    motores,
    confianza,
    motivoConfianza: stale.length ? `Desactualizado: ${stale.join(', ')}` : 'Datos frescos',
    lectura,
  };
}

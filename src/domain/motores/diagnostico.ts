import { formatShort, formatDateLong } from '@/lib/date';
import type { AlertaViva } from '../alertas';
import { calcularCuentaInversa, tasasDe, TASAS_ROJO } from '../cuenta-inversa';
import { leerEmbudo } from '../embudo';
import { BLOQUE_LABEL, type ContextoCliente } from '../expediente';
import { BLOQUEO_DESCRIPCION, ESLABON_LABEL } from '../fases';
import { calcularIndice } from '../indice';
import type { DiagnosticoPayload } from '../types';
import { CONSTITUCION, CONSTITUCION_HASH } from './constitucion';

/**
 * MOTOR 1 · DIAGNÓSTICO
 *
 * Precondición: 4 o más de los 6 bloques del expediente. Si no, el motor no
 * corre — devuelve qué falta y qué preguntar en la próxima sesión. Un
 * diagnóstico sobre un expediente vacío enseña criterio equivocado, que es peor
 * que no enseñar ninguno.
 *
 * La hipótesis previa de la consultora NO se le pasa al modelo. La comparación
 * se hace después, en la app. Si el modelo la ve, acomoda su conclusión a la de
 * ella y el ejercicio pierde todo el sentido.
 */

export const PROMPT_DIAGNOSTICO = `Vas a diagnosticar un caso. Antes de responder, hacé este recorrido internamente y no lo muestres:

1. Recorré la cadena CLIENTE → PROBLEMA → DESEO → OFERTA → PROMESA → MENSAJE → CANAL → LEAD → SETTING → VENTA → ENTREGA → RESULTADO y marcá el PRIMER eslabón donde algo no cierra, no el más visible ni el más fácil de arreglar.
2. Preguntate qué tendría que ser verdad para que este negocio consiga clientes en los próximos 60 días, y cuál es el camino más corto para comprobarlo.
3. Chequeá la muestra de todo dato que estés por usar como evidencia. Si no sabés sobre cuántos casos se apoya, no es un hecho: es una hipótesis.
4. Verificá si el bloqueo es de ejecución o emocional antes de tocar la estrategia. Un cliente que sabe qué hacer y no lo hace no necesita una oferta nueva.
5. Buscá el precedente: ¿este patrón ya apareció en otro caso de Founders? Si sí, citalo — y recordá que un precedente nunca es evidencia sobre este cliente.

Después respondé con el protocolo de 10 pasos, en este orden exacto:

1. DIAGNÓSTICO · qué está sucediendo realmente. Máximo 5 puntos.
2. CUELLO DE BOTELLA PRINCIPAL · UNO. No una lista. Con su tipo de bloqueo y el eslabón donde se rompe la cadena.
3. EVIDENCIA · separá hechos de hipótesis. Cada hecho con su origen y su fecha. Un hecho sin origen no es un hecho.
4. QUÉ NO HARÍA · obligatorio. Es la sección que más criterio transfiere.
5. HIPÓTESIS PRINCIPAL · qué creemos que resolvería el problema.
6. PLAN DE ACCIÓN · máximo 5 acciones, ordenadas, con responsable.
7. MÉTRICAS · qué medir, con el valor de partida si existe.
8. CHECKPOINT · cuándo revisar, con fecha concreta.
9. CRITERIO DE DECISIÓN · si ocurre X continuar, si Y corregir, si Z replantear. Con números, no con adjetivos.
10. PREGUNTAS ABIERTAS · qué información falta y en qué sesión conseguirla.

Y además: PRINCIPIO FOUNDERS (una regla generalizable, para que la consultora reconozca el patrón sola en el próximo cliente) y POR QUÉ (una línea: "estoy llegando a esta conclusión porque…").

Restricciones que se validan en el código y que si violás hacen que la respuesta se rechace:
- Un solo cuello de botella. El campo es un string, no un array.
- Máximo 5 puntos de diagnóstico y máximo 5 acciones.
- Todo hecho lleva fuenteId y fecha.
- Si el cliente todavía no vendió, el plan no puede mencionar CRM, funnel, automatización, webinar, más ads ni contratar closer.
- Toda afirmación de "esto no funciona" requiere declarar la muestra.

Prohibiciones de contenido:
- No completes información faltante imaginándola. Lo que no está en el expediente va a preguntas abiertas.
- No diagnostiques emocional cuando los números muestran un problema de oferta o de volumen, ni estratégico cuando el cliente ya tiene claridad y no ejecuta.
- No propongas escalar algo que todavía no funciona.
- No cambies de estrategia por un caso aislado.
- No respondas "según el Método FOUNDERS deberías…". Primero el negocio, después el método.

Devolvés exactamente este JSON, sin texto alrededor:
{
  "diagnostico": ["..."],
  "cuelloBotella": "...",
  "tipoBloqueo": "estrategico|mensaje|adquisicion|comercial|entrega|operativo|ejecucion|emocional",
  "eslabonRoto": "cliente|problema|deseo|oferta|promesa|mensaje|canal|lead|setting|venta|entrega|resultado",
  "evidencia": [{"afirmacion":"...","tipo":"hecho|hipotesis","fuenteTipo":"sesion|tracker|pago|estrategia","fuenteId":"...","fecha":"YYYY-MM-DD","cita":"..."}],
  "queNoHaria": ["..."],
  "hipotesisPrincipal": "...",
  "planAccion": [{"accion":"...","responsable":"..."}],
  "metricas": [{"metrica":"...","valorPartida":"..."}],
  "checkpoint": "YYYY-MM-DD",
  "criterioDecision": {"continuar":"...","corregir":"...","replantear":"..."},
  "preguntasAbiertas": ["..."],
  "precedentesCitados": ["..."],
  "principioFounders": "...",
  "porQue": "..."
}`;

export const VERSION_DIAGNOSTICO = `diag-1.0+${CONSTITUCION_HASH}`;

// ---------------------------------------------------------------------------
// Serialización del expediente · cada dato con su origen y su fecha
// ---------------------------------------------------------------------------

export function serializarExpediente(ctx: ContextoCliente, alertas: AlertaViva[]): string {
  const c = ctx.cliente;
  const l: string[] = [];

  l.push(`## CLIENTE: ${c.nombre} · ${c.programa} · alta ${formatDateLong(c.fechaAlta)} · día ${ctx.dia} del programa`);
  l.push(
    `Consultora: ${ctx.consultora?.nombre ?? 'sin asignar'} · Garantía: ${c.tieneGarantia ? 'sí' : 'no'} · Plan: ${c.planPago ?? '—'} · Horas reales por semana: ${c.horasRealesSemana ?? 'SIN DATO'}`,
  );
  l.push(`Fase del negocio: ${ctx.fase} · Expediente: ${ctx.bloquesCargados} de 6 bloques`);
  l.push('');

  const n = ctx.registros.negocio;
  l.push(`## NEGOCIO  [actualizado ${n ? formatShort(n.actualizadoAt) : 'nunca'}]`);
  if (n) {
    l.push(`Qué vende: ${n.queVende ?? 'SIN DATO'}`);
    l.push(`A quién: ${n.aQuien ?? 'SIN DATO'}`);
    l.push(`Precio: ${n.precio ? `${n.moneda} ${n.precio.toLocaleString('es-AR')}` : 'SIN DATO'}`);
    l.push(`Facturación mensual: ${n.facturacionMensual?.toLocaleString('es-AR') ?? 'SIN DATO'}`);
    l.push(`Clientes actuales: ${n.cantidadClientes ?? 'SIN DATO'} · origen: ${n.origenClientes ?? 'SIN DATO'}`);
    l.push(`Qué funcionó: ${n.queFunciono ?? 'SIN DATO'} · qué no: ${n.queNoFunciono ?? 'SIN DATO'}`);
  } else l.push('SIN DATOS');
  l.push('');

  const a = ctx.registros.autoridad;
  l.push('## AUTORIDAD');
  if (a) {
    l.push(`Hace excepcionalmente bien: ${a.haceExcepcionalmenteBien ?? 'SIN DATO'}`);
    l.push(`Experiencia: ${a.experienciaProfesional ?? 'SIN DATO'}`);
    l.push(`Resultados propios: ${a.resultadosPropios ?? 'SIN DATO'}`);
    l.push(`Resultados de terceros: ${a.resultadosTerceros ?? 'SIN DATO'}`);
    l.push(`Industrias que conoce: ${a.industriasQueConoce.join(', ') || 'SIN DATO'}`);
    l.push(`Autoridad desperdiciada: ${a.autoridadDesperdiciada ?? 'SIN DATO'}`);
  } else l.push('SIN DATOS');
  l.push('');

  const e = ctx.estrategia;
  l.push(`## ESTRATEGIA VIGENTE  ${e ? `[versión ${e.version} · desde ${formatShort(e.vigenteDesde)} · iniciativa: ${e.iniciativa ?? '—'}]` : '[SIN CARGAR]'}`);
  if (e) {
    l.push(`Cliente ideal: ${e.clienteIdeal ?? 'SIN DATO'}`);
    l.push(`Problema: ${e.problema ?? 'SIN DATO'}`);
    l.push(`Deseo: ${e.deseo ?? 'SIN DATO'}`);
    l.push(`Promesa: ${e.promesa ?? 'SIN DATO'}`);
    l.push(`Oferta: ${e.oferta ?? 'SIN DATO'}`);
    l.push(`Mecanismo: ${e.mecanismo ?? 'SIN DATO'} · Canal: ${e.canal ?? 'SIN DATO'}`);
    l.push(`Precio: ${e.precio ? `${e.moneda} ${e.precio.toLocaleString('es-AR')}` : 'SIN DATO'}`);
    if (ctx.estrategiasPrevias.length) {
      l.push('### Versiones anteriores');
      for (const v of ctx.estrategiasPrevias) {
        l.push(
          `v${v.version} [desde ${formatShort(v.vigenteDesde)}]: precio ${v.precio?.toLocaleString('es-AR') ?? '—'} · ${v.motivoCambio ?? 'sin motivo registrado'} · iniciativa ${v.iniciativa ?? '—'}`,
        );
      }
    }
  } else l.push('SIN DATOS');
  l.push('');

  if (ctx.objetivo) {
    const ci = calcularCuentaInversa(ctx.objetivo.metaMensual, ctx.objetivo.ticket, tasasDe(ctx.objetivo));
    const rojo = calcularCuentaInversa(ctx.objetivo.metaMensual, ctx.objetivo.ticket, TASAS_ROJO);
    l.push('## CUENTA INVERSA DESDE LA META');
    l.push(
      `Meta ${ctx.objetivo.moneda} ${ctx.objetivo.metaMensual.toLocaleString('es-AR')} por mes · ticket ${ctx.objetivo.ticket.toLocaleString('es-AR')}`,
    );
    l.push(
      `En objetivo: ${ci.ventasMes} ventas · ${ci.asistenciasMes} asistencias · ${ci.agendasMes} agendas · ${ci.conversacionesMes} conversaciones · ${ci.dmsSemana} DMs/semana · ${ci.alcanceSemana.toLocaleString('es-AR')} de alcance/semana`,
    );
    l.push(
      `Con el embudo en rojo: ${rojo.dmsSemana} DMs/semana y ${rojo.alcanceSemana.toLocaleString('es-AR')} de alcance/semana para facturar exactamente lo mismo`,
    );
    l.push('');
  }

  l.push('## NÚMEROS  [tracker semanal · null = no se cargó, 0 = se midió y dio cero]');
  const ultimas = [...ctx.registros.metricas].sort((a2, b2) => b2.semanaIso.localeCompare(a2.semanaIso)).slice(0, 8).reverse();
  if (ultimas.length) {
    l.push('| Semana | Alcance | DMs | Conv. | Agendas | Asist. | Ofertas | Ventas | Facturado |');
    for (const m of ultimas) {
      const f = (v: number | null) => (v === null ? '—' : String(v));
      l.push(
        `| ${formatShort(m.semanaIso)} | ${f(m.alcanceTotal)} | ${f(m.dmsIniciados)} | ${f(m.conversacionesAvanzadas)} | ${f(m.agendas)} | ${f(m.asistencias)} | ${f(m.ofertasRealizadas)} | ${f(m.ventas)} | ${f(m.facturado)} |`,
      );
    }
    l.push(
      `Acumulado del programa: ${ctx.totales.dmsIniciados.valor} DMs · ${ctx.totales.agendas.valor} agendas · ${ctx.totales.asistencias.valor} asistencias · ${ctx.ventas} ventas · ${ctx.facturado.toLocaleString('es-AR')} facturado`,
    );
    l.push(
      `Semanas sin dato cargado: ${ctx.totales.dmsIniciados.semanasSinDato} de ${ctx.totales.dmsIniciados.semanasSinDato + ctx.totales.dmsIniciados.semanasConDato}`,
    );
  } else l.push('SIN NÚMEROS CARGADOS');
  l.push('');

  l.push('## SESIONES  [últimas 6]');
  const ses = ctx.registros.sesiones.filter((s) => s.fecha <= ctx.hoy).slice(0, 6);
  if (ses.length) {
    for (const s of ses) {
      const senales: string[] = [];
      if (s.mencionoNumeros === false) senales.push('no se dijo un solo número');
      if (s.seFueEnHerramienta) senales.push('se fue en herramienta');
      if (s.cerroConCompromiso === false) senales.push('cerró sin compromiso');
      if (s.abrioRepasando === false) senales.push('no repasó el compromiso anterior');
      if (typeof s.pctHablaCliente === 'number' && s.pctHablaCliente < 30) senales.push(`el cliente habló ${s.pctHablaCliente}%`);
      l.push(
        `- ${formatShort(s.fecha)} [${s.id}] · ${s.estadoAgenda}${s.reporte ? ` · reporte: ${s.reporte.replace(/\n/g, ' ')}` : ' · SIN REPORTE'}${senales.length ? ` · señales: ${senales.join(', ')}` : ''}`,
      );
    }
  } else l.push('SIN SESIONES REGISTRADAS');
  l.push('');

  l.push('## COMPROMISOS');
  const comp = ctx.registros.compromisos.slice(0, 8);
  if (comp.length) {
    for (const x of comp) {
      l.push(`- ${x.estado === 'pendiente' && x.fechaVencimiento < ctx.hoy ? 'VENCIDO' : x.estado} ${formatShort(x.fechaVencimiento)}: "${x.descripcion}" (${x.responsable})`);
    }
  } else l.push('SIN COMPROMISOS REGISTRADOS');
  l.push('');

  l.push('## ALERTAS ABIERTAS');
  const abiertas = alertas.filter((x) => !x.cerradaAt);
  if (abiertas.length) {
    for (const x of abiertas) {
      l.push(
        `- ${x.estadoSemaforo.toUpperCase()} ${x.codigo} (${x.vecesEmitida}ª vez) desde ${formatShort(x.emitidaAt)}: ${x.cuerpo}${x.citaTextual ? ` Textual: "${x.citaTextual}"` : ''}`,
      );
    }
  } else l.push('Ninguna');
  l.push('');

  l.push('## PAGOS Y GARANTÍA');
  l.push(
    `Cuotas vencidas: ${ctx.cuotasVencidas.length}${ctx.diasCuotaMasVencida ? ` · la más vieja hace ${ctx.diasCuotaMasVencida} días` : ''}`,
  );
  if (c.tieneGarantia) {
    l.push('Tiene garantía firmada: exige 90% de asistencia 1:1, 2 mentorías grupales por semana, reporte semanal y cuotas en término.');
    l.push(`Asistencias a mentorías en las últimas 3 semanas: ${ctx.asistenciaMentorias3sem}`);
  }
  l.push('');

  const vacios = Object.entries(ctx.bloques)
    .filter(([, v]) => !v)
    .map(([k]) => BLOQUE_LABEL[k as keyof typeof BLOQUE_LABEL]);
  l.push('## BLOQUES VACÍOS DEL EXPEDIENTE');
  l.push(vacios.length ? vacios.map((x) => `- ${x}: sin datos`).join('\n') : 'Ninguno');

  return l.join('\n');
}

export function construirPromptDiagnostico(
  ctx: ContextoCliente,
  alertas: AlertaViva[],
  pregunta?: string,
): { system: string[]; user: string[]; version: string } {
  const embudo = leerEmbudo(ctx);
  const indice = calcularIndice(ctx);

  const lecturaSistema = [
    '## LECTURA DETERMINÍSTICA DEL SISTEMA',
    'Esto ya lo calculó la app con aritmética, sin modelo. No lo repitas: discutilo si no coincidís.',
    `Índice de avance: ${indice.valor}/100 (confianza del dato: ${indice.confianza})`,
    `Pilares: ${indice.pilares.map((p) => `${p.label} ${p.valor === null ? 'n/a' : Math.round(p.valor)}`).join(' · ')}`,
    `Eslabón roto calculado: ${ESLABON_LABEL[embudo.eslabon]} · bloqueo ${embudo.tipoBloqueo} (${BLOQUEO_DESCRIPCION[embudo.tipoBloqueo]})`,
    `Evidencia: ${embudo.evidencia}`,
    embudo.concluyente ? '' : `ATENCIÓN: la muestra no alcanza para concluir (${embudo.muestra ?? 'sin muestra'}).`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    system: [CONSTITUCION, PROMPT_DIAGNOSTICO],
    user: [
      serializarExpediente(ctx, alertas),
      lecturaSistema,
      pregunta ? `## PREGUNTA DE LA CONSULTORA\n${pregunta}` : '## PREGUNTA DE LA CONSULTORA\nDiagnóstico general del caso.',
    ],
    version: VERSION_DIAGNOSTICO,
  };
}

// ---------------------------------------------------------------------------
// Borrador local · el piso de calidad mientras la API no está conectada
// ---------------------------------------------------------------------------

export function borradorLocal(ctx: ContextoCliente, alertas: AlertaViva[]): DiagnosticoPayload {
  const e = leerEmbudo(ctx);
  const indice = calcularIndice(ctx);
  const abiertas = alertas.filter((a) => !a.cerradaAt && a.estadoSemaforo !== 'verde');
  const c = ctx.cliente;

  const diagnostico: string[] = [
    `${c.nombre} está en el día ${ctx.dia} del programa, fase ${ctx.fase}, con ${ctx.ventas} venta(s) registrada(s).`,
    e.evidencia,
  ];
  if (indice.motores.length) diagnostico.push(indice.motores[0]);
  if (abiertas.length) diagnostico.push(`Hay ${abiertas.length} alerta(s) abierta(s); la más grave es ${abiertas[0].codigo}: ${abiertas[0].cuerpo}`);
  if (ctx.bloquesCargados < 4)
    diagnostico.push(`El expediente tiene ${ctx.bloquesCargados} de 6 bloques: sobre lo que falta, el sistema no puede opinar.`);

  const evidencia = [
    {
      afirmacion: e.evidencia,
      tipo: 'hecho' as const,
      fuenteTipo: 'tracker',
      fuenteId: ctx.ultimaSemanaCargada?.id ?? 'tracker',
      fecha: ctx.ultimaSemanaCargada?.semanaIso ?? ctx.hoy,
    },
    ...(ctx.ultimaSesion
      ? [
          {
            afirmacion: `Última sesión realizada el ${formatShort(ctx.ultimaSesion.fecha)}${ctx.diasSinSesion !== null ? `, hace ${ctx.diasSinSesion} días` : ''}.`,
            tipo: 'hecho' as const,
            fuenteTipo: 'sesion',
            fuenteId: ctx.ultimaSesion.id,
            fecha: ctx.ultimaSesion.fecha,
          },
        ]
      : []),
    ...(e.concluyente
      ? []
      : [
          {
            afirmacion: `La muestra disponible (${e.muestra ?? 'sin muestra'}) no alcanza para concluir sobre este eslabón.`,
            tipo: 'hipotesis' as const,
          },
        ]),
  ];

  const plan = [{ accion: e.accion, responsable: 'consultora' }];
  if (abiertas[0]) plan.push({ accion: abiertas[0].pedido, responsable: abiertas[0].destinatario });
  if (ctx.bloquesCargados < 4)
    plan.push({ accion: 'Completar los bloques faltantes del expediente en la próxima sesión.', responsable: 'consultora' });

  return {
    diagnostico: diagnostico.slice(0, 5),
    cuelloBotella: e.titulo,
    tipoBloqueo: e.tipoBloqueo,
    eslabonRoto: e.eslabon,
    evidencia,
    queNoHaria: [
      e.queNoHacer,
      'No cambiar dos cosas a la vez. Si mejora, no vas a saber cuál fue.',
    ],
    hipotesisPrincipal: `Si se corrige ${ESLABON_LABEL[e.eslabon].toLowerCase()}, el resto del embudo debería moverse sin tocar nada más.`,
    planAccion: plan.slice(0, 5),
    metricas: [
      { metrica: 'DMs por semana', valorPartida: String(ctx.ultimas4.dmsIniciados.valor) },
      { metrica: 'Agendas acumuladas', valorPartida: String(ctx.totales.agendas.valor) },
      { metrica: 'Ventas', valorPartida: String(ctx.ventas) },
    ],
    checkpoint: ctx.hoy,
    criterioDecision: {
      continuar: `Si en 3 semanas ${ESLABON_LABEL[e.eslabon].toLowerCase()} mejora al menos 50%, se sostiene el plan.`,
      corregir: 'Si mejora menos de eso, se ajusta la táctica sin cambiar el eslabón.',
      replantear: 'Si no se mueve nada y la muestra alcanza, se replantea el eslabón anterior de la cadena.',
    },
    preguntasAbiertas: Object.entries(ctx.bloques)
      .filter(([, v]) => !v)
      .map(([k]) => `Falta el bloque ${BLOQUE_LABEL[k as keyof typeof BLOQUE_LABEL]}: conseguirlo en la próxima sesión.`),
    precedentesCitados: [],
    principioFounders:
      'Ningún eslabón se juzga sin muestra, y cuando hay tres en rojo el que manda es el primero de la cadena: los de abajo pueden ser consecuencia.',
    porQue: `Estoy llegando a esta conclusión porque ${e.evidencia.toLowerCase()}`,
  };
}

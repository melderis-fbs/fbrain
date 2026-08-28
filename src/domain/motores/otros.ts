import { calcularCuentaInversa, TASAS_OBJETIVO, TASAS_ROJO } from '../cuenta-inversa';
import type { ContextoCliente } from '../expediente';
import { CONSTITUCION_HASH } from './constitucion';

/**
 * MOTORES 2, 3 y 4 · onboarding, coherencia y score.
 * Más el extractor de transcripciones, que es el de mayor volumen.
 *
 * Los prompts viven en el repo y versionados. Cada corrida guarda el hash: sin
 * eso el set de evaluación no significa nada, porque no se puede saber contra
 * qué versión se midió.
 */

// ---------------------------------------------------------------------------
// Motor 2 · Onboarding 60 días
// ---------------------------------------------------------------------------

export const PROMPT_ONBOARDING = `Vas a preparar el arranque de un cliente nuevo. El objetivo no es un cronograma de doce semanas: es que este negocio tenga la mejor posibilidad de generar una venta antes del día 60.

Antes de escribir, resolvé internamente:
- ¿Qué está comprando realmente? Separá lo que dijo que quiere de lo que su situación indica que necesita.
- ¿Qué activos ya tiene y no está usando? Contenido grabado, comunidad, testimonios, contactos, autoridad de su profesión anterior. El arranque más rápido casi siempre sale de acá.
- ¿Cuántas horas reales tiene? El plan se arma contra ese número, nunca contra las horas del pitch.
- ¿Qué es lo único que no puede quedar abierto en las primeras dos semanas?

Devolvés, en este orden:
1. QUÉ NECESITA, EN ORDEN. Máximo 5, cada una con la cita textual de la llamada o del onboarding que la justifica, con fecha. Ordenadas por lo que más mueve una venta, no por lo que es más fácil.
2. LA CUENTA INVERSA. Ya viene calculada en el contexto: usala tal cual, no la recalcules ni la redondees distinto.
3. MAPA 60 DÍAS. Tramos 1-7, 8-14, 15-30, 31-45, 46-60. Qué se resuelve y qué señal del mercado esperamos.
4. SPRINT 1. Objetivo, hipótesis, entre 3 y 5 acciones con responsable, métrica, resultado esperado, fecha de revisión.
5. LAS TRES COSAS PARA LA SESIÓN 1. Concretas y verificables. Si hay garantía firmada, una es leer sus condiciones en voz alta.
6. RIESGOS DEL CASO, cada uno con su evidencia textual.
7. BRIEF PARA EL CANAL DE LA CONSULTORA, para pegar tal cual, escrito para alguien que no escuchó la llamada.
8. QUÉ NO HARÍA EN LOS PRIMEROS 30 DÍAS.

Reglas:
- Si el cliente tiene varios mercados abiertos, cerrarlos es trabajo de las primeras dos semanas. No necesita que le impongan el nicho: necesita que le cierren la puerta a los otros.
- No lo mandes a hacer tarea solo si en la llamada dijo que eso no le funciona. Convertilo en trabajo asistido dentro de la sesión.
- Un cliente con academia grabada, comunidad o testimonios sin usar arranca empaquetando lo que tiene, no creando algo nuevo.
- Los primeros 30 días no incluyen CRM, funnel, automatización, webinar ni equipo comercial.
- Nunca descartes la experiencia previa porque dijo que no quiere ese mercado. Investigá primero por qué.

Devolvés JSON según el contrato de onboarding, sin texto alrededor.`;

export const VERSION_ONBOARDING = `onb-1.0+${CONSTITUCION_HASH}`;

/**
 * La cuenta inversa NO la calcula el modelo: la calcula la app y se la pasa
 * hecha. Es aritmética, y un modelo que redondea distinto cada vez rompe el
 * KPI operativo del cliente.
 */
export function cuentaInversaParaPrompt(metaMensual: number, ticket: number) {
  const objetivo = calcularCuentaInversa(metaMensual, ticket, TASAS_OBJETIVO);
  const rojo = calcularCuentaInversa(metaMensual, ticket, TASAS_ROJO);
  return {
    objetivo,
    rojo,
    texto: [
      `Meta: ${metaMensual.toLocaleString('es-AR')} por mes · ticket ${ticket.toLocaleString('es-AR')}`,
      `EN OBJETIVO → ${objetivo.ventasMes} ventas · ${objetivo.asistenciasMes} asistencias · ${objetivo.agendasMes} agendas · ${objetivo.conversacionesMes} conversaciones · ${objetivo.dmsSemana} DMs por semana · ${objetivo.alcanceSemana.toLocaleString('es-AR')} de alcance por semana`,
      `EN ROJO → ${rojo.asistenciasMes} asistencias · ${rojo.agendasMes} agendas · ${rojo.conversacionesMes} conversaciones · ${rojo.dmsSemana} DMs por semana · ${rojo.alcanceSemana.toLocaleString('es-AR')} de alcance por semana`,
      `Con el embudo en objetivo necesita ${Math.round((rojo.alcanceSemana / Math.max(1, objetivo.alcanceSemana)) * 10) / 10}× menos alcance para facturar exactamente lo mismo.`,
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Motor 3 · Test de coherencia · dos llamadas, y el orden ES la funcionalidad
// ---------------------------------------------------------------------------

export const PROMPT_COHERENCIA_A = `Vas a leer un material de comunicación de un negocio. No sabés nada del negocio, ni de su dueño, ni de su cliente ideal, y no vas a poder preguntarlo. No especules sobre qué quiso decir el autor.

Tu única tarea es responder una pregunta: ¿qué tipo de persona se sentiría profundamente identificada con este mensaje?

No "¿para quién parece escrito?". No "¿a quién le convendría?". Quién se reconoce, tal como está escrito, leído por alguien que ve esto por primera vez mientras scrollea.

Describí a esa persona con la precisión de un comprador reconocible: industria o profesión, tipo de negocio, nivel de facturación aproximado, madurez, tamaño de equipo y momento del negocio.

Y respondé además:
- Nivel de dolor: ¿principiante (no vende, no arrancó) o de crecimiento (factura y no escala)?
- Movimiento: ¿está escapando de un problema o capturando una oportunidad?
- Capacidad de pago inferida.
- Quién NO se reconoce. Si no repele a nadie, decilo: es un hallazgo, no un vacío.
- Frases decisivas: 3 a 6 expresiones textuales del material que más definen a quién atrae, y qué señal manda cada una.

No evalúes si el material está bien o mal escrito. No lo reescribas. No des recomendaciones.`;

export const PROMPT_COHERENCIA_B = `Tenés dos definiciones de cliente para el mismo negocio.

A · INFERIDA: quién se reconoce en el material publicado, según una lectura a ciegas hecha sin conocer el negocio. Es un dato cerrado: no lo cuestiones ni lo ajustes.
B · DECLARADA: el cliente ideal registrado en la estrategia vigente, con su fecha y su versión.

Compará y devolvé: veredicto (coherente / parcial / incoherente) con su por qué; la brecha dimensión por dimensión (madurez, facturación, tipo de dolor, capacidad de pago, industria); las palabras responsables con cita textual y qué diría en su lugar alguien que quisiera atraer al cliente declarado; qué eslabón tocar primero; el drift contra versiones anteriores de la estrategia; qué no haría todavía; y la conclusión sobre los leads.

La regla que no se negocia: si los leads son incorrectos, NO concluyas que hay un problema de segmentación. El orden de revisión es mensaje → problema descrito → nivel de madurez → deseo activado → palabras, y sólo al final targeting.

Si te pasaron menos de 10 leads, declará explícitamente que la muestra no alcanza para concluir sobre calidad de leads.

No reescribas el material. Primero decimos qué está mal y por qué.`;

export const VERSION_COHERENCIA = `coh-1.0+${CONSTITUCION_HASH}`;

// ---------------------------------------------------------------------------
// Motor 4A · Score de salud comercial · 12 dimensiones
// ---------------------------------------------------------------------------

export const PROMPT_SCORE = `Calificá el negocio del 1 al 10 en estas doce dimensiones: cliente ideal, problema, deseo, oferta, promesa, mensaje, autoridad, adquisición, volumen, ventas, entrega, ejecución.

Cada puntaje lleva su evidencia al lado, con origen y fecha. Un score sin evidencia es un número que nadie va a creer la segunda vez.

Si no tenés información suficiente para calificar una dimensión, no inventes un 5: devolvé null y explicá qué dato falta. Un null honesto es más útil que un promedio inventado.

Después indicá los 3 scores que más están limitando las ventas. No los tres más bajos: los tres cuya mejora movería más la aguja, que no es lo mismo. Un 4 en entrega no importa si todavía no hay ventas; un 6 en mensaje puede ser lo único que importa.

Respetá la jerarquía al recomendar: cliente → problema → oferta → promesa → mensaje → validación → adquisición → ventas → entrega → escala. No propongas trabajar el eslabón 8 si el 3 está en 4.

Para la promesa, calificá por separado especificidad, relevancia, deseo, credibilidad, diferenciación y claridad. Si alguno está por debajo de 7, explicá por qué.

Devolvés JSON según el contrato de score, sin texto alrededor.`;

export const VERSION_SCORE = `score-1.0+${CONSTITUCION_HASH}`;

// ---------------------------------------------------------------------------
// Extractor de transcripciones · el de mayor volumen, con modelo chico
// ---------------------------------------------------------------------------

export const PROMPT_EXTRACTOR = `Vas a leer la transcripción de una sesión entre una consultora de Founders y su cliente. Extraé información, no la interpretes ni la mejores.

Devolvés:
1. REPORTE. De 5 a 10 líneas: qué se trabajó, a qué se llegó, qué quedó abierto. Para que alguien que no estuvo entienda el caso en treinta segundos. Tono de registro interno, sin adornos.
2. COMPROMISOS. Todo lo que el cliente o la consultora se comprometió a hacer, con responsable y fecha concreta. Si un compromiso no tiene fecha, marcalo sinFecha: eso ya es una señal.
3. NÚMEROS MENCIONADOS. Todo dato cuantitativo dicho, con su cita. No estimes, no completes, no redondees. Si dijo "unos veinte", devolvé 20 con aproximado true.
4. CAMBIOS DE ESTRATEGIA. Qué cambió, de qué a qué, y de quién fue la iniciativa. Un cambio de precio a iniciativa del cliente sin llamada de venta de por medio es criterio de alerta rojo.
5. FRASES CANDIDATAS A ALERTA. Citas textuales literales, sin corregir la gramática. No clasifiques el estado: eso lo hace el motor de alertas.
6. SEÑALES DE LA SESIÓN, como booleanos: se dijo al menos un número; la sesión se fue en pantalla o herramienta; cerró con compromiso con fecha; abrió repasando el compromiso anterior; porcentaje aproximado que habló el cliente; tema declarado y tema tratado.
7. DATOS DEL EXPEDIENTE que aparecieron en la sesión y llenan un bloque vacío, con su cita.

Reglas: no inventes nada — lo que no aparece va null. Las citas son literales. No opines sobre el desempeño de la consultora. Si la transcripción está cortada, decilo en calidadTranscripcion y extraé lo que haya.`;

export const VERSION_EXTRACTOR = 'extr-1.0';

// ---------------------------------------------------------------------------
// Motor 4B · Alertas por criterio
// ---------------------------------------------------------------------------

export const PROMPT_ALERTAS_CRITERIO = `Vas a leer la transcripción de una sesión y detectar señales de riesgo según criterios fijos. No estás evaluando la calidad de la sesión ni juzgando a nadie: estás buscando frases y ausencias específicas.

Para cada señal devolvé el código, la cita textual exacta, el estado y el pedido.

Reglas que no se negocian:
1. Sin cita textual no hay alerta. Sin cita es una interpretación y se discute; con cita es un hecho y se trabaja.
2. La cita es literal. No la parafrasees, no la limpies, no le arregles la gramática.
3. Si el criterio es una ausencia (familia B), el textual es la constatación: qué se buscó y no apareció.
4. No inventes códigos. Lo que te preocupe y no encaje va en observaciones, sin estado de semáforo.

Lo que explícitamente NO es alerta: una queja aislada resuelta en la misma sesión; dudas técnicas por más frustradas que suenen; mal día o tema personal que no toca el programa; emoción fuerte con avance — el que llora y trajo sus 30 conversaciones hechas no está en riesgo, y este es el falso positivo que más rápido hace que el equipo deje de leer las alertas; cliente nuevo en sus primeras dos semanas.

El escalado de dos amarillas iguales a rojo no lo decidís vos: lo hace una regla en SQL.`;

export const VERSION_ALERTAS = `alert-1.0+${CONSTITUCION_HASH}`;

// ---------------------------------------------------------------------------
// Registro de motores · para la pantalla de transparencia y el costo
// ---------------------------------------------------------------------------

export interface MotorInfo {
  key: string;
  nombre: string;
  proposito: string;
  modelo: 'criterio' | 'extraccion';
  version: string;
  cuando: string;
  contrato: string;
  estado: 'listo' | 'sin_conectar';
}

export const MOTORES: MotorInfo[] = [
  {
    key: 'diagnostico',
    nombre: 'Diagnóstico',
    proposito: 'Un solo cuello de botella, con evidencia, plan de máximo 5 acciones y qué no hacer.',
    modelo: 'criterio',
    version: `diag-1.0+${CONSTITUCION_HASH}`,
    cuando: 'A pedido de la consultora, con hipótesis previa obligatoria.',
    contrato: 'diagnostico.schema.json',
    estado: 'sin_conectar',
  },
  {
    key: 'onboarding',
    nombre: 'Plan de onboarding 60 días',
    proposito: 'Qué necesita en orden, cuenta inversa, mapa de 60 días, sprint 1 y brief para el canal.',
    modelo: 'criterio',
    version: VERSION_ONBOARDING,
    cuando: 'El día del alta, con la llamada de venta y el formulario.',
    contrato: 'onboarding.schema.json',
    estado: 'sin_conectar',
  },
  {
    key: 'coherencia',
    nombre: 'Test de coherencia',
    proposito: 'Brief inverso a ciegas contra el cliente ideal declarado. Dos llamadas, y el orden es la funcionalidad.',
    modelo: 'criterio',
    version: VERSION_COHERENCIA,
    cuando: 'Cuando se carga un anuncio, reel, guion, landing o DM.',
    contrato: 'coherencia.schema.json',
    estado: 'sin_conectar',
  },
  {
    key: 'score',
    nombre: 'Score de salud comercial',
    proposito: '12 dimensiones con evidencia obligatoria y las 3 que más limitan la venta.',
    modelo: 'criterio',
    version: VERSION_SCORE,
    cuando: 'A pedido, y automáticamente los días 30, 60 y 90.',
    contrato: 'score.schema.json',
    estado: 'sin_conectar',
  },
  {
    key: 'extractor',
    nombre: 'Extractor de transcripciones',
    proposito: 'Reporte, compromisos, números, cambios de estrategia, frases candidatas y señales.',
    modelo: 'extraccion',
    version: VERSION_EXTRACTOR,
    cuando: 'Al cerrar cada sesión. ~340 por mes: es la llamada de mayor volumen.',
    contrato: 'extraccion-sesion.schema.json',
    estado: 'sin_conectar',
  },
  {
    key: 'alertas',
    nombre: 'Alertas por criterio',
    proposito: 'Familias A, B y C con cita textual obligatoria.',
    modelo: 'extraccion',
    version: VERSION_ALERTAS,
    cuando: 'Después de cada sesión, sobre la transcripción.',
    contrato: 'alerta.schema.json',
    estado: 'sin_conectar',
  },
];

/** Score local: sólo puntúa lo que se puede sostener con datos. El resto queda en null, a propósito. */
export function scoreLocal(ctx: ContextoCliente) {
  const t = ctx.totales;
  const n = (v: number | null) => v;
  const dims: { dimension: string; valor: number | null; evidencia: string; datoFaltante?: string }[] = [
    {
      dimension: 'cliente_ideal',
      valor: ctx.estrategia?.clienteIdeal ? 6 : null,
      evidencia: ctx.estrategia?.clienteIdeal
        ? `Declarado en la estrategia v${ctx.estrategia.version}. El puntaje real necesita criterio: esto sólo verifica que exista.`
        : '',
      datoFaltante: ctx.estrategia?.clienteIdeal ? undefined : 'No hay cliente ideal cargado en la estrategia vigente.',
    },
    {
      dimension: 'volumen',
      valor: ctx.esperado && t.dmsIniciados.confiable
        ? Math.max(1, Math.min(10, Math.round((t.dmsIniciados.valor / Math.max(1, ctx.esperado.dms)) * 10)))
        : null,
      evidencia: ctx.esperado && t.dmsIniciados.confiable
        ? `${t.dmsIniciados.valor} DMs acumulados contra ${Math.round(ctx.esperado.dms)} que necesita para su meta.`
        : '',
      datoFaltante: t.dmsIniciados.confiable ? undefined : 'Sin DMs cargados en el tracker.',
    },
    {
      dimension: 'ventas',
      valor: t.asistencias.valor >= 10
        ? Math.max(1, Math.min(10, Math.round((t.ventas.valor / t.asistencias.valor) * 40)))
        : null,
      evidencia: t.asistencias.valor >= 10
        ? `${t.ventas.valor} ventas sobre ${t.asistencias.valor} llamadas con asistencia.`
        : '',
      datoFaltante: t.asistencias.valor >= 10 ? undefined : `Sólo ${t.asistencias.valor} llamadas: no alcanza para concluir sobre cierre.`,
    },
    {
      dimension: 'ejecucion',
      valor: ctx.cumplimientoCompromisos !== null ? Math.max(1, Math.round(ctx.cumplimientoCompromisos * 10)) : null,
      evidencia: ctx.cumplimientoCompromisos !== null
        ? `${Math.round(ctx.cumplimientoCompromisos * 100)}% de compromisos cumplidos.`
        : '',
      datoFaltante: ctx.cumplimientoCompromisos === null ? 'Sin compromisos cerrados para evaluar.' : undefined,
    },
  ];
  void n;
  return dims;
}

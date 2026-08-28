import { z } from 'zod';

/**
 * CONTRATOS DE SALIDA
 *
 * La disciplina va en el código, no en el prompt. Si el modelo devuelve dos
 * cuellos de botella, la respuesta se rechaza y se reintenta con el error de
 * validación en el mensaje. Máximo tres intentos; después, fallo visible.
 *
 * Estos schemas son la versión ejecutable de `06-contratos-json/` del paquete
 * de Brain. Se validan con Zod porque la app es TypeScript, y el JSON Schema
 * queda como documentación del contrato.
 */

export const MAX_REINTENTOS_VALIDACION = 3;

export const evidenciaSchema = z
  .object({
    afirmacion: z.string().min(1),
    tipo: z.enum(['hecho', 'hipotesis']),
    fuenteTipo: z.string().optional(),
    fuenteId: z.string().optional(),
    fecha: z.string().optional(),
    cita: z.string().optional(),
  })
  .refine((e) => e.tipo !== 'hecho' || (Boolean(e.fuenteId) && Boolean(e.fecha)), {
    message: 'Un hecho sin fuente y fecha no es un hecho: va como hipótesis.',
  });

export const tipoBloqueoSchema = z.enum([
  'estrategico', 'mensaje', 'adquisicion', 'comercial',
  'entrega', 'operativo', 'ejecucion', 'emocional',
]);

export const eslabonSchema = z.enum([
  'cliente', 'problema', 'deseo', 'oferta', 'promesa', 'mensaje',
  'canal', 'lead', 'setting', 'venta', 'entrega', 'resultado',
]);

/** Frases que delatan construcción antes de validar. */
const PROHIBIDO_SIN_VENTAS = /\b(crm|funnel|embudo automatizado|automatiz|webinar|contratar (un )?closer|escalar ads|más ads)\b/i;

export const diagnosticoSchema = z
  .object({
    diagnostico: z.array(z.string().min(3)).min(1).max(5),
    // Escalar a propósito: un solo cuello de botella. No es un array.
    cuelloBotella: z.string().min(10),
    tipoBloqueo: tipoBloqueoSchema,
    eslabonRoto: eslabonSchema,
    evidencia: z.array(evidenciaSchema).min(1),
    queNoHaria: z.array(z.string().min(3)).min(1),
    hipotesisPrincipal: z.string().min(10),
    planAccion: z
      .array(z.object({ accion: z.string().min(5), responsable: z.string().min(2) }))
      .min(1)
      .max(5),
    metricas: z.array(z.object({ metrica: z.string(), valorPartida: z.string().optional() })).min(1),
    checkpoint: z.string().min(4),
    criterioDecision: z.object({
      continuar: z.string().min(4),
      corregir: z.string().min(4),
      replantear: z.string().min(4),
    }),
    preguntasAbiertas: z.array(z.string()),
    precedentesCitados: z.array(z.string()).default([]),
    principioFounders: z.string().min(10),
    porQue: z.string().min(10),
    contradiccionConConsultora: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    // No recomendar construir antes de validar.
    const texto = d.planAccion.map((p) => p.accion).join(' ');
    if (PROHIBIDO_SIN_VENTAS.test(texto)) {
      ctx.addIssue({
        code: 'custom',
        path: ['planAccion'],
        message:
          'El plan propone construir (CRM, funnel, automatización, webinar, más ads o closer). Antes hay que validar que la oferta vende.',
      });
    }
  });

export type DiagnosticoValidado = z.infer<typeof diagnosticoSchema>;

export const dimensionSchema = z.enum([
  'cliente_ideal', 'problema', 'deseo', 'oferta', 'promesa', 'mensaje',
  'autoridad', 'adquisicion', 'volumen', 'ventas', 'entrega', 'ejecucion',
]);

export const scoreSchema = z
  .object({
    dimensiones: z
      .array(
        z.object({
          dimension: dimensionSchema,
          valor: z.number().int().min(1).max(10).nullable(),
          evidencia: z.string(),
          datoFaltante: z.string().optional(),
          esLimitante: z.boolean(),
        }),
      )
      .length(12),
    limitantes: z.array(dimensionSchema).length(3),
    promesaDetalle: z.object({
      especificidad: z.number().min(1).max(10),
      relevancia: z.number().min(1).max(10),
      deseo: z.number().min(1).max(10),
      credibilidad: z.number().min(1).max(10),
      diferenciacion: z.number().min(1).max(10),
      claridad: z.number().min(1).max(10),
      comentario: z.string(),
    }),
    lecturaGeneral: z.string().min(20),
  })
  .superRefine((s, ctx) => {
    const limitantes = s.dimensiones.filter((d) => d.esLimitante).length;
    if (limitantes !== 3) {
      ctx.addIssue({ code: 'custom', path: ['dimensiones'], message: 'Exactamente 3 dimensiones marcadas como limitantes.' });
    }
    for (const d of s.dimensiones) {
      if (d.valor !== null && d.evidencia.trim().length < 10) {
        ctx.addIssue({
          code: 'custom',
          path: ['dimensiones'],
          message: `La dimensión ${d.dimension} tiene puntaje sin evidencia. Un score sin evidencia no se cree dos veces.`,
        });
      }
      if (d.valor === null && !d.datoFaltante) {
        ctx.addIssue({
          code: 'custom',
          path: ['dimensiones'],
          message: `La dimensión ${d.dimension} vino en null sin explicar qué dato falta.`,
        });
      }
    }
  });

export const coherenciaSchema = z
  .object({
    perfilInferidoCiego: z.object({
      quienEs: z.string().min(10),
      nivelDolor: z.enum(['principiante', 'crecimiento']),
      movimiento: z.enum(['escapar', 'capturar']),
      capacidadPagoInferida: z.string(),
      quienNoSeReconoce: z.string(),
      frasesDecisivas: z.array(z.object({ cita: z.string(), senal: z.string() })).min(3).max(6),
    }),
    perfilDeclarado: z.string(),
    veredicto: z.enum(['coherente', 'parcial', 'incoherente']),
    veredictoPorQue: z.string().min(10),
    brecha: z.array(
      z.object({
        dimension: z.string(),
        inferido: z.string(),
        declarado: z.string(),
        coincide: z.boolean(),
      }),
    ),
    palabrasResponsables: z.array(
      z.object({ cita: z.string(), porQueDesvia: z.string(), queDiriaEnSuLugar: z.string() }),
    ),
    eslabonATocar: eslabonSchema,
    ordenDeRevision: z.array(z.string()),
    drift: z.string().optional(),
    queNoHaria: z.array(z.string()).min(1),
    conclusionLeads: z.string(),
    principioFounders: z.string(),
  })
  .superRefine((c, ctx) => {
    // Si los leads son incorrectos, no se concluye segmentación primero.
    if (c.eslabonATocar === 'canal') {
      ctx.addIssue({
        code: 'custom',
        path: ['eslabonATocar'],
        message:
          'No se toca el canal primero. El orden es mensaje → problema → madurez → deseo → palabras, y recién al final targeting.',
      });
    }
  });

export const extraccionSchema = z.object({
  reporte: z.string().min(30),
  compromisos: z.array(
    z.object({
      descripcion: z.string(),
      responsable: z.string(),
      fechaVencimiento: z.string().nullable(),
      sinFecha: z.boolean().default(false),
    }),
  ),
  numeros: z.array(
    z.object({
      campo: z.string(),
      valor: z.number().nullable(),
      aproximado: z.boolean().default(false),
      cita: z.string(),
    }),
  ),
  cambiosEstrategia: z.array(
    z.object({
      campo: z.string(),
      de: z.string().nullable(),
      a: z.string(),
      iniciativa: z.enum(['consultora', 'cliente', 'conjunta']),
      cita: z.string(),
    }),
  ),
  frasesCandidatas: z.array(z.object({ cita: z.string(), momento: z.string().optional() })),
  senales: z.object({
    mencionoNumeros: z.boolean().nullable(),
    seFueEnHerramienta: z.boolean().nullable(),
    cerroConCompromiso: z.boolean().nullable(),
    abrioRepasando: z.boolean().nullable(),
    pctHablaCliente: z.number().min(0).max(100).nullable(),
    temaDeclarado: z.string().nullable(),
    temaTratado: z.string().nullable(),
  }),
  datosExpediente: z.array(z.object({ campo: z.string(), valor: z.string(), cita: z.string() })),
  calidadTranscripcion: z.enum(['completa', 'parcial', 'cortada', 'ilegible']),
});

export const onboardingSchema = z
  .object({
    necesidades: z
      .array(
        z.object({
          necesidad: z.string(),
          evidencia: z.object({ cita: z.string().min(5), fecha: z.string() }),
        }),
      )
      .min(1)
      .max(5),
    cuentaInversa: z.object({
      ventasMes: z.number(),
      asistenciasMes: z.number(),
      agendasMes: z.number(),
      conversacionesMes: z.number(),
      dmsSemana: z.number(),
      alcanceSemana: z.number(),
      enRojo: z.object({
        asistenciasMes: z.number(),
        agendasMes: z.number(),
        conversacionesMes: z.number(),
        dmsSemana: z.number(),
        alcanceSemana: z.number(),
      }),
    }),
    mapa60Dias: z
      .array(z.object({ tramo: z.string(), resuelve: z.string(), senalEsperada: z.string() }))
      .min(3),
    sprint1: z.object({
      objetivo: z.string(),
      hipotesis: z.string(),
      acciones: z.array(z.object({ accion: z.string(), responsable: z.string() })).min(3).max(5),
      metrica: z.string(),
      resultadoEsperado: z.string(),
      fechaRevision: z.string(),
    }),
    sesion1: z.array(z.string()).min(3).max(3),
    riesgos: z.array(z.object({ riesgo: z.string(), evidencia: z.string() })),
    datosFaltantes: z.array(z.string()).default([]),
    briefConsultora: z.string().min(100),
    queNoHaria: z.array(z.string()).min(1),
    activosSinUsar: z.array(z.string()).default([]),
  })
  .superRefine((o, ctx) => {
    const primeros30 = o.mapa60Dias
      .slice(0, 3)
      .map((t) => `${t.resuelve} ${t.senalEsperada}`)
      .join(' ');
    if (PROHIBIDO_SIN_VENTAS.test(primeros30)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mapa60Dias'],
        message: 'Los primeros 30 días no pueden incluir CRM, funnel, automatización, webinar ni equipo comercial.',
      });
    }
  });

export type ResultadoValidacion<T> =
  | { ok: true; datos: T }
  | { ok: false; errores: string[] };

export function validar<T>(schema: z.ZodType<T>, valor: unknown): ResultadoValidacion<T> {
  const r = schema.safeParse(valor);
  if (r.success) return { ok: true, datos: r.data };
  return {
    ok: false,
    errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`),
  };
}

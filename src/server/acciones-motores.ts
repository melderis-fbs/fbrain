'use server';

import { redirect } from 'next/navigation';
import { nuevoId } from '@/lib/id';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import {
  coherenciaSchema,
  diagnosticoSchema,
  onboardingSchema,
  perfilCiegoSchema,
  veredictoCoherenciaSchema,
  validar,
} from '@/domain/motores/contratos';
import {
  construirPromptDiagnostico,
  PROMPT_DIAGNOSTICO,
  serializarExpediente,
  VERSION_DIAGNOSTICO,
} from '@/domain/motores/diagnostico';
import {
  cuentaInversaParaPrompt,
  PROMPT_COHERENCIA_A,
  PROMPT_COHERENCIA_B,
  PROMPT_ONBOARDING,
  VERSION_COHERENCIA,
  VERSION_ONBOARDING,
} from '@/domain/motores/otros';
import { extraerDeDocumentos, extraerDeTexto } from '@/server/ficha-extractor';
import { getUsuario } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import { correrMotor } from '@/server/modelo';
import { documentosParaPrompt } from '@/server/contexto-documentos';
import type { Diagnostico, DiagnosticoPayload, TipoBloqueo } from '@/domain/types';

/**
 * LOS BOTONES.
 *
 * Cada motor del paquete, detrás de una acción. Ninguna de estas funciones
 * decide nada: arma el contexto, llama, valida contra el contrato y devuelve.
 * Si el contrato no se cumple en tres intentos, el fallo es visible.
 */

async function contextoDe(clienteId: string) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(clienteId);
  if (!v) throw new Error('Cliente inexistente.');
  return { usuario, ctx: v.ctx, alertas: v.alertas };
}

// ---------------------------------------------------------------- diagnóstico

export async function correrDiagnostico(clienteId: string, formData: FormData) {
  const { usuario, ctx, alertas } = await contextoDe(clienteId);

  const hipotesis = String(formData.get('hipotesis') ?? '').trim();
  if (hipotesis.length < 10) {
    return { ok: false as const, error: 'Falta tu hipótesis. Sin eso esto es un oráculo, no un entrenamiento.' };
  }
  const bloqueoHipotesis = String(formData.get('bloqueoHipotesis') ?? '') as TipoBloqueo | '';
  const pregunta = String(formData.get('pregunta') ?? '').trim() || undefined;

  const { user, version } = construirPromptDiagnostico(ctx, alertas, pregunta);
  // Los números dicen qué pasó; los documentos, qué se dijo. Sin esto el motor
  // no puede citar textual, y sin cita textual el método no emite nada.
  const docs = documentosParaPrompt(ctx.registros.documentos);

  const r = await correrMotor({
    motor: 'diagnostico',
    promptMotor: PROMPT_DIAGNOSTICO,
    contexto: [...user, docs.texto].join('\n\n'),
    schema: diagnosticoSchema,
    promptVersion: version,
  });
  if (!r.ok) return { ok: false as const, error: r.error, errores: r.errores };

  const payload = r.datos as DiagnosticoPayload;
  const hoy = hoyIso();
  const registro: Diagnostico = {
    id: nuevoId(),
    clienteId,
    consultoraId: usuario.id,
    pregunta,
    hipotesisConsultora: hipotesis,
    cuelloBotella: payload.cuelloBotella,
    tipoBloqueo: payload.tipoBloqueo,
    eslabonRoto: payload.eslabonRoto,
    coincidio: bloqueoHipotesis ? bloqueoHipotesis === payload.tipoBloqueo : undefined,
    payload,
    promptVersion: VERSION_DIAGNOSTICO,
    modelo: r.uso.modelo,
    createdAt: hoy,
  };
  await getRepo().guardarDiagnostico(registro);
  revalidatePath(`/clientes/${clienteId}/diagnostico`);

  return { ok: true as const, payload, uso: r.uso };
}

// ----------------------------------------------------------------- coherencia

/**
 * Dos llamadas, y el orden ES la funcionalidad. La primera lee el material sin
 * saber nada del negocio. Recién la segunda ve el cliente ideal declarado. Si
 * se hiciera en una sola llamada, el modelo acomodaría el perfil inferido al
 * declarado y el test no mediría nada.
 */
export async function correrCoherencia(clienteId: string, formData: FormData) {
  const { ctx } = await contextoDe(clienteId);

  const material = String(formData.get('material') ?? '').trim();
  if (material.length < 30) {
    return { ok: false as const, error: 'Pegá el material completo: con menos de 30 caracteres no hay nada que leer.' };
  }
  const tipo = String(formData.get('tipo') ?? 'material');
  const leads = String(formData.get('leads') ?? '').trim();

  const a = await correrMotor({
    motor: 'coherencia-A',
    promptMotor: PROMPT_COHERENCIA_A,
    contexto: `## MATERIAL (${tipo})\n\n${material}`,
    schema: perfilCiegoSchema,
    promptVersion: VERSION_COHERENCIA,
  });
  if (!a.ok) return { ok: false as const, error: `Llamada A · ${a.error}`, errores: a.errores };

  const estrategia = ctx.estrategia;
  const declarado = [
    `Cliente ideal declarado: ${estrategia?.clienteIdeal ?? '(no declarado)'}`,
    estrategia?.problema ? `Problema: ${estrategia.problema}` : '',
    estrategia?.deseo ? `Deseo: ${estrategia.deseo}` : '',
    estrategia?.oferta ? `Oferta: ${estrategia.oferta}` : '',
    estrategia?.precio ? `Precio: ${estrategia.precio} ${estrategia.moneda ?? ''}` : '',
    leads ? `Leads que llegaron con este material: ${leads}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const b = await correrMotor({
    motor: 'coherencia-B',
    promptMotor: PROMPT_COHERENCIA_B,
    contexto:
      `## PERFIL INFERIDO A CIEGAS (llamada A)\n${JSON.stringify(a.datos, null, 2)}\n\n` +
      `## PERFIL DECLARADO POR EL NEGOCIO\n${declarado}`,
    schema: veredictoCoherenciaSchema,
    promptVersion: VERSION_COHERENCIA,
  });
  if (!b.ok) return { ok: false as const, error: `Llamada B · ${b.error}`, errores: b.errores };

  // Las reglas cruzadas se validan sobre el objeto ensamblado, no sobre cada mitad.
  const completo = { ...b.datos, perfilInferidoCiego: a.datos };
  const v = validar(coherenciaSchema, completo);
  if (!v.ok) {
    return { ok: false as const, error: 'El resultado ensamblado no cumple el contrato.', errores: v.errores };
  }

  return {
    ok: true as const,
    resultado: v.datos,
    uso: { entrada: a.uso.tokensEntrada + b.uso.tokensEntrada, salida: a.uso.tokensSalida + b.uso.tokensSalida },
  };
}

// ----------------------------------------------------------------- onboarding

export async function correrOnboarding(clienteId: string) {
  const { ctx, alertas } = await contextoDe(clienteId);

  const objetivo = ctx.objetivo;
  const cuenta = objetivo
    ? cuentaInversaParaPrompt(objetivo.metaMensual, objetivo.ticket)
    : null;

  const r = await correrMotor({
    motor: 'onboarding',
    promptMotor: PROMPT_ONBOARDING,
    contexto:
      `${serializarExpediente(ctx, alertas)}\n\n` +
      `${documentosParaPrompt(ctx.registros.documentos).texto}\n\n` +
      (cuenta ? `## CUENTA INVERSA\n${JSON.stringify(cuenta, null, 2)}` : '## CUENTA INVERSA\nSin meta ni ticket cargados: no se puede calcular. Decilo en el plan.'),
    schema: onboardingSchema,
    promptVersion: VERSION_ONBOARDING,
  });
  if (!r.ok) return { ok: false as const, error: r.error, errores: r.errores };
  return { ok: true as const, plan: r.datos, uso: r.uso };
}

// -------------------------------------------------------------- ficha (docs)

/**
 * El onboarding no empieza en blanco: el consultor pega lo que ya tiene y esto
 * lo convierte en los bloques del expediente para que corrija en vez de tipear.
 * No guarda nada: devuelve la propuesta y el consultor firma.
 */
export async function extraerFicha(documento: string) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  return extraerDeTexto(documento);
}

/**
 * Lo mismo, pero desde los documentos que el cliente ya tiene cargados.
 *
 * La selección y la lectura pasan acá, del lado del servidor. Antes el
 * navegador tenía los documentos enteros en memoria y los mandaba de vuelta
 * en cada extracción: la ficha de un cliente con diez transcripciones pesaba
 * un megabyte de sólo abrirla, y esa espera era la mitad de la lentitud.
 */
export async function extraerFichaDeExpediente(clienteId: string) {
  const { ctx } = await contextoDe(clienteId);
  return extraerDeDocumentos(ctx.registros.documentos);
}

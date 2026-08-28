import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { CONSTITUCION } from '@/domain/motores/constitucion';
import { MAX_REINTENTOS_VALIDACION, validar } from '@/domain/motores/contratos';

/**
 * LA CAPA QUE FALTABA.
 *
 * Los prompts, los contratos y el armado del contexto ya existían: lo único
 * que no había era quién hiciera la llamada. Esto es eso, y nada más.
 *
 * La disciplina va acá y no en el prompt. Si el modelo devuelve dos cuellos de
 * botella, la respuesta se rechaza y se reintenta con el error de validación
 * adentro del mensaje. Tres intentos; después, fallo visible. Un motor que
 * reintenta mucho tiene el prompt o el schema mal, y es la señal más temprana
 * de que algo se rompió — por eso el contador se devuelve al llamador.
 */

/** Los modelos salen de configuración, como pide `09-integraciones`. */
const MODELO_CRITERIO = process.env.MODELO_CRITERIO || 'claude-opus-5';
const MODELO_EXTRACCION = process.env.MODELO_EXTRACCION || 'claude-opus-5';

const REINTENTOS = Number(process.env.MAX_REINTENTOS_VALIDACION) || MAX_REINTENTOS_VALIDACION;

/**
 * Sin key la app entera sigue funcionando: los motores quedan `sin_conectar`
 * y el motor de reglas local es el que responde. Nunca `NEXT_PUBLIC_`: esta
 * key no puede cruzar al browser.
 */
export function hayModelo(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _cliente: Anthropic | null = null;
function cliente(): Anthropic {
  if (!_cliente) _cliente = new Anthropic();
  return _cliente;
}

export type Uso = {
  motor: string;
  promptVersion: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
  cacheLeido: number;
  intentos: number;
  validoAlPrimerIntento: boolean;
  ms: number;
};

/**
 * Observabilidad mínima del paquete: una línea por llamada. Sin esto el costo
 * se descubre en la factura, y un motor que reintenta no se nota hasta que
 * alguien se queja de la salida.
 */
function registrar(u: Uso) {
  console.info(
    `[motor] ${u.motor} v=${u.promptVersion} modelo=${u.modelo} ` +
      `in=${u.tokensEntrada} out=${u.tokensSalida} cache=${u.cacheLeido} ` +
      `intentos=${u.intentos} ${u.ms}ms`,
  );
}

export type Salida<T> =
  | { ok: true; datos: T; uso: Uso }
  | { ok: false; error: string; errores?: string[]; uso?: Uso };

/** El modelo devuelve JSON. A veces lo envuelve en un bloque de código igual. */
function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const desde = limpio.indexOf('{');
  const hasta = limpio.lastIndexOf('}');
  if (desde === -1 || hasta === -1) throw new Error('La respuesta no contiene un objeto JSON.');
  return JSON.parse(limpio.slice(desde, hasta + 1));
}

export type OpcionesMotor<T> = {
  motor: string;
  /** El prompt del motor. La constitución se antepone sola. */
  promptMotor: string;
  /** El expediente serializado del cliente. */
  contexto: string;
  schema: z.ZodType<T>;
  promptVersion: string;
  /** `criterio` para diagnóstico, coherencia, onboarding y score. */
  tipo?: 'criterio' | 'extraccion';
  esfuerzo?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
};

export async function correrMotor<T>(o: OpcionesMotor<T>): Promise<Salida<T>> {
  if (!hayModelo()) {
    return { ok: false, error: 'No hay ANTHROPIC_API_KEY configurada. Los motores están sin conectar.' };
  }

  const modelo = o.tipo === 'extraccion' ? MODELO_EXTRACCION : MODELO_CRITERIO;
  const arranque = Date.now();

  // La constitución es idéntica en todas las llamadas: va primera y cacheada.
  // El prompt del motor cambia por motor pero no por cliente, así que también.
  const system: Anthropic.TextBlockParam[] = [
    { type: 'text', text: CONSTITUCION, cache_control: { type: 'ephemeral' } },
    {
      type: 'text',
      text:
        `${o.promptMotor}\n\n` +
        'Devolvé únicamente el objeto JSON que pide el contrato. Sin texto ' +
        'antes ni después, sin bloque de código, sin explicaciones.',
      cache_control: { type: 'ephemeral' },
    },
  ];

  const mensajes: Anthropic.MessageParam[] = [{ role: 'user', content: o.contexto }];

  let entrada = 0;
  let salida = 0;
  let cache = 0;
  let ultimosErrores: string[] = [];

  for (let intento = 1; intento <= REINTENTOS; intento++) {
    let respuesta: Anthropic.Message;
    try {
      respuesta = await cliente().messages.create({
        model: modelo,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: o.esfuerzo ?? (o.tipo === 'extraccion' ? 'medium' : 'high') },
        system,
        messages: mensajes,
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) {
        return { ok: false, error: 'La ANTHROPIC_API_KEY es inválida o está vencida.' };
      }
      if (e instanceof Anthropic.RateLimitError) {
        return { ok: false, error: 'Límite de uso alcanzado. Reintentá en unos minutos.' };
      }
      if (e instanceof Anthropic.APIError) {
        return { ok: false, error: `Error de la API (${e.status}): ${e.message}` };
      }
      return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido al llamar al modelo.' };
    }

    entrada += respuesta.usage.input_tokens;
    salida += respuesta.usage.output_tokens;
    cache += respuesta.usage.cache_read_input_tokens ?? 0;

    if (respuesta.stop_reason === 'refusal') {
      return { ok: false, error: 'El modelo declinó responder este pedido.' };
    }

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    let crudo: unknown;
    try {
      crudo = extraerJson(texto);
    } catch {
      ultimosErrores = ['La respuesta no era JSON válido.'];
      mensajes.push(
        { role: 'assistant', content: texto.slice(0, 2000) },
        { role: 'user', content: 'Eso no es JSON válido. Devolvé sólo el objeto JSON del contrato.' },
      );
      continue;
    }

    const v = validar(o.schema, crudo);
    if (v.ok) {
      const uso: Uso = {
        motor: o.motor,
        promptVersion: o.promptVersion,
        modelo,
        tokensEntrada: entrada,
        tokensSalida: salida,
        cacheLeido: cache,
        intentos: intento,
        validoAlPrimerIntento: intento === 1,
        ms: Date.now() - arranque,
      };
      registrar(uso);
      return { ok: true, datos: v.datos, uso };
    }

    // El error de validación vuelve adentro del mensaje: el modelo corrige
    // sobre lo que ya escribió en vez de empezar de cero.
    ultimosErrores = v.errores;
    mensajes.push(
      { role: 'assistant', content: JSON.stringify(crudo) },
      {
        role: 'user',
        content:
          'Tu respuesta no cumple el contrato. Corregí exactamente esto y ' +
          `devolvé el objeto completo de nuevo:\n\n- ${v.errores.join('\n- ')}`,
      },
    );
  }

  const uso: Uso = {
    motor: o.motor,
    promptVersion: o.promptVersion,
    modelo,
    tokensEntrada: entrada,
    tokensSalida: salida,
    cacheLeido: cache,
    intentos: REINTENTOS,
    validoAlPrimerIntento: false,
    ms: Date.now() - arranque,
  };
  registrar(uso);
  return {
    ok: false,
    error: `El modelo no pudo cumplir el contrato en ${REINTENTOS} intentos. Fallo visible, no silencioso.`,
    errores: ultimosErrores,
    uso,
  };
}

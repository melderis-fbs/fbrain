import Anthropic from '@anthropic-ai/sdk';
import { NextResponse, type NextRequest } from 'next/server';
import { CONSTITUCION } from '@/domain/motores/constitucion';
import { serializarExpediente } from '@/domain/motores/diagnostico';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { hayModelo } from '@/server/modelo';

export const runtime = 'nodejs';

/**
 * EL CHAT SOBRE EL CLIENTE.
 *
 * Los motores son llamadas estructuradas con contrato: sirven para el
 * diagnóstico, el score, la coherencia. No sirven para "¿por qué me parece que
 * este tipo no ejecuta?", que es la pregunta que la consultora hace de verdad
 * cinco minutos antes de la sesión. Para eso es esto.
 *
 * La diferencia con un chat genérico es que el expediente entero viaja como
 * contexto y no se puede inventar un dato: lo que no está, no está.
 */

const INSTRUCCIONES = `Estás respondiendo preguntas de una consultora de Founders sobre UN cliente concreto, cuyo expediente completo tenés arriba.

Cómo respondés:

- Usás el expediente. Si la respuesta está en los números, citá los números con su semana. Si está en una sesión, citá la fecha.
- Si un dato no está cargado, decilo y decí qué bloque hay que completar. No lo estimes, no lo supongas, no razones como si estuviera. "No sabemos cuántas conversaciones tuvo" es una respuesta correcta y útil; inventar un número no lo es.
- Distinguí siempre entre lo que es un hecho del expediente y lo que es tu hipótesis. La consultora tiene que poder separarlos de un vistazo.
- Sos breve. Está por entrar a una sesión, no está leyendo un informe.
- No emitís alertas ni cerrás diagnósticos: eso tiene contrato y botón propio. Si lo que te piden es un diagnóstico formal, decile que use el botón de Diagnóstico, que valida contra el contrato y queda registrado.
- Si la consultora te propone una lectura y el expediente la contradice, decilo. No estás para acompañarla: estás para que la sesión salga mejor.`;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const usuario = await getUsuario();
  if (!usuario) return NextResponse.json({ error: 'Sin sesión.' }, { status: 401 });
  if (!hayModelo()) {
    return NextResponse.json(
      { error: 'No hay ANTHROPIC_API_KEY configurada. El chat está sin conectar.' },
      { status: 503 },
    );
  }

  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) return NextResponse.json({ error: 'Cliente inexistente.' }, { status: 404 });
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) {
    return NextResponse.json({ error: 'Ese cliente no es tuyo.' }, { status: 403 });
  }

  let mensajes: Anthropic.MessageParam[];
  try {
    const body = await req.json();
    mensajes = (body?.mensajes ?? [])
      .filter((m: unknown): m is { role: string; content: string } =>
        Boolean(m) && typeof (m as { content?: unknown }).content === 'string')
      .map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content.slice(0, 8000),
      }))
      .slice(-20);
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (!mensajes.length) return NextResponse.json({ error: 'Sin mensajes.' }, { status: 400 });

  const cliente = new Anthropic();

  // La constitución no cambia nunca y el expediente no cambia dentro de una
  // conversación: los dos van cacheados, antes de los mensajes.
  const stream = cliente.messages.stream({
    model: process.env.MODELO_CRITERIO || 'claude-opus-5',
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: CONSTITUCION },
      {
        type: 'text',
        text: `## EXPEDIENTE DEL CLIENTE\n\n${serializarExpediente(v.ctx, v.alertas)}\n\n${INSTRUCCIONES}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: mensajes,
  });

  const encoder = new TextEncoder();
  const salida = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const evento of stream) {
          if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(evento.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === 'refusal') {
          controller.enqueue(encoder.encode('\n\n[El modelo declinó responder este pedido.]'));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al hablar con el modelo.';
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(salida, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  });
}

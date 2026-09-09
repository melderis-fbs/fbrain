'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import { correrMotor } from '@/server/modelo';
import { PROMPT_SESION, resumenSesionSchema, VERSION_SESION } from '@/domain/motores/sesion';

/**
 * Cargar una transcripción y analizarla, en un solo paso.
 *
 * Antes esto eran dos pantallas y un formulario de cuatrocientas líneas con
 * catorce controles, y el «extractor» que tenía adentro no llamaba a ningún
 * modelo: eran expresiones regulares con un comentario que decía que en
 * producción iría el motor. Nunca fue.
 *
 * Ahora: se pega el texto, se aprieta una vez, y vuelve el resumen. Lo que el
 * modelo propone queda guardado como el reporte de la sesión, y sigue siendo
 * editable — el criterio de la consultora manda sobre el resumen, siempre.
 */
export async function analizarSesion(
  clienteId: string,
  sesionId: string,
  texto: string,
): Promise<{ ok: true; puntos: string[] } | { ok: false; error: string }> {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');

  const ws = await getWorkspace();
  const v = ws.porId.get(clienteId);
  if (!v) return { ok: false, error: 'Cliente inexistente.' };
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const sesion = v.ctx.registros.sesiones.find((s) => s.id === sesionId);
  if (!sesion) return { ok: false, error: 'Esa sesión no existe.' };

  const limpio = texto.trim();
  if (limpio.length < 200) {
    return { ok: false, error: 'La transcripción es muy corta para resumirla. Pegá la conversación completa.' };
  }

  const r = await correrMotor({
    motor: 'sesion',
    promptMotor: PROMPT_SESION,
    contexto: `## TRANSCRIPCIÓN DE LA SESIÓN\n\nFecha: ${sesion.fecha}\n\n${limpio}`,
    schema: resumenSesionSchema,
    promptVersion: VERSION_SESION,
    tipo: 'extraccion',
    // Resumir no es razonar: es quedarse con lo que pasó y tirar el resto.
    esfuerzo: 'low',
  });
  if (!r.ok) return { ok: false, error: [r.error, ...(r.errores ?? [])].join(' · ') };

  const d = r.datos;
  await getRepo().guardarSesion({
    ...sesion,
    transcripcionTexto: limpio,
    reporte: d.puntos.map((p) => `· ${p}`).join('\n'),
    reporteCargadoAt: hoyIso(),
    cerroConCompromiso: d.cerroConCompromiso ?? d.compromisos.length > 0,
    mencionoNumeros: d.mencionoNumeros,
    temaTratado: d.temaTratado ?? sesion.temaTratado,
    procesadaAt: hoyIso(),
  });

  // Los compromisos acordados pasan a serlo de verdad: con fecha y estado, que
  // es lo que permite que después alguien pregunte si se cumplieron.
  for (const c of d.compromisos) {
    await getRepo().guardarCompromiso({
      id: crypto.randomUUID(),
      clienteId,
      sesionId,
      descripcion: c.que,
      responsable: c.quien,
      fechaVencimiento: sumarDias(sesion.fecha, 7),
      estado: 'pendiente',
    });
  }

  revalidatePath(`/clientes/${clienteId}/sesiones`);
  revalidatePath(`/clientes/${clienteId}`);
  return { ok: true, puntos: d.puntos };
}

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

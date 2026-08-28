'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import { mondayOf } from '@/lib/date';
import type { MetricaSemanal } from '@/domain/types';

/**
 * Vacío es null, no cero.
 *
 * Es la regla que sostiene la mitad del motor: los acumulados declaran sobre
 * cuántas semanas con dato están calculados, los pilares que no se pueden
 * evaluar quedan en `n/a` en vez de puntuar cero, y el tracker dibuja distinto
 * una semana en cero de una semana sin cargar. Si acá se convirtiera el vacío
 * en 0, un cliente al que nadie le cargó los números se vería igual que uno
 * que no hizo nada, y son casos opuestos.
 */
const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

const lineas = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

export async function guardarSemana(clienteId: string, formData: FormData) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');

  const ws = await getWorkspace();
  const v = ws.porId.get(clienteId);
  if (!v) throw new Error('Cliente inexistente.');
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const semana = mondayOf(String(formData.get('semana') || hoyIso()));

  const m: MetricaSemanal = {
    id: `${clienteId}-${semana}`,
    clienteId,
    semanaIso: semana,
    contenidoPublicado: num(formData.get('contenidoPublicado')),
    alcanceTotal: num(formData.get('alcanceTotal')),
    alcanceNoSeguidores: num(formData.get('alcanceNoSeguidores')),
    dmsIniciados: num(formData.get('dmsIniciados')),
    conversacionesAvanzadas: num(formData.get('conversacionesAvanzadas')),
    leads: num(formData.get('leads')),
    leadsCalificados: num(formData.get('leadsCalificados')),
    agendas: num(formData.get('agendas')),
    asistencias: num(formData.get('asistencias')),
    cancelaciones: num(formData.get('cancelaciones')),
    llamadas: num(formData.get('asistencias')),
    ofertasRealizadas: num(formData.get('ofertasRealizadas')),
    ventas: num(formData.get('ventas')),
    facturado: num(formData.get('facturado')),
    ticketPromedio: num(formData.get('ticketPromedio')),
    inversionAds: num(formData.get('inversionAds')),
    objeciones: lineas(formData.get('objeciones')),
    origenOportunidades: {},
    cargadoPor: usuario.id,
  };

  await getRepo().guardarMetrica(m);
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath(`/clientes/${clienteId}/tracker`);
  redirect(`/clientes/${clienteId}/tracker?ok=${semana}`);
}

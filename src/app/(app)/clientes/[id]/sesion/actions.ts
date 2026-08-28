'use server';

import { redirect } from 'next/navigation';
import { nuevoId } from '@/lib/id';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { CRITERIOS } from '@/domain/alertas';
import { getUsuario } from '@/server/auth';
import { hoyIso } from '@/server/workspace';
import { mondayOf } from '@/lib/date';
import type {
  Alerta, Compromiso, EstadoAgenda, HitoCliente, LecturaConsultora,
  MetricaSemanal, Sesion, TipoBloqueo,
} from '@/domain/types';

/** Vacío es null, no cero. "No sabemos cuántas hubo" es un dato distinto de "hubo cero". */
const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

const bool = (v: FormDataEntryValue | null): boolean | undefined => {
  const s = String(v ?? '');
  if (s === 'si') return true;
  if (s === 'no') return false;
  return undefined;
};

const lineas = (v: FormDataEntryValue | null) =>
  String(v ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * UNA SOLA FIRMA.
 *
 * Nada de lo que propone el extractor se guarda como dato confirmado sin este
 * paso. Y esta pantalla escribe de una sola vez en sesión, compromisos,
 * métricas, hitos, lectura y alertas: si un dato no entra acá, no debería
 * existir en el sistema.
 */
export async function firmarSesion(clienteId: string, formData: FormData) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const repo = getRepo();
  const hoy = hoyIso();

  const fecha = String(formData.get('fecha') || hoy);
  const estadoAgenda = (String(formData.get('estadoAgenda') || 'realizada')) as EstadoAgenda;
  const sesionId = nuevoId();
  const transcripcion = String(formData.get('transcripcion') ?? '').trim();
  const reporte = String(formData.get('reporte') ?? '').trim();

  const sesion: Sesion = {
    id: sesionId,
    clienteId,
    consultoraId: usuario.id,
    fecha,
    duracionMinutos: 50,
    estadoAgenda,
    tieneGrabacion: Boolean(transcripcion),
    transcripcionTexto: transcripcion || undefined,
    reporte: reporte || undefined,
    reporteCargadoAt: reporte ? hoy : undefined,
    mencionoNumeros: bool(formData.get('mencionoNumeros')),
    pctHablaCliente: num(formData.get('pctHablaCliente')) ?? undefined,
    cerroConCompromiso: bool(formData.get('cerroConCompromiso')),
    abrioRepasando: bool(formData.get('abrioRepasando')),
    seFueEnHerramienta: bool(formData.get('seFueEnHerramienta')),
    temaDeclarado: String(formData.get('temaDeclarado') ?? '') || undefined,
    temaTratado: String(formData.get('temaTratado') ?? '') || undefined,
    satisfaccion: num(formData.get('satisfaccion')) ?? undefined,
    procesadaAt: transcripcion ? hoy : undefined,
  };
  await repo.guardarSesion(sesion);

  // ----------------------------------------------------------- compromisos
  const vencimiento = String(formData.get('vencimientoCompromisos') || '');
  for (const texto of lineas(formData.get('compromisos'))) {
    const c: Compromiso = {
      id: nuevoId(),
      clienteId,
      sesionId,
      descripcion: texto,
      responsable: 'cliente',
      fechaVencimiento: vencimiento || fecha,
      estado: 'pendiente',
    };
    await repo.guardarCompromiso(c);
  }

  // ----------------------------------------------------------- métricas
  if (formData.get('cargarNumeros') === 'si') {
    const m: MetricaSemanal = {
      id: nuevoId(),
      clienteId,
      semanaIso: mondayOf(fecha),
      contenidoPublicado: num(formData.get('contenidoPublicado')),
      alcanceTotal: num(formData.get('alcanceTotal')),
      alcanceNoSeguidores: num(formData.get('alcanceNoSeguidores')),
      dmsIniciados: num(formData.get('dmsIniciados')),
      conversacionesAvanzadas: num(formData.get('conversacionesAvanzadas')),
      leads: null,
      leadsCalificados: null,
      agendas: num(formData.get('agendas')),
      asistencias: num(formData.get('asistencias')),
      cancelaciones: null,
      llamadas: num(formData.get('asistencias')),
      ofertasRealizadas: num(formData.get('ofertasRealizadas')),
      ventas: num(formData.get('ventas')),
      facturado: num(formData.get('facturado')),
      ticketPromedio: null,
      inversionAds: null,
      objeciones: lineas(formData.get('objeciones')),
      origenOportunidades: {},
      cargadoPor: usuario.id,
    };
    await repo.guardarMetrica(m);
  }

  // ----------------------------------------------------------- hitos
  for (const [key, valor] of formData.entries()) {
    if (!key.startsWith('hito:')) continue;
    const hitoKey = key.slice(5);
    const estado = String(valor) as HitoCliente['estado'];
    if (estado === 'sin_trabajar') continue;
    await repo.guardarHito({
      clienteId,
      hitoKey,
      estado,
      actualizadoAt: fecha,
      actualizadoPor: usuario.id,
      cumplidoAt: estado === 'cumplido' ? fecha : undefined,
      confirmadoPor: estado === 'cumplido' ? usuario.id : undefined,
    });
  }

  // ----------------------------------------------------------- lectura
  const lectura: LecturaConsultora = {
    id: nuevoId(),
    clienteId,
    consultoraId: usuario.id,
    sesionId,
    fecha,
    percepcion: (formData.get('percepcion') as LecturaConsultora['percepcion']) ?? 'bien',
    bloqueoDeclarado: (formData.get('bloqueo') as TipoBloqueo | 'ninguno') ?? 'ninguno',
    necesitaIntervencion: formData.get('necesitaIntervencion') === 'on',
    potencialRenovacion: (formData.get('renovacion') as LecturaConsultora['potencialRenovacion']) ?? 'medio',
    comentario: String(formData.get('comentario') ?? '') || undefined,
  };
  await repo.guardarLectura(lectura);

  // ----------------------------------------------------------- alerta de criterio
  const codigo = String(formData.get('codigoCriterio') ?? '');
  const cita = String(formData.get('citaTextual') ?? '').trim();
  if (codigo && cita) {
    const def = CRITERIOS.find((c) => c.codigo === codigo);
    if (def) {
      const alerta: Alerta = {
        id: nuevoId(),
        clienteId,
        sesionId,
        codigo,
        origen: 'criterio',
        estadoSemaforo: def.estado,
        titulo: def.titulo,
        cuerpo: String(formData.get('cuerpoCriterio') ?? def.titulo),
        citaTextual: cita,
        fechaCita: fecha,
        pedido: String(formData.get('pedidoCriterio') ?? 'Revisar en la próxima sesión y dejar registro.'),
        destinatario: def.destinatario,
        plazoHoras: def.plazoHoras,
        prioridad: def.prioridad,
        emitidaAt: fecha,
        emitidaEnSemana: mondayOf(fecha),
        diferida: false,
        vecesEmitida: 1,
      };
      await repo.crearAlerta(alerta);
    }
  }

  revalidatePath(`/clientes/${clienteId}`);
  redirect(`/clientes/${clienteId}`);
}

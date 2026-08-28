'use server';

import { redirect } from 'next/navigation';
import { nuevoId } from '@/lib/id';
import { revalidatePath } from 'next/cache';
import { getRepo } from '@/data';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace, hoyIso } from '@/server/workspace';
import type {
  Autoridad, Cliente, EstadoCliente, EstrategiaVersion, Negocio, ObjetivoComercial,
} from '@/domain/types';

/** Vacío es vacío, no cero. Mismo criterio que el cierre de sesión. */
const num = (v: FormDataEntryValue | null): number | undefined => {
  const s = String(v ?? '').trim();
  if (s === '') return undefined;
  const n = Number(s.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

const txt = (v: FormDataEntryValue | null): string | undefined => {
  const s = String(v ?? '').trim();
  return s === '' ? undefined : s;
};

const lista = (v: FormDataEntryValue | null): string[] =>
  String(v ?? '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * LA FICHA.
 *
 * Escribe los cuatro bloques del expediente de una vez. Dos de ellos son
 * append-only y no es un detalle de implementación: cambiar la estrategia o la
 * meta sin dejar la versión anterior borra contra qué se venía midiendo, y el
 * drift entre versiones es justamente lo que mira el test de coherencia.
 */
export async function guardarFicha(clienteId: string, formData: FormData) {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');

  const ws = await getWorkspace();
  const v = ws.porId.get(clienteId);
  if (!v) throw new Error('Cliente inexistente.');
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) {
    redirect('/mis-clientes');
  }

  const hoy = hoyIso();
  const previo = v.ctx.cliente;

  // ------------------------------------------------------------- identidad
  const cliente: Cliente = {
    ...previo,
    nombre: txt(formData.get('nombre')) ?? previo.nombre,
    email: txt(formData.get('email')),
    telefono: txt(formData.get('telefono')),
    programa: txt(formData.get('programa')) ?? previo.programa,
    fechaAlta: txt(formData.get('fechaAlta')) ?? previo.fechaAlta,
    fechaFinPrevista: txt(formData.get('fechaFinPrevista')),
    planPago: txt(formData.get('planPago')),
    tieneGarantia: formData.get('tieneGarantia') === 'on',
    fuente: txt(formData.get('fuente')),
    estado: (txt(formData.get('estado')) as EstadoCliente) ?? previo.estado,
    horasRealesSemana: num(formData.get('horasRealesSemana')),
    diasGraciaPago: num(formData.get('diasGraciaPago')),
    driveFolderId: txt(formData.get('driveFolderId')),
    nivelVendido: txt(formData.get('nivelVendido')),
    nivelDesalineado: formData.get('nivelDesalineado') === 'on',
  };
  // Reasignar cartera es de administración: una consultora no se autoasigna.
  if (veTodo(usuario.rol)) cliente.consultoraId = txt(formData.get('consultoraId'));
  await getRepo().guardarCliente(cliente);

  // --------------------------------------------------------------- negocio
  const negocio: Negocio = {
    clienteId,
    queVende: txt(formData.get('queVende')),
    aQuien: txt(formData.get('aQuien')),
    precio: num(formData.get('negocioPrecio')),
    moneda: txt(formData.get('negocioMoneda')) ?? 'ARS',
    comoEntrega: txt(formData.get('comoEntrega')),
    facturacionMensual: num(formData.get('facturacionMensual')),
    cantidadClientes: num(formData.get('cantidadClientes')),
    origenClientes: txt(formData.get('origenClientes')),
    queFunciono: txt(formData.get('queFunciono')),
    queNoFunciono: txt(formData.get('queNoFunciono')),
    actualizadoAt: hoy,
  };
  await getRepo().guardarNegocio(negocio);

  // ------------------------------------------------------------- autoridad
  const autoridad: Autoridad = {
    clienteId,
    haceExcepcionalmenteBien: txt(formData.get('haceExcepcionalmenteBien')),
    experienciaProfesional: txt(formData.get('experienciaProfesional')),
    resultadosPropios: txt(formData.get('resultadosPropios')),
    resultadosTerceros: txt(formData.get('resultadosTerceros')),
    industriasQueConoce: lista(formData.get('industriasQueConoce')),
    autoridadDesperdiciada: txt(formData.get('autoridadDesperdiciada')),
    actualizadoAt: hoy,
  };
  await getRepo().guardarAutoridad(autoridad);

  // ------------------------------------------------------------ estrategia
  // Append-only: sólo se escribe una versión nueva si algo cambió de verdad.
  const anterior = v.ctx.estrategia;
  const campos = {
    clienteIdeal: txt(formData.get('clienteIdeal')),
    problema: txt(formData.get('problema')),
    deseo: txt(formData.get('deseo')),
    promesa: txt(formData.get('promesa')),
    oferta: txt(formData.get('oferta')),
    mecanismo: txt(formData.get('mecanismo')),
    canal: txt(formData.get('canal')),
    precio: num(formData.get('estrategiaPrecio')),
    moneda: txt(formData.get('estrategiaMoneda')) ?? 'ARS',
  };
  const hayAlgo = Object.values(campos).some((x) => x !== undefined && x !== 'ARS');
  const cambio =
    !anterior ||
    (Object.keys(campos) as (keyof typeof campos)[]).some(
      (k) => (campos[k] ?? undefined) !== ((anterior as unknown as Record<string, unknown>)[k] ?? undefined),
    );

  if (hayAlgo && cambio) {
    const estrategia: EstrategiaVersion = {
      id: nuevoId(),
      clienteId,
      version: (anterior?.version ?? 0) + 1,
      ...campos,
      vigenteDesde: hoy,
      motivoCambio: txt(formData.get('motivoCambio')),
      iniciativa: (txt(formData.get('iniciativa')) as EstrategiaVersion['iniciativa']) ?? 'consultora',
      creadaPor: usuario.id,
    };
    await getRepo().guardarEstrategia(estrategia);
  }

  // -------------------------------------------------------------- objetivo
  const meta = num(formData.get('metaMensual'));
  const ticket = num(formData.get('ticket'));
  const objPrevio = v.ctx.objetivo;
  if (meta !== undefined && ticket !== undefined &&
      (!objPrevio || objPrevio.metaMensual !== meta || objPrevio.ticket !== ticket)) {
    const objetivo: ObjetivoComercial = {
      id: nuevoId(),
      clienteId,
      metaMensual: meta,
      ticket,
      moneda: txt(formData.get('objetivoMoneda')) ?? 'ARS',
      // Sin tasas medidas se usan las de objetivo del método.
      tasaCierre: objPrevio?.tasaCierre ?? 0.25,
      tasaAsistencia: objPrevio?.tasaAsistencia ?? 0.7,
      tasaAgendamiento: objPrevio?.tasaAgendamiento ?? 0.2,
      tasaAvance: objPrevio?.tasaAvance ?? 0.3,
      tasaDmSobreAlcance: objPrevio?.tasaDmSobreAlcance ?? 0.02,
      diaInicioProspeccion: objPrevio?.diaInicioProspeccion ?? 14,
      vigenteDesde: hoy,
      creadoPor: usuario.id,
    };
    await getRepo().guardarObjetivo(objetivo);
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath(`/clientes/${clienteId}/ficha`);
  redirect(`/clientes/${clienteId}`);
}

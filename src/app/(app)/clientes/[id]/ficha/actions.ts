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
/**
 * Guardar la ficha.
 *
 * Envuelve todas las escrituras: si la base rechaza una, el error vuelve a la
 * pantalla en vez de tumbar el render. Antes esto era un 500 con un número de
 * digest, que obliga a ir a buscar el log del servidor para enterarse de que
 * faltaba una columna — y mientras tanto el trabajo cargado en el formulario
 * se pierde. Ahora el formulario sigue ahí, con lo escrito, y arriba dice qué
 * pasó.
 *
 * El `redirect` de Next funciona lanzando una excepción, así que se deja
 * pasar: no es un fallo.
 */
export async function guardarFicha(clienteId: string, formData: FormData): Promise<{ error: string } | void> {
  try {
    return await guardarFichaInterno(clienteId, formData);
  } catch (e) {
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest?: unknown }).digest).startsWith('NEXT_')) {
      throw e;
    }
    return { error: e instanceof Error ? e.message : 'No se pudo guardar la ficha.' };
  }
}

async function guardarFichaInterno(clienteId: string, formData: FormData) {
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

    closer: txt(formData.get('closer')),
    setter: txt(formData.get('setter')),
    montoTotal: num(formData.get('montoTotal')),
    cantidadCuotas: num(formData.get('cantidadCuotas')),
    estadoDeuda: (txt(formData.get('estadoDeuda')) as Cliente['estadoDeuda']) ?? previo.estadoDeuda,
    notas: txt(formData.get('notas')),
    nivelDesalineado: formData.get('nivelDesalineado') === 'on',
  };
  // Reasignar cartera es de administración: una consultora no se autoasigna.
  if (veTodo(usuario.rol)) cliente.consultoraId = txt(formData.get('consultoraId'));
  await getRepo().guardarCliente(cliente);

  /**
   * Un cambio de consultora no es una edición más: es el momento de mayor
   * mortandad de la cartera. Hasta ahora sólo se pisaba `consultoraId` y no
   * quedaba rastro — ni fecha, ni motivo, ni nada que mirar cuando tres
   * semanas después el cliente se va. Ahora deja su fila, que es lo que la
   * línea de tiempo y la revisión del caso ya sabían leer.
   */
  //
  // Sólo cuando hay un destino de verdad. Dejar a un cliente sin asignar no
  // es un traspaso —no hay a quién traspasarlo— y escribir la fila igual
  // metía una cadena vacía en una columna uuid, que la base rechaza y hasta
  // hace poco se tragaba en silencio.
  if (cliente.consultoraId && cliente.consultoraId !== previo.consultoraId) {
    await getRepo().guardarTraspaso({
      id: nuevoId(),
      clienteId,
      consultoraOrigenId: previo.consultoraId,
      consultoraDestinoId: cliente.consultoraId,
      fecha: hoy,
      motivo: txt(formData.get('motivoTraspaso')),
    });
  }

  /**
   * Una sola moneda para todo el cliente.
   *
   * Había tres campos —negocio, estrategia y objetivo— y el formulario mostraba
   * uno solo. Los otros dos se guardaban siempre en pesos, así que una cartera
   * en dólares terminaba con el precio de la oferta y el ticket en ARS sin que
   * nadie lo pidiera. Un cliente factura en una moneda; pedirla tres veces es
   * pedir tres formas de contradecirse.
   */
  const moneda = txt(formData.get('moneda')) ?? txt(formData.get('negocioMoneda')) ?? 'USD';

  // --------------------------------------------------------------- negocio
  const negocio: Negocio = {
    clienteId,
    queVende: txt(formData.get('queVende')),
    aQuien: txt(formData.get('aQuien')),
    precio: num(formData.get('negocioPrecio')),
    moneda,
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
    moneda,
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
  /**
   * El ticket de la cuenta inversa es, en la práctica, el precio de la oferta.
   * Tenerlos como dos campos separados y obligatorios invita a que se
   * desincronicen, y entonces la cuenta inversa se calcula contra un número
   * que ya nadie sostiene. Si no se escribe, se toma el de la oferta.
   */
  const ticket = num(formData.get('ticket')) ?? num(formData.get('estrategiaPrecio'));
  const objPrevio = v.ctx.objetivo;
  if (meta !== undefined && ticket !== undefined &&
      (!objPrevio || objPrevio.metaMensual !== meta || objPrevio.ticket !== ticket)) {
    const objetivo: ObjetivoComercial = {
      id: nuevoId(),
      clienteId,
      metaMensual: meta,
      ticket,
      moneda,
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

  /**
   * La propuesta del extractor queda marcada como decidida.
   *
   * No se borra: si mañana hay que discutir de dónde salió un dato de la
   * ficha, la propuesta con su cita es la única respuesta. Lo que cambia es
   * que deja de ofrecerse —alguien ya la tuvo a la vista y guardó— y que el
   * barrido no vuelve a gastar una llamada en este cliente.
   */
  const pendiente = ws.dataset.propuestas.find((p) => p.clienteId === clienteId && !p.aplicadaAt);
  if (pendiente) {
    await getRepo().guardarPropuestaFicha({ ...pendiente, aplicadaAt: hoy });
  }

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath(`/clientes/${clienteId}/ficha`);
  redirect(`/clientes/${clienteId}`);
}

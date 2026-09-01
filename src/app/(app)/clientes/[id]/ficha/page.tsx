import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { FichaForm } from '@/components/FichaForm';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { hayModelo } from '@/server/modelo';
import { guardarFicha } from './actions';

export const metadata = { title: 'Ficha · Founders Brain' };

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export default async function FichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { cliente, estrategia, objetivo, bloques, bloquesCargados } = v.ctx;
  const { negocio, autoridad } = v.ctx.registros;

  const inicial: Record<string, string> = {
    nombre: s(cliente.nombre),
    email: s(cliente.email),
    telefono: s(cliente.telefono),
    programa: s(cliente.programa),
    fechaAlta: s(cliente.fechaAlta),
    fechaFinPrevista: s(cliente.fechaFinPrevista),
    planPago: s(cliente.planPago),
    fuente: s(cliente.fuente),
    estado: s(cliente.estado) || 'activo',
    consultoraId: s(cliente.consultoraId),
    horasRealesSemana: s(cliente.horasRealesSemana),
    diasGraciaPago: s(cliente.diasGraciaPago),
    driveFolderId: s(cliente.driveFolderId),
    nivelVendido: s(cliente.nivelVendido),
    tieneGarantia: cliente.tieneGarantia ? 'on' : '',
    nivelDesalineado: cliente.nivelDesalineado ? 'on' : '',

    closer: s(cliente.closer),
    setter: s(cliente.setter),
    montoTotal: s(cliente.montoTotal),
    cantidadCuotas: s(cliente.cantidadCuotas),
    estadoDeuda: s(cliente.estadoDeuda) || 'al_dia',
    notas: s(cliente.notas),

    queVende: s(negocio?.queVende),
    aQuien: s(negocio?.aQuien),
    negocioPrecio: s(negocio?.precio),
    negocioMoneda: s(negocio?.moneda) || 'ARS',
    comoEntrega: s(negocio?.comoEntrega),
    facturacionMensual: s(negocio?.facturacionMensual),
    cantidadClientes: s(negocio?.cantidadClientes),
    origenClientes: s(negocio?.origenClientes),
    queFunciono: s(negocio?.queFunciono),
    queNoFunciono: s(negocio?.queNoFunciono),

    haceExcepcionalmenteBien: s(autoridad?.haceExcepcionalmenteBien),
    experienciaProfesional: s(autoridad?.experienciaProfesional),
    resultadosPropios: s(autoridad?.resultadosPropios),
    resultadosTerceros: s(autoridad?.resultadosTerceros),
    industriasQueConoce: (autoridad?.industriasQueConoce ?? []).join(', '),
    autoridadDesperdiciada: s(autoridad?.autoridadDesperdiciada),

    clienteIdeal: s(estrategia?.clienteIdeal),
    problema: s(estrategia?.problema),
    deseo: s(estrategia?.deseo),
    promesa: s(estrategia?.promesa),
    oferta: s(estrategia?.oferta),
    mecanismo: s(estrategia?.mecanismo),
    canal: s(estrategia?.canal),
    estrategiaPrecio: s(estrategia?.precio),
    estrategiaMoneda: s(estrategia?.moneda) || 'ARS',
    iniciativa: 'consultora',

    metaMensual: s(objetivo?.metaMensual),
    ticket: s(objetivo?.ticket),
    objetivoMoneda: s(objetivo?.moneda) || 'ARS',
  };

  /**
   * El selector de consultora tiene que incluir a la que el cliente ya tiene,
   * aunque no esté en la lista de consultoras activas —porque se dio de baja,
   * o porque es administración—. Si no está, el navegador selecciona la
   * primera opción, que es «sin asignar», y guardar la ficha para corregir
   * cualquier otro campo le saca el cliente a quien lo atiende.
   */
  const asignada = cliente.consultoraId
    ? ws.equipo.find((p) => p.id === cliente.consultoraId)
    : undefined;
  const equipoParaElSelector =
    asignada && !ws.consultoras.some((c) => c.id === asignada.id)
      ? [...ws.consultoras, asignada]
      : ws.consultoras;

  const faltantes = Object.entries(bloques)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:border-accent">← {cliente.nombre}</Link>
      </div>

      <div className="mb-4">
        <h1 className="text-[22px] font-semibold tracking-tight">Ficha del cliente</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Los cuatro bloques del expediente. Con {bloquesCargados} de 6 cargados
          {faltantes.length > 0 && <> — falta{faltantes.length > 1 ? 'n' : ''} <strong>{faltantes.join(', ')}</strong></>}.
          {' '}El diagnóstico necesita 4 para habilitarse: por debajo de eso el motor razona sobre huecos.
        </p>
      </div>

      <FichaForm
        clienteId={id}
        inicial={inicial}
        equipo={equipoParaElSelector.map((c) => ({ id: c.id, nombre: c.nombre }))}
        esAdmin={veTodo(usuario.rol)}
        conectado={hayModelo()}
        guardados={v.ctx.registros.documentos.map((d) => ({
          titulo: d.titulo,
          fecha: d.fecha,
          contenido: d.contenido,
        }))}
        accion={guardarFicha}
      />
    </div>
  );
}

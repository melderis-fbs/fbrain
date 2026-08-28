import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { CerrarSesionForm, type HitoUI } from '@/components/CerrarSesionForm';
import { CRITERIOS } from '@/domain/alertas';
import { HITOS } from '@/domain/fases';
import { firmarSesion } from './actions';

export const metadata = { title: 'Cerrar sesión · Founders Brain' };

export default async function CerrarSesionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  const ws = await getWorkspace();
  const v = ws.porId.get(id);
  if (!v) notFound();
  if (!veTodo(usuario.rol) && v.ctx.cliente.consultoraId !== usuario.id) redirect('/mis-clientes');

  const { ctx } = v;
  const hitos: HitoUI[] = HITOS.filter((h) => h.fase === ctx.fase && !h.automatico).map((h) => ({
    key: h.key,
    label: h.label,
    gate: h.gate,
    dia: h.dia,
    estado: ctx.hitos.get(h.key)?.estado ?? 'sin_trabajar',
  }));

  const ultima = ctx.ultimaSemanaCargada;
  const action = firmarSesion.bind(null, id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href={`/clientes/${id}`} className="hover:underline">← {ctx.cliente.nombre}</Link>
      </div>
      <header className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-tight">Cerrar sesión</h1>
        <p className="mt-1.5 text-[13px] text-ink-2">
          {ctx.cliente.nombre} · día {ctx.dia} · fase {ctx.fase}. Objetivo: menos de tres minutos.
        </p>
      </header>

      <CerrarSesionForm
        clienteNombre={ctx.cliente.nombre}
        hitos={hitos}
        hoy={ws.hoy}
        kpi={ctx.kpiSemanal ? { dms: ctx.kpiSemanal.dms, agendas: ctx.kpiSemanal.agendas } : undefined}
        ultimaSemana={
          ultima
            ? {
                contenidoPublicado: ultima.contenidoPublicado,
                alcanceTotal: ultima.alcanceTotal,
                alcanceNoSeguidores: ultima.alcanceNoSeguidores,
                dmsIniciados: ultima.dmsIniciados,
                conversacionesAvanzadas: ultima.conversacionesAvanzadas,
                agendas: ultima.agendas,
                asistencias: ultima.asistencias,
                ofertasRealizadas: ultima.ofertasRealizadas,
                ventas: ultima.ventas,
              }
            : undefined
        }
        criterios={CRITERIOS.map((c) => ({ codigo: c.codigo, titulo: c.titulo, estado: c.estado }))}
        lecturaActual={
          ctx.lectura
            ? {
                percepcion: ctx.lectura.percepcion,
                bloqueo: ctx.lectura.bloqueoDeclarado,
                renovacion: ctx.lectura.potencialRenovacion,
              }
            : undefined
        }
        action={action}
      />
    </div>
  );
}

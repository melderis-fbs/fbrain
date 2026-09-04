import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LimpiezaCartera, type FilaLimpieza } from '@/components/LimpiezaCartera';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { ETIQUETA_MOTIVO, motivosDeBaja } from '@/domain/limpieza';
import { darDeBajaEnLote } from './actions';

export const metadata = { title: 'Limpiar la cartera · Founders Brain' };

export default async function LimpiezaPage() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const ws = await getWorkspace();

  const filas: FilaLimpieza[] = ws.vistas
    .map((v) => {
      const r = v.ctx.registros;
      const motivos = motivosDeBaja(
        v.ctx.cliente,
        v.ctx.dia,
        {
          sesiones: r.sesiones.length,
          metricas: r.metricas.length,
          documentos: r.documentos.length,
          lecturas: r.lecturas.length,
          compromisos: r.compromisos.length,
        },
        v.ctx.cliente.programa?.includes('M2') ? 6 : 4,
      );
      return { v, motivos };
    })
    .filter((x) => x.motivos.length > 0)
    .sort((a, b) => b.v.ctx.dia - a.v.ctx.dia)
    .map(({ v, motivos }) => ({
      id: v.ctx.cliente.id,
      nombre: v.ctx.cliente.nombre,
      consultora: v.consultora?.nombre ?? 'sin asignar',
      dia: v.ctx.dia,
      estado: v.ctx.cliente.estado,
      motivos: motivos.map((m) => ETIQUETA_MOTIVO[m]),
      cuotasImpagas: v.ctx.registros.pagos.filter((p) => p.estado === 'vencido').length,
    }));

  const vivos = ws.vistas.filter((v) => ['activo', 'pausado'].includes(v.ctx.cliente.estado)).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 text-[12px] text-ink-3">
        <Link href="/cartera" className="hover:border-accent">← Cartera</Link>
      </div>

      <h1 className="text-[22px] font-semibold tracking-tight">Limpiar la cartera</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
        La importación trajo la planilla entera, y la planilla tiene el histórico. Hoy figuran{' '}
        <strong className="tnum">{vivos}</strong> clientes vivos y{' '}
        <strong className="tnum">{filas.length}</strong> tienen algo que los hace sospechosos.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        No es un problema cosmético: un cliente que ya no existe <strong>dispara alertas</strong>.
        La regla del día 90 sin venta se cumple perfecto en alguien que se fue hace ocho meses, y
        esa alerta le pide a una consultora una revisión de caso sobre una persona que no está.
        Mientras esto no se limpie, ningún número del tablero es la cartera real.
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
        Nada viene tildado y nada se borra: el cliente cambia de estado y queda su fila de baja con
        la fecha y el motivo. Si alguno estaba bien, se corrige desde su ficha.
      </p>

      <div className="mt-5">
        <LimpiezaCartera filas={filas} darDeBaja={darDeBajaEnLote} />
      </div>
    </div>
  );
}

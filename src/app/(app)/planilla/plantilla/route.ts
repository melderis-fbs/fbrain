import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { aCsv } from '@/lib/csv';
import { getUsuario, veTodo } from '@/server/auth';
import { getWorkspace } from '@/server/workspace';
import { CLIENTES, esDePlanilla } from '@/server/planilla-mapeo';

/**
 * LA PLANTILLA DE LA SOLAPA «FICHA»
 *
 * La app devuelve la tabla ya armada: una fila por cliente, con el nombre
 * exacto como está guardado y las columnas del expediente, precargadas con lo
 * que ya sabe.
 *
 * Es la pieza que faltaba para que cargar el expediente en masa sea viable. El
 * problema de armar esa tabla a mano no es tipear 194 filas: es que el cliente
 * se identifica por nombre exacto, así que cada «Maria» sin acento es una fila
 * que no entra. Generándola desde la base, el match está garantizado por
 * construcción — nadie tiene que adivinar cómo se escribió un nombre.
 *
 * Y sirve dos veces: la primera para llenar los huecos, y después como
 * radiografía de qué le falta al expediente de la cartera, que es una pregunta
 * que hoy sólo se puede contestar abriendo 194 fichas de a una.
 */

/** Las columnas del expediente, con el encabezado que el importador reconoce. */
const COLUMNAS = Object.entries(CLIENTES)
  .filter(([campo]) => !esDePlanilla(campo))
  .map(([campo, alias]) => ({ campo, encabezado: alias[0] }));

export async function GET() {
  const usuario = await getUsuario();
  if (!usuario) redirect('/login');
  if (!veTodo(usuario.rol)) redirect('/mis-clientes');

  const ws = await getWorkspace();

  // Por consultora y después por nombre: así cada una puede trabajar su bloque
  // de filas sin filtrar nada.
  const vistas = [...ws.vistas].sort(
    (a, b) =>
      (a.consultora?.nombre ?? 'zzz').localeCompare(b.consultora?.nombre ?? 'zzz') ||
      a.ctx.cliente.nombre.localeCompare(b.ctx.cliente.nombre),
  );

  /**
   * Las dos primeras columnas son de referencia y el importador las ignora:
   * están para que quien completa sepa de quién es cada fila. `nombre` sí se
   * usa, y es la que no hay que tocar.
   */
  const filas: (string | number | undefined)[][] = [
    ['nombre', 'consultora (referencia)', 'email (referencia)', ...COLUMNAS.map((c) => c.encabezado)],
  ];

  for (const v of vistas) {
    const c = v.ctx.cliente;
    const n = v.ctx.registros.negocio;
    const a = v.ctx.registros.autoridad;
    const e = v.ctx.estrategia;
    const o = v.ctx.objetivo;

    const valor: Record<string, string | number | undefined> = {
      moneda: n?.moneda ?? e?.moneda,
      fechaFinPrevista: c.fechaFinPrevista,
      planPago: c.planPago,
      horasRealesSemana: c.horasRealesSemana,
      diasGraciaPago: c.diasGraciaPago,
      nivelVendido: c.nivelVendido,

      queVende: n?.queVende,
      aQuien: n?.aQuien,
      negocioPrecio: n?.precio,
      comoEntrega: n?.comoEntrega,
      facturacionMensual: n?.facturacionMensual,
      cantidadClientes: n?.cantidadClientes,
      origenClientes: n?.origenClientes,
      queFunciono: n?.queFunciono,
      queNoFunciono: n?.queNoFunciono,

      haceExcepcionalmenteBien: a?.haceExcepcionalmenteBien,
      experienciaProfesional: a?.experienciaProfesional,
      resultadosPropios: a?.resultadosPropios,
      resultadosTerceros: a?.resultadosTerceros,
      industriasQueConoce: a?.industriasQueConoce?.join(', '),
      autoridadDesperdiciada: a?.autoridadDesperdiciada,

      clienteIdeal: e?.clienteIdeal,
      problema: e?.problema,
      deseo: e?.deseo,
      promesa: e?.promesa,
      oferta: e?.oferta,
      mecanismo: e?.mecanismo,
      canal: e?.canal,
      estrategiaPrecio: e?.precio,
      // Vacío a propósito: el motivo es de cada cambio, no del cliente.
      motivoCambio: undefined,

      metaMensual: o?.metaMensual,
      ticket: o?.ticket,
    };

    filas.push([
      c.nombre,
      v.consultora?.nombre ?? 'sin asignar',
      c.email,
      ...COLUMNAS.map((col) => valor[col.campo]),
    ]);
  }

  // BOM para que Excel abra los acentos bien. Sin esto, «Consultoría» se ve
  // «ConsultorÃ­a» y alguien lo va a "corregir" a mano en 194 filas.
  const csv = `﻿${aCsv(filas)}`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ficha-${ws.hoy}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

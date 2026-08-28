import { addDays, daysBetween, formatShort } from '@/lib/date';
import type { ContextoCliente } from './expediente';
import type { Baja, Pago, PasoBajaKey, Prorroga } from './types';

/**
 * EL CARRIL DE COBRANZA
 *
 * Está separado del de servicio a propósito, y la instrucción fue literal:
 * «a vos te chupa un huevo lo que pase en el servicio, vos te dedicás a
 * cobrar» / «indistintamente de cómo vaya el cliente, tiene que pagar».
 *
 * Traducido a código: NADA de lo que hay acá lee el semáforo, el índice ni la
 * atribución. Un cliente en rojo y un cliente modelo tienen el mismo
 * vencimiento y el mismo día de corte. Que la cobranza dependa de cómo viene
 * el caso es exactamente lo que produjo la lista de deudores que tienen hoy:
 * cada excepción es razonable de a una, y juntas son seis meses de servicio
 * regalado.
 *
 * La única puerta que abre al servicio es una: si el cliente dice que lo que
 * recibió no es lo que le vendieron, eso no es una excusa de pago, es un
 * reclamo sobre la llamada de venta, y va a otro carril con otro responsable.
 *
 * Los días de gracia salen del contrato de cada cliente —los viejos tienen 5,
 * los nuevos 3— y no de una constante global, porque el equipo firmó
 * condiciones distintas y aplicar la nueva a un contrato viejo es indefendible.
 */

export const DIAS_GRACIA_DEFAULT = 5;

export type EstadoCobranza =
  | 'sin_plan'
  | 'al_dia'
  | 'por_vencer'
  | 'vence_hoy'
  | 'en_gracia'
  | 'corte_pendiente'
  | 'prorroga_vigente'
  | 'prorroga_vencida'
  | 'baja_en_curso'
  | 'cerrado';

export const COBRANZA_LABEL: Record<EstadoCobranza, string> = {
  sin_plan: 'Sin plan de pago cargado',
  al_dia: 'Al día',
  por_vencer: 'Vence en breve',
  vence_hoy: 'Vence hoy',
  en_gracia: 'Dentro de los días de gracia',
  corte_pendiente: 'Corte pendiente',
  prorroga_vigente: 'Prórroga vigente',
  prorroga_vencida: 'Prórroga vencida sin pago',
  baja_en_curso: 'Baja en curso',
  cerrado: 'Programa terminado de pagar',
};

/** Severidad para ordenar la bandeja de cobranza. Nada que ver con el semáforo. */
export const COBRANZA_ORDEN: Record<EstadoCobranza, number> = {
  corte_pendiente: 100,
  prorroga_vencida: 95,
  en_gracia: 80,
  vence_hoy: 70,
  baja_en_curso: 60,
  prorroga_vigente: 50,
  por_vencer: 40,
  sin_plan: 30,
  al_dia: 10,
  cerrado: 0,
};

export type PlantillaKey =
  | 'recordatorio_previo'
  | 'recordatorio_vencimiento'
  | 'ultimo_aviso'
  | 'corte'
  | 'baja_voluntaria'
  | 'reclamo_de_venta';

export interface Plantilla {
  key: PlantillaKey;
  nombre: string;
  cuando: string;
  /** Quién lo manda. Nunca la consultora del caso: la relación no se usa para cobrar. */
  desde: 'administracion' | 'direccion';
  texto: string;
}

/**
 * «Armémonos cuatro mensajes según la situación y mandemos siempre lo mismo.»
 *
 * Cuatro de cobranza más dos de escalada, porque en la misma reunión
 * aparecieron dos situaciones que no son cobranza y hoy se responden
 * improvisando: el que se quiere dar de baja y el que dice que esto no es lo
 * que compró.
 *
 * Las variables entre llaves las completa la app. El texto no se edita caso
 * por caso: ése es el punto de tenerlo escrito.
 */
export const PLANTILLAS: Plantilla[] = [
  {
    key: 'recordatorio_previo',
    nombre: 'Recordatorio · dos días antes',
    cuando: 'Dos días antes del vencimiento. Si contesta acá, no se manda el del día.',
    desde: 'administracion',
    texto:
      'Hola {nombre}, ¿cómo estás? Te escribo para recordarte que el {fecha} vence la cuota {cuota} de tu programa, por {moneda} {monto}. Te paso los datos para que la dejes lista. Cualquier cosa me avisás por acá.',
  },
  {
    key: 'recordatorio_vencimiento',
    nombre: 'Recordatorio · el día del vencimiento',
    cuando: 'El mismo día, sólo si no contestó el anterior.',
    desde: 'administracion',
    texto:
      'Hola {nombre}, hoy vence la cuota {cuota} ({moneda} {monto}). Según tu contrato tenés {gracia} días de margen, hasta el {limite}. Avisame si ya la hiciste así la registro.',
  },
  {
    key: 'ultimo_aviso',
    nombre: 'Último aviso · dentro de la gracia',
    cuando: 'Un día antes de que se cumpla el margen del contrato.',
    desde: 'administracion',
    texto:
      'Hola {nombre}, la cuota {cuota} venció el {fecha} y el margen del contrato termina mañana, {limite}. Si no la recibimos, los accesos quedan suspendidos hasta que se regularice; no es una decisión sobre vos, es lo que firmamos las dos partes. Si hay algo que contarme, contámelo hoy.',
  },
  {
    key: 'corte',
    nombre: 'Corte de accesos',
    cuando: 'Cumplido el margen del contrato. Se manda y se ejecuta el mismo día.',
    desde: 'administracion',
    texto:
      'Hola {nombre}. De acuerdo a la cláusula de pagos del contrato, pasado el margen de {gracia} días desde el vencimiento del {fecha}, suspendemos los accesos al programa. Eso incluye las sesiones 1 a 1, las mentorías grupales y la comunidad. Para reactivarlos hay que regularizar {moneda} {deuda}. Quedo a disposición para coordinarlo.',
  },
  {
    key: 'baja_voluntaria',
    nombre: 'Baja pedida por el cliente',
    cuando: 'Apenas dice que se quiere ir. No se consulta con nadie ni se intenta retener.',
    desde: 'administracion',
    texto:
      'Hola {nombre}, recibido. Procedemos a cerrar los accesos al programa. Lo que quede pendiente del plan de pago sigue vigente según el contrato. Te agradezco el tiempo que estuviste y te deseo lo mejor con el proyecto.',
  },
  {
    key: 'reclamo_de_venta',
    nombre: 'Dice que esto no es lo que compró',
    cuando: 'Nunca lo responde cobranza. Abre revisión de la llamada de venta.',
    desde: 'direccion',
    texto:
      'Hola {nombre}, gracias por decírmelo así de claro. Antes de contestarte quiero escuchar la llamada de venta y revisar qué se te prometió exactamente. Te respondo yo misma en 48 horas con una posición, no con una excusa.',
  },
];

export function plantilla(key: PlantillaKey): Plantilla {
  return PLANTILLAS.find((p) => p.key === key)!;
}

export function completar(p: Plantilla, vars: Record<string, string | number>): string {
  return p.texto.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

// ---------------------------------------------------------------------------
// La lectura
// ---------------------------------------------------------------------------

export interface LecturaCobranza {
  estado: EstadoCobranza;
  orden: number;
  diasGracia: number;
  /** La cuota que define el estado */
  cuota?: Pago;
  /** Último día en que se puede pagar sin corte */
  limite?: string;
  /** Negativo = ya pasó */
  diasParaLimite: number | null;
  diasVencida: number | null;
  deuda: number;
  moneda: string;
  prorroga?: Prorroga;
  baja?: Baja;
  titular: string;
  accion: string;
  plantillaSugerida?: PlantillaKey;
  /** Pasos de la baja que faltan. Lo que en la reunión se olvidó tres veces. */
  pasosPendientes: PasoBajaKey[];
}

export const PASOS_BAJA: { key: PasoBajaKey; label: string; detalle: string }[] = [
  { key: 'accesos', label: 'Cerrar accesos al campus', detalle: 'School / plataforma del programa.' },
  { key: 'telegram', label: 'Sacar del Telegram', detalle: 'El que más se olvida, y el que el cliente sigue leyendo meses después.' },
  { key: 'comunidad', label: 'Sacar de la comunidad y de los grupos', detalle: 'Slack, WhatsApp o el canal que corresponda.' },
  { key: 'mentorias', label: 'Sacar del calendario de mentorías', detalle: 'Si no, sigue recibiendo invitaciones a sesiones que ya no le corresponden.' },
  { key: 'cobros', label: 'Cancelar cobros recurrentes', detalle: 'Un débito después de la baja es un contracargo asegurado.' },
  { key: 'drive', label: 'Cerrar la carpeta de Drive', detalle: 'Quitar permisos de edición, conservar el material.' },
  { key: 'consultora', label: 'Avisar a la consultora', detalle: 'Que no se entere por la ausencia en la agenda.' },
  { key: 'post_mortem', label: 'Post mortem escrito', detalle: 'Qué falló y en qué semana. Sin esto la baja no enseña nada.' },
];

const HOY_MONEDA = 'USD';

export function leerCobranza(ctx: ContextoCliente): LecturaCobranza {
  const hoy = ctx.hoy;
  const diasGracia = ctx.cliente.diasGraciaPago ?? DIAS_GRACIA_DEFAULT;
  const pagos = [...ctx.registros.pagos].sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const impagos = pagos.filter((p) => !p.fechaPago && p.estado !== 'incobrable');
  const deuda = impagos.filter((p) => p.fechaVencimiento <= hoy).reduce((a, p) => a + p.monto, 0);
  const moneda = pagos[0]?.moneda ?? HOY_MONEDA;

  const baja = ctx.registros.bajas?.[0];
  const pasosPendientes = baja
    ? PASOS_BAJA.map((p) => p.key).filter((k) => !baja.pasos.some((x) => x.key === k && x.hechoAt))
    : [];

  const mk = (
    estado: EstadoCobranza,
    titular: string,
    accion: string,
    extra: Partial<LecturaCobranza> = {},
  ): LecturaCobranza => ({
    estado,
    orden: COBRANZA_ORDEN[estado],
    diasGracia,
    deuda,
    moneda,
    diasParaLimite: null,
    diasVencida: null,
    titular,
    accion,
    baja,
    pasosPendientes,
    ...extra,
  });

  if (baja && pasosPendientes.length) {
    return mk('baja_en_curso',
      `Baja del ${formatShort(baja.fecha)} con ${pasosPendientes.length} paso(s) del checklist sin hacer.`,
      'Completar el checklist de baja hoy. Un cliente dado de baja que sigue en el Telegram es un problema que vuelve.',
    );
  }

  if (!pagos.length) {
    return mk('sin_plan',
      'No hay plan de pago cargado para este cliente.',
      'Cargar cuotas, montos y vencimientos. Sin esto la cobranza depende de que alguien se acuerde.',
    );
  }

  if (!impagos.length) {
    return mk('cerrado', 'El programa está pago en su totalidad.', 'Nada que gestionar.');
  }

  const proxima = impagos[0];
  const prorroga = ctx.registros.prorrogas
    ?.filter((p) => p.pagoId === proxima.id)
    .sort((a, b) => b.autorizadaAt.localeCompare(a.autorizadaAt))[0];

  // --- prórroga: gana sobre el vencimiento original, pero tiene su propia fecha
  if (prorroga && !prorroga.resultado) {
    const d = daysBetween(hoy, prorroga.nuevaFecha);
    if (d >= 0) {
      return mk('prorroga_vigente',
        `Prórroga de ${prorroga.diasOtorgados} días autorizada por ${prorroga.autorizadaPor}. Vence el ${formatShort(prorroga.nuevaFecha)}.`,
        `Sin mensajes hasta el ${formatShort(prorroga.nuevaFecha)}. La prórroga se respeta o no era una prórroga.`,
        { cuota: proxima, prorroga, limite: prorroga.nuevaFecha, diasParaLimite: d },
      );
    }
    return mk('prorroga_vencida',
      `La prórroga venció el ${formatShort(prorroga.nuevaFecha)}, hace ${-d} días, y la cuota ${proxima.numeroCuota} sigue impaga.`,
      'Corte de accesos hoy. La prórroga ya fue la excepción; una segunda excepción convierte el contrato en una sugerencia.',
      { cuota: proxima, prorroga, limite: prorroga.nuevaFecha, diasParaLimite: d, plantillaSugerida: 'corte' },
    );
  }

  const venc = proxima.fechaVencimiento;
  const limite = addDays(venc, diasGracia);
  const haciaVenc = daysBetween(hoy, venc);
  const haciaLimite = daysBetween(hoy, limite);
  const vencida = daysBetween(venc, hoy);

  if (haciaVenc > 2) {
    return mk('al_dia',
      `Próxima cuota ${proxima.numeroCuota} el ${formatShort(venc)}, en ${haciaVenc} días.`,
      'Nada que hacer todavía.',
      { cuota: proxima, limite, diasParaLimite: haciaLimite },
    );
  }

  if (haciaVenc > 0) {
    return mk('por_vencer',
      `Cuota ${proxima.numeroCuota} vence el ${formatShort(venc)}, en ${haciaVenc} día(s).`,
      'Mandar el recordatorio de dos días antes.',
      { cuota: proxima, limite, diasParaLimite: haciaLimite, plantillaSugerida: 'recordatorio_previo' },
    );
  }

  if (haciaVenc === 0) {
    return mk('vence_hoy',
      `Cuota ${proxima.numeroCuota} vence hoy. Margen del contrato: ${diasGracia} días, hasta el ${formatShort(limite)}.`,
      'Mandar el recordatorio del día, salvo que ya haya contestado el anterior.',
      { cuota: proxima, limite, diasParaLimite: haciaLimite, diasVencida: 0, plantillaSugerida: 'recordatorio_vencimiento' },
    );
  }

  if (haciaLimite >= 0) {
    return mk('en_gracia',
      `Cuota ${proxima.numeroCuota} vencida hace ${vencida} día(s). Quedan ${haciaLimite} de los ${diasGracia} del contrato.`,
      haciaLimite <= 1
        ? 'Último aviso hoy, con la fecha de corte explícita.'
        : 'Seguimiento por el canal de siempre. No negociar plazos nuevos sin autorización.',
      { cuota: proxima, limite, diasParaLimite: haciaLimite, diasVencida: vencida, plantillaSugerida: haciaLimite <= 1 ? 'ultimo_aviso' : 'recordatorio_vencimiento' },
    );
  }

  return mk('corte_pendiente',
    `Cuota ${proxima.numeroCuota} vencida hace ${vencida} días. El margen de ${diasGracia} días terminó el ${formatShort(limite)}, hace ${-haciaLimite}.`,
    'Cortar los accesos hoy y mandar el mensaje de corte. Un día más es un día de servicio regalado y un precedente.',
    { cuota: proxima, limite, diasParaLimite: haciaLimite, diasVencida: vencida, plantillaSugerida: 'corte' },
  );
}

// ---------------------------------------------------------------------------
// La cuenta que faltaba: ¿la flexibilidad paga?
// ---------------------------------------------------------------------------

/**
 * «De todos los que no pagaron por esto, creo que un caso, dos casos han
 * cumplido.» Eso hoy es una impresión. Acá pasa a ser un número, y es el
 * número que hace innecesario discutir la política cada vez.
 */
export interface ResumenCobranza {
  enRiesgo: number;
  moneda: string;
  cortesPendientes: number;
  enGracia: number;
  porVencer: number;
  bajasIncompletas: number;
  prorrogasOtorgadas: number;
  prorrogasQuePagaron: number;
  tasaProrroga: number | null;
}

export function resumenCobranza(
  lecturas: { lectura: LecturaCobranza; prorrogas: Prorroga[] }[],
): ResumenCobranza {
  const todas = lecturas.flatMap((l) => l.prorrogas);
  const resueltas = todas.filter((p) => p.resultado);
  const pagaron = resueltas.filter((p) => p.resultado === 'pago');
  return {
    enRiesgo: lecturas
      .filter((l) => ['corte_pendiente', 'prorroga_vencida', 'en_gracia'].includes(l.lectura.estado))
      .reduce((a, l) => a + l.lectura.deuda, 0),
    moneda: lecturas[0]?.lectura.moneda ?? HOY_MONEDA,
    cortesPendientes: lecturas.filter((l) => l.lectura.estado === 'corte_pendiente' || l.lectura.estado === 'prorroga_vencida').length,
    enGracia: lecturas.filter((l) => l.lectura.estado === 'en_gracia').length,
    porVencer: lecturas.filter((l) => ['por_vencer', 'vence_hoy'].includes(l.lectura.estado)).length,
    bajasIncompletas: lecturas.filter((l) => l.lectura.estado === 'baja_en_curso').length,
    prorrogasOtorgadas: todas.length,
    prorrogasQuePagaron: pagaron.length,
    tasaProrroga: resueltas.length ? pagaron.length / resueltas.length : null,
  };
}

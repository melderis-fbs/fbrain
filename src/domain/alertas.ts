import { addDays, daysBetween, formatShort, mondayOf } from '@/lib/date';
import { leerCobranza, type LecturaCobranza } from './cobranza';
import type { ContextoCliente } from './expediente';
import type { Alerta, DestinatarioAlerta, OrigenAlerta, Semaforo } from './types';

/** La lectura de cobranza es cara de recalcular por regla: se cachea por contexto. */
const cacheCobranza = new WeakMap<ContextoCliente, LecturaCobranza>();
function leerCobranzaSegura(c: ContextoCliente): LecturaCobranza | null {
  const hit = cacheCobranza.get(c);
  if (hit) return hit;
  try {
    const l = leerCobranza(c);
    cacheCobranza.set(c, l);
    return l;
  } catch {
    return null;
  }
}

/**
 * EL SISTEMA DE ALERTAS
 *
 * Acá se fusionaron dos catálogos y hubo que elegir. Ganó el de Brain, y con
 * razón:
 *
 *   · Toda alerta se cierra porque alguien escribió qué hizo. Nunca por el
 *     paso del tiempo. Mi versión anterior las auto-resolvía cuando la
 *     condición desaparecía — cómodo, y exactamente lo que hace que nadie se
 *     haga cargo de nada.
 *   · Una roja o una negra no la puede cerrar la consultora del caso.
 *   · Sin cita textual, una alerta de criterio no se emite.
 *   · Techo de diez por semana. Lo que pasa el techo se difiere, no se borra.
 *
 * Lo único que agregué encima: `condicionVigente`. Si la condición ya no se
 * cumple (el cliente tuvo la sesión, la cuota se pagó), la bandeja lo dice y
 * cerrarla es escribir una línea. Se respeta el principio sin generar trabajo
 * inútil, que era la crítica razonable a la regla original.
 */

export interface ReglaDura {
  codigo: string;
  titulo: string;
  familia: 'cadencia' | 'registro' | 'pago' | 'resultado' | 'proceso' | 'garantia' | 'dato' | 'criterio';
  descripcion: string;
  /** De dónde salió la regla: Brain trae 10; la fusión agregó las demás */
  origenCatalogo: 'brain' | 'cs-os';
  /** Códigos que, si están disparados, hacen redundante a esta regla. */
  suprimidaPor?: string[];
  evaluar: (ctx: ContextoCliente) => Disparo | null;
}

export interface Disparo {
  estado: Semaforo;
  /** Desde cuándo se cumple la condición. Sin esto todas las alertas nacen hoy
   *  y el techo semanal deja de tener sentido en la primera corrida. */
  desde?: string;
  cuerpo: string;
  pedido: string;
  destinatario: DestinatarioAlerta;
  plazoHoras: number;
  prioridad: number;
  citaTextual?: string;
  fechaCita?: string;
}

const dias = (n: number | null) => (n === null ? '—' : String(n));

// ---------------------------------------------------------------------------
// Las diez reglas duras de Brain
// ---------------------------------------------------------------------------

export const REGLAS: ReglaDura[] = [
  {
    codigo: 'RD-01',
    titulo: 'Cadencia rota',
    familia: 'cadencia',
    origenCatalogo: 'brain',
    descripcion: 'Más de 21 días sin sesión realizada. Más de 30 → rojo.',
    evaluar: (c) => {
      const d = c.diasSinSesion;
      if (c.esNuevo) return null;
      if (d === null) {
        return {
          estado: 'amarillo',
          cuerpo: `No hay ninguna sesión realizada registrada desde el alta, hace ${c.dia} días.`,
          pedido: 'Confirmar si hubo sesiones sin registrar o si el cliente todavía no arrancó. Agendar hoy.',
          destinatario: 'consultora',
          plazoHoras: 72,
          prioridad: 70,
        };
      }
      if (d <= 21) return null;
      const grave = d > 30;
      return {
        estado: grave ? 'rojo' : 'amarillo',
        cuerpo: `La última sesión realizada fue el ${formatShort(c.ultimaSesion!.fecha)}. Van ${d} días. El acuerdo de cadencia del programa es semanal.`,
        pedido: grave
          ? 'Revisión de caso en 48 h con alguien que no sea su consultora, y contacto el mismo día.'
          : 'Que la consultora agende la próxima sesión hoy y confirme horario fijo.',
        destinatario: grave ? 'revision_externa' : 'consultora',
        plazoHoras: grave ? 48 : 72,
        prioridad: grave ? 90 : 70,
        desde: addDays(c.ultimaSesion!.fecha, 21),
      };
    },
  },
  {
    codigo: 'RD-02',
    titulo: 'Dos cancelaciones seguidas',
    familia: 'cadencia',
    origenCatalogo: 'brain',
    suprimidaPor: ['RD-01'],
    descripcion: 'Las dos últimas sesiones agendadas no se realizaron.',
    evaluar: (c) => {
      if (c.esNuevo) return null;
      const ordenadas = [...c.registros.sesiones]
        .filter((s) => s.fecha <= c.hoy)
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      const [a, b] = ordenadas;
      const fallo = (s?: { estadoAgenda: string }) =>
        s && ['cancelada', 'reprogramada', 'no_asistio'].includes(s.estadoAgenda);
      if (!fallo(a) || !fallo(b)) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Las dos últimas sesiones agendadas no se realizaron. La última fue el ${formatShort(a.fecha)} (${a.estadoAgenda.replace('_', ' ')}).`,
        pedido: 'Llamado corto fuera de agenda para entender el motivo. No reagendar por mensaje.',
        destinatario: 'consultora',
        plazoHoras: 48,
        prioridad: 65,
        desde: a.fecha,
      };
    },
  },
  {
    codigo: 'RD-03',
    titulo: 'Cuota vencida hace más de 30 días',
    familia: 'pago',
    origenCatalogo: 'brain',
    descripcion: 'Se aplica también a clientes nuevos.',
    evaluar: (c) => {
      if (!c.diasCuotaMasVencida || c.diasCuotaMasVencida <= 30) return null;
      const cuota = c.cuotasVencidas.sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento))[0];
      return {
        estado: 'rojo',
        cuerpo: `Cuota ${cuota.numeroCuota} vencida el ${formatShort(cuota.fechaVencimiento)}, hace ${c.diasCuotaMasVencida} días. ${c.cuotasVencidas.length} cuota(s) impaga(s) en total.`,
        pedido: 'Gestión de cobranza por administración y definición de si el acompañamiento continúa.',
        destinatario: 'admin',
        plazoHoras: 48,
        prioridad: 95,
        desde: addDays(cuota.fechaVencimiento, 30),
      };
    },
  },
  {
    codigo: 'RD-04',
    titulo: 'Cambio de consultora reciente',
    familia: 'proceso',
    origenCatalogo: 'brain',
    descripcion: 'Traspaso en los últimos 30 días. Es el momento de mayor mortandad de la cartera.',
    evaluar: (c) => {
      if (!c.traspasoReciente) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Traspaso de consultora el ${formatShort(c.traspasoReciente.fecha)}. El traspaso es el momento de mayor pérdida de clientes de la cartera.`,
        pedido: 'Verificar que hubo presentación en vivo y que la nueva consultora leyó el expediente antes de la primera sesión.',
        destinatario: 'admin',
        plazoHoras: 72,
        prioridad: 78,
        desde: c.traspasoReciente.fecha,
      };
    },
  },
  {
    codigo: 'RD-05',
    titulo: 'Sesión sin registro',
    familia: 'registro',
    origenCatalogo: 'brain',
    descripcion: 'Sesión realizada sin transcripción, grabación ni reporte. Con amarillo ya abierto → rojo.',
    evaluar: (c) => {
      const sinRegistro = c.sesionesSinRegistro.filter(
        (s) => c.hoy > s.fecha && daysBetween(s.fecha, c.hoy) <= 30,
      );
      if (!sinRegistro.length) return null;
      const yaAmarillo = c.alertasAbiertas.some((a) => a.estadoSemaforo === 'amarillo' && a.codigo !== 'RD-05');
      return {
        estado: yaAmarillo ? 'rojo' : 'amarillo',
        cuerpo: `${sinRegistro.length} sesión(es) realizada(s) sin transcripción, grabación ni reporte. La última, el ${formatShort(sinRegistro[0].fecha)}. Sobre esas sesiones el sistema está ciego.`,
        pedido: 'Subir la transcripción o escribir el reporte hoy. Si no existe registro, dejar constancia de qué se trabajó.',
        destinatario: yaAmarillo ? 'revision_externa' : 'consultora',
        plazoHoras: 48,
        prioridad: 80,
        desde: sinRegistro[0].fecha,
      };
    },
  },
  {
    codigo: 'RD-06',
    titulo: 'Reporte cargado tarde',
    familia: 'registro',
    origenCatalogo: 'brain',
    suprimidaPor: ['RD-05'],
    descripcion: 'Más de 48 h entre la sesión y la carga del reporte.',
    evaluar: (c) => {
      const tarde = c.sesionesRealizadas.filter((s) => {
        if (!s.reporteCargadoAt) return false;
        if (daysBetween(s.fecha, c.hoy) > 60) return false;
        return new Date(s.reporteCargadoAt).getTime() - new Date(s.fecha).getTime() > 48 * 3600 * 1000;
      });
      if (tarde.length < 3) return null;
      return {
        estado: 'amarillo',
        cuerpo: `${tarde.length} reportes cargados con más de 48 h de atraso en los últimos 60 días. Se cargan en lote, y el registro se pierde justo cuando el caso se calienta.`,
        pedido: 'Cargar el reporte al cerrar la sesión, no al final de la semana.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 58,
        desde: tarde[0].fecha,
      };
    },
  },
  {
    codigo: 'RD-07',
    titulo: 'Día 90 sin ninguna venta',
    familia: 'resultado',
    origenCatalogo: 'brain',
    descripcion: 'El hito de resultado vencido. Es la alerta de mayor prioridad del sistema.',
    evaluar: (c) => {
      if (c.dia < 90 || c.ventas > 0) return null;
      return {
        estado: 'rojo',
        cuerpo: `Día ${c.dia} del programa y no hay ninguna venta registrada. El objetivo del programa es la primera venta antes del día 60.`,
        pedido: 'Revisión de caso completa con alguien que no sea su consultora, dentro de las 48 h. Definir una sola palanca para los próximos 30 días.',
        destinatario: 'revision_externa',
        plazoHoras: 48,
        prioridad: 100,
        desde: addDays(c.cliente.fechaAlta, 89),
      };
    },
  },
  {
    codigo: 'RD-08',
    titulo: 'Escalado automático',
    familia: 'proceso',
    origenCatalogo: 'brain',
    descripcion: 'Dos amarillas del mismo código en tres sesiones → rojo, sin que nadie opine.',
    evaluar: (c) => {
      const porCodigo = new Map<string, number>();
      for (const a of c.registros.alertas) {
        if (a.estadoSemaforo !== 'amarillo') continue;
        porCodigo.set(a.codigo, (porCodigo.get(a.codigo) ?? 0) + a.vecesEmitida);
      }
      const repetido = [...porCodigo.entries()].find(([, n]) => n >= 2);
      if (!repetido) return null;
      return {
        estado: 'rojo',
        cuerpo: `La alerta ${repetido[0]} apareció ${repetido[1]} veces. Dos amarillas del mismo código dejan de ser un episodio y pasan a ser un patrón.`,
        pedido: 'Revisión de caso con alguien que no sea su consultora. No cerrar sin un cambio concreto en el plan.',
        destinatario: 'revision_externa',
        plazoHoras: 48,
        prioridad: 98,
      };
    },
  },
  {
    codigo: 'RD-09',
    titulo: 'Cero asistencia a mentorías',
    familia: 'garantia',
    origenCatalogo: 'brain',
    descripcion: 'Sin ninguna asistencia en tres semanas. Prioridad alta si hay garantía firmada.',
    evaluar: (c) => {
      if (c.esNuevo || c.asistenciaMentorias3sem > 0) return null;
      if (!c.registros.asistencias.length && c.dia < 30) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Sin ninguna asistencia a mentorías grupales en las últimas 3 semanas.${c.cliente.tieneGarantia ? ' Tiene garantía firmada, que exige 2 por semana.' : ''}`,
        pedido: c.cliente.tieneGarantia
          ? 'Conversación sobre las condiciones de la garantía y qué la está bloqueando. Preguntar si el problema es el horario.'
          : 'Preguntar en la próxima sesión qué la está frenando. En general el obstáculo es el horario, no el interés.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: c.cliente.tieneGarantia ? 75 : 55,
      };
    },
  },
  {
    codigo: 'RD-10',
    titulo: 'Bajó su precio por iniciativa propia',
    familia: 'resultado',
    origenCatalogo: 'brain',
    descripcion: 'Caída de más del 10% en el precio, sin llamada de venta de por medio.',
    evaluar: (c) => {
      const actual = c.estrategia;
      const previa = c.estrategiasPrevias[0];
      if (!actual?.precio || !previa?.precio) return null;
      if (actual.precio >= previa.precio * 0.9) return null;
      if (actual.iniciativa !== 'cliente') return null;
      return {
        estado: 'rojo',
        cuerpo: `El precio pasó de ${previa.precio.toLocaleString('es-AR')} a ${actual.precio.toLocaleString('es-AR')} el ${formatShort(actual.vigenteDesde)}, a iniciativa del cliente. Es el patrón exacto del caso Parigi.`,
        pedido: 'Revisión con alguien que no sea su consultora antes de que el precio nuevo salga al mercado.',
        destinatario: 'revision_externa',
        plazoHoras: 48,
        prioridad: 92,
        desde: actual.vigenteDesde,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Lo que agrega la fusión con el CRM de Customer Success
  // -------------------------------------------------------------------------
  {
    codigo: 'RD-11',
    titulo: 'Día 60 sin la primera venta',
    familia: 'resultado',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-07'],
    descripcion: 'El objetivo del programa vencido. Treinta días antes de que sea rojo.',
    evaluar: (c) => {
      if (c.dia < 60 || c.dia >= 90 || c.ventas > 0) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Día ${c.dia} sin la primera venta. El objetivo del programa es tenerla antes del día 60. Quedan ${90 - c.dia} días antes de que esto sea rojo.`,
        pedido: 'Definir con el cliente la única palanca de los próximos 30 días y revisarla semana a semana.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 85,
        desde: addDays(c.cliente.fechaAlta, 59),
      };
    },
  },
  {
    codigo: 'RD-12',
    titulo: 'KPI semanal incumplido',
    familia: 'resultado',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-15', 'RD-01'],
    descripcion: 'Tres semanas seguidas por debajo del KPI que sale de su propia cuenta inversa.',
    evaluar: (c) => {
      if (!c.kpiSemanal || !c.esperado || c.esperado.semanasActivas < 3) return null;
      const ultimas = [...c.registros.metricas]
        .filter((m) => m.dmsIniciados !== null)
        .sort((a, b) => b.semanaIso.localeCompare(a.semanaIso))
        .slice(0, 3);
      if (ultimas.length < 3) return null;
      const objetivo = c.kpiSemanal.dms;
      if (!ultimas.every((m) => (m.dmsIniciados ?? 0) < objetivo * 0.6)) return null;
      const valores = ultimas.map((m) => m.dmsIniciados).join(', ');
      return {
        estado: 'amarillo',
        cuerpo: `Tres semanas seguidas por debajo de su KPI: ${valores} DMs contra ${objetivo} por semana que necesita para su meta. No es una métrica de vanidad, es el compromiso operativo.`,
        pedido: 'Revisar en sesión si el KPI es irreal para sus horas o si el problema es ejecución. Corregir una de las dos cosas, no las dos.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 68,
      };
    },
  },
  {
    codigo: 'RD-13',
    titulo: 'Tracker sin cargar',
    familia: 'dato',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-01'],
    descripcion: 'Sin métricas cargadas hace más de 21 días. El índice de este cliente no es confiable.',
    evaluar: (c) => {
      if (c.esNuevo) return null;
      if (c.diasDesdeMetricas !== null && c.diasDesdeMetricas <= 21) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Sin números cargados hace ${dias(c.diasDesdeMetricas)} días. Sobre este cliente el sistema no puede opinar: el índice y el diagnóstico dejan de ser confiables.`,
        pedido: 'Cargar el tracker de las semanas faltantes. Dos minutos al cerrar la próxima sesión.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 60,
      };
    },
  },
  {
    codigo: 'RD-14',
    titulo: 'Expediente ciego',
    familia: 'dato',
    origenCatalogo: 'cs-os',
    descripcion: 'Menos de 4 bloques cargados después del día 21. Los motores no pueden correr.',
    evaluar: (c) => {
      if (c.dia < 21 || c.bloquesCargados >= 4) return null;
      const faltan = Object.entries(c.bloques)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .join(', ');
      return {
        estado: 'amarillo',
        cuerpo: `Día ${c.dia} con ${c.bloquesCargados} de 6 bloques del expediente cargados. Faltan: ${faltan}. Con menos de 4, el diagnóstico no corre.`,
        pedido: 'Completar los bloques faltantes en la próxima sesión. Es media hora que evita meses de trabajo a ciegas.',
        destinatario: 'admin',
        plazoHoras: 96,
        prioridad: 72,
        desde: addDays(c.cliente.fechaAlta, 20),
      };
    },
  },
  {
    codigo: 'RD-15',
    titulo: 'Caída fuerte de actividad',
    familia: 'resultado',
    origenCatalogo: 'cs-os',
    descripcion: 'Las últimas dos semanas por debajo del 40% del mes anterior.',
    evaluar: (c) => {
      const ahora = c.ultimas4.dmsIniciados;
      const antes = c.previas4.dmsIniciados;
      if (!ahora.confiable || !antes.confiable || antes.valor < 20) return null;
      if (ahora.valor >= antes.valor * 0.4) return null;
      const caida = Math.round((1 - ahora.valor / antes.valor) * 100);
      return {
        estado: 'amarillo',
        cuerpo: `La actividad cayó ${caida}% contra el mes anterior: ${ahora.valor} DMs en las últimas 4 semanas contra ${antes.valor} en las 4 previas.`,
        pedido: 'Entender qué pasó en las últimas dos semanas antes de cambiar cualquier cosa de la estrategia.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 66,
      };
    },
  },
  {
    codigo: 'RD-16',
    titulo: 'Garantía en riesgo del lado nuestro',
    familia: 'garantia',
    origenCatalogo: 'cs-os',
    descripcion: 'Cliente con garantía firmada y condiciones que no se están cumpliendo.',
    evaluar: (c) => {
      if (!c.cliente.tieneGarantia || c.esNuevo) return null;
      const agendadas = c.sesionesUltimos60.length;
      if (agendadas < 4) return null;
      const realizadas = c.sesionesUltimos60.filter((s) => s.estadoAgenda === 'realizada').length;
      const tasa = realizadas / agendadas;
      if (tasa >= 0.9) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Cliente con garantía firmada: ${realizadas} de ${agendadas} sesiones realizadas en 60 días (${Math.round(tasa * 100)}%). La cláusula exige 90% de asistencia 1:1.`,
        pedido: 'Revisar si las sesiones caídas fueron del lado del cliente o del nuestro. Si fueron nuestras, la garantía queda expuesta.',
        destinatario: 'admin',
        plazoHoras: 72,
        prioridad: 75,
      };
    },
  },
  {
    codigo: 'RD-17',
    titulo: 'Compromisos vencidos acumulados',
    familia: 'proceso',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-01'],
    descripcion: 'Tres o más compromisos vencidos sin cerrar.',
    evaluar: (c) => {
      if (c.compromisosVencidos.length < 3) return null;
      return {
        estado: 'amarillo',
        cuerpo: `${c.compromisosVencidos.length} compromisos vencidos sin cerrar. El más viejo, del ${formatShort(c.compromisosVencidos[0].fechaVencimiento)}.`,
        pedido: 'Depurar la lista en la próxima sesión: cancelar lo que ya no aplica y dejar dos compromisos vivos.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 55,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Lectura de la consultora · el criterio humano emite alertas, no puntaje
  // -------------------------------------------------------------------------
  {
    codigo: 'CR-01',
    titulo: 'La consultora pidió intervención',
    familia: 'criterio',
    origenCatalogo: 'cs-os',
    descripcion: 'La consultora considera que no puede resolverlo sola.',
    evaluar: (c) => {
      if (!c.lectura?.necesitaIntervencion) return null;
      return {
        estado: 'rojo',
        cuerpo: `La consultora marcó que necesita intervención el ${formatShort(c.lectura.fecha)}. Bloqueo declarado: ${c.lectura.bloqueoDeclarado}.`,
        pedido: 'Asignar revisión externa y definir la intervención dentro de 48 h.',
        destinatario: 'revision_externa',
        plazoHoras: 48,
        prioridad: 96,
        desde: c.lectura.fecha,
        citaTextual: c.lectura.comentario,
        fechaCita: c.lectura.fecha,
      };
    },
  },
  {
    codigo: 'CR-02',
    titulo: 'La consultora ve el caso en riesgo',
    familia: 'criterio',
    origenCatalogo: 'cs-os',
    descripcion: 'Percepción de deterioro que los números todavía no muestran.',
    evaluar: (c) => {
      if (c.lectura?.percepcion !== 'riesgo' || c.lectura.necesitaIntervencion) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Lectura de la consultora del ${formatShort(c.lectura.fecha)}: caso en riesgo. Bloqueo declarado: ${c.lectura.bloqueoDeclarado}.`,
        pedido: 'Llevar el caso a la próxima reunión de revisión con la evidencia que sostiene la lectura.',
        destinatario: 'consultora',
        plazoHoras: 120,
        prioridad: 70,
        desde: c.lectura.fecha,
        citaTextual: c.lectura.comentario,
        fechaCita: c.lectura.fecha,
      };
    },
  },

  // -------------------------------------------------------------------------
  // Cobranza · el carril que no discute el servicio
  //
  // Estas cuatro no leen semáforo ni índice a propósito. La cuota vence igual
  // para el cliente modelo y para el que está en rojo, y cada excepción
  // razonable de a una es la razón por la que hay una lista de deudores.
  // -------------------------------------------------------------------------
  {
    codigo: 'RD-18',
    titulo: 'Cuota vencida dentro del margen del contrato',
    familia: 'pago',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-19', 'RD-03', 'RD-20'],
    descripcion: 'Venció y todavía corren los días de gracia que firmó ese cliente.',
    evaluar: (c) => {
      const l = leerCobranzaSegura(c);
      if (!l || l.estado !== 'en_gracia') return null;
      return {
        estado: 'amarillo',
        cuerpo: `${l.titular} Corte previsto para el ${formatShort(l.limite!)}.`,
        pedido: l.accion,
        destinatario: 'admin',
        plazoHoras: 24,
        prioridad: 74,
        desde: l.cuota!.fechaVencimiento,
      };
    },
  },
  {
    codigo: 'RD-19',
    titulo: 'Corte de accesos pendiente',
    familia: 'pago',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-03'],
    descripcion: 'Se cumplió el margen del contrato y el cliente sigue con acceso.',
    evaluar: (c) => {
      const l = leerCobranzaSegura(c);
      if (!l || l.estado !== 'corte_pendiente') return null;
      return {
        estado: 'rojo',
        cuerpo: `${l.titular} Deuda exigible: ${l.moneda} ${l.deuda.toLocaleString('es-AR')}.`,
        pedido: 'Cortar accesos hoy y mandar el mensaje de corte. Un día más es servicio regalado y un precedente.',
        destinatario: 'admin',
        plazoHoras: 24,
        prioridad: 94,
        desde: l.limite,
      };
    },
  },
  {
    codigo: 'RD-20',
    titulo: 'Prórroga vencida sin pago',
    familia: 'pago',
    origenCatalogo: 'cs-os',
    descripcion: 'Se otorgó una excepción con fecha y la fecha pasó.',
    evaluar: (c) => {
      const l = leerCobranzaSegura(c);
      if (!l || l.estado !== 'prorroga_vencida') return null;
      return {
        estado: 'rojo',
        cuerpo: `${l.titular} La autorizó ${l.prorroga!.autorizadaPor} el ${formatShort(l.prorroga!.autorizadaAt)}.`,
        pedido: 'Corte hoy y registrar el resultado de la prórroga. Una segunda excepción convierte el contrato en una sugerencia.',
        destinatario: 'admin',
        plazoHoras: 24,
        prioridad: 93,
        desde: l.prorroga!.nuevaFecha,
      };
    },
  },
  {
    codigo: 'RD-21',
    titulo: 'Baja con el checklist sin terminar',
    familia: 'proceso',
    origenCatalogo: 'cs-os',
    descripcion: 'Cliente dado de baja que todavía tiene accesos abiertos.',
    evaluar: (c) => {
      const l = leerCobranzaSegura(c);
      if (!l || l.estado !== 'baja_en_curso' || !l.baja) return null;
      const d = daysBetween(l.baja.fecha, c.hoy);
      if (d < 2) return null;
      return {
        estado: d > 7 ? 'rojo' : 'amarillo',
        cuerpo: `Baja del ${formatShort(l.baja.fecha)}, hace ${d} días, con ${l.pasosPendientes.length} paso(s) sin hacer: ${l.pasosPendientes.join(', ')}.`,
        pedido: 'Completar el checklist hoy. Un cliente dado de baja que sigue leyendo el Telegram es un problema que vuelve.',
        destinatario: 'admin',
        plazoHoras: 24,
        prioridad: d > 7 ? 86 : 68,
        desde: addDays(l.baja.fecha, 2),
      };
    },
  },

  // -------------------------------------------------------------------------
  // Dos fallas nuestras que hoy no dispara nada
  // -------------------------------------------------------------------------
  {
    codigo: 'RD-22',
    titulo: 'Cambio de consultora sin sesión de transición',
    familia: 'proceso',
    origenCatalogo: 'cs-os',
    suprimidaPor: ['RD-01'],
    descripcion: 'Pasaron los días y el cliente todavía no se sentó con su consultora nueva.',
    evaluar: (c) => {
      if (!c.traspasoReciente) return null;
      const d = daysBetween(c.traspasoReciente.fecha, c.hoy);
      if (d < 7) return null;
      const posteriores = c.sesionesRealizadas.filter((s) => s.fecha >= c.traspasoReciente!.fecha);
      if (posteriores.length) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Cambio de consultora el ${formatShort(c.traspasoReciente.fecha)}, hace ${d} días, y todavía no hubo una sesión con la nueva.`,
        pedido: 'Sesión de transición esta semana, con el expediente repasado antes: el cliente no tiene que volver a contar su historia.',
        destinatario: 'consultora',
        plazoHoras: 72,
        prioridad: 78,
        desde: addDays(c.traspasoReciente.fecha, 7),
      };
    },
  },
  {
    codigo: 'RD-23',
    titulo: 'El producto no corresponde al nivel del negocio',
    familia: 'proceso',
    origenCatalogo: 'cs-os',
    descripcion: 'Compró una etapa y trajo un negocio de otra. Es un problema de venta y asignación.',
    evaluar: (c) => {
      if (!c.cliente.nivelDesalineado) return null;
      return {
        estado: 'amarillo',
        cuerpo: `Compró ${c.cliente.nivelVendido ?? 'el programa de entrada'} y el negocio que trajo está en otra etapa. No es un problema del cliente ni de su consultora.`,
        pedido: 'Revisar la llamada de venta con dirección y definir si se recoloca el producto o se ajusta el acompañamiento. Antes de que lo diga él.',
        destinatario: 'admin',
        plazoHoras: 96,
        prioridad: 76,
        desde: addDays(c.cliente.fechaAlta, 14),
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Criterios de transcripción · los emite el modelo, con cita obligatoria
// El catálogo vive acá para que la bandeja los renderice igual que las duras.
// ---------------------------------------------------------------------------

export interface CriterioTranscripcion {
  codigo: string;
  familia: 'A' | 'B' | 'C';
  estado: Semaforo;
  titulo: string;
  destinatario: DestinatarioAlerta;
  plazoHoras: number;
  prioridad: number;
}

export const CRITERIOS: CriterioTranscripcion[] = [
  { codigo: 'CT-N1', familia: 'A', estado: 'negro', titulo: 'Nombra irse, pausar o pedir reembolso', destinatario: 'admin', plazoHoras: 0, prioridad: 99 },
  { codigo: 'CT-N2', familia: 'A', estado: 'negro', titulo: 'Dice que esto no es lo que compró', destinatario: 'admin', plazoHoras: 0, prioridad: 99 },
  { codigo: 'CT-N3', familia: 'A', estado: 'negro', titulo: 'Cuestiona al equipo entero', destinatario: 'admin', plazoHoras: 0, prioridad: 99 },
  { codigo: 'CT-N4', familia: 'A', estado: 'negro', titulo: 'Menciona abogado, contracargo o garantía', destinatario: 'admin', plazoHoras: 0, prioridad: 99 },
  { codigo: 'CT-R1', familia: 'A', estado: 'rojo', titulo: 'Desesperanza sobre el proceso', destinatario: 'revision_externa', plazoHoras: 48, prioridad: 88 },
  { codigo: 'CT-R2', familia: 'A', estado: 'rojo', titulo: 'No entiende el orden de lo que se le pide', destinatario: 'revision_externa', plazoHoras: 48, prioridad: 86 },
  { codigo: 'CT-R3', familia: 'A', estado: 'rojo', titulo: 'Baja su precio o cambia su oferta por iniciativa propia', destinatario: 'revision_externa', plazoHoras: 48, prioridad: 92 },
  { codigo: 'CT-R4', familia: 'A', estado: 'rojo', titulo: 'Pide cambio de consultora o se queja del equipo', destinatario: 'revision_externa', plazoHoras: 48, prioridad: 90 },
  { codigo: 'CT-R5', familia: 'A', estado: 'rojo', titulo: 'Dice que no puede sostener el pago', destinatario: 'admin', plazoHoras: 48, prioridad: 93 },
  { codigo: 'CT-R6', familia: 'A', estado: 'rojo', titulo: 'El mismo bloqueo por tercera sesión consecutiva', destinatario: 'revision_externa', plazoHoras: 48, prioridad: 85 },
  { codigo: 'CT-A1', familia: 'A', estado: 'amarillo', titulo: 'No puede explicar su oferta en voz alta', destinatario: 'consultora', plazoHoras: 120, prioridad: 62 },
  { codigo: 'CT-A2', familia: 'A', estado: 'amarillo', titulo: '"El sistema me abruma"', destinatario: 'consultora', plazoHoras: 120, prioridad: 60 },
  { codigo: 'CT-A3', familia: 'A', estado: 'amarillo', titulo: 'Segunda sesión seguida sin llegar a lo comprometido', destinatario: 'consultora', plazoHoras: 120, prioridad: 64 },
  { codigo: 'CT-A4', familia: 'A', estado: 'amarillo', titulo: 'Se compara con otro cliente del programa', destinatario: 'consultora', plazoHoras: 120, prioridad: 55 },
  { codigo: 'CT-A5', familia: 'A', estado: 'amarillo', titulo: 'Queja de contradicción entre consultora y mentor', destinatario: 'consultora', plazoHoras: 120, prioridad: 66 },
  { codigo: 'CT-A6', familia: 'A', estado: 'amarillo', titulo: 'Menciona un curso o coach externo', destinatario: 'consultora', plazoHoras: 120, prioridad: 58 },
  { codigo: 'CT-B1', familia: 'B', estado: 'amarillo', titulo: 'No se dijo un solo número en toda la sesión', destinatario: 'consultora', plazoHoras: 120, prioridad: 57 },
  { codigo: 'CT-B2', familia: 'B', estado: 'amarillo', titulo: 'La sesión se fue en pantalla o configuración', destinatario: 'consultora', plazoHoras: 120, prioridad: 63 },
  { codigo: 'CT-B3', familia: 'B', estado: 'amarillo', titulo: 'Cierra sin un compromiso con fecha', destinatario: 'consultora', plazoHoras: 120, prioridad: 56 },
  { codigo: 'CT-B4', familia: 'B', estado: 'amarillo', titulo: 'Abre sin repasar el compromiso anterior', destinatario: 'consultora', plazoHoras: 120, prioridad: 52 },
  { codigo: 'CT-B5', familia: 'B', estado: 'amarillo', titulo: 'El cliente habló menos del 30% del tiempo', destinatario: 'consultora', plazoHoras: 120, prioridad: 54 },
  { codigo: 'CT-C3', familia: 'C', estado: 'amarillo', titulo: 'El registro no coincide con la transcripción', destinatario: 'admin', plazoHoras: 96, prioridad: 61 },
];

export function metaDeCodigo(codigo: string) {
  const rd = REGLAS.find((r) => r.codigo === codigo);
  if (rd) return { titulo: rd.titulo, familia: rd.familia, origen: 'regla_dura' as OrigenAlerta };
  const ct = CRITERIOS.find((c) => c.codigo === codigo);
  if (ct) return { titulo: ct.titulo, familia: `Criterio ${ct.familia}`, origen: 'criterio' as OrigenAlerta };
  return { titulo: codigo, familia: '—', origen: 'regla_dura' as OrigenAlerta };
}

// ---------------------------------------------------------------------------
// Evaluación y reconciliación
// ---------------------------------------------------------------------------

export interface AlertaViva extends Alerta {
  /** ¿La condición que la disparó sigue cumpliéndose hoy? */
  condicionVigente: boolean;
  reglaTitulo: string;
  familia: string;
}

export const SEVERIDAD: Record<Semaforo, number> = { verde: 0, amarillo: 1, rojo: 2, negro: 3 };

/**
 * Corre las reglas duras sobre un cliente y las reconcilia con lo persistido.
 * Idempotente por (cliente, código): si ya hay una abierta, no se emite otra.
 */
export function correrReglas(ctx: ContextoCliente): AlertaViva[] {
  /**
   * Si la fecha de alta es una estimación, el reloj del programa no corre.
   *
   * Casi todas estas reglas miden contra el día del programa —día 60 sin
   * venta, hitos vencidos, cadencia de sesiones— y contra una fecha inventada
   * darían un número que parece un diagnóstico y no lo es. Setenta clientes
   * emitiendo alertas falsas hacen que el equipo deje de leer la bandeja, y
   * eso es más caro que no alertarlos: la bandeja sirve mientras se le crea.
   *
   * El cliente igual existe, se asigna, se abre y se edita. Lo único que
   * espera es la medición, y se destraba sola cuando alguien carga la fecha.
   */
  if (ctx.cliente.fechaAltaProvisional) return [];

  const abiertasPorCodigo = new Map(
    ctx.registros.alertas.filter((a) => !a.cerradaAt).map((a) => [a.codigo, a]),
  );
  const out: AlertaViva[] = [];
  const disparadas = new Set<string>();

  // Primera pasada: qué regla dispara. Segunda: cuáles quedan suprimidas por
  // otra más específica. Ocho alertas sobre el mismo cliente no son ocho
  // problemas: son el mismo problema contado ocho veces, y así el equipo deja
  // de leer la bandeja.
  const evaluadas = new Map<string, Disparo>();
  for (const regla of REGLAS) {
    try {
      const d = regla.evaluar(ctx);
      if (d) evaluadas.set(regla.codigo, d);
    } catch {
      // una regla rota no puede tumbar el resto del motor
    }
  }

  for (const regla of REGLAS) {
    const d = evaluadas.get(regla.codigo);
    if (!d) continue;
    if (regla.suprimidaPor?.some((c) => evaluadas.has(c))) continue;
    disparadas.add(regla.codigo);
    const previa = abiertasPorCodigo.get(regla.codigo);
    out.push({
      id: previa?.id ?? `${ctx.cliente.id}:${regla.codigo}`,
      clienteId: ctx.cliente.id,
      codigo: regla.codigo,
      origen: regla.familia === 'criterio' ? 'lectura' : 'regla_dura',
      estadoSemaforo: d.estado,
      titulo: regla.titulo,
      cuerpo: d.cuerpo,
      citaTextual: d.citaTextual,
      fechaCita: d.fechaCita,
      pedido: d.pedido,
      destinatario: d.destinatario,
      plazoHoras: d.plazoHoras,
      prioridad: d.prioridad,
      emitidaAt: previa?.emitidaAt ?? d.desde ?? ctx.hoy,
      emitidaEnSemana: previa?.emitidaEnSemana ?? mondayOf(d.desde ?? ctx.hoy),
      diferida: previa?.diferida ?? false,
      vecesEmitida: previa?.vecesEmitida ?? 1,
      condicionVigente: true,
      reglaTitulo: regla.titulo,
      familia: regla.familia,
    });
  }

  // Alertas ya persistidas cuya condición dejó de cumplirse: siguen abiertas —
  // se cierran escribiendo qué se hizo — pero la bandeja lo señala.
  for (const a of ctx.registros.alertas) {
    if (a.cerradaAt) continue;
    if (disparadas.has(a.codigo)) continue;
    const meta = metaDeCodigo(a.codigo);
    out.push({
      ...a,
      condicionVigente: a.origen === 'criterio' ? true : false,
      reglaTitulo: meta.titulo,
      familia: meta.familia,
    });
  }

  return out.sort(
    (a, b) => SEVERIDAD[b.estadoSemaforo] - SEVERIDAD[a.estadoSemaforo] || b.prioridad - a.prioridad,
  );
}

/**
 * Techo semanal. Las que pasan se difieren y van al informe mensual: no se
 * borran, pero no compiten por la atención. Las negras nunca se difieren.
 */
export function aplicarTechoSemanal(alertas: AlertaViva[], techo = 10, hoy?: string): AlertaViva[] {
  const semana = mondayOf(hoy ?? new Date().toISOString().slice(0, 10));
  const negras = alertas.filter((a) => a.estadoSemaforo === 'negro');
  // El techo regula lo que ENTRA esta semana. Lo que quedó abierto de semanas
  // anteriores no se difiere: se arrastra, y esa cuenta es el verdadero
  // indicador de si el sistema de alertas funciona.
  const nuevas = alertas
    .filter((a) => a.estadoSemaforo !== 'negro' && a.emitidaEnSemana === semana)
    .sort((a, b) => b.prioridad - a.prioridad);
  const arrastre = alertas.filter(
    (a) => a.estadoSemaforo !== 'negro' && a.emitidaEnSemana !== semana,
  );
  const cupo = Math.max(0, techo - negras.length);
  return [
    ...negras.map((a) => ({ ...a, diferida: false })),
    ...nuevas.map((a, i) => ({ ...a, diferida: i >= cupo })),
    ...arrastre.map((a) => ({ ...a, diferida: false })),
  ];
}

export function fechaLimite(a: Alerta): string {
  return addDays(a.emitidaAt, Math.max(1, Math.round(a.plazoHoras / 24)));
}

/** Una roja o negra no la puede cerrar la consultora del caso. */
export function puedeCerrar(
  alerta: Alerta,
  usuarioId: string,
  rol: 'consultora' | 'admin',
  consultoraDelCasoId?: string,
): { puede: boolean; motivo?: string } {
  if (rol === 'admin') return { puede: true };
  if (alerta.estadoSemaforo === 'negro') {
    return { puede: false, motivo: 'Las alertas negras las cierra administración.' };
  }
  if (alerta.estadoSemaforo === 'rojo' && usuarioId === consultoraDelCasoId) {
    return { puede: false, motivo: 'Una roja no la cierra la consultora del caso: requiere revisión externa.' };
  }
  return { puede: true };
}

export function validarCierre(texto: string): { ok: boolean; error?: string } {
  const limpio = texto.trim();
  if (limpio.length < 20) {
    return { ok: false, error: 'Escribí qué hiciste, con al menos 20 caracteres. Una alerta no se cierra por el paso del tiempo.' };
  }
  return { ok: true };
}

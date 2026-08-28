import { UMBRALES } from './cuenta-inversa';
import type { ContextoCliente } from './expediente';
import { BLOQUEO_DESCRIPCION, ESLABON_LABEL } from './fases';
import type { Eslabon, TipoBloqueo } from './types';

/**
 * DIAGNÓSTICO DETERMINÍSTICO DEL EMBUDO
 *
 * Esto no reemplaza al motor de criterio: lo precede. Es la parte del
 * diagnóstico que se puede resolver con aritmética, y sirve para tres cosas:
 *   · alimentar el triage sin gastar un peso en tokens,
 *   · darle al motor de criterio una lectura previa que puede discutir,
 *   · ser el piso de calidad: si el modelo dice algo peor que esto, está
 *     diciendo algo peor que una resta.
 *
 * Dos reglas que vienen del método y que acá son código, no recomendación:
 *   1. Ningún eslabón se juzga sin muestra. Un 0% de cierre sobre 2 llamadas
 *      no es un problema de cierre: es falta de datos.
 *   2. Un solo eslabón manda, y es el primero de la cadena. Los de abajo
 *      pueden ser consecuencia.
 */

export interface LecturaEmbudo {
  eslabon: Eslabon;
  tipoBloqueo: TipoBloqueo;
  titulo: string;
  evidencia: string;
  accion: string;
  queNoHacer: string;
  /** false cuando la conclusión se apoya en una muestra insuficiente */
  concluyente: boolean;
  muestra?: string;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const pct = (a: number, b: number) => `${Math.round(ratio(a, b) * 100)}%`;

export function leerEmbudo(ctx: ContextoCliente): LecturaEmbudo {
  const t = ctx.totales;
  const dms = t.dmsIniciados.valor;
  const conv = t.conversacionesAvanzadas.valor;
  const agendas = t.agendas.valor;
  const asistencias = t.asistencias.valor;
  const ventas = t.ventas.valor;
  const alcance = t.alcanceTotal.valor;
  const alcanceNS = t.alcanceNoSeguidores.valor;

  // ---------------------------------------------------------------- 0. Datos
  if (!t.dmsIniciados.confiable && !t.agendas.confiable && ctx.dia > 21) {
    return {
      eslabon: 'resultado',
      tipoBloqueo: 'operativo',
      titulo: 'No hay números cargados',
      evidencia: `Sin métricas cargadas${ctx.diasDesdeMetricas ? ` hace ${ctx.diasDesdeMetricas} días` : ' nunca'}. Sobre este cliente el sistema no puede concluir nada.`,
      accion: 'Cargar el tracker de las últimas semanas al cerrar la próxima sesión. Son dos minutos.',
      queNoHacer: 'No sacar conclusiones sobre su embudo hasta tener el dato. Un diagnóstico sin números es una opinión.',
      concluyente: false,
    };
  }

  // ---------------------------------------------------------------- 1. Contacto
  if (ctx.diasSinSesion === null || ctx.diasSinSesion > 21) {
    return {
      eslabon: 'entrega',
      tipoBloqueo: 'operativo',
      titulo: 'Contacto perdido',
      evidencia:
        ctx.diasSinSesion === null
          ? 'Nunca se registró una sesión realizada.'
          : `Última sesión realizada hace ${ctx.diasSinSesion} días. El acuerdo del programa es cadencia semanal.`,
      accion: 'Contacto hoy por el canal que responda y sesión agendada esta semana.',
      queNoHacer: 'No mandar un mensaje de reagenda y esperar. Es el patrón exacto del caso Gianna.',
      concluyente: true,
    };
  }

  // ---------------------------------------------------------------- 2. Estrategia
  if (!ctx.bloques.estrategia && ctx.dia >= 21) {
    return {
      eslabon: 'cliente',
      tipoBloqueo: 'estrategico',
      titulo: 'Cliente ideal y oferta sin cerrar',
      evidencia: `Día ${ctx.dia} y el bloque de estrategia del expediente sigue vacío.`,
      accion: 'Sesión de definición esta semana: un comprador reconocible y una oferta que se explique en 30 segundos.',
      queNoHacer: 'No mandarlo a publicar más contenido. Sin destinatario, más volumen es más ruido.',
      concluyente: true,
    };
  }

  const hitoOferta = ctx.hitos.get('oferta')?.estado;
  if (ctx.dia >= 30 && hitoOferta !== 'cumplido') {
    return {
      eslabon: 'oferta',
      tipoBloqueo: 'estrategico',
      titulo: 'Oferta sin cerrar',
      evidencia: `Día ${ctx.dia} y la oferta todavía no está confirmada. Es el gate del primer mes.`,
      accion: 'Revisión de oferta con la administradora esta semana y cierre de versión.',
      queNoHacer: 'No abrir un canal nuevo mientras la oferta esté abierta. Se multiplica el trabajo sin mover la venta.',
      concluyente: true,
    };
  }

  // ---------------------------------------------------------------- 3. Volumen
  const esperado = ctx.esperado;
  if (esperado && esperado.semanasActivas >= 1) {
    if (dms < esperado.dms * 0.5) {
      return {
        eslabon: 'canal',
        tipoBloqueo: 'adquisicion',
        titulo: 'Volumen de prospección por debajo de su propio KPI',
        evidencia: `${dms} DMs acumulados contra ${Math.round(esperado.dms)} que necesita para su meta de ${ctx.objetivo?.moneda ?? ''} ${ctx.objetivo?.metaMensual.toLocaleString('es-AR')} con su ticket. Su KPI es ${ctx.kpiSemanal?.dms} por semana.`,
        accion: `Cuota diaria hasta llegar a ${ctx.kpiSemanal?.dms} DMs por semana, con seguimiento en cada sesión.`,
        queNoHacer: 'No rediseñar la oferta todavía: con este volumen no hay muestra para concluir que la oferta falla.',
        concluyente: true,
        muestra: `${dms} DMs`,
      };
    }
  }

  if (ctx.dia >= 45 && dms === 0 && conv === 0) {
    return {
      eslabon: 'canal',
      tipoBloqueo: 'adquisicion',
      titulo: 'No salió al mercado',
      evidencia: `Día ${ctx.dia} sin ningún DM iniciado ni conversación abierta.`,
      accion: 'Plan de activación de 7 días: perfil, tres publicaciones y veinte conversaciones.',
      queNoHacer: 'No trabajar el guion de ventas todavía. No hay a quién decírselo.',
      concluyente: true,
    };
  }

  // ---------------------------------------------------------------- 4. Alcance
  if (t.alcanceTotal.confiable && alcance >= 2000 && ratio(alcanceNS, alcance) < UMBRALES.alcanceNoSeguidores) {
    return {
      eslabon: 'mensaje',
      tipoBloqueo: 'mensaje',
      titulo: 'El contenido circula solo entre los que ya lo siguen',
      evidencia: `${pct(alcanceNS, alcance)} del alcance es de no seguidores, sobre ${alcance.toLocaleString('es-AR')} de alcance total.`,
      accion: 'Cambiar tema y formato hacia el problema del comprador, no hacia la comunidad.',
      queNoHacer: 'No aumentar la frecuencia de publicación. El problema no es cuánto publica.',
      concluyente: true,
      muestra: `${alcance.toLocaleString('es-AR')} de alcance`,
    };
  }

  // ---------------------------------------------------------------- 5. Avance
  if (dms >= UMBRALES.muestraMinima && ratio(conv, dms) < UMBRALES.avanceConversacion) {
    return {
      eslabon: 'lead',
      tipoBloqueo: 'mensaje',
      titulo: 'Las conversaciones no avanzan',
      evidencia: `${dms} DMs iniciados → ${conv} conversaciones que avanzan (${pct(conv, dms)}).`,
      accion: 'Revisar los últimos diez chats reales y reescribir la apertura y la transición.',
      queNoHacer: 'No pedir la llamada en el primer mensaje. Es la causa más común de este número.',
      concluyente: true,
      muestra: `${dms} DMs`,
    };
  }

  // ---------------------------------------------------------------- 6. Agenda
  if (conv >= UMBRALES.muestraMinima && ratio(agendas, conv) < UMBRALES.agendamiento) {
    return {
      eslabon: 'setting',
      tipoBloqueo: 'comercial',
      titulo: 'Las conversaciones no llegan a la agenda',
      evidencia: `${conv} conversaciones que avanzan → ${agendas} agendas (${pct(agendas, conv)}).`,
      accion: 'Diagnóstico antes de ofrecer la llamada, y presentar la llamada como conversación con un resultado, no como venta.',
      queNoHacer: 'No tocar el contenido. Este número no se arregla publicando distinto.',
      concluyente: true,
      muestra: `${conv} conversaciones`,
    };
  }

  // ---------------------------------------------------------------- 7. Show
  if (agendas >= 5 && ratio(asistencias, agendas) < UMBRALES.asistencia) {
    return {
      eslabon: 'setting',
      tipoBloqueo: 'comercial',
      titulo: 'Agenda pero no aparecen',
      evidencia: `${agendas} agendas → ${asistencias} asistencias (${pct(asistencias, agendas)}).`,
      accion: 'Confirmación 24 h y 1 h antes, y no agendar a más de 72 horas.',
      queNoHacer: 'No leer esto como un problema de mercado. En orgánico esto es proceso.',
      concluyente: true,
      muestra: `${agendas} agendas`,
    };
  }

  // ---------------------------------------------------------------- 8. Cierre
  if (asistencias >= UMBRALES.muestraMinima && ratio(ventas, asistencias) < UMBRALES.cierre) {
    return {
      eslabon: 'venta',
      tipoBloqueo: 'comercial',
      titulo: 'Llega a la llamada y no cierra',
      evidencia: `${asistencias} llamadas con asistencia → ${ventas} ventas (${pct(ventas, asistencias)}).`,
      accion: 'Escuchar dos llamadas grabadas con la consultora y trabajar diagnóstico, valor y cierre.',
      queNoHacer: 'No sumar volumen de prospección. Sumar llamadas a un guion que no cierra sólo quema leads.',
      concluyente: true,
      muestra: `${asistencias} llamadas`,
    };
  }
  if (asistencias > 0 && asistencias < UMBRALES.muestraMinima && ventas === 0 && ctx.dia > 60) {
    return {
      eslabon: 'venta',
      tipoBloqueo: 'comercial',
      titulo: 'Sin ventas, pero todavía sin muestra para concluir',
      evidencia: `${asistencias} llamadas con asistencia y ninguna venta. Con menos de ${UMBRALES.muestraMinima} llamadas no se puede concluir sobre el cierre.`,
      accion: `Llegar a ${UMBRALES.muestraMinima} llamadas antes de tocar la oferta o el guion. Grabarlas todas.`,
      queNoHacer: 'No cambiar la oferta por dos llamadas que no cerraron. Eso es ruido, no señal.',
      concluyente: false,
      muestra: `${asistencias} llamadas`,
    };
  }

  // ---------------------------------------------------------------- 9. Ticket
  if (ventas >= 2 && ctx.objetivo && ctx.esperado) {
    const ticketReal = ctx.facturado / Math.max(1, ventas);
    if (ticketReal < ctx.objetivo.ticket * 0.7) {
      return {
        eslabon: 'oferta',
        tipoBloqueo: 'estrategico',
        titulo: 'Vende por debajo de su precio de lista',
        evidencia: `Ticket real ${Math.round(ticketReal).toLocaleString('es-AR')} contra ${ctx.objetivo.ticket.toLocaleString('es-AR')} de lista, sobre ${ventas} ventas.`,
        accion: 'Revisar cómo se presenta el precio y las cuotas. Un cierre del 40% al 70% del precio es peor negocio que un 25% a precio completo.',
        queNoHacer: 'No bajar el precio de lista para que cierre más rápido. Ese es el camino del caso Parigi.',
        concluyente: true,
        muestra: `${ventas} ventas`,
      };
    }
  }

  // ---------------------------------------------------------------- 10. Ejecución
  if (ctx.cumplimientoCompromisos !== null && ctx.cumplimientoCompromisos < 0.5) {
    return {
      eslabon: 'resultado',
      tipoBloqueo: 'ejecucion',
      titulo: 'Sabe qué hacer y no lo hace',
      evidencia: `${Math.round(ctx.cumplimientoCompromisos * 100)}% de compromisos cumplidos, con ${ctx.compromisosVencidos.length} vencidos sin cerrar.`,
      accion: 'Reducir a una sola acción semanal verificable y trabajarla dentro de la sesión, no como tarea.',
      queNoHacer: 'No rediseñar la estrategia. El problema no es qué hacer; es que no se hace.',
      concluyente: true,
    };
  }

  // ---------------------------------------------------------------- 11. Sano
  return {
    eslabon: 'resultado',
    tipoBloqueo: 'operativo',
    titulo: 'Sin eslabón roto detectado',
    evidencia: 'El embudo está dentro de lo esperado para su propia cuenta inversa.',
    accion: ctx.ventas > 0
      ? 'Sostener el ritmo y documentar qué funcionó, para que la venta sea repetible y no anecdótica.'
      : 'Sostener el volumen hasta tener muestra suficiente para leer el cierre.',
    queNoHacer: 'No cambiar nada mientras el número mejora. Lo que funciona no se toca sin una razón concreta.',
    concluyente: true,
  };
}

export function resumenBloqueo(l: LecturaEmbudo) {
  return `${ESLABON_LABEL[l.eslabon]} · ${BLOQUEO_DESCRIPCION[l.tipoBloqueo].toLowerCase()}`;
}

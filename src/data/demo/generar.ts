import { addDays, mondayOf } from '@/lib/date';
import { HITOS } from '@/domain/fases';
import { PASOS_BAJA } from '@/domain/cobranza';
import type {
  Alerta,
  AsistenciaMentoria,
  AtribucionManual,
  Autoridad,
  Baja,
  Cliente,
  Compromiso,
  Diagnostico,
  EstrategiaVersion,
  HitoCliente,
  LecturaConsultora,
  MetricaSemanal,
  Negocio,
  ObjetivoComercial,
  Pago,
  Prorroga,
  RevisionCaso,
  Sesion,
  Traspaso,
} from '@/domain/types';
import { CARGA, CONSULTORAS, NOMBRES, PROGRAMAS, RUBROS } from './gente';

/**
 * Cartera ficticia de demostración: ~85 clientes con la distribución real de
 * carga por consultora. Determinística, para que el equipo pueda discutir
 * casos concretos y volver a encontrarlos mañana igual.
 *
 * Los arquetipos no son inventados de cero: reproducen los modos de falla que
 * ya están documentados en la operación de Founders. Dos de ellos —el de
 * escalada emocional y el de cadencia rota— existen para que se vea qué
 * hubieran hecho las reglas si hubieran estado corriendo.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Arquetipo =
  | 'sano_temprano'
  | 'sano_vendiendo'
  | 'renovacion'
  | 'en_ritmo'
  | 'volumen_bajo'
  | 'mensaje_no_convierte'
  | 'no_agenda'
  | 'no_asiste'
  | 'no_cierra'
  | 'ticket_bajo'
  | 'ejecucion_baja'
  | 'cadencia_rota'
  | 'escalada_emocional'
  | 'expediente_ciego'
  | 'dia90_sin_venta'
  | 'cuotas_vencidas'
  | 'garantia_en_riesgo'
  | 'traspaso_reciente'
  | 'sin_mentorias'
  | 'precio_bajado'
  // Los cuatro que salieron de la revisión de cartera de agosto
  | 'corte_pendiente'
  | 'prorroga_vencida'
  | 'baja_sin_cerrar'
  | 'nivel_desalineado';

interface Perfil {
  /** DMs por semana efectivos, como fracción del KPI que necesita */
  cumplimientoKpi: number;
  tasaAvance: number;
  tasaAgenda: number;
  tasaAsistencia: number;
  tasaCierre: number;
  ticketReal: number; // fracción del precio de lista
  cumplimientoCompromisos: number;
  asistenciaSesiones: number;
  registroSesiones: number; // probabilidad de que la sesión tenga registro
  cargaTracker: number; // probabilidad de que la semana esté cargada
  bloques: number; // bloques del expediente que se cargan
  diaInicioProspeccion: number;
}

const P = (o: Partial<Perfil>): Perfil => ({
  cumplimientoKpi: 0.9,
  tasaAvance: 0.6,
  tasaAgenda: 0.45,
  tasaAsistencia: 0.85,
  tasaCierre: 0.32,
  ticketReal: 1,
  cumplimientoCompromisos: 0.8,
  asistenciaSesiones: 0.95,
  registroSesiones: 0.95,
  cargaTracker: 0.95,
  bloques: 6,
  diaInicioProspeccion: 30,
  ...o,
});

const PERFILES: Record<Arquetipo, Perfil> = {
  sano_temprano: P({ cumplimientoKpi: 0.8, diaInicioProspeccion: 28 }),
  sano_vendiendo: P({ cumplimientoKpi: 1.05, tasaCierre: 0.36 }),
  renovacion: P({ cumplimientoKpi: 1, tasaCierre: 0.34 }),
  en_ritmo: P({ cumplimientoKpi: 0.85, tasaCierre: 0.28, cumplimientoCompromisos: 0.75 }),
  volumen_bajo: P({ cumplimientoKpi: 0.3, cumplimientoCompromisos: 0.5, diaInicioProspeccion: 38 }),
  mensaje_no_convierte: P({ cumplimientoKpi: 1.1, tasaAvance: 0.18 }),
  no_agenda: P({ cumplimientoKpi: 1, tasaAvance: 0.6, tasaAgenda: 0.14 }),
  no_asiste: P({ cumplimientoKpi: 1, tasaAsistencia: 0.42 }),
  no_cierra: P({ cumplimientoKpi: 1, tasaCierre: 0.05 }),
  ticket_bajo: P({ cumplimientoKpi: 1.2, tasaCierre: 0.38, ticketReal: 0.45 }),
  ejecucion_baja: P({ cumplimientoKpi: 0.45, cumplimientoCompromisos: 0.25, asistenciaSesiones: 0.8 }),
  cadencia_rota: P({ cumplimientoKpi: 0.4, asistenciaSesiones: 0.55, cargaTracker: 0.5, registroSesiones: 0.6 }),
  escalada_emocional: P({ cumplimientoKpi: 0.55, tasaCierre: 0.08, registroSesiones: 0.55, cumplimientoCompromisos: 0.45 }),
  expediente_ciego: P({ bloques: 2, cargaTracker: 0.2, registroSesiones: 0.35, cumplimientoKpi: 0.5 }),
  dia90_sin_venta: P({ cumplimientoKpi: 0.7, tasaCierre: 0 }),
  cuotas_vencidas: P({ cumplimientoKpi: 0.6, tasaCierre: 0.15 }),
  garantia_en_riesgo: P({ asistenciaSesiones: 0.7, cumplimientoKpi: 0.7 }),
  traspaso_reciente: P({ cumplimientoKpi: 0.65, cargaTracker: 0.8 }),
  sin_mentorias: P({ cumplimientoKpi: 0.75 }),
  precio_bajado: P({ cumplimientoKpi: 0.8, tasaCierre: 0.2, ticketReal: 0.75 }),
  corte_pendiente: P({ cumplimientoKpi: 0.5, tasaCierre: 0.1, asistenciaSesiones: 0.7 }),
  prorroga_vencida: P({ cumplimientoKpi: 0.7, tasaCierre: 0.18 }),
  baja_sin_cerrar: P({ cumplimientoKpi: 0.35, tasaCierre: 0.05, registroSesiones: 0.5, asistenciaSesiones: 0.4 }),
  // Trajo un negocio que ya factura y compró el producto de arranque. El
  // desajuste no es suyo ni de su consultora: se produjo en la venta.
  nivel_desalineado: P({ cumplimientoKpi: 1.1, tasaCierre: 0.3, cumplimientoCompromisos: 0.85 }),
};

/** Mezcla de la cartera. Suma exactamente 85: si sobra, la cola se descarta
 *  entera y los arquetipos del final desaparecen sin que nadie lo note. */
const MEZCLA: [Arquetipo, number][] = [
  ['en_ritmo', 10],
  ['sano_vendiendo', 7],
  ['sano_temprano', 6],
  ['corte_pendiente', 3],
  ['prorroga_vencida', 2],
  ['baja_sin_cerrar', 2],
  ['nivel_desalineado', 2],
  ['volumen_bajo', 5],
  ['mensaje_no_convierte', 4],
  ['no_agenda', 3],
  ['no_asiste', 3],
  ['no_cierra', 4],
  ['ticket_bajo', 3],
  ['ejecucion_baja', 4],
  ['cadencia_rota', 4],
  ['escalada_emocional', 2],
  ['expediente_ciego', 4],
  ['dia90_sin_venta', 3],
  ['cuotas_vencidas', 2],
  ['garantia_en_riesgo', 2],
  ['traspaso_reciente', 2],
  ['sin_mentorias', 3],
  ['precio_bajado', 2],
  ['renovacion', 3],
];

export interface DatasetDemo {
  clientes: Cliente[];
  negocios: Negocio[];
  autoridades: Autoridad[];
  estrategias: EstrategiaVersion[];
  objetivos: ObjetivoComercial[];
  metricas: MetricaSemanal[];
  sesiones: Sesion[];
  compromisos: Compromiso[];
  pagos: Pago[];
  asistencias: AsistenciaMentoria[];
  hitos: HitoCliente[];
  lecturas: LecturaConsultora[];
  alertas: Alerta[];
  traspasos: Traspaso[];
  diagnosticos: Diagnostico[];
  prorrogas: Prorroga[];
  bajas: Baja[];
  atribuciones: AtribucionManual[];
  revisiones: RevisionCaso[];
}

const REPORTES = [
  'Revisamos el avance de la semana y ajustamos el foco. Quedó pendiente cerrar la definición de la oferta.',
  'Trabajamos sobre las conversaciones que se caen. Detectamos que pide la llamada demasiado temprano.',
  'Repasamos los números del tracker. Volumen por debajo del objetivo semanal.',
  'Escuchamos una llamada grabada. El diagnóstico es corto y pasa a presentar demasiado rápido.',
  'Definimos los pilares de contenido y el ángulo para las próximas dos semanas.',
  'Sesión de reencuadre: revisamos qué compró y qué esperar de los próximos 30 días.',
  'Cerramos la promesa y la bajamos a una frase. Falta llevarla al perfil.',
  'Revisamos objeciones repetidas y armamos respuestas para las tres más frecuentes.',
];

const TAREAS = [
  'Abrir 20 conversaciones nuevas',
  'Publicar 3 piezas de contenido',
  'Grabar y subir 2 llamadas',
  'Actualizar bio y CTA del perfil',
  'Hacer seguimiento de los 5 leads tibios',
  'Escribir la promesa en una sola frase',
  'Agendar 3 llamadas para la semana',
  'Cargar el tracker de la semana',
];

const CITAS_ESCALADA = [
  'no veo esa luz al final del camino',
  'siento que es como el perro que se muerde la cola',
  'me parece que nadie la tiene clara con esto',
  'si esto no cambia voy a tener que ver qué hago',
];

export function generarDataset(hoy: string): DatasetDemo {
  const d: DatasetDemo = {
    clientes: [], negocios: [], autoridades: [], estrategias: [], objetivos: [],
    metricas: [], sesiones: [], compromisos: [], pagos: [], asistencias: [],
    hitos: [], lecturas: [], alertas: [], traspasos: [], diagnosticos: [],
    prorrogas: [], bajas: [], atribuciones: [], revisiones: [],
  };

  // Lista de arquetipos expandida y repartida entre consultoras
  const cola: Arquetipo[] = [];
  for (const [a, n] of MEZCLA) for (let i = 0; i < n; i++) cola.push(a);
  // Barajado determinístico (Fisher-Yates con la misma semilla siempre): reparte
  // los arquetipos entre las consultoras sin depender de que el largo de la
  // lista sea coprimo con nada. Con un salto fijo, agregar un arquetipo podía
  // colapsar la variedad de toda la cartera sin que se notara.
  const rMezcla = rng(20260827);
  for (let i = cola.length - 1; i > 0; i--) {
    const j = Math.floor(rMezcla() * (i + 1));
    [cola[i], cola[j]] = [cola[j], cola[i]];
  }

  const asignaciones: { consultoraId: string }[] = [];
  for (const c of CONSULTORAS) for (let i = 0; i < CARGA[c.id]; i++) asignaciones.push({ consultoraId: c.id });

  const total = Math.min(cola.length, asignaciones.length, NOMBRES.length);

  for (let i = 0; i < total; i++) {
    const r = rng(7000 + i * 131);
    const arq = cola[i];
    const perfil = PERFILES[arq];
    const id = `c-${String(i + 1).padStart(3, '0')}`;
    const consultoraId = asignaciones[i].consultoraId;
    const nombre = NOMBRES[i];

    // ----------------------------------------------------------- calendario
    let dia: number;
    switch (arq) {
      case 'sano_temprano': dia = 6 + Math.floor(r() * 20); break;
      case 'dia90_sin_venta': dia = 92 + Math.floor(r() * 40); break;
      case 'renovacion': dia = 130 + Math.floor(r() * 40); break;
      case 'escalada_emocional': dia = 62 + Math.floor(r() * 30); break;
      case 'expediente_ciego': dia = 28 + Math.floor(r() * 50); break;
      // Los de cobranza tienen que estar más allá de la primera cuota para que
      // el vencimiento exista de verdad y no sea un número puesto a mano.
      case 'corte_pendiente': dia = 38 + Math.floor(r() * 55); break;
      case 'prorroga_vencida': dia = 45 + Math.floor(r() * 50); break;
      case 'baja_sin_cerrar': dia = 55 + Math.floor(r() * 60); break;
      case 'nivel_desalineado': dia = 18 + Math.floor(r() * 45); break;
      // Bastante avanzado para que las tres cuotas ya hayan vencido.
      case 'cuotas_vencidas': dia = 75 + Math.floor(r() * 45); break;
      default: dia = 20 + Math.floor(r() * 110);
    }
    const fechaAlta = addDays(hoy, -(dia - 1));
    /**
     * Contratos viejos: 5 días de margen. Los firmados en los últimos tres
     * meses: 3 días. La condición viaja con el cliente, no con la app.
     */
    const diasGraciaPago = dia <= 90 ? 3 : 5;
    const programa = PROGRAMAS[Math.floor(r() * PROGRAMAS.length)];
    const tieneGarantia = arq === 'garantia_en_riesgo' || r() < 0.22;
    const ticketLista = [900, 1200, 1500, 1800, 2400, 3000][Math.floor(r() * 6)];
    const meta = ticketLista * (3 + Math.floor(r() * 5));

    d.clientes.push({
      id,
      nombre,
      email: `${nombre.split(' ')[0].toLowerCase()}@ejemplo.com`,
      programa,
      fechaAlta,
      fechaFinPrevista: addDays(fechaAlta, 180),
      planPago: ['1 pago', '2000-1000-500', '3 cuotas', '2 cuotas'][Math.floor(r() * 4)],
      tieneGarantia,
      fuente: ['IG', 'referido', 'ads', 'orgánico'][Math.floor(r() * 4)],
      consultoraId,
      estado: 'activo',
      diasGraciaPago,
      nivelDesalineado: arq === 'nivel_desalineado',
      nivelVendido: arq === 'nivel_desalineado' ? 'el programa de arranque (M1)' : undefined,
      driveFolderId: `drive-${id}`,
      horasRealesSemana: perfil.bloques >= 4 ? [3, 5, 8, 10, 12][Math.floor(r() * 5)] : undefined,
      // Lo comercial, que en la planilla real lo lleva finanzas. El monto y el
      // estado de deuda se completan más abajo, cuando ya existen las cuotas:
      // derivarlos es la única forma de que la lectura comercial y la de
      // cobranza no se contradigan en pantalla.
      closer: ['Vicky', 'Kevin', 'Braian'][Math.floor(r() * 3)],
      setter: ['Lara', 'Kevin', 'automática'][Math.floor(r() * 3)],
    });

    // ----------------------------------------------------------- bloques
    const rubro = RUBROS[i % RUBROS.length];
    if (perfil.bloques >= 2) {
      d.negocios.push({
        clienteId: id,
        queVende: `Acompañamiento 1:1 de ${rubro.toLowerCase()}`,
        aQuien: perfil.bloques >= 4 ? `Dueños de negocios de ${rubro.toLowerCase()} que ya facturan y dependen de sí mismos` : undefined,
        precio: perfil.bloques >= 4 ? ticketLista : undefined,
        moneda: 'USD',
        comoEntrega: 'Sesiones semanales + material',
        facturacionMensual: Math.round(ticketLista * (0.5 + r() * 2)),
        cantidadClientes: Math.floor(r() * 6),
        origenClientes: 'Referidos y contactos previos',
        queFunciono: 'El boca a boca con clientes de su etapa anterior',
        queNoFunciono: 'Publicar sin un destinatario claro',
        actualizadoAt: addDays(fechaAlta, 5),
      });
    }
    if (perfil.bloques >= 3) {
      d.autoridades.push({
        clienteId: id,
        haceExcepcionalmenteBien: `Diagnosticar rápido problemas de ${rubro.toLowerCase()}`,
        experienciaProfesional: `${5 + Math.floor(r() * 15)} años en ${rubro.toLowerCase()}`,
        resultadosPropios: 'Construyó y vendió su práctica anterior',
        resultadosTerceros: `${3 + Math.floor(r() * 20)} clientes acompañados`,
        industriasQueConoce: [rubro, RUBROS[(i + 3) % RUBROS.length]],
        autoridadDesperdiciada: 'Tiene una comunidad de la etapa anterior que no está usando',
        actualizadoAt: addDays(fechaAlta, 9),
      });
    }
    if (perfil.bloques >= 4) {
      const base: Omit<EstrategiaVersion, 'id' | 'version' | 'vigenteDesde' | 'precio'> = {
        clienteId: id,
        clienteIdeal: `Profesionales de ${rubro.toLowerCase()} que facturan y no escalan`,
        problema: 'Depende de su tiempo para facturar',
        deseo: 'Vender servicios de alto valor sin sumar horas',
        promesa: `Cerrar 3 clientes de alto valor en 90 días`,
        oferta: 'Programa de 12 semanas 1:1',
        mecanismo: 'Método Founders',
        canal: 'Instagram orgánico',
        moneda: 'USD',
        motivoCambio: undefined,
        iniciativa: 'consultora',
      };
      d.estrategias.push({ ...base, id: `${id}-e1`, version: 1, vigenteDesde: addDays(fechaAlta, 12), precio: ticketLista });
      if (arq === 'precio_bajado' || arq === 'escalada_emocional') {
        d.estrategias.push({
          ...base,
          id: `${id}-e2`,
          version: 2,
          vigenteDesde: addDays(hoy, -Math.floor(20 + r() * 20)),
          precio: Math.round(ticketLista * 0.7),
          motivoCambio: 'El cliente decidió bajar el precio porque le parecía caro para su mercado',
          iniciativa: 'cliente',
        });
      }
      d.objetivos.push({
        id: `${id}-o1`,
        clienteId: id,
        metaMensual: meta,
        ticket: ticketLista,
        moneda: 'USD',
        tasaCierre: 0.32,
        tasaAsistencia: 0.85,
        tasaAgendamiento: 0.45,
        tasaAvance: 0.6,
        tasaDmSobreAlcance: 0.005,
        diaInicioProspeccion: perfil.diaInicioProspeccion,
        vigenteDesde: addDays(fechaAlta, 7),
        creadoPor: consultoraId,
      });
    }

    // ----------------------------------------------------------- métricas
    const kpiDms = Math.max(
      8,
      Math.ceil(meta / ticketLista / 0.32 / 0.85 / 0.45 / 0.6 / 4),
    );
    const semanas = Math.floor(dia / 7);
    let carryAg = 0;
    let carryAs = 0;
    let carryVt = 0;
    for (let w = 1; w <= semanas; w++) {
      const semanaIso = mondayOf(addDays(fechaAlta, (w - 1) * 7));
      const diaDeLaSemana = (w - 1) * 7 + 1;
      const activo = diaDeLaSemana >= perfil.diaInicioProspeccion;
      const cargada = r() < perfil.cargaTracker;
      // "cadencia_rota" y "expediente_ciego" dejan de cargar en las últimas semanas
      const abandonoReciente =
        (arq === 'cadencia_rota' || arq === 'expediente_ciego') && w > semanas - 4;

      if (!cargada || abandonoReciente) {
        d.metricas.push({
          id: `${id}-w${w}`,
          clienteId: id,
          semanaIso,
          contenidoPublicado: null, alcanceTotal: null, alcanceNoSeguidores: null,
          dmsIniciados: null, conversacionesAvanzadas: null, leads: null,
          leadsCalificados: null, agendas: null, asistencias: null, cancelaciones: null,
          llamadas: null, ofertasRealizadas: null, ventas: null, facturado: null,
          ticketPromedio: null, inversionAds: null, objeciones: [], origenOportunidades: {},
          cargadoPor: consultoraId,
        });
        continue;
      }

      const jitter = 0.75 + r() * 0.5;
      const dms = activo ? Math.round(kpiDms * perfil.cumplimientoKpi * jitter) : 0;
      const alcance = activo ? Math.round(dms / 0.005 * (0.8 + r() * 0.5)) : Math.round(r() * 400);
      const alcanceNS = Math.round(alcance * (arq === 'mensaje_no_convierte' ? 0.2 : 0.35 + r() * 0.35));
      const conv = Math.round(dms * perfil.tasaAvance);
      const agF = conv * perfil.tasaAgenda + carryAg;
      const ag = Math.floor(agF); carryAg = agF - ag;
      const asF = ag * perfil.tasaAsistencia + carryAs;
      const asis = Math.floor(asF); carryAs = asF - asis;
      const vtF = asis * perfil.tasaCierre + carryVt;
      const vt = Math.floor(vtF); carryVt = vtF - vt;
      const ticket = Math.round(ticketLista * perfil.ticketReal);

      d.metricas.push({
        id: `${id}-w${w}`,
        clienteId: id,
        semanaIso,
        contenidoPublicado: activo ? Math.round(2 + r() * 3) : Math.round(r() * 2),
        alcanceTotal: alcance,
        alcanceNoSeguidores: alcanceNS,
        dmsIniciados: dms,
        conversacionesAvanzadas: conv,
        leads: Math.round(conv * 0.7),
        leadsCalificados: Math.round(conv * 0.5),
        agendas: ag,
        asistencias: asis,
        cancelaciones: Math.max(0, ag - asis),
        llamadas: asis,
        ofertasRealizadas: asis,
        ventas: vt,
        facturado: vt * ticket,
        ticketPromedio: vt > 0 ? ticket : null,
        inversionAds: null,
        objeciones: vt === 0 && asis > 0 ? ['precio', 'tiempo'] : [],
        origenOportunidades: { organico: conv },
        cargadoPor: consultoraId,
      });
    }

    // ----------------------------------------------------------- sesiones
    const cantidadSesiones = Math.floor(dia / 7);
    for (let s = 1; s <= cantidadSesiones; s++) {
      const fecha = addDays(fechaAlta, (s - 1) * 7 + 2);
      if (fecha > hoy) continue;
      const asistio = r() < perfil.asistenciaSesiones;
      const conRegistro = asistio && r() < perfil.registroSesiones;
      const cortada = arq === 'cadencia_rota' && s > cantidadSesiones - 4;
      if (cortada) continue;
      const estadoAgenda = asistio ? 'realizada' : (['cancelada', 'reprogramada', 'no_asistio'] as const)[Math.floor(r() * 3)];
      const seFueEnHerramienta = arq === 'escalada_emocional' ? r() < 0.5 : r() < 0.12;
      d.sesiones.push({
        id: `${id}-s${s}`,
        clienteId: id,
        consultoraId,
        fecha,
        duracionMinutos: 50,
        estadoAgenda,
        tieneGrabacion: conRegistro,
        transcripcionTexto: conRegistro ? `Transcripción de la sesión del ${fecha}. ${REPORTES[s % REPORTES.length]}` : undefined,
        reporte: conRegistro ? REPORTES[s % REPORTES.length] : undefined,
        reporteCargadoAt: conRegistro ? addDays(fecha, r() < 0.3 ? 4 : 0) : undefined,
        mencionoNumeros: conRegistro ? r() > 0.25 : undefined,
        pctHablaCliente: conRegistro ? Math.round(25 + r() * 45) : undefined,
        cerroConCompromiso: conRegistro ? r() > 0.2 : undefined,
        abrioRepasando: conRegistro ? r() > 0.35 : undefined,
        seFueEnHerramienta: conRegistro ? seFueEnHerramienta : undefined,
        temaDeclarado: conRegistro ? 'Avance semanal' : undefined,
        temaTratado: conRegistro ? (r() < 0.15 ? 'Configuración de herramientas' : 'Avance semanal') : undefined,
        satisfaccion: conRegistro && r() < 0.35 ? Math.round(6 + r() * 4) : undefined,
        procesadaAt: conRegistro ? fecha : undefined,
      });

      if (asistio && s % 2 === 0) {
        d.compromisos.push({
          id: `${id}-k${s}`,
          clienteId: id,
          sesionId: `${id}-s${s}`,
          descripcion: TAREAS[(i + s) % TAREAS.length],
          responsable: 'cliente',
          fechaVencimiento: addDays(fecha, 7),
          estado:
            addDays(fecha, 7) > hoy
              ? 'pendiente'
              : r() < perfil.cumplimientoCompromisos
                ? 'cumplido'
                : r() < 0.5
                  ? 'no_cumplido'
                  : 'pendiente',
        });
      }
    }

    // ----------------------------------------------------------- pagos
    const cuotas = 3;
    // La cuota que este arquetipo deja impaga a propósito. Se calcula contra la
    // fecha de hoy para que el estado de cobranza sea el que se quiere mostrar
    // y no el que salga de casualidad.
    const impagaDesde = ((): number | null => {
      // Sólo la última cuota: este arquetipo representa al que se atrasó ahora,
      // no al deudor histórico. Ése es `corte_pendiente`.
      if (arq === 'cuotas_vencidas') return cuotas;
      if (arq === 'corte_pendiente' || arq === 'prorroga_vencida' || arq === 'baja_sin_cerrar') {
        return Math.max(1, Math.min(cuotas, Math.floor((dia - 1) / 30) + 1));
      }
      return null;
    })();

    for (let q = 1; q <= cuotas; q++) {
      let venc = addDays(fechaAlta, (q - 1) * 30);
      // Al arquetipo de corte se le ubica el vencimiento justo del otro lado
      // del margen del contrato: es el caso que la bandeja tiene que gritar.
      if (impagaDesde !== null && q === impagaDesde && arq === 'corte_pendiente') {
        venc = addDays(hoy, -(diasGraciaPago + 1 + Math.floor(r() * 6)));
      }
      if (impagaDesde !== null && q === impagaDesde && arq === 'prorroga_vencida') {
        venc = addDays(hoy, -(diasGraciaPago + 10 + Math.floor(r() * 8)));
      }
      // Los de `cuotas_vencidas` quedan DENTRO del margen del contrato: es el
      // estado en el que la cobranza todavía se resuelve bien, y sin al menos
      // un caso así la pantalla sólo muestra incendios.
      if (impagaDesde !== null && q === impagaDesde && arq === 'cuotas_vencidas') {
        venc = addDays(hoy, -Math.max(1, diasGraciaPago - 1));
      }
      if (impagaDesde !== null && q === impagaDesde && arq === 'baja_sin_cerrar') {
        venc = addDays(hoy, -(diasGraciaPago + 20 + Math.floor(r() * 20)));
      }
      const impago = impagaDesde !== null && q >= impagaDesde;
      const pasado = venc <= hoy;
      d.pagos.push({
        id: `${id}-p${q}`,
        clienteId: id,
        numeroCuota: q,
        monto: Math.round(1500 + r() * 1500),
        moneda: 'USD',
        fechaVencimiento: venc,
        fechaPago: pasado && !impago ? venc : undefined,
        estado: !pasado ? 'pendiente' : impago ? 'vencido' : 'pagado',
      });
    }

    // Lo comercial se deriva de las cuotas recién generadas, no se sortea
    // aparte: si el monto total no fuera la suma de lo pactado, la lista
    // comercial y la de cobranza mostrarían números distintos del mismo
    // cliente y no habría forma de saber cuál creer.
    {
      const suyos = d.pagos.filter((p) => p.clienteId === id);
      const cli = d.clientes.find((c) => c.id === id)!;
      cli.montoTotal = suyos.reduce((a, p) => a + p.monto, 0);
      cli.cantidadCuotas = cuotas;
      const vencidas = suyos.filter((p) => p.estado === 'vencido');
      cli.estadoDeuda = !vencidas.length
        ? 'al_dia'
        : arq === 'baja_sin_cerrar'
          ? 'moroso'
          : arq === 'prorroga_vencida'
            ? 'en_tramite'
            : 'deudor';
    }

    // ----------------------------------------------------------- prórrogas
    if (arq === 'prorroga_vencida' && impagaDesde !== null) {
      const cuota = d.pagos.find((p) => p.clienteId === id && p.numeroCuota === impagaDesde)!;
      d.prorrogas.push({
        id: `${id}-pr1`,
        clienteId: id,
        pagoId: cuota.id,
        diasOtorgados: 15,
        autorizadaPor: 'Vicky',
        autorizadaAt: addDays(cuota.fechaVencimiento, 1),
        nuevaFecha: addDays(cuota.fechaVencimiento, 16),
        motivo: 'Pidió tiempo por un cobro atrasado de su propio cliente.',
      });
    }
    // Prórrogas ya resueltas, para que la tasa de recupero sea un número real y
    // no una promesa. Es la cuenta que hoy nadie tiene: de las excepciones que
    // se dieron, cuántas terminaron en pago.
    if (arq === 'cuotas_vencidas' || (arq === 'en_ritmo' && r() < 0.14) || arq === 'garantia_en_riesgo') {
      const cuota = d.pagos.find(
        (p) => p.clienteId === id && p.numeroCuota === 2 && p.fechaPago !== undefined,
      );
      if (cuota) {
        const pago = r() < 0.3;
        d.prorrogas.push({
          id: `${id}-pr0`,
          clienteId: id,
          pagoId: cuota.id,
          diasOtorgados: 10,
          autorizadaPor: 'Vicky',
          autorizadaAt: addDays(cuota.fechaVencimiento, 1),
          nuevaFecha: addDays(cuota.fechaVencimiento, 11),
          motivo: 'Excepción por única vez.',
          resultado: pago ? 'pago' : 'no_pago',
          resueltaAt: addDays(cuota.fechaVencimiento, 12),
        });
      }
    }

    // ----------------------------------------------------------- bajas
    if (arq === 'baja_sin_cerrar') {
      const fechaBaja = addDays(hoy, -(3 + Math.floor(r() * 12)));
      // El checklist queda a medias exactamente como pasa hoy: se cierran los
      // accesos del campus y el resto queda abierto durante semanas.
      const hechos = new Set(['accesos', 'consultora']);
      d.bajas.push({
        id: `${id}-b1`,
        clienteId: id,
        fecha: fechaBaja,
        motivo: r() < 0.6 ? 'falta_de_pago' : 'voluntaria',
        solicitadaPor: r() < 0.6 ? 'founders' : 'cliente',
        pidioReembolso: r() < 0.25,
        nota: 'Dejó de pagar y no respondió los dos últimos mensajes.',
        pasos: PASOS_BAJA.map((p) => ({
          key: p.key,
          hechoAt: hechos.has(p.key) ? fechaBaja : undefined,
          hechoPor: hechos.has(p.key) ? 'u-vicky' : undefined,
        })),
      });
    }

    // ----------------------------------------------------------- mentorías
    if (arq !== 'sin_mentorias') {
      const mentorias = ['contenido', 'ventas', 'anuncios', 'setteo', 'mentalidad'] as const;
      for (let w = 0; w < Math.min(8, semanas); w++) {
        const fecha = addDays(hoy, -w * 7 - 1);
        if (fecha < fechaAlta) continue;
        const cuantas = arq === 'garantia_en_riesgo' ? (r() < 0.4 ? 1 : 0) : r() < 0.6 ? 2 : 1;
        for (let k = 0; k < cuantas; k++) {
          d.asistencias.push({
            id: `${id}-m${w}-${k}`,
            clienteId: id,
            mentoria: mentorias[(w + k) % mentorias.length],
            fecha,
            asistio: true,
          });
        }
      }
    }

    // ----------------------------------------------------------- hitos
    for (const h of HITOS) {
      if (h.automatico) continue;
      const retraso = perfil.bloques >= 4 ? 0 : 25;
      const efectivo = h.dia + retraso;
      let estado: HitoCliente['estado'] = 'sin_trabajar';
      let cumplidoAt: string | undefined;
      if (dia >= efectivo && perfil.bloques >= 4) {
        estado = 'cumplido';
        cumplidoAt = addDays(fechaAlta, Math.min(dia - 1, efectivo));
      } else if (dia >= efectivo - 12) {
        estado = r() < 0.4 ? 'necesita_ajustes' : 'en_progreso';
      }
      if ((arq === 'volumen_bajo' || arq === 'ejecucion_baja') && h.key === 'kpi_sostenido') {
        estado = 'bloqueado';
        cumplidoAt = undefined;
      }
      if (estado !== 'sin_trabajar') {
        d.hitos.push({
          clienteId: id,
          hitoKey: h.key,
          estado,
          actualizadoAt: cumplidoAt ?? addDays(hoy, -Math.floor(r() * 12)),
          actualizadoPor: consultoraId,
          cumplidoAt,
          confirmadoPor: estado === 'cumplido' && h.confirma === 'admin' ? 'u-vicky' : undefined,
          nota: estado === 'necesita_ajustes' ? 'Falta bajarlo a una sola frase.' : estado === 'bloqueado' ? 'Frenado: no sostiene el volumen acordado.' : undefined,
        });
      }
    }

    // ----------------------------------------------------------- traspaso
    if (arq === 'traspaso_reciente') {
      const origen = CONSULTORAS.find((c) => c.id !== consultoraId)!;
      d.traspasos.push({
        id: `${id}-t1`,
        clienteId: id,
        consultoraOrigenId: origen.id,
        consultoraDestinoId: consultoraId,
        fecha: addDays(hoy, -Math.floor(5 + r() * 20)),
        motivo: 'Redistribución de cartera',
      });
    }

    // ----------------------------------------------------------- lectura
    const percepcion =
      arq === 'escalada_emocional' || arq === 'dia90_sin_venta'
        ? 'riesgo'
        : ['volumen_bajo', 'ejecucion_baja', 'cadencia_rota', 'no_cierra', 'expediente_ciego', 'cuotas_vencidas'].includes(arq)
          ? 'atencion'
          : arq === 'sano_vendiendo' || arq === 'renovacion'
            ? 'muy_bien'
            : 'bien';
    const bloqueo =
      arq === 'volumen_bajo' ? 'adquisicion'
      : arq === 'mensaje_no_convierte' ? 'mensaje'
      : arq === 'no_cierra' || arq === 'no_agenda' || arq === 'no_asiste' ? 'comercial'
      : arq === 'ejecucion_baja' || arq === 'cadencia_rota' ? 'ejecucion'
      : arq === 'escalada_emocional' ? 'emocional'
      : arq === 'expediente_ciego' ? 'operativo'
      : 'ninguno';
    d.lecturas.push({
      id: `${id}-l1`,
      clienteId: id,
      consultoraId,
      fecha: addDays(hoy, -Math.floor(1 + r() * 12)),
      percepcion: percepcion as LecturaConsultora['percepcion'],
      bloqueoDeclarado: bloqueo as LecturaConsultora['bloqueoDeclarado'],
      necesitaIntervencion: arq === 'escalada_emocional' || (arq === 'dia90_sin_venta' && r() < 0.6),
      potencialRenovacion: arq === 'renovacion' || arq === 'sano_vendiendo' ? 'alto' : percepcion === 'riesgo' ? 'bajo' : 'medio',
      comentario:
        arq === 'escalada_emocional'
          ? 'Viene enojado hace tres sesiones y ya mencionó irse. No puedo sola con esto.'
          : arq === 'cadencia_rota'
            ? 'No contesta hace semanas. Le escribí por todos lados.'
            : arq === 'no_cierra'
              ? 'Hace las llamadas pero no diagnostica: presenta.'
              : undefined,
    });

    // ----------------------------------------------------------- alertas de criterio
    // Las emite el modelo desde la transcripción, con cita textual obligatoria.
    if (arq === 'escalada_emocional') {
      const cita = CITAS_ESCALADA[Math.floor(r() * CITAS_ESCALADA.length)];
      const fecha = addDays(hoy, -Math.floor(3 + r() * 10));
      d.alertas.push({
        id: `${id}-a1`,
        clienteId: id,
        codigo: cita.includes('nadie') ? 'CT-N3' : 'CT-R1',
        origen: 'criterio',
        estadoSemaforo: cita.includes('nadie') ? 'negro' : 'rojo',
        titulo: cita.includes('nadie') ? 'Cuestiona al equipo entero' : 'Desesperanza sobre el proceso',
        cuerpo: `${nombre} expresó desánimo sobre el proceso completo, no sobre una tarea puntual. Es la ${1 + Math.floor(r() * 3)}ª vez en las últimas seis semanas.`,
        citaTextual: cita,
        fechaCita: fecha,
        pedido: 'Revisión de caso con alguien que no sea su consultora dentro de 48 h. Definir si hay reencuadre o plan de recuperación.',
        destinatario: cita.includes('nadie') ? 'admin' : 'revision_externa',
        plazoHoras: cita.includes('nadie') ? 0 : 48,
        prioridad: cita.includes('nadie') ? 99 : 88,
        emitidaAt: fecha,
        emitidaEnSemana: mondayOf(fecha),
        diferida: false,
        vecesEmitida: 2,
      });
    }
    if (arq === 'no_cierra' && r() < 0.6) {
      const fecha = addDays(hoy, -Math.floor(4 + r() * 12));
      d.alertas.push({
        id: `${id}-a2`,
        clienteId: id,
        codigo: 'CT-A1',
        origen: 'criterio',
        estadoSemaforo: 'amarillo',
        titulo: 'No puede explicar su oferta en voz alta',
        cuerpo: `Al pedirle que explicara su oferta en la sesión, no pudo sostenerla sin leer.`,
        citaTextual: 'la verdad que todavía no me sale explicarlo, lo tengo escrito pero no me sale',
        fechaCita: fecha,
        pedido: 'Practicar la oferta en voz alta dentro de la próxima sesión, no como tarea.',
        destinatario: 'consultora',
        plazoHoras: 120,
        prioridad: 62,
        emitidaAt: fecha,
        emitidaEnSemana: mondayOf(fecha),
        diferida: false,
        vecesEmitida: 1,
      });
    }
    if (arq === 'ejecucion_baja' && r() < 0.5) {
      const fecha = addDays(hoy, -Math.floor(2 + r() * 10));
      d.alertas.push({
        id: `${id}-a3`,
        clienteId: id,
        codigo: 'CT-A3',
        origen: 'criterio',
        estadoSemaforo: 'amarillo',
        titulo: 'Segunda sesión seguida sin llegar a lo comprometido',
        cuerpo: 'Dos sesiones seguidas abriendo con que no llegó a lo acordado.',
        citaTextual: 'esta semana no llegué, se me complicó con el trabajo',
        fechaCita: fecha,
        pedido: 'Reducir el compromiso a una sola acción y hacerla dentro de la sesión.',
        destinatario: 'consultora',
        plazoHoras: 120,
        prioridad: 64,
        emitidaAt: fecha,
        emitidaEnSemana: mondayOf(fecha),
        diferida: false,
        vecesEmitida: 2,
      });
    }

    // ----------------------------------------------------------- diagnóstico previo
    if (perfil.bloques >= 4 && dia > 45 && r() < 0.35) {
      const fecha = addDays(hoy, -Math.floor(5 + r() * 30));
      const coincidio = r() < 0.6;
      d.diagnosticos.push({
        id: `${id}-d1`,
        clienteId: id,
        consultoraId,
        hipotesisConsultora: 'Creo que el problema es el contenido: no está llegando a la gente correcta.',
        cuelloBotella: bloqueo === 'comercial' ? 'La llamada no diagnostica: presenta demasiado rápido' : 'Volumen insuficiente para concluir sobre el mensaje',
        tipoBloqueo: (bloqueo === 'ninguno' ? 'adquisicion' : bloqueo) as Diagnostico['tipoBloqueo'],
        eslabonRoto: bloqueo === 'comercial' ? 'venta' : 'canal',
        coincidio,
        payload: {} as Diagnostico['payload'],
        promptVersion: 'diag-1.0',
        modelo: 'criterio',
        createdAt: fecha,
      });
    }
  }

  return d;
}

export function resumenDataset(d: DatasetDemo) {
  return {
    clientes: d.clientes.length,
    sesiones: d.sesiones.length,
    metricas: d.metricas.length,
    semanasSinCargar: d.metricas.filter((m) => m.dmsIniciados === null).length,
    alertasCriterio: d.alertas.length,
  };
}

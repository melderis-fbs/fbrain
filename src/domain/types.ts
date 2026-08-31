/**
 * FOUNDERS BRAIN — modelo de dominio unificado
 *
 * Vocabulario: el del paquete de Brain. Consultora, expediente, semáforo,
 * eslabón, tipo de bloqueo. El equipo lee estas tablas, así que se llaman como
 * el equipo las llama.
 *
 * Regla que ordena todo el modelo: se persiste lo que no se puede derivar.
 * El semáforo, la fase del negocio, la completitud del expediente, la timeline
 * y el índice de avance son cálculo, no columnas.
 */

// ---------------------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------------------

export type RolUsuario = 'consultora' | 'admin';

export interface Consultora {
  id: string;
  nombre: string;
  email: string;
  rol: RolUsuario;
  cupoMaximo: number;
  aceptaNuevos: boolean;
  activa: boolean;
  color: string;
  /**
   * «Que levante la mano si se siente apabullada.» Lo declara ella y no se
   * deduce del cupo: se puede estar al tope y bien, o con ocho clientes y
   * fundida. Es un dato de entrada, no una inferencia.
   */
  manoLevantadaAt?: string;
  manoLevantadaNota?: string;
  /** Sesiones agendadas sin margen entre una y otra en los últimos 14 días. */
  sesionesBackToBack?: number;
}

// ---------------------------------------------------------------------------
// Bloque 1 · Identidad
// ---------------------------------------------------------------------------

export type EstadoCliente = 'activo' | 'pausado' | 'finalizado' | 'perdido';

export interface Cliente {
  id: string;
  nombre: string;
  email?: string;
  telefono?: string;
  programa: string;
  fechaAlta: string;
  fechaFinPrevista?: string;
  planPago?: string;
  tieneGarantia: boolean;
  fuente?: string;
  consultoraId?: string;
  estado: EstadoCliente;
  driveFolderId?: string;
  /** Declaradas en la sesión 1. El plan se arma contra este número, no contra las del pitch. */
  horasRealesSemana?: number;
  /**
   * Margen de pago que firmó ESTE cliente. Los contratos viejos dicen 5 días,
   * los nuevos 3. Aplicar la condición nueva a un contrato viejo es
   * indefendible, así que el número vive en el cliente y no en una constante.
   */
  diasGraciaPago?: number;
  /**
   * El negocio que trajo no corresponde al nivel del producto que compró.
   * Sale de la llamada de venta o del onboarding y es un problema de
   * asignación, no del cliente ni de la consultora que lo recibe.
   */
  nivelDesalineado?: boolean;
  /** Qué se le vendió, para poder contrastarlo con lo que trajo. */
  nivelVendido?: string;

  // --- lo comercial, tal como lo lleva finanzas -----------------------------

  /** Quién cerró la venta. Sirve para leer la cartera por origen, no para culpar. */
  closer?: string;
  /** Quién la agendó. */
  setter?: string;
  /**
   * Lo contratado. No es la suma de las cuotas cargadas: si faltan cuotas por
   * cargar, este número sigue siendo el bueno y la diferencia es lo que hay
   * que mirar.
   */
  montoTotal?: number;
  /** En cuántas cuotas se pactó. Cuántas están pagas sale de `pagos`. */
  cantidadCuotas?: number;
  /**
   * El juicio de finanzas sobre el cobro, que no siempre coincide con la
   * aritmética de vencimientos: se puede tener una cuota vencida y estar
   * "en trámite" porque el cliente ya avisó que paga el martes.
   */
  estadoDeuda?: EstadoDeuda;
  /** Notas libres. Van al expediente como lo que son: algo que alguien anotó. */
  notas?: string;
}

/**
 * Los estados de cobro que escribe finanzas. `al_dia` es el estado por
 * defecto y por eso casi nunca está escrito en la planilla: se asume cuando la
 * celda está vacía.
 */
export type EstadoDeuda = 'al_dia' | 'deudor' | 'moroso' | 'en_tramite' | 'incobrable';

export const ESTADO_DEUDA_LABEL: Record<EstadoDeuda, string> = {
  al_dia: 'Al día',
  deudor: 'Deudor',
  moroso: 'Moroso',
  en_tramite: 'En trámite',
  incobrable: 'Incobrable',
};

export interface Traspaso {
  id: string;
  clienteId: string;
  consultoraOrigenId?: string;
  consultoraDestinoId: string;
  fecha: string;
  motivo?: string;
}

// ---------------------------------------------------------------------------
// Bloque 2 · Negocio
// ---------------------------------------------------------------------------

export interface Negocio {
  clienteId: string;
  queVende?: string;
  aQuien?: string;
  precio?: number;
  moneda: string;
  comoEntrega?: string;
  facturacionMensual?: number;
  cantidadClientes?: number;
  origenClientes?: string;
  queFunciono?: string;
  queNoFunciono?: string;
  actualizadoAt: string;
}

// ---------------------------------------------------------------------------
// Bloque 3 · Autoridad
// ---------------------------------------------------------------------------

export interface Autoridad {
  clienteId: string;
  haceExcepcionalmenteBien?: string;
  experienciaProfesional?: string;
  resultadosPropios?: string;
  resultadosTerceros?: string;
  industriasQueConoce: string[];
  autoridadDesperdiciada?: string;
  actualizadoAt: string;
}

// ---------------------------------------------------------------------------
// Bloque 4 · Estrategia vigente · APPEND-ONLY
// ---------------------------------------------------------------------------

export type Iniciativa = 'consultora' | 'cliente' | 'conjunta';

export interface EstrategiaVersion {
  id: string;
  clienteId: string;
  version: number;
  clienteIdeal?: string;
  problema?: string;
  deseo?: string;
  promesa?: string;
  oferta?: string;
  mecanismo?: string;
  canal?: string;
  precio?: number;
  moneda: string;
  vigenteDesde: string;
  motivoCambio?: string;
  /** Un cambio de precio a iniciativa del cliente, sin llamada de venta, es alerta roja. */
  iniciativa?: Iniciativa;
  sesionId?: string;
  creadaPor?: string;
}

// ---------------------------------------------------------------------------
// Objetivo comercial · la cuenta inversa desde la meta
// ---------------------------------------------------------------------------

export interface ObjetivoComercial {
  id: string;
  clienteId: string;
  metaMensual: number;
  ticket: number;
  moneda: string;
  /** Tasas del embudo usadas para la cuenta inversa. Si no se midieron, se usan las de objetivo. */
  tasaCierre: number;
  tasaAsistencia: number;
  tasaAgendamiento: number;
  tasaAvance: number;
  tasaDmSobreAlcance: number;
  /** Día del programa en el que empieza a prospectar de verdad */
  diaInicioProspeccion: number;
  vigenteDesde: string;
  creadoPor?: string;
}

// ---------------------------------------------------------------------------
// Bloque 5 · Números · una fila por cliente y semana
// null ≠ 0. Cero conversaciones es un dato; "no sabemos" es otro.
// ---------------------------------------------------------------------------

export interface MetricaSemanal {
  id: string;
  clienteId: string;
  semanaIso: string;
  contenidoPublicado: number | null;
  alcanceTotal: number | null;
  alcanceNoSeguidores: number | null;
  dmsIniciados: number | null;
  conversacionesAvanzadas: number | null;
  leads: number | null;
  leadsCalificados: number | null;
  agendas: number | null;
  asistencias: number | null;
  cancelaciones: number | null;
  llamadas: number | null;
  ofertasRealizadas: number | null;
  ventas: number | null;
  facturado: number | null;
  ticketPromedio: number | null;
  inversionAds: number | null;
  objeciones: string[];
  origenOportunidades: Record<string, number>;
  cargadoPor?: string;
}

export type EstadoPago = 'pendiente' | 'pagado' | 'vencido' | 'incobrable';

export interface Pago {
  id: string;
  clienteId: string;
  numeroCuota: number;
  monto: number;
  moneda: string;
  fechaVencimiento: string;
  fechaPago?: string;
  estado: EstadoPago;
}

/**
 * Una prórroga es una excepción autorizada, con nombre y con fecha. Antes era
 * un mensaje de WhatsApp que nadie volvía a mirar; por eso «creo que uno o dos
 * cumplieron» era lo mejor que se podía decir sobre si conviene darlas.
 * `resultado` es la columna que convierte esa impresión en una política.
 */
export interface Prorroga {
  id: string;
  clienteId: string;
  pagoId: string;
  diasOtorgados: number;
  autorizadaPor: string;
  autorizadaAt: string;
  nuevaFecha: string;
  motivo?: string;
  resultado?: 'pago' | 'no_pago';
  resueltaAt?: string;
}

export type MotivoBaja = 'falta_de_pago' | 'voluntaria' | 'reembolso' | 'fin_programa';

export type PasoBajaKey =
  | 'accesos' | 'telegram' | 'comunidad' | 'mentorias'
  | 'cobros' | 'drive' | 'consultora' | 'post_mortem';

export interface PasoBaja {
  key: PasoBajaKey;
  hechoAt?: string;
  hechoPor?: string;
}

/**
 * La baja no es un cambio de estado: es una lista de cosas que hay que hacer
 * y que se olvidan de a una. Sobre todo una.
 */
export interface Baja {
  id: string;
  clienteId: string;
  fecha: string;
  motivo: MotivoBaja;
  solicitadaPor: 'cliente' | 'founders';
  pidioReembolso: boolean;
  nota?: string;
  pasos: PasoBaja[];
}

/**
 * Corrección humana de la atribución automática. El motor propone; una persona
 * puede decir lo contrario, pero tiene que escribir por qué y queda firmado.
 */
export interface AtribucionManual {
  id: string;
  clienteId: string;
  responsable: 'cliente' | 'nosotros' | 'ambos' | 'sin_datos' | 'ninguno';
  texto: string;
  por: string;
  at: string;
}

/**
 * La revisión de caso: el veredicto que hoy Jhosanna produce escuchando al
 * coach, leyendo el resumen, analizando las llamadas y escuchando al cliente.
 * Lo que la app puede hacer es armarle la película; la conclusión sigue siendo
 * de una persona y por eso se escribe.
 */
export interface RevisionCaso {
  id: string;
  clienteId: string;
  revisadaPor: string;
  fecha: string;
  responsable: 'cliente' | 'nosotros' | 'ambos' | 'sin_datos';
  veredicto: string;
  accionAcordada: string;
  /** A quién le queda la pelota */
  responsableAccion: string;
  fechaSeguimiento?: string;
}

export type Mentoria = 'contenido' | 'ventas' | 'anuncios' | 'setteo' | 'mentalidad';

export interface AsistenciaMentoria {
  id: string;
  clienteId: string;
  mentoria: Mentoria;
  fecha: string;
  asistio: boolean;
}

// ---------------------------------------------------------------------------
// Bloque 6 · Trazabilidad
// ---------------------------------------------------------------------------

export type EstadoAgenda = 'realizada' | 'cancelada' | 'reprogramada' | 'no_asistio';

export interface Sesion {
  id: string;
  clienteId: string;
  consultoraId?: string;
  fecha: string;
  duracionMinutos?: number;
  estadoAgenda: EstadoAgenda;
  tieneGrabacion: boolean;
  transcripcionTexto?: string;
  transcripcionPath?: string;
  reporte?: string;
  reporteCargadoAt?: string;
  // Señales de la familia B: las ausencias también son señal
  mencionoNumeros?: boolean;
  pctHablaCliente?: number;
  cerroConCompromiso?: boolean;
  abrioRepasando?: boolean;
  seFueEnHerramienta?: boolean;
  temaDeclarado?: string;
  temaTratado?: string;
  /** 0-10, una pregunta al cierre. Hoy esta casilla está vacía en 818 filas. */
  satisfaccion?: number;
  procesadaAt?: string;
}

export type EstadoCompromiso = 'pendiente' | 'cumplido' | 'no_cumplido';

export interface Compromiso {
  id: string;
  clienteId: string;
  sesionId?: string;
  descripcion: string;
  responsable: string;
  fechaVencimiento: string;
  estado: EstadoCompromiso;
  notaCierre?: string;
}

// ---------------------------------------------------------------------------
// Lectura de la consultora
// Brain captura criterio con cita textual. Esto es lo otro: el juicio que
// ninguna transcripción detecta. No se promedia como dato: emite alertas.
// ---------------------------------------------------------------------------

export type PercepcionConsultora = 'muy_bien' | 'bien' | 'atencion' | 'riesgo';

export type TipoBloqueo =
  | 'estrategico'
  | 'mensaje'
  | 'adquisicion'
  | 'comercial'
  | 'entrega'
  | 'operativo'
  | 'ejecucion'
  | 'emocional';

export type Eslabon =
  | 'cliente'
  | 'problema'
  | 'deseo'
  | 'oferta'
  | 'promesa'
  | 'mensaje'
  | 'canal'
  | 'lead'
  | 'setting'
  | 'venta'
  | 'entrega'
  | 'resultado';

export type Potencial = 'alto' | 'medio' | 'bajo';

export interface LecturaConsultora {
  id: string;
  clienteId: string;
  consultoraId: string;
  sesionId?: string;
  fecha: string;
  percepcion: PercepcionConsultora;
  bloqueoDeclarado: TipoBloqueo | 'ninguno';
  necesitaIntervencion: boolean;
  potencialRenovacion: Potencial;
  comentario?: string;
}

// ---------------------------------------------------------------------------
// Hitos · el reloj del programa
// ---------------------------------------------------------------------------

export type EstadoHito = 'sin_trabajar' | 'en_progreso' | 'necesita_ajustes' | 'bloqueado' | 'cumplido';

export interface HitoCliente {
  clienteId: string;
  hitoKey: string;
  estado: EstadoHito;
  nota?: string;
  actualizadoAt: string;
  actualizadoPor?: string;
  cumplidoAt?: string;
  confirmadoPor?: string;
}

// ---------------------------------------------------------------------------
// Alertas · el corazón de Brain
// ---------------------------------------------------------------------------

export type Semaforo = 'verde' | 'amarillo' | 'rojo' | 'negro';
export type OrigenAlerta = 'regla_dura' | 'criterio' | 'lectura';
export type DestinatarioAlerta = 'consultora' | 'revision_externa' | 'admin';

export interface Alerta {
  id: string;
  clienteId: string;
  sesionId?: string;
  codigo: string;
  origen: OrigenAlerta;
  estadoSemaforo: Semaforo;
  titulo: string;
  cuerpo: string;
  /** Obligatoria si origen = 'criterio'. Sin cita es interpretación y se discute. */
  citaTextual?: string;
  fechaCita?: string;
  pedido: string;
  destinatario: DestinatarioAlerta;
  plazoHoras: number;
  prioridad: number;
  emitidaAt: string;
  emitidaEnSemana: string;
  diferida: boolean;
  cerradaAt?: string;
  cerradaPor?: string;
  textoCierre?: string;
  escaladaAId?: string;
  vecesEmitida: number;
}

// ---------------------------------------------------------------------------
// Motores
// ---------------------------------------------------------------------------

export type TipoEvidencia = 'hecho' | 'hipotesis';

export interface Evidencia {
  afirmacion: string;
  tipo: TipoEvidencia;
  fuenteTipo?: string;
  fuenteId?: string;
  fecha?: string;
  cita?: string;
}

/**
 * Lo que el consultor sube: transcripciones, la llamada de venta, el
 * formulario de onboarding, un contrato. Es la materia prima del expediente y
 * del diagnóstico, y por eso vive con el cliente y no en el corpus del método.
 */
export type TipoDocumento =
  | 'transcripcion'
  | 'llamada_venta'
  | 'formulario_onboarding'
  | 'contrato'
  | 'reporte'
  | 'otro';

export interface DocumentoCliente {
  id: string;
  clienteId: string;
  tipo: TipoDocumento;
  titulo: string;
  contenido: string;
  /** La fecha del hecho, no la de la carga: una transcripción es de su sesión. */
  fecha: string;
  subidoPor?: string;
  creadoAt: string;
  /** Si la carga vino de un archivo, cuál. Sirve para no subir dos veces lo mismo. */
  archivo?: string;
}

export interface Diagnostico {
  id: string;
  clienteId: string;
  consultoraId: string;
  pregunta?: string;
  /** Obligatoria antes de ver la respuesta. Convierte cada consulta en entrenamiento. */
  hipotesisConsultora: string;
  cuelloBotella: string;
  tipoBloqueo: TipoBloqueo;
  eslabonRoto: Eslabon;
  coincidio?: boolean;
  payload: DiagnosticoPayload;
  promptVersion: string;
  modelo: string;
  createdAt: string;
}

export interface DiagnosticoPayload {
  diagnostico: string[];
  cuelloBotella: string;
  tipoBloqueo: TipoBloqueo;
  eslabonRoto: Eslabon;
  evidencia: Evidencia[];
  queNoHaria: string[];
  hipotesisPrincipal: string;
  planAccion: { accion: string; responsable: string }[];
  metricas: { metrica: string; valorPartida?: string }[];
  checkpoint: string;
  criterioDecision: { continuar: string; corregir: string; replantear: string };
  preguntasAbiertas: string[];
  precedentesCitados: string[];
  principioFounders: string;
  porQue: string;
}

export type DimensionScore =
  | 'cliente_ideal' | 'problema' | 'deseo' | 'oferta' | 'promesa' | 'mensaje'
  | 'autoridad' | 'adquisicion' | 'volumen' | 'ventas' | 'entrega' | 'ejecucion';

export interface ScoreItem {
  dimension: DimensionScore;
  valor: number | null;
  evidencia: string;
  datoFaltante?: string;
  esLimitante: boolean;
}

export interface ScoreComercial {
  id: string;
  clienteId: string;
  items: ScoreItem[];
  lecturaGeneral: string;
  promptVersion: string;
  createdAt: string;
}

export type VeredictoCoherencia = 'coherente' | 'parcial' | 'incoherente';

export interface CoherenciaTest {
  id: string;
  clienteId: string;
  materialTipo: string;
  materialTexto: string;
  perfilInferidoCiego: Record<string, unknown>;
  veredicto: VeredictoCoherencia;
  payload: Record<string, unknown>;
  promptVersion: string;
  createdAt: string;
}

export interface Sprint {
  id: string;
  clienteId: string;
  numero: number;
  objetivo: string;
  hipotesis?: string;
  acciones: { accion: string; responsable: string }[];
  metrica: string;
  resultadoEsperado?: string;
  fechaInicio: string;
  fechaRevision: string;
  resultadoReal?: string;
}

export interface CasoPerdido {
  id: string;
  clienteId: string;
  fecha: string;
  motivo: string;
  pidioReembolso: boolean;
  alertasSinCerrar: number;
  postMortem?: string;
  postMortemAt?: string;
}

// ---------------------------------------------------------------------------
// Timeline derivada
// ---------------------------------------------------------------------------

export type TipoEventoTimeline =
  | 'alta' | 'sesion' | 'hito' | 'estrategia' | 'venta' | 'alerta'
  | 'compromiso' | 'pago' | 'traspaso' | 'diagnostico' | 'perdido';

export interface EventoTimeline {
  at: string;
  tipo: TipoEventoTimeline;
  titulo: string;
  detalle?: string;
  cita?: string;
  tono: 'neutral' | 'bueno' | 'malo';
}

import type {
  Alerta, AsistenciaMentoria, AtribucionManual, Autoridad, Baja, Cliente, Compromiso, Consultora,
  Diagnostico, DocumentoCliente, EstrategiaVersion, HitoCliente, LecturaConsultora, MetricaSemanal,
  Negocio, ObjetivoComercial, Pago, Prorroga, PropuestaFicha, RevisionCaso, Sesion, Traspaso,
} from '@/domain/types';

export interface Dataset {
  equipo: Consultora[];
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
  documentos: DocumentoCliente[];
  propuestas: PropuestaFicha[];
  prorrogas: Prorroga[];
  bajas: Baja[];
  atribuciones: AtribucionManual[];
  revisiones: RevisionCaso[];
}

export interface CierreAlerta {
  alertaId: string;
  texto: string;
  cerradaPor: string;
}

/**
 * La app nunca habla con Postgres directamente: habla con este contrato.
 * Eso permite correr Brain entero sin base de datos, testear los motores sin
 * infraestructura, y cambiar de proveedor sin tocar una pantalla.
 */
export interface Repo {
  readonly modo: 'demo' | 'supabase';
  cargarTodo(hoy: string): Promise<Dataset>;
  /** La ficha: los datos del cliente que hoy sólo se podían cargar por CSV. */
  guardarCliente(c: Cliente): Promise<void>;
  guardarNegocio(n: Negocio): Promise<void>;
  guardarAutoridad(a: Autoridad): Promise<void>;
  guardarObjetivo(o: ObjetivoComercial): Promise<void>;
  /** Lo que entra desde la planilla consolidada. */
  guardarPago(p: Pago): Promise<void>;
  guardarAsistencia(a: AsistenciaMentoria): Promise<void>;
  /** Los documentos que sube el consultor: transcripciones, llamada de venta. */
  guardarDocumento(d: DocumentoCliente): Promise<void>;
  borrarDocumento(id: string): Promise<void>;
  /**
   * El borrador de ficha que dejó el extractor. Se guarda en vez de aplicarse:
   * quien decide si un dato entra al expediente es la persona que atiende al
   * cliente, no el barrido.
   */
  guardarPropuestaFicha(p: PropuestaFicha): Promise<void>;
  borrarPropuestaFicha(clienteId: string): Promise<void>;
  guardarSesion(s: Sesion): Promise<void>;
  guardarMetrica(m: MetricaSemanal): Promise<void>;
  guardarCompromiso(c: Compromiso): Promise<void>;
  guardarHito(h: HitoCliente): Promise<void>;
  guardarLectura(l: LecturaConsultora): Promise<void>;
  guardarEstrategia(e: EstrategiaVersion): Promise<void>;
  guardarDiagnostico(d: Diagnostico): Promise<void>;
  cerrarAlerta(c: CierreAlerta, hoy: string): Promise<void>;
  crearAlerta(a: Alerta): Promise<void>;
  guardarProrroga(p: Prorroga): Promise<void>;
  guardarBaja(b: Baja): Promise<void>;
  /**
   * El traspaso es el momento de mayor mortandad de la cartera, así que se
   * registra explícitamente en vez de deducirlo de que el `consultora_id`
   * cambió. Sin la fila no hay fecha, no hay motivo y no hay nada que mirar
   * cuando tres semanas después el cliente se va.
   */
  guardarTraspaso(t: Traspaso): Promise<void>;
  guardarAtribucion(a: AtribucionManual): Promise<void>;
  guardarRevision(r: RevisionCaso): Promise<void>;
}

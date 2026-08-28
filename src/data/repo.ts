import type {
  Alerta, AsistenciaMentoria, AtribucionManual, Autoridad, Baja, Cliente, Compromiso, Consultora,
  Diagnostico, EstrategiaVersion, HitoCliente, LecturaConsultora, MetricaSemanal,
  Negocio, ObjetivoComercial, Pago, Prorroga, RevisionCaso, Sesion, Traspaso,
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
  guardarAtribucion(a: AtribucionManual): Promise<void>;
  guardarRevision(r: RevisionCaso): Promise<void>;
}

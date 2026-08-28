/**
 * EL MAPEO DE COLUMNAS DE LA PLANILLA
 *
 * `09-integraciones` es explícito: el mapeo va en configuración, no
 * hardcodeado, porque las planillas cambian de forma. Cambiar el nombre de una
 * columna en Drive no debería requerir tocar código en ningún otro archivo que
 * éste.
 *
 * Cada campo lista los encabezados que lo identifican. Se comparan
 * normalizados —sin acentos, sin mayúsculas, sin puntuación— así que
 * "Facturación mensual", "facturacion_mensual" y "FACTURACION MENSUAL" son el
 * mismo. El primero que aparezca en la fila gana.
 */

export const SOLAPAS = {
  clientes: process.env.SHEETS_SOLAPA_CLIENTES || 'Clientes',
  metricas: process.env.SHEETS_SOLAPA_METRICAS || 'Metricas',
  pagos: process.env.SHEETS_SOLAPA_PAGOS || 'Pagos',
  asistencias: process.env.SHEETS_SOLAPA_ASISTENCIAS || 'Asistencias',
} as const;

export type Mapeo = Record<string, string[]>;

/** Solapa 1 · lo de finanzas tal como está, más el expediente al final. */
export const CLIENTES: Mapeo = {
  nombre: ['nombre', 'cliente', 'nombre y apellido'],
  email: ['email', 'mail', 'correo'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp'],
  fuente: ['fuente', 'fuente de captacion', 'origen'],
  programa: ['programa', 'producto'],
  montoTotal: ['monto total', 'total', 'valor total'],
  cantidadCuotas: ['cuotas', 'cantidad de cuotas', 'nro cuotas'],
  moneda: ['moneda', 'divisa'],
  estatusFinanciero: ['estatus', 'estado deuda', 'estado de deuda'],
  reembolso: ['reembolso'],
  terminado: ['terminado', 'completado'],
  notas: ['notas', 'observaciones'],

  // --- expediente ---
  fechaAlta: ['fecha alta', 'fecha de alta', 'fecha de ingreso', 'fecha de ingreso 1er pago', 'ingreso'],
  fechaFinPrevista: ['fecha fin prevista', 'fin previsto', 'fecha de fin'],
  planPago: ['plan pago', 'plan de pago'],
  tieneGarantia: ['garantia', 'tiene garantia'],
  horasRealesSemana: ['horas reales semana', 'horas reales', 'horas por semana'],
  estado: ['estado cliente', 'estado'],
  consultora: ['consultora', 'coach', 'consultor', 'consultora asignada'],
  diasGraciaPago: ['dias gracia pago', 'dias de gracia'],
  nivelVendido: ['nivel vendido', 'que se le vendio'],

  queVende: ['que vende', 'qué vende'],
  aQuien: ['a quien', 'a quién'],
  negocioPrecio: ['precio'],
  comoEntrega: ['como entrega', 'cómo entrega'],
  facturacionMensual: ['facturacion mensual', 'facturación mensual'],
  cantidadClientes: ['cantidad clientes', 'cuantos clientes'],
  origenClientes: ['origen clientes', 'de donde vienen'],
  queFunciono: ['que funciono', 'qué funcionó'],
  queNoFunciono: ['que no funciono', 'qué no funcionó'],

  haceExcepcionalmenteBien: ['hace excepcionalmente bien'],
  experienciaProfesional: ['experiencia profesional', 'experiencia'],
  resultadosPropios: ['resultados propios'],
  resultadosTerceros: ['resultados terceros', 'resultados para terceros'],
  industriasQueConoce: ['industrias que conoce', 'industrias'],
  autoridadDesperdiciada: ['autoridad desperdiciada'],

  clienteIdeal: ['cliente ideal'],
  problema: ['problema'],
  deseo: ['deseo'],
  oferta: ['oferta'],
  promesa: ['promesa'],
  mecanismo: ['mecanismo'],
  canal: ['canal'],
  estrategiaPrecio: ['precio estrategia', 'precio de la oferta'],
  motivoCambio: ['motivo cambio', 'motivo del cambio'],

  metaMensual: ['meta mensual', 'meta'],
  ticket: ['ticket', 'ticket promedio objetivo'],
};

/**
 * Las cuatro cuotas de la planilla de finanzas, en formato ancho. Cada una se
 * convierte en una fila de `pagos`. Se soportan hasta cuatro porque son las
 * que tiene la planilla; agregar una quinta es agregar una entrada acá.
 */
export const CUOTAS: { monto: string[]; fecha: string[]; metodo: string[]; estado: string[] }[] = [
  {
    monto: ['primer pago', '1er pago', 'pago 1'],
    fecha: ['fecha de ingreso 1er pago', 'fecha 1er pago', 'fecha primer pago', 'fecha de ingreso'],
    metodo: ['met pago 1', 'metodo pago 1'],
    estado: ['estado pago 1', 'estado 1er pago'],
  },
  {
    monto: ['segundo pago', '2do pago', 'pago 2'],
    fecha: ['fecha 2do pago', 'fecha segundo pago'],
    metodo: ['met pago 2', 'metodo pago 2'],
    estado: ['estado pago 2', 'estado 2do pago'],
  },
  {
    monto: ['tercer pago', '3er pago', 'pago 3'],
    fecha: ['fecha 3er pago', 'fecha tercer pago'],
    metodo: ['met pago 3', 'metodo pago 3'],
    estado: ['estado pago 3', 'estado 3er pago'],
  },
  {
    monto: ['cuarto pago', '4to pago', 'pago 4'],
    fecha: ['fecha 4to pago', 'fecha cuarto pago'],
    metodo: ['met pago 4', 'metodo pago 4'],
    estado: ['estado 4to pago', 'estado pago 4'],
  },
];

/** Solapa 2 · una fila por cliente por semana. */
export const METRICAS: Mapeo = {
  cliente: ['cliente', 'nombre'],
  semana: ['semana', 'semana iso', 'lunes'],
  contenidoPublicado: ['contenido publicado', 'contenido'],
  alcanceTotal: ['alcance total', 'alcance'],
  alcanceNoSeguidores: ['alcance no seguidores'],
  dmsIniciados: ['dms iniciados', 'dms'],
  conversacionesAvanzadas: ['conversaciones avanzadas', 'conversaciones'],
  leads: ['leads'],
  leadsCalificados: ['leads calificados'],
  agendas: ['agendas'],
  asistencias: ['asistencias'],
  cancelaciones: ['cancelaciones'],
  ofertasRealizadas: ['ofertas realizadas', 'ofertas'],
  ventas: ['ventas'],
  facturado: ['facturado'],
  ticketPromedio: ['ticket promedio'],
  inversionAds: ['inversion ads', 'inversión en ads', 'ads'],
};

/** Solapa 3 · pagos en formato largo, si preferís una fila por cuota. */
export const PAGOS: Mapeo = {
  cliente: ['cliente', 'nombre'],
  numeroCuota: ['cuota', 'numero cuota', 'nro cuota'],
  monto: ['monto', 'importe'],
  moneda: ['moneda'],
  fechaVencimiento: ['vencimiento', 'fecha vencimiento', 'fecha de vencimiento'],
  fechaPago: ['fecha pago', 'fecha de pago', 'pagado el'],
  estado: ['estado', 'estado pago'],
};

/** Solapa 4 · asistencias a mentorías. */
export const ASISTENCIAS: Mapeo = {
  cliente: ['cliente', 'nombre'],
  mentoria: ['mentoria', 'mentoría', 'modulo', 'módulo'],
  fecha: ['fecha'],
  asistio: ['asistio', 'asistió', 'presente'],
};

/** Cómo se leen los estados de pago que escribe finanzas. */
export const ESTADO_PAGO: Record<string, 'pagado' | 'pendiente' | 'vencido' | 'incobrable'> = {
  pagado: 'pagado',
  pago: 'pagado',
  ok: 'pagado',
  si: 'pagado',
  cobrado: 'pagado',
  pendiente: 'pendiente',
  'por vencer': 'pendiente',
  vencido: 'vencido',
  atrasado: 'vencido',
  deuda: 'vencido',
  incobrable: 'incobrable',
  perdido: 'incobrable',
  reembolsado: 'incobrable',
};

export const ESTADO_CLIENTE: Record<string, 'activo' | 'pausado' | 'finalizado' | 'perdido'> = {
  activo: 'activo',
  activa: 'activo',
  'en curso': 'activo',
  pausado: 'pausado',
  pausa: 'pausado',
  pausada: 'pausado',
  finalizado: 'finalizado',
  graduado: 'finalizado',
  terminado: 'finalizado',
  completado: 'finalizado',
  perdido: 'perdido',
  baja: 'perdido',
  cancelado: 'perdido',
};

export const MENTORIAS = ['contenido', 'ventas', 'anuncios', 'setteo', 'mentalidad'] as const;

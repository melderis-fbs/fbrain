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

/**
 * Tres solapas, no cuatro. Las métricas semanales NO vienen de la planilla:
 * viven en la base del CRM y se cargan desde `/clientes/[id]/tracker`. Tenerlas
 * en los dos lados obliga a decidir cuál gana cada vez que difieren, y la
 * respuesta correcta —la que cargó la consultora mirando el caso— es
 * justamente la que una importación diaria pisaría sin avisar.
 */
export const SOLAPAS = {
  clientes: process.env.SHEETS_SOLAPA_CLIENTES ?? 'Seguimiento clientes',
  pagos: process.env.SHEETS_SOLAPA_PAGOS ?? '',
  asistencias: process.env.SHEETS_SOLAPA_ASISTENCIAS ?? '',
} as const;

/**
 * Las dos últimas van vacías a propósito. La planilla de Founders hoy no tiene
 * una solapa de pagos en formato largo —las cuotas están en columnas dentro de
 * «Seguimiento clientes»— ni una de asistencias. Una solapa vacía se saltea con
 * un renglón que lo dice, en vez de reportar un error que no lo es. El día que
 * existan, alcanza con nombrarlas en `SHEETS_SOLAPA_PAGOS` y
 * `SHEETS_SOLAPA_ASISTENCIAS`.
 */

/**
 * La planilla no tiene columna de moneda y sus importes están en dólares: un
 * «Monto total» de 5.000 con cuotas de 2.000, 1.500 y 1.500. El método de pago
 * dice «Transferencia ARS» o «Zelle», pero el importe ya viene convertido. Si
 * algún día se cargan importes en pesos, esto se cambia sin tocar código.
 */
export const MONEDA_POR_DEFECTO = process.env.SHEETS_MONEDA || 'USD';

export type Mapeo = Record<string, string[]>;

/**
 * Qué parte del expediente llena cada campo.
 *
 * Existe para una sola cosa: que la pantalla no muestre los 47 campos en una
 * lista plana. Vista así, alguien que compara con su planilla de finanzas —que
 * tiene quince— concluye razonablemente que no va a funcionar. Y no es que
 * falten columnas: los otros treinta y dos son del expediente, se cargan desde
 * la ficha, y agregarlos a la planilla sería trabajo al pedo.
 */
export const ORIGEN: Record<string, 'planilla' | 'ficha'> = {
  // Lo que la planilla de finanzas efectivamente tiene.
  nombre: 'planilla', email: 'planilla', telefono: 'planilla', fuente: 'planilla',
  programa: 'planilla', montoTotal: 'planilla', cantidadCuotas: 'planilla',
  estadoDeuda: 'planilla', closer: 'planilla', setter: 'planilla', notas: 'planilla',
  fechaAlta: 'planilla', tieneGarantia: 'planilla', estado: 'planilla',
  consultora: 'planilla',
};

/** Todo lo que no está arriba lo carga la consultora en la ficha. */
export const esDePlanilla = (campo: string) => ORIGEN[campo] === 'planilla';

/** Solapa 1 · lo de finanzas tal como está, más el expediente al final. */
export const CLIENTES: Mapeo = {
  nombre: ['nombre', 'cliente', 'nombre y apellido'],
  email: ['email', 'mail', 'correo'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp'],
  fuente: ['fuente', 'fuente de captacion', 'origen'],
  programa: ['programa', 'producto'],
  moneda: ['moneda', 'divisa'],

  // --- lo comercial, tal como lo lleva finanzas ---
  montoTotal: ['monto total', 'valor total'],
  cantidadCuotas: ['cuotas', 'cantidad de cuotas', 'nro cuotas'],
  estadoDeuda: ['estado deuda', 'estado de deuda'],
  closer: ['closer', 'cerro', 'vendedor'],
  setter: ['setter', 'agendo'],
  notas: ['notas', 'observaciones'],

  // --- expediente ---
  fechaAlta: ['fecha alta', 'fecha de alta', 'fecha de ingreso', 'fecha de ingreso 1er pago'],
  fechaFinPrevista: ['fecha fin prevista', 'fin previsto', 'fecha de fin'],
  planPago: ['plan pago', 'plan de pago'],
  tieneGarantia: ['garantia', 'tiene garantia'],
  horasRealesSemana: ['horas reales semana', 'horas reales', 'horas por semana'],
  estado: ['estado cliente', 'estatus', 'estado'],
  consultora: ['consultor/a', 'consultora', 'coach', 'consultor', 'consultora asignada'],
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

/** Solapa 2 · pagos en formato largo, si preferís una fila por cuota. */
export const PAGOS: Mapeo = {
  cliente: ['cliente', 'nombre'],
  numeroCuota: ['cuota', 'numero cuota', 'nro cuota'],
  monto: ['monto', 'importe'],
  moneda: ['moneda'],
  fechaVencimiento: ['vencimiento', 'fecha vencimiento', 'fecha de vencimiento'],
  fechaPago: ['fecha pago', 'fecha de pago', 'pagado el'],
  estado: ['estado', 'estado pago'],
};

/** Solapa 3 · asistencias a mentorías. */
export const ASISTENCIAS: Mapeo = {
  cliente: ['cliente', 'nombre'],
  mentoria: ['mentoria', 'mentoría', 'modulo', 'módulo'],
  fecha: ['fecha'],
  asistio: ['asistio', 'asistió', 'presente'],
};

/** Cómo se leen los estados de pago que escribe finanzas. */
export const ESTADO_PAGO: Record<string, 'pagado' | 'pendiente' | 'vencido' | 'incobrable'> = {
  // La planilla de finanzas marca cada cuota con una casilla y el export la
  // escribe TRUE/FALSE. TRUE sí es "pagado"; FALSE es sólo "todavía no", y a
  // propósito NO está en esta tabla: si estuviera, una cuota impaga y vencida
  // entraría como "pendiente" y la cobranza no la vería. Al no encontrarla
  // acá, el importador cae en la inferencia por fecha —vencida si el
  // vencimiento ya pasó— que es justamente la que dispara las alertas.
  true: 'pagado',
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
  deudor: 'vencido',
  moroso: 'vencido',
  'en tramite': 'pendiente',
  incobrable: 'incobrable',
  perdido: 'incobrable',
  reembolsado: 'incobrable',
};

/**
 * Cómo lee finanzas el estado de cobro. Vacío no está acá: una celda vacía es
 * "al día", que es el caso de 151 de las 160 filas y por eso nadie lo escribe.
 */
export const ESTADO_DEUDA: Record<string, 'deudor' | 'moroso' | 'en_tramite' | 'incobrable'> = {
  deudor: 'deudor',
  deudora: 'deudor',
  debe: 'deudor',
  moroso: 'moroso',
  morosa: 'moroso',
  'en tramite': 'en_tramite',
  tramite: 'en_tramite',
  'en gestion': 'en_tramite',
  incobrable: 'incobrable',
  perdido: 'incobrable',
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

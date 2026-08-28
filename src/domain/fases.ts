import type { Eslabon, TipoBloqueo } from './types';

/**
 * EL RELOJ DEL PROGRAMA
 *
 * Decisión de integración: el eje no son los módulos del programa (M1 mindset,
 * M2 bases, M3 contenido, M4). El módulo mide avance de programa; lo que
 * importa es el avance del negocio. Dos clientes en el mismo módulo pueden
 * necesitar cosas opuestas.
 *
 * Entonces el eje son dos cosas superpuestas:
 *   · la FASE del negocio, derivada de la cadena de eslabones;
 *   · los HITOS con fecha, que son el reloj duro y la promesa comercial.
 *
 * El hito que define el producto es uno solo: PRIMERA VENTA ANTES DEL DÍA 60.
 * El día 90 sin venta ya no es un hito atrasado: es la regla dura RD-07.
 */

export type FaseNegocio = 'definicion' | 'mensaje' | 'volumen' | 'conversion' | 'escala';

export const FASES: { key: FaseNegocio; nombre: string; pregunta: string }[] = [
  { key: 'definicion', nombre: 'Definición', pregunta: '¿Qué vende, a quién y por cuánto?' },
  { key: 'mensaje', nombre: 'Mensaje', pregunta: '¿Lo está comunicando de forma que el comprador correcto se reconozca?' },
  { key: 'volumen', nombre: 'Volumen', pregunta: '¿Le está llegando a suficiente gente para que la estadística signifique algo?' },
  { key: 'conversion', nombre: 'Conversión', pregunta: '¿Las conversaciones se transforman en llamadas y en ventas?' },
  { key: 'escala', nombre: 'Escala', pregunta: '¿La venta se repite o fue suerte?' },
];

export interface HitoDef {
  key: string;
  label: string;
  /** Día del programa en el que ya debería estar cumplido */
  dia: number;
  fase: FaseNegocio;
  /** Un gate condiciona todo lo que viene después. Lo confirma la administradora. */
  gate: boolean;
  confirma: 'consultora' | 'admin';
  /** Si el hito se puede verificar contra datos, no depende de que alguien lo tilde */
  automatico?: 'primera_venta' | 'venta_repetida' | 'primera_agenda' | 'primera_llamada' | 'expediente';
  detalle?: string;
}

export const HITOS: HitoDef[] = [
  {
    key: 'onboarding',
    label: 'Onboarding hecho y expediente base cargado',
    dia: 7,
    fase: 'definicion',
    gate: false,
    confirma: 'consultora',
    automatico: 'expediente',
    detalle: 'Incluye las horas reales por semana. El plan se arma contra ese número, no contra el del pitch.',
  },
  {
    key: 'cuenta_inversa',
    label: 'Cuenta inversa hecha con el cliente',
    dia: 7,
    fase: 'definicion',
    gate: false,
    confirma: 'consultora',
    detalle: 'Cuántos DMs por semana necesita para su meta. Es lo primero de la sesión 1 y lo que más se saltea.',
  },
  {
    key: 'cliente_ideal',
    label: 'Cliente ideal y problema cerrados',
    dia: 21,
    fase: 'definicion',
    gate: false,
    confirma: 'consultora',
    detalle: 'Un comprador reconocible, no "emprendedores".',
  },
  {
    key: 'oferta',
    label: 'Oferta y promesa cerradas',
    dia: 30,
    fase: 'definicion',
    gate: true,
    confirma: 'admin',
    detalle: 'Sin esto el cliente no puede salir al mercado. Si sigue abierto en el mes 2, el programa está detenido.',
  },
  {
    key: 'mensaje',
    label: 'Mensaje y canal definidos',
    dia: 35,
    fase: 'mensaje',
    gate: false,
    confirma: 'consultora',
  },
  {
    key: 'primera_conversacion',
    label: 'Primeras conversaciones que avanzan',
    dia: 42,
    fase: 'volumen',
    gate: false,
    confirma: 'consultora',
  },
  {
    key: 'kpi_sostenido',
    label: 'KPI semanal de DMs sostenido 3 semanas',
    dia: 50,
    fase: 'volumen',
    gate: false,
    confirma: 'consultora',
    detalle: 'El compromiso operativo que sale de la cuenta inversa. No es una métrica de vanidad.',
  },
  {
    key: 'primera_agenda',
    label: 'Primera agenda',
    dia: 45,
    fase: 'volumen',
    gate: false,
    confirma: 'consultora',
    automatico: 'primera_agenda',
  },
  {
    key: 'primera_llamada',
    label: 'Primera llamada realizada',
    dia: 55,
    fase: 'conversion',
    gate: false,
    confirma: 'consultora',
    automatico: 'primera_llamada',
  },
  {
    key: 'primera_venta',
    label: 'Primera venta',
    dia: 60,
    fase: 'conversion',
    gate: true,
    confirma: 'admin',
    automatico: 'primera_venta',
    detalle: 'La promesa del programa. Todo el sistema existe para que este hito llegue a tiempo.',
  },
  {
    key: 'venta_repetida',
    label: 'Segunda venta',
    dia: 90,
    fase: 'escala',
    gate: true,
    confirma: 'admin',
    automatico: 'venta_repetida',
    detalle: 'Una venta puede ser suerte. Dos ya es sistema.',
  },
  {
    key: 'sistema',
    label: 'Sistema de seguimiento sostenible',
    dia: 100,
    fase: 'escala',
    gate: false,
    confirma: 'consultora',
  },
];

export const HITOS_POR_FASE = FASES.map((f) => ({
  ...f,
  hitos: HITOS.filter((h) => h.fase === f.key).sort((a, b) => a.dia - b.dia),
}));

export function hitoDef(key: string): HitoDef | undefined {
  return HITOS.find((h) => h.key === key);
}

// ---------------------------------------------------------------------------
// La cadena. El motor busca la PRIMERA incoherencia, no la más visible.
// ---------------------------------------------------------------------------

export const CADENA: Eslabon[] = [
  'cliente', 'problema', 'deseo', 'oferta', 'promesa', 'mensaje',
  'canal', 'lead', 'setting', 'venta', 'entrega', 'resultado',
];

export const ESLABON_LABEL: Record<Eslabon, string> = {
  cliente: 'Cliente',
  problema: 'Problema',
  deseo: 'Deseo',
  oferta: 'Oferta',
  promesa: 'Promesa',
  mensaje: 'Mensaje',
  canal: 'Canal',
  lead: 'Lead',
  setting: 'Setting',
  venta: 'Venta',
  entrega: 'Entrega',
  resultado: 'Resultado',
};

export const BLOQUEO_LABEL: Record<TipoBloqueo, string> = {
  estrategico: 'Estratégico',
  mensaje: 'Mensaje',
  adquisicion: 'Adquisición',
  comercial: 'Comercial',
  entrega: 'Entrega',
  operativo: 'Operativo',
  ejecucion: 'Ejecución',
  emocional: 'Emocional',
};

export const BLOQUEO_DESCRIPCION: Record<TipoBloqueo, string> = {
  estrategico: 'No sabe qué vender o a quién',
  mensaje: 'La propuesta está bien pero no se comunica',
  adquisicion: 'La oferta funciona pero no hay distribución',
  comercial: 'Hay leads pero no convierten',
  entrega: 'Puede vender pero no entregar',
  operativo: 'No hay capacidad, procesos o equipo',
  ejecucion: 'Sabe qué hacer y no lo hace',
  emocional: 'Miedo, perfeccionismo, vergüenza o necesidad de aprobación',
};

/** Jerarquía de prioridad: no se escala algo que todavía no funciona. */
export const JERARQUIA: Eslabon[] = [
  'cliente', 'problema', 'oferta', 'promesa', 'mensaje', 'lead', 'setting', 'venta', 'entrega', 'resultado',
];

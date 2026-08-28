/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Dataset, Repo } from '../repo';
import { clienteSupabase } from './client';

/**
 * Adaptador Postgres/Supabase.
 *
 * Trae el conjunto de trabajo que RLS ya recortó y calcula en memoria. Con ~85
 * clientes esto es más rápido y mucho más mantenible que replicar el motor en
 * SQL. Las reglas duras sí corren en SQL por cron todas las noches, como manda
 * el paquete: son restas de fechas y no necesitan la app prendida.
 */

const camel = <T,>(row: any, mapa: Record<string, string>): T => {
  const out: any = {};
  for (const [k, v] of Object.entries(mapa)) out[v] = row[k];
  return out as T;
};

const M = {
  consultora: { id: 'id', nombre: 'nombre', email: 'email', rol: 'rol', cupo_maximo: 'cupoMaximo', acepta_nuevos: 'aceptaNuevos', activa: 'activa', color: 'color', mano_levantada_at: 'manoLevantadaAt', mano_levantada_nota: 'manoLevantadaNota', sesiones_back_to_back: 'sesionesBackToBack' },
  cliente: { id: 'id', nombre: 'nombre', email: 'email', telefono: 'telefono', programa: 'programa', fecha_alta: 'fechaAlta', fecha_fin_prevista: 'fechaFinPrevista', plan_pago: 'planPago', tiene_garantia: 'tieneGarantia', fuente: 'fuente', consultora_id: 'consultoraId', estado: 'estado', drive_folder_id: 'driveFolderId', horas_reales_semana: 'horasRealesSemana', dias_gracia_pago: 'diasGraciaPago', nivel_desalineado: 'nivelDesalineado', nivel_vendido: 'nivelVendido' },
  negocio: { cliente_id: 'clienteId', que_vende: 'queVende', a_quien: 'aQuien', precio: 'precio', moneda: 'moneda', como_entrega: 'comoEntrega', facturacion_mensual: 'facturacionMensual', cantidad_clientes: 'cantidadClientes', origen_clientes: 'origenClientes', que_funciono: 'queFunciono', que_no_funciono: 'queNoFunciono', actualizado_at: 'actualizadoAt' },
  autoridad: { cliente_id: 'clienteId', hace_excepcionalmente_bien: 'haceExcepcionalmenteBien', experiencia_profesional: 'experienciaProfesional', resultados_propios: 'resultadosPropios', resultados_terceros: 'resultadosTerceros', industrias_que_conoce: 'industriasQueConoce', autoridad_desperdiciada: 'autoridadDesperdiciada', actualizado_at: 'actualizadoAt' },
  estrategia: { id: 'id', cliente_id: 'clienteId', version: 'version', cliente_ideal: 'clienteIdeal', problema: 'problema', deseo: 'deseo', promesa: 'promesa', oferta: 'oferta', mecanismo: 'mecanismo', canal: 'canal', precio: 'precio', moneda: 'moneda', vigente_desde: 'vigenteDesde', motivo_cambio: 'motivoCambio', iniciativa: 'iniciativa', sesion_id: 'sesionId', creada_por: 'creadaPor' },
  objetivo: { id: 'id', cliente_id: 'clienteId', meta_mensual: 'metaMensual', ticket: 'ticket', moneda: 'moneda', tasa_cierre: 'tasaCierre', tasa_asistencia: 'tasaAsistencia', tasa_agendamiento: 'tasaAgendamiento', tasa_avance: 'tasaAvance', tasa_dm_sobre_alcance: 'tasaDmSobreAlcance', dia_inicio_prospeccion: 'diaInicioProspeccion', vigente_desde: 'vigenteDesde', creado_por: 'creadoPor' },
  metrica: { id: 'id', cliente_id: 'clienteId', semana_iso: 'semanaIso', contenido_publicado: 'contenidoPublicado', alcance_total: 'alcanceTotal', alcance_no_seguidores: 'alcanceNoSeguidores', dms_iniciados: 'dmsIniciados', conversaciones_avanzadas: 'conversacionesAvanzadas', leads: 'leads', leads_calificados: 'leadsCalificados', agendas: 'agendas', asistencias: 'asistencias', cancelaciones: 'cancelaciones', llamadas: 'llamadas', ofertas_realizadas: 'ofertasRealizadas', ventas: 'ventas', facturado: 'facturado', ticket_promedio: 'ticketPromedio', inversion_ads: 'inversionAds', objeciones: 'objeciones', origen_oportunidades: 'origenOportunidades', cargado_por: 'cargadoPor' },
  sesion: { id: 'id', cliente_id: 'clienteId', consultora_id: 'consultoraId', fecha: 'fecha', duracion_minutos: 'duracionMinutos', estado_agenda: 'estadoAgenda', tiene_grabacion: 'tieneGrabacion', transcripcion_texto: 'transcripcionTexto', transcripcion_path: 'transcripcionPath', reporte: 'reporte', reporte_cargado_at: 'reporteCargadoAt', menciono_numeros: 'mencionoNumeros', pct_habla_cliente: 'pctHablaCliente', cerro_con_compromiso: 'cerroConCompromiso', abrio_repasando: 'abrioRepasando', se_fue_en_herramienta: 'seFueEnHerramienta', tema_declarado: 'temaDeclarado', tema_tratado: 'temaTratado', satisfaccion: 'satisfaccion', procesada_at: 'procesadaAt' },
  compromiso: { id: 'id', cliente_id: 'clienteId', sesion_id: 'sesionId', descripcion: 'descripcion', responsable: 'responsable', fecha_vencimiento: 'fechaVencimiento', estado: 'estado', nota_cierre: 'notaCierre' },
  pago: { id: 'id', cliente_id: 'clienteId', numero_cuota: 'numeroCuota', monto: 'monto', moneda: 'moneda', fecha_vencimiento: 'fechaVencimiento', fecha_pago: 'fechaPago', estado: 'estado' },
  asistencia: { id: 'id', cliente_id: 'clienteId', mentoria: 'mentoria', fecha: 'fecha', asistio: 'asistio' },
  hito: { cliente_id: 'clienteId', hito_key: 'hitoKey', estado: 'estado', nota: 'nota', actualizado_at: 'actualizadoAt', actualizado_por: 'actualizadoPor', cumplido_at: 'cumplidoAt', confirmado_por: 'confirmadoPor' },
  lectura: { id: 'id', cliente_id: 'clienteId', consultora_id: 'consultoraId', sesion_id: 'sesionId', fecha: 'fecha', percepcion: 'percepcion', bloqueo_declarado: 'bloqueoDeclarado', necesita_intervencion: 'necesitaIntervencion', potencial_renovacion: 'potencialRenovacion', comentario: 'comentario' },
  alerta: { id: 'id', cliente_id: 'clienteId', sesion_id: 'sesionId', codigo: 'codigo', origen: 'origen', estado_semaforo: 'estadoSemaforo', titulo: 'titulo', cuerpo: 'cuerpo', cita_textual: 'citaTextual', fecha_cita: 'fechaCita', pedido: 'pedido', destinatario: 'destinatario', plazo_horas: 'plazoHoras', prioridad: 'prioridad', emitida_at: 'emitidaAt', emitida_en_semana: 'emitidaEnSemana', diferida: 'diferida', cerrada_at: 'cerradaAt', cerrada_por: 'cerradaPor', texto_cierre: 'textoCierre', escalada_a_id: 'escaladaAId', veces_emitida: 'vecesEmitida' },
  traspaso: { id: 'id', cliente_id: 'clienteId', consultora_origen_id: 'consultoraOrigenId', consultora_destino_id: 'consultoraDestinoId', fecha: 'fecha', motivo: 'motivo' },
  documento: { id: 'id', cliente_id: 'clienteId', tipo: 'tipo', titulo: 'titulo', contenido: 'contenido', fecha: 'fecha', subido_por: 'subidoPor', creado_at: 'creadoAt', archivo: 'archivo' },
  diagnostico: { id: 'id', cliente_id: 'clienteId', consultora_id: 'consultoraId', pregunta: 'pregunta', hipotesis_consultora: 'hipotesisConsultora', cuello_botella: 'cuelloBotella', tipo_bloqueo: 'tipoBloqueo', eslabon_roto: 'eslabonRoto', coincidio: 'coincidio', payload: 'payload', prompt_version: 'promptVersion', modelo: 'modelo', created_at: 'createdAt' },
  prorroga: { id: 'id', cliente_id: 'clienteId', pago_id: 'pagoId', dias_otorgados: 'diasOtorgados', autorizada_por: 'autorizadaPor', autorizada_at: 'autorizadaAt', nueva_fecha: 'nuevaFecha', motivo: 'motivo', resultado: 'resultado', resuelta_at: 'resueltaAt' },
  baja: { id: 'id', cliente_id: 'clienteId', fecha: 'fecha', motivo: 'motivo', solicitada_por: 'solicitadaPor', pidio_reembolso: 'pidioReembolso', nota: 'nota', pasos: 'pasos' },
  atribucion: { id: 'id', cliente_id: 'clienteId', responsable: 'responsable', texto: 'texto', por: 'por', at: 'at' },
  revision: { id: 'id', cliente_id: 'clienteId', revisada_por: 'revisadaPor', fecha: 'fecha', responsable: 'responsable', veredicto: 'veredicto', accion_acordada: 'accionAcordada', responsable_accion: 'responsableAccion', fecha_seguimiento: 'fechaSeguimiento' },
} as const;

const snake = (obj: Record<string, unknown>, mapa: Record<string, string>) => {
  const inv = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (inv[k]) out[inv[k]] = v ?? null;
  return out;
};

export const supabaseRepo: Repo = {
  modo: 'supabase',

  async cargarTodo(): Promise<Dataset> {
    const sb = await clienteSupabase();
    const tablas = [
      'consultoras', 'clientes', 'negocio', 'autoridad', 'estrategia_versiones',
      'objetivos_comerciales', 'metricas_semanales', 'sesiones', 'compromisos',
      'pagos', 'asistencias_mentoria', 'hitos_cliente', 'lecturas_consultora',
      'alertas', 'traspasos', 'diagnosticos', 'documentos_cliente',
      'prorrogas', 'bajas', 'atribuciones', 'revisiones_caso',
    ];
    const res = await Promise.all(tablas.map((t) => sb.from(t).select('*')));
    const [eq, cl, ne, au, es, ob, me, se, co, pa, as, hi, le, al, tr, di, dc, pr, ba, at, rv] =
      res.map((r) => r.data ?? []);

    return {
      equipo: eq.map((r) => camel(r, M.consultora)),
      clientes: cl.map((r) => camel(r, M.cliente)),
      negocios: ne.map((r) => camel(r, M.negocio)),
      autoridades: au.map((r) => camel(r, M.autoridad)),
      estrategias: es.map((r) => camel(r, M.estrategia)),
      objetivos: ob.map((r) => camel(r, M.objetivo)),
      metricas: me.map((r) => camel(r, M.metrica)),
      sesiones: se.map((r) => camel(r, M.sesion)),
      compromisos: co.map((r) => camel(r, M.compromiso)),
      pagos: pa.map((r) => camel(r, M.pago)),
      asistencias: as.map((r) => camel(r, M.asistencia)),
      hitos: hi.map((r) => camel(r, M.hito)),
      lecturas: le.map((r) => camel(r, M.lectura)),
      alertas: al.map((r) => camel(r, M.alerta)),
      traspasos: tr.map((r) => camel(r, M.traspaso)),
      diagnosticos: di.map((r) => camel(r, M.diagnostico)),
      documentos: dc.map((r) => camel(r, M.documento)),
      prorrogas: pr.map((r) => camel(r, M.prorroga)),
      bajas: ba.map((r: any) => ({ ...camel(r, M.baja), pasos: r.pasos ?? [] })),
      atribuciones: at.map((r) => camel(r, M.atribucion)),
      revisiones: rv.map((r) => camel(r, M.revision)),
    } as Dataset;
  },

  async guardarCliente(c) {
    const sb = await clienteSupabase();
    await sb.from('clientes').upsert(snake(c as never, M.cliente));
  },
  async guardarNegocio(n) {
    const sb = await clienteSupabase();
    await sb.from('negocio').upsert(snake(n as never, M.negocio), { onConflict: 'cliente_id' });
  },
  async guardarAutoridad(a) {
    const sb = await clienteSupabase();
    await sb.from('autoridad').upsert(snake(a as never, M.autoridad), { onConflict: 'cliente_id' });
  },
  /** Append-only: cambiar la meta no borra contra qué se venía midiendo. */
  async guardarObjetivo(o) {
    const sb = await clienteSupabase();
    await sb.from('objetivos_comerciales').insert(snake(o as never, M.objetivo));
  },
  async guardarDocumento(d) {
    const sb = await clienteSupabase();
    await sb.from('documentos_cliente').upsert(snake(d as never, M.documento));
  },
  async borrarDocumento(id) {
    const sb = await clienteSupabase();
    await sb.from('documentos_cliente').delete().eq('id', id);
  },
  async guardarPago(p) {
    const sb = await clienteSupabase();
    await sb.from('pagos').upsert(snake(p as never, M.pago), { onConflict: 'cliente_id,numero_cuota' });
  },
  async guardarAsistencia(a) {
    const sb = await clienteSupabase();
    await sb.from('asistencias_mentoria').upsert(snake(a as never, M.asistencia), { onConflict: 'cliente_id,mentoria,fecha' });
  },
  async guardarSesion(s) {
    const sb = await clienteSupabase();
    await sb.from('sesiones').upsert(snake(s as never, M.sesion));
  },
  async guardarMetrica(m) {
    const sb = await clienteSupabase();
    await sb.from('metricas_semanales').upsert(snake(m as never, M.metrica), { onConflict: 'cliente_id,semana_iso' });
  },
  async guardarCompromiso(c) {
    const sb = await clienteSupabase();
    await sb.from('compromisos').upsert(snake(c as never, M.compromiso));
  },
  async guardarHito(h) {
    const sb = await clienteSupabase();
    await sb.from('hitos_cliente').upsert(snake(h as never, M.hito), { onConflict: 'cliente_id,hito_key' });
  },
  async guardarLectura(l) {
    const sb = await clienteSupabase();
    await sb.from('lecturas_consultora').insert(snake(l as never, M.lectura));
  },
  async guardarEstrategia(e) {
    const sb = await clienteSupabase();
    // append-only: la base tiene reglas que bloquean UPDATE y DELETE
    await sb.from('estrategia_versiones').insert(snake(e as never, M.estrategia));
  },
  async guardarDiagnostico(d) {
    const sb = await clienteSupabase();
    await sb.from('diagnosticos').insert(snake(d as never, M.diagnostico));
  },
  async cerrarAlerta({ alertaId, texto, cerradaPor }, hoy) {
    const sb = await clienteSupabase();
    // El trigger tg_valida_cierre_rojo rechaza el cierre si lo intenta la
    // consultora del caso sobre una roja o negra. La app muestra el motivo.
    await sb
      .from('alertas')
      .update({ cerrada_at: hoy, texto_cierre: texto, cerrada_por: cerradaPor })
      .eq('id', alertaId);
  },
  async crearAlerta(a) {
    const sb = await clienteSupabase();
    await sb.from('alertas').insert(snake(a as never, M.alerta));
  },
  async guardarProrroga(p) {
    const sb = await clienteSupabase();
    await sb.from('prorrogas').upsert(snake(p as never, M.prorroga));
  },
  async guardarBaja(b) {
    const sb = await clienteSupabase();
    await sb.from('bajas').upsert({ ...snake(b as never, M.baja), pasos: b.pasos });
  },
  /** Append-only: la corrección anterior queda, para poder discutir el criterio después. */
  async guardarAtribucion(a) {
    const sb = await clienteSupabase();
    await sb.from('atribuciones').insert(snake(a as never, M.atribucion));
  },
  async guardarRevision(r) {
    const sb = await clienteSupabase();
    await sb.from('revisiones_caso').insert(snake(r as never, M.revision));
  },
};

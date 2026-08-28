-- ============================================================================
-- FOUNDERS BRAIN · reglas de la fusión (RD-11 a RD-17, CR-01, CR-02)
--
-- Las diez reglas de Brain viven en 0003 y no se tocan. Estas siete más dos
-- vienen del CRM de Customer Success y siguen exactamente el mismo contrato:
-- restas de fechas y sumas de filas, sin modelo de lenguaje, idempotentes por
-- (cliente, código), y con responsable, plazo y prioridad.
--
-- Supresión: una regla no se emite si ya está disparada otra más específica.
-- Ocho alertas sobre el mismo cliente no son ocho problemas: son el mismo
-- problema contado ocho veces, y así el equipo deja de leer la bandeja.
-- ============================================================================

create or replace function fn_suprimida(p_cliente uuid, p_codigos text[])
returns boolean language sql stable as $$
  select exists (
    select 1 from alertas
    where cliente_id = p_cliente and cerrada_at is null and codigo = any(p_codigos)
  );
$$;

create or replace function fn_correr_reglas_fusion()
returns table (codigo text, emitidas int)
language plpgsql as $$
declare v_count int;
begin

-- --------------------------------------------------------------------------
-- RD-11 · DÍA 60 SIN LA PRIMERA VENTA
-- El objetivo del programa es la primera venta antes del día 60. Esta alerta
-- llega treinta días antes de que el caso sea rojo por RD-07.
-- --------------------------------------------------------------------------
with base as (
  select c.id as cliente_id, c.nombre,
         current_date - c.fecha_alta as dia,
         coalesce((select sum(m.ventas) from metricas_semanales m where m.cliente_id = c.id), 0) as ventas
  from clientes c where c.estado = 'activo'
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-11', 'regla_dura', 'amarillo',
       'Día ' || dia || ' sin la primera venta',
       'Día ' || dia || ' del programa y todavía no hay una venta registrada. El objetivo del programa '
         || 'es la primera venta antes del día 60. Quedan ' || (90 - dia) || ' días antes de que esto sea rojo.',
       'Definir con el cliente la única palanca de los próximos 30 días y revisarla semana a semana.',
       'consultora', 72, 85
from base
where dia >= 60 and dia < 90 and ventas = 0
  and not fn_alerta_abierta(cliente_id, 'RD-11')
  and not fn_suprimida(cliente_id, array['RD-07']);
get diagnostics v_count = row_count;
return query select 'RD-11'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-12 · KPI SEMANAL INCUMPLIDO
-- Tres semanas seguidas por debajo del 60% del KPI que sale de su propia
-- cuenta inversa. No es una métrica de vanidad: es el compromiso operativo.
-- --------------------------------------------------------------------------
with kpi as (
  select o.cliente_id,
         ceil(((o.meta_mensual / o.ticket) / o.tasa_cierre / o.tasa_asistencia
               / o.tasa_agendamiento / o.tasa_avance) / 4)::int as dms_semana
  from objetivos_comerciales o
), ult as (
  select m.cliente_id, m.dms_iniciados,
         row_number() over (partition by m.cliente_id order by m.semana_iso desc) as rn
  from metricas_semanales m
  where m.dms_iniciados is not null
), fallan as (
  select u.cliente_id, k.dms_semana, count(*) as semanas
  from ult u join kpi k on k.cliente_id = u.cliente_id
  where u.rn <= 3 and u.dms_iniciados < k.dms_semana * 0.6
  group by u.cliente_id, k.dms_semana
  having count(*) = 3
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select f.cliente_id, 'RD-12', 'regla_dura', 'amarillo',
       'KPI semanal incumplido tres semanas seguidas',
       'Tres semanas seguidas por debajo de su KPI de ' || f.dms_semana || ' DMs por semana, que es lo que '
         || 'necesita para su meta con su ticket.',
       'Revisar en sesión si el KPI es irreal para sus horas o si el problema es ejecución. Corregir una de las dos, no las dos.',
       'consultora', 72, 68
from fallan f
where not fn_es_cliente_nuevo(f.cliente_id)
  and not fn_alerta_abierta(f.cliente_id, 'RD-12')
  and not fn_suprimida(f.cliente_id, array['RD-15','RD-01']);
get diagnostics v_count = row_count;
return query select 'RD-12'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-13 · TRACKER SIN CARGAR
-- Sin números el índice de ese cliente no es confiable, y un índice que no es
-- confiable es peor que no tener índice.
-- --------------------------------------------------------------------------
with ult as (
  select c.id as cliente_id,
         (select max(m.semana_iso) from metricas_semanales m
           where m.cliente_id = c.id and m.dms_iniciados is not null) as ultima
  from clientes c where c.estado = 'activo'
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-13', 'regla_dura', 'amarillo',
       'Tracker sin cargar',
       'Sin números cargados' || coalesce(' desde el ' || to_char(ultima, 'DD/MM'), ' nunca')
         || '. Sobre este cliente el sistema no puede opinar.',
       'Cargar el tracker de las semanas faltantes. Dos minutos al cerrar la próxima sesión.',
       'consultora', 72, 60
from ult
where (ultima is null or current_date - ultima > 21)
  and not fn_es_cliente_nuevo(cliente_id)
  and not fn_alerta_abierta(cliente_id, 'RD-13')
  and not fn_suprimida(cliente_id, array['RD-01']);
get diagnostics v_count = row_count;
return query select 'RD-13'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-14 · EXPEDIENTE CIEGO
-- Menos de cuatro bloques después del día 21: los motores de criterio no
-- corren y el caso queda fuera del alcance del sistema.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select b.cliente_id, 'RD-14', 'regla_dura', 'amarillo',
       'Expediente ciego · ' || b.bloques || ' de 6 bloques',
       'Día ' || (current_date - c.fecha_alta) || ' con ' || b.bloques || ' de 6 bloques cargados. '
         || 'Con menos de cuatro, el motor de diagnóstico no corre.',
       'Completar los bloques faltantes en la próxima sesión. Es media hora que evita meses de trabajo a ciegas.',
       'admin', 96, 72
from v_bloques_cargados b
join clientes c on c.id = b.cliente_id
where c.estado = 'activo'
  and b.bloques < 4
  and current_date - c.fecha_alta >= 21
  and not fn_alerta_abierta(b.cliente_id, 'RD-14');
get diagnostics v_count = row_count;
return query select 'RD-14'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-15 · CAÍDA FUERTE DE ACTIVIDAD
-- Las últimas cuatro semanas por debajo del 40% de las cuatro previas.
-- --------------------------------------------------------------------------
with ventanas as (
  select m.cliente_id,
         sum(m.dms_iniciados) filter (where m.semana_iso > current_date - interval '28 days') as ahora,
         sum(m.dms_iniciados) filter (where m.semana_iso <= current_date - interval '28 days'
                                        and m.semana_iso > current_date - interval '56 days') as antes
  from metricas_semanales m
  where m.dms_iniciados is not null
  group by m.cliente_id
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select v.cliente_id, 'RD-15', 'regla_dura', 'amarillo',
       'Caída fuerte de actividad',
       'La actividad cayó ' || round((1 - v.ahora::numeric / v.antes) * 100) || '% contra el mes anterior: '
         || v.ahora || ' DMs en las últimas 4 semanas contra ' || v.antes || ' en las 4 previas.',
       'Entender qué pasó en las últimas dos semanas antes de cambiar cualquier cosa de la estrategia.',
       'consultora', 72, 66
from ventanas v
where v.antes >= 20 and v.ahora < v.antes * 0.4
  and not fn_alerta_abierta(v.cliente_id, 'RD-15');
get diagnostics v_count = row_count;
return query select 'RD-15'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-16 · GARANTÍA EN RIESGO DEL LADO NUESTRO
-- La cláusula exige 90% de asistencia 1:1. Si las sesiones caídas fueron
-- nuestras, la garantía queda expuesta y nadie lo está mirando.
-- --------------------------------------------------------------------------
with asistencia as (
  select s.cliente_id,
         count(*) as agendadas,
         count(*) filter (where s.estado_agenda = 'realizada') as realizadas
  from sesiones s
  where s.fecha > now() - interval '60 days'
  group by s.cliente_id
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select a.cliente_id, 'RD-16', 'regla_dura', 'amarillo',
       'Garantía en riesgo del lado nuestro',
       'Cliente con garantía firmada: ' || a.realizadas || ' de ' || a.agendadas || ' sesiones realizadas en 60 días ('
         || round(a.realizadas::numeric / a.agendadas * 100) || '%). La cláusula exige 90% de asistencia 1:1.',
       'Revisar si las sesiones caídas fueron del lado del cliente o del nuestro. Si fueron nuestras, la garantía queda expuesta.',
       'admin', 72, 75
from asistencia a
join clientes c on c.id = a.cliente_id
where c.tiene_garantia and c.estado = 'activo'
  and a.agendadas >= 4
  and a.realizadas::numeric / a.agendadas < 0.9
  and not fn_es_cliente_nuevo(a.cliente_id)
  and not fn_alerta_abierta(a.cliente_id, 'RD-16');
get diagnostics v_count = row_count;
return query select 'RD-16'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-17 · COMPROMISOS VENCIDOS ACUMULADOS
-- --------------------------------------------------------------------------
with vencidos as (
  select k.cliente_id, count(*) as n, min(k.fecha_vencimiento) as mas_viejo
  from compromisos k
  where k.estado = 'pendiente' and k.fecha_vencimiento < current_date
  group by k.cliente_id
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select v.cliente_id, 'RD-17', 'regla_dura', 'amarillo',
       v.n || ' compromisos vencidos sin cerrar',
       v.n || ' compromisos vencidos sin cerrar. El más viejo, del ' || to_char(v.mas_viejo, 'DD/MM') || '.',
       'Depurar la lista en la próxima sesión: cancelar lo que ya no aplica y dejar dos compromisos vivos.',
       'consultora', 72, 55
from vencidos v
where v.n >= 3
  and not fn_alerta_abierta(v.cliente_id, 'RD-17')
  and not fn_suprimida(v.cliente_id, array['RD-01']);
get diagnostics v_count = row_count;
return query select 'RD-17'::text, v_count;

-- --------------------------------------------------------------------------
-- CR-01 · LA CONSULTORA PIDIÓ INTERVENCIÓN
-- El criterio humano no se promedia en ningún puntaje: emite una alerta con
-- responsable y plazo, y no la puede cerrar quien la abrió.
-- --------------------------------------------------------------------------
with ultima as (
  select distinct on (l.cliente_id) l.*
  from lecturas_consultora l
  order by l.cliente_id, l.fecha desc
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     cita_textual, fecha_cita, pedido, destinatario, plazo_horas, prioridad)
select u.cliente_id, 'CR-01', 'lectura', 'rojo',
       'La consultora pidió intervención',
       'La consultora marcó que necesita intervención el ' || to_char(u.fecha, 'DD/MM')
         || '. Bloqueo declarado: ' || u.bloqueo_declarado || '.',
       u.comentario, u.fecha,
       'Asignar revisión externa y definir la intervención dentro de 48 h.',
       'revision_externa', 48, 96
from ultima u
where u.necesita_intervencion
  and not fn_alerta_abierta(u.cliente_id, 'CR-01');
get diagnostics v_count = row_count;
return query select 'CR-01'::text, v_count;

-- --------------------------------------------------------------------------
-- CR-02 · LA CONSULTORA VE EL CASO EN RIESGO
-- Percepción de deterioro que los números todavía no muestran.
-- --------------------------------------------------------------------------
with ultima as (
  select distinct on (l.cliente_id) l.*
  from lecturas_consultora l
  order by l.cliente_id, l.fecha desc
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     cita_textual, fecha_cita, pedido, destinatario, plazo_horas, prioridad)
select u.cliente_id, 'CR-02', 'lectura', 'amarillo',
       'La consultora ve el caso en riesgo',
       'Lectura del ' || to_char(u.fecha, 'DD/MM') || ': caso en riesgo. Bloqueo declarado: '
         || u.bloqueo_declarado || '.',
       u.comentario, u.fecha,
       'Llevar el caso a la próxima reunión de revisión con la evidencia que sostiene la lectura.',
       'consultora', 120, 70
from ultima u
where u.percepcion = 'riesgo' and not u.necesita_intervencion
  and not fn_alerta_abierta(u.cliente_id, 'CR-02');
get diagnostics v_count = row_count;
return query select 'CR-02'::text, v_count;

end $$;

-- ============================================================================
-- Corrida completa: Brain primero, fusión después, y al final el techo semanal.
-- ============================================================================
create or replace function fn_correr_todas_las_reglas()
returns table (codigo text, emitidas int)
language plpgsql as $$
begin
  return query select * from fn_correr_reglas_duras();
  return query select * from fn_correr_reglas_fusion();
  perform fn_aplicar_techo_semanal(10);
end $$;

-- Cron a las 03:00 de Buenos Aires (06:00 UTC).
-- select cron.schedule('reglas-duras', '0 6 * * *', 'select fn_correr_todas_las_reglas()');

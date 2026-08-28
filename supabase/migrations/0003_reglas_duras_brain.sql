-- ============================================================================
-- FOUNDERS BRAIN · Reglas duras (alertas determinísticas)
--
-- Estas diez reglas NO usan modelo de lenguaje. Son restas de fechas y sumas
-- de filas. Son aproximadamente la mitad del valor del producto, la mitad más
-- barata de construir y la que más rápido paga: el caso Gianna se detectaba
-- con la regla RD-01 y con nada más.
--
-- Se ejecutan una vez por noche. Cada regla es idempotente: no vuelve a
-- emitir una alerta del mismo código si ya hay una abierta para ese cliente.
--
-- CÓMO PROBARLAS SIN LA APP: cada bloque de esta función se puede traducir a
-- una fórmula de planilla sobre la cartera actual. Ver
-- especificacion-reglas.md, columna "Equivalente en planilla".
-- ============================================================================

-- Cliente nuevo: sus primeras dos semanas no disparan alerta de proceso.
-- Todavía no hay línea de base. (Los pagos sí, siempre.)
create or replace function fn_es_cliente_nuevo(p_cliente uuid)
returns boolean language sql stable as $$
  select fecha_alta > current_date - interval '14 days' from clientes where id = p_cliente;
$$;

-- Evita duplicar: ¿ya hay una alerta abierta de este código para este cliente?
create or replace function fn_alerta_abierta(p_cliente uuid, p_codigo text)
returns boolean language sql stable as $$
  select exists (
    select 1 from alertas
    where cliente_id = p_cliente and codigo = p_codigo and cerrada_at is null
  );
$$;


create or replace function fn_correr_reglas_duras()
returns table (codigo text, emitidas int)
language plpgsql as $$
declare
  v_count int;
begin

-- --------------------------------------------------------------------------
-- RD-01 · CADENCIA ROTA · más de 21 días sin sesión realizada
-- Gianna, 08/05, primera línea de su propia sesión: "no nos vemos hace 3 / 4
-- semanas". Nadie la contó. Esta es la regla que la hubiera atrapado.
-- 21-30 días: amarillo. Más de 30: rojo.
-- --------------------------------------------------------------------------
with ult as (
  select c.id as cliente_id, c.nombre,
         coalesce(max(s.fecha)::date, c.fecha_alta) as ultima,
         current_date - coalesce(max(s.fecha)::date, c.fecha_alta) as dias
  from clientes c
  left join sesiones s
    on s.cliente_id = c.id and s.estado_agenda = 'realizada'
  where c.estado = 'activo'
  group by c.id, c.nombre, c.fecha_alta
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-01', 'regla_dura',
       case when dias > 30 then 'rojo'::semaforo else 'amarillo'::semaforo end,
       'Cadencia rota · ' || dias || ' días sin sesión',
       'La última sesión realizada fue el ' || to_char(ultima, 'DD/MM') || '. Van '
         || dias || ' días. El acuerdo de cadencia del programa es semanal.',
       case when dias > 30
         then 'Revisión de caso en 48 h con alguien que no sea su consultora, y contacto el mismo día.'
         else 'Que la consultora agende la próxima sesión hoy y confirme el horario fijo.' end,
       case when dias > 30 then 'revision_externa'::destinatario_alerta
            else 'consultora'::destinatario_alerta end,
       case when dias > 30 then 48 else 72 end,
       case when dias > 30 then 90 else 70 end
from ult
where dias > 21
  and not fn_es_cliente_nuevo(cliente_id)
  and not fn_alerta_abierta(cliente_id, 'RD-01');
get diagnostics v_count = row_count;
return query select 'RD-01'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-02 · DOS CANCELACIONES O REPROGRAMACIONES SEGUIDAS
-- --------------------------------------------------------------------------
with ord as (
  select cliente_id, fecha, estado_agenda,
         lag(estado_agenda) over (partition by cliente_id order by fecha) as anterior,
         row_number() over (partition by cliente_id order by fecha desc) as rn
  from sesiones
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select o.cliente_id, 'RD-02', 'regla_dura', 'amarillo',
       'Dos cancelaciones seguidas',
       'Las dos últimas sesiones agendadas no se realizaron. La última fue el '
         || to_char(o.fecha, 'DD/MM') || ' (' || o.estado_agenda || ').',
       'Llamado corto fuera de agenda para entender el motivo. No reagendar por mensaje.',
       'consultora', 48, 65
from ord o
where o.rn = 1
  and o.estado_agenda in ('cancelada','reprogramada','no_asistio')
  and o.anterior in ('cancelada','reprogramada','no_asistio')
  and not fn_es_cliente_nuevo(o.cliente_id)
  and not fn_alerta_abierta(o.cliente_id, 'RD-02');
get diagnostics v_count = row_count;
return query select 'RD-02'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-03 · CUOTA VENCIDA HACE MÁS DE 30 DÍAS
-- Andy: dos de tres cuotas, 93 y 62 días. Se aplica también a clientes nuevos.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select p.cliente_id, 'RD-03', 'regla_dura', 'rojo',
       'Cuota ' || p.numero_cuota || ' vencida hace '
         || (current_date - p.fecha_vencimiento) || ' días',
       'Vencimiento ' || to_char(p.fecha_vencimiento,'DD/MM') || ', sin pago registrado. '
         || 'Monto ' || p.monto || ' ' || coalesce(p.moneda,'USD') || '.',
       'Definir quién habla de la cuota y cuándo. Si hay garantía firmada, revisar la cláusula antes de la próxima sesión.',
       'admin', 48, 95
from pagos p
join clientes c on c.id = p.cliente_id
where p.estado in ('pendiente','vencido')
  and p.fecha_pago is null
  and p.fecha_vencimiento < current_date - interval '30 days'
  and c.estado = 'activo'
  and not fn_alerta_abierta(p.cliente_id, 'RD-03');
get diagnostics v_count = row_count;
return query select 'RD-03'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-04 · CAMBIO DE CONSULTORA EN LOS ÚLTIMOS 30 DÍAS
-- El traspaso es el momento de mayor mortandad de la cartera. No es una
-- alerta de problema: es una ventana de vigilancia.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select t.cliente_id, 'RD-04', 'regla_dura', 'amarillo',
       'Traspaso reciente · ' || (current_date - t.fecha) || ' días',
       'Cambió de consultora el ' || to_char(t.fecha,'DD/MM')
         || '. El traspaso es el momento de mayor pérdida de clientes que tenemos.',
       'Confirmar que hubo al menos dos sesiones con la consultora nueva en las primeras tres semanas.',
       'admin', 168, 55
from traspasos t
join clientes c on c.id = t.cliente_id
where t.fecha > current_date - interval '30 days'
  and c.estado = 'activo'
  and not fn_alerta_abierta(t.cliente_id, 'RD-04');
get diagnostics v_count = row_count;
return query select 'RD-04'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-05 · SESIÓN SIN REGISTRO
-- Las dos sesiones donde el caso Parigi se rompió --27/07 y 11/08-- no tienen
-- registro. Justo cuando se calienta, desaparece la trazabilidad.
-- Una sesión sin registro en un cliente que YA tiene amarillo es rojo
-- automático.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, sesion_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select s.cliente_id, s.id, 'RD-05', 'regla_dura',
       case when exists (
              select 1 from alertas a
              where a.cliente_id = s.cliente_id and a.cerrada_at is null
                and a.estado_semaforo in ('amarillo','rojo'))
            then 'rojo'::semaforo else 'amarillo'::semaforo end,
       'Sesión del ' || to_char(s.fecha,'DD/MM') || ' sin registro',
       'No hay transcripción, grabación ni reporte de esa sesión. El caso queda ciego '
         || 'exactamente en el punto donde después no se puede reconstruir qué pasó.',
       'Cargar el reporte hoy. Si no hay grabación, escribir de memoria qué se trabajó y qué se comprometió.',
       'consultora', 24, 80
from sesiones s
join clientes c on c.id = s.cliente_id
where s.estado_agenda = 'realizada'
  and s.fecha < now() - interval '3 days'
  and s.transcripcion_texto is null
  and s.transcripcion_path is null
  and s.reporte is null
  and c.estado = 'activo'
  and not exists (
    select 1 from alertas a where a.sesion_id = s.id and a.codigo = 'RD-05'
  );
get diagnostics v_count = row_count;
return query select 'RD-05'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-06 · REPORTE CARGADO CON MÁS DE 48 HORAS DE ATRASO
-- Alerta sobre nosotros, no sobre el cliente. Le llega a la consultora.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, sesion_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select s.cliente_id, s.id, 'RD-06', 'regla_dura', 'amarillo',
       'Reporte pendiente · sesión del ' || to_char(s.fecha,'DD/MM'),
       'Pasaron más de 48 horas desde la sesión y el reporte no está cargado. '
         || 'Los reportes cargados en lote pierden el detalle que sirve.',
       'Cargar el reporte de esta sesión antes del cierre del día.',
       'consultora', 24, 40
from sesiones s
join clientes c on c.id = s.cliente_id
where s.estado_agenda = 'realizada'
  and s.reporte is null
  and s.fecha < now() - interval '48 hours'
  and s.fecha > now() - interval '14 days'
  and c.estado = 'activo'
  and not exists (
    select 1 from alertas a where a.sesion_id = s.id and a.codigo = 'RD-06'
  );
get diagnostics v_count = row_count;
return query select 'RD-06'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-07 · HITO DE RESULTADO VENCIDO · día 90 sin una venta registrada
-- Es la regla que define el producto: optimizamos resultados, no avance de
-- programa.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select c.id, 'RD-07', 'regla_dura', 'rojo',
       'Día ' || (current_date - c.fecha_alta) || ' sin una venta registrada',
       'Alta el ' || to_char(c.fecha_alta,'DD/MM')
         || '. No hay ninguna venta cargada en el tracker desde entonces.',
       'Revisión de caso completa con alguien que no sea su consultora: diagnóstico, cuello de botella y sprint nuevo.',
       'revision_externa', 48, 100
from clientes c
where c.estado = 'activo'
  and c.fecha_alta <= current_date - interval '90 days'
  and coalesce((select sum(m.ventas) from metricas_semanales m where m.cliente_id = c.id), 0) = 0
  and not fn_alerta_abierta(c.id, 'RD-07');
get diagnostics v_count = row_count;
return query select 'RD-07'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-08 · DOS AMARILLAS DEL MISMO CÓDIGO EN TRES SESIONES → ROJO AUTOMÁTICO
-- La regla que hoy no existe y es la que importa. Parigi tuvo cinco escalones
-- emocionales en diez semanas y ninguno disparó una revisión. Esta regla
-- rompe ese patrón sin que nadie tenga que opinar.
-- --------------------------------------------------------------------------
with ventana as (
  select cliente_id, max(fecha) as hasta,
         (array_agg(fecha order by fecha desc))[least(3, count(*))] as desde
  from sesiones where estado_agenda = 'realizada'
  group by cliente_id
),
repetidas as (
  select a.cliente_id, a.codigo, count(*) as veces,
         min(a.emitida_at) as primera, max(a.emitida_at) as ultima,
         array_agg(a.id) as ids
  from alertas a
  join ventana v on v.cliente_id = a.cliente_id
  where a.estado_semaforo = 'amarillo'
    and a.emitida_at >= v.desde
  group by a.cliente_id, a.codigo
  having count(*) >= 2
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad, escalada_a_id)
select r.cliente_id, 'RD-08', 'regla_dura', 'rojo',
       'Escalado automático · ' || r.codigo || ' por ' || r.veces || 'ª vez',
       'La misma alerta (' || r.codigo || ') apareció ' || r.veces
         || ' veces en las últimas tres sesiones, entre el '
         || to_char(r.primera,'DD/MM') || ' y el ' || to_char(r.ultima,'DD/MM')
         || '. Dos amarillas iguales en tres sesiones son rojo, sin que nadie tenga que opinar.',
       'Revisión de caso en 48 h con alguien que no sea su consultora. La roja solo la cierra quien hizo la revisión.',
       'revision_externa', 48, 98, r.ids[1]
from repetidas r
where not fn_alerta_abierta(r.cliente_id, 'RD-08');
get diagnostics v_count = row_count;
return query select 'RD-08'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-09 · CERO ASISTENCIA A MENTORÍAS EN TRES SEMANAS
-- Relevante sobre todo con garantía firmada: la cláusula exige dos mentorías
-- grupales por semana.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select c.id, 'RD-09', 'regla_dura', 'amarillo',
       'Sin mentorías en 3 semanas',
       'No registra asistencia a ninguna mentoría grupal desde hace más de 21 días.'
         || case when c.tiene_garantia
                 then ' Tiene garantía firmada: la cláusula exige dos mentorías por semana.'
                 else '' end,
       'Preguntar en la próxima sesión si el obstáculo es el horario. Si lo es, es un problema nuestro, no del cliente.',
       'consultora', 168, case when c.tiene_garantia then 75 else 45 end
from clientes c
where c.estado = 'activo'
  and not fn_es_cliente_nuevo(c.id)
  and not exists (
    select 1 from asistencias_mentoria am
    where am.cliente_id = c.id and am.asistio
      and am.fecha > current_date - interval '21 days')
  and not fn_alerta_abierta(c.id, 'RD-09');
get diagnostics v_count = row_count;
return query select 'RD-09'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-10 · EL CLIENTE BAJÓ SU PRECIO POR INICIATIVA PROPIA
-- A Parigi le pasó el 02/07: de 20.000 a 15.000, sin llamada de venta de por
-- medio, y nadie lo frenó. Requiere estrategia_versiones append-only.
-- --------------------------------------------------------------------------
with cambios as (
  select ev.cliente_id, ev.version, ev.precio, ev.vigente_desde, ev.iniciativa,
         lag(ev.precio) over (partition by ev.cliente_id order by ev.version) as precio_anterior
  from estrategia_versiones ev
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select ch.cliente_id, 'RD-10', 'regla_dura', 'rojo',
       'Bajó su precio por iniciativa propia',
       'El precio pasó de ' || ch.precio_anterior || ' a ' || ch.precio || ' el '
         || to_char(ch.vigente_desde,'DD/MM')
         || ', a iniciativa del cliente y sin llamada de venta de por medio.',
       'Frenar el cambio antes de que se comunique al mercado y revisar por qué bajó: casi nunca es el precio, es la percepción de valor.',
       'revision_externa', 48, 92
from cambios ch
join clientes c on c.id = ch.cliente_id
where ch.precio_anterior is not null
  and ch.precio < ch.precio_anterior * 0.9
  and ch.iniciativa = 'cliente'
  and ch.vigente_desde > current_date - interval '30 days'
  and c.estado = 'activo'
  and not fn_alerta_abierta(ch.cliente_id, 'RD-10');
get diagnostics v_count = row_count;
return query select 'RD-10'::text, v_count;

end $$;


-- ============================================================================
-- TECHO DE 10 ALERTAS POR SEMANA
-- Con ~85 clientes activos, si esto tira más de 10 alertas por semana se
-- deja de leer en un mes. Las que pasan el techo NO se borran: se marcan como
-- diferidas y van al informe mensual.
-- Las negras nunca se difieren.
-- ============================================================================

create or replace function fn_aplicar_techo_semanal(p_techo int default 10)
returns int language plpgsql as $$
declare v_diferidas int;
begin
  with ranking as (
    select id,
           row_number() over (order by prioridad desc, emitida_at asc) as pos
    from alertas
    where emitida_en_semana = date_trunc('week', now())::date
      and cerrada_at is null
      and estado_semaforo <> 'negro'
      and not diferida
  )
  update alertas a
     set diferida = true
    from ranking r
   where a.id = r.id and r.pos > p_techo;
  get diagnostics v_diferidas = row_count;
  return v_diferidas;
end $$;


-- ============================================================================
-- PROGRAMACIÓN · todas las noches a las 03:00 hora de Buenos Aires (06:00 UTC)
-- ============================================================================

select cron.schedule(
  'reglas-duras-nocturnas',
  '0 6 * * *',
  $$ select fn_correr_reglas_duras(); select fn_aplicar_techo_semanal(10); $$
);

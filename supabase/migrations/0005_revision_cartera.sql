-- ============================================================================
-- 0005 · Lo que salió de la revisión de cartera de agosto de 2026
--
-- Cuatro cosas que la reunión dejó claras y que el modelo no tenía:
--   1. El margen de pago es del contrato de cada cliente, no una constante.
--   2. Una prórroga es una excepción autorizada con nombre, fecha y resultado.
--   3. Una baja no es un estado: es un checklist que se olvida de a uno.
--   4. Un atraso sin responsable es una observación, no una decisión.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Condiciones que viajan con el cliente
-- ---------------------------------------------------------------------------

alter table clientes
  -- Los contratos viejos firmaron 5 días de margen; los nuevos, 3. Aplicarle la
  -- condición nueva a un contrato viejo es indefendible, así que el número vive
  -- acá y no en el código.
  add column if not exists dias_gracia_pago smallint not null default 5
    check (dias_gracia_pago between 0 and 30),
  -- El negocio que trajo no corresponde al nivel del producto que compró. Es un
  -- problema de venta y de asignación: no del cliente ni de su consultora.
  add column if not exists nivel_desalineado boolean not null default false,
  add column if not exists nivel_vendido text;

alter table consultoras
  -- La sobrecarga la declara ella. No se deduce del cupo: se puede estar al tope
  -- y bien, o con ocho clientes y fundida.
  add column if not exists mano_levantada_at date,
  add column if not exists mano_levantada_nota text,
  add column if not exists sesiones_back_to_back smallint not null default 0;

-- ---------------------------------------------------------------------------
-- 2 · Prórrogas
-- ---------------------------------------------------------------------------

create table if not exists prorrogas (
  id               uuid primary key default gen_random_uuid(),
  cliente_id       uuid not null references clientes(id) on delete cascade,
  pago_id          uuid not null references pagos(id) on delete cascade,
  dias_otorgados   smallint not null check (dias_otorgados between 1 and 90),
  autorizada_por   text not null,
  autorizada_at    date not null default current_date,
  nueva_fecha      date not null,
  motivo           text,
  -- La columna que convierte «creo que uno o dos cumplieron» en una política.
  resultado        text check (resultado in ('pago', 'no_pago')),
  resuelta_at      date,
  created_at       timestamptz not null default now()
);

create index if not exists ix_prorrogas_cliente on prorrogas(cliente_id);
create index if not exists ix_prorrogas_abiertas on prorrogas(nueva_fecha) where resultado is null;

-- Una segunda prórroga sobre la misma cuota no es una excepción: es un plan de
-- pago nuevo, y se carga como tal.
create unique index if not exists ux_prorroga_por_pago on prorrogas(pago_id);

-- ---------------------------------------------------------------------------
-- 3 · Bajas y su checklist
-- ---------------------------------------------------------------------------

create table if not exists bajas (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  fecha           date not null default current_date,
  motivo          text not null check (motivo in ('falta_de_pago', 'voluntaria', 'reembolso', 'fin_programa')),
  solicitada_por  text not null check (solicitada_por in ('cliente', 'founders')),
  pidio_reembolso boolean not null default false,
  nota            text,
  -- [{key, hechoAt, hechoPor}]. El paso que más se olvida es 'telegram'.
  pasos           jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists ix_bajas_cliente on bajas(cliente_id);

-- Una baja debería dejar al cliente fuera de la cartera activa. Que hoy no pase
-- automáticamente es justamente el problema.
create or replace function fn_baja_marca_cliente() returns trigger as $$
begin
  update clientes set estado = 'perdido'
   where id = new.cliente_id and estado = 'activo';
  return new;
end $$ language plpgsql;

drop trigger if exists tg_baja_marca_cliente on bajas;
create trigger tg_baja_marca_cliente after insert on bajas
  for each row execute function fn_baja_marca_cliente();

-- ---------------------------------------------------------------------------
-- 4 · Atribución y revisión de caso
-- ---------------------------------------------------------------------------

do $$ begin
  create type responsable_desvio as enum ('cliente', 'nosotros', 'ambos', 'sin_datos', 'ninguno');
exception when duplicate_object then null; end $$;

-- Append-only, igual que estrategia_versiones: una corrección de criterio es
-- una fila nueva. Poder discutir después por qué alguien pensó distinto vale
-- más que tener la tabla prolija.
create table if not exists atribuciones (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  responsable  responsable_desvio not null,
  texto        text not null check (length(trim(texto)) >= 20),
  por          text not null,
  at           date not null default current_date,
  created_at   timestamptz not null default now()
);

create index if not exists ix_atribuciones_cliente on atribuciones(cliente_id, at desc);

create rule atribuciones_sin_update as on update to atribuciones do instead nothing;
create rule atribuciones_sin_delete as on delete to atribuciones do instead nothing;

create table if not exists revisiones_caso (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references clientes(id) on delete cascade,
  revisada_por       text not null,
  fecha              date not null default current_date,
  responsable        responsable_desvio not null,
  -- Una revisión sin veredicto escrito fue una charla sobre el caso.
  veredicto          text not null check (length(trim(veredicto)) >= 20),
  accion_acordada    text not null check (length(trim(accion_acordada)) >= 10),
  responsable_accion text not null,
  fecha_seguimiento  date,
  created_at         timestamptz not null default now()
);

create index if not exists ix_revisiones_cliente on revisiones_caso(cliente_id, fecha desc);


-- ---------------------------------------------------------------------------
-- 5 · RLS
--
-- Cobranza y bajas son de administración. La consultora del caso no las toca:
-- es justamente la persona a la que más le cuesta decir que no, porque es la
-- que hizo el onboarding y la que sostiene la relación. Separar el rol es lo
-- que hace que el corte no dependa de la fuerza de voluntad de nadie.
-- ---------------------------------------------------------------------------

create or replace function fn_es_su_cliente(p_cliente uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from clientes c
    where c.id = p_cliente and c.consultora_id = fn_consultora_id()
  );
$$;

alter table prorrogas       enable row level security;
alter table bajas           enable row level security;
alter table atribuciones    enable row level security;
alter table revisiones_caso enable row level security;

create policy prorrogas_admin on prorrogas
  for all using (fn_es_admin()) with check (fn_es_admin());

create policy bajas_admin on bajas
  for all using (fn_es_admin()) with check (fn_es_admin());

-- La atribución y la revisión sí las ve la consultora sobre sus casos: son el
-- material con el que entra a la sesión.
create policy atribuciones_lectura on atribuciones
  for select using (fn_es_admin() or fn_es_su_cliente(cliente_id));

create policy atribuciones_escritura on atribuciones
  for insert with check (fn_es_admin() or fn_es_su_cliente(cliente_id));

create policy revisiones_lectura on revisiones_caso
  for select using (fn_es_admin() or fn_es_su_cliente(cliente_id));

-- Una revisión de caso la escribe quien revisa, y por definición no es la
-- consultora del caso. Mismo principio que el cierre de una alerta roja.
create policy revisiones_escritura on revisiones_caso
  for insert with check (fn_es_admin() or not fn_es_su_cliente(cliente_id));


-- ============================================================================
-- 6 · Reglas duras nuevas · RD-18 a RD-23
--
-- Mismo contrato que las anteriores: restas de fechas y sumas de filas, sin
-- modelo de lenguaje, idempotentes por (cliente, código), con responsable,
-- plazo y prioridad. Ninguna de las cuatro de cobranza mira el semáforo del
-- cliente, y eso es deliberado.
-- ============================================================================

create or replace function fn_correr_reglas_cobranza()
returns table (codigo text, emitidas int)
language plpgsql as $$
declare v_count int;
begin

-- --------------------------------------------------------------------------
-- Cuota impaga más vieja de cada cliente, con el margen de SU contrato y la
-- prórroga vigente si la hubiera. Todo lo de abajo se apoya en esta vista.
-- --------------------------------------------------------------------------
create temp table if not exists _cobranza on commit drop as
with impagas as (
  select p.id as pago_id, p.cliente_id, p.numero_cuota, p.monto, p.moneda,
         p.fecha_vencimiento,
         row_number() over (partition by p.cliente_id order by p.fecha_vencimiento) as rn
  from pagos p
  where p.fecha_pago is null and p.estado <> 'incobrable'
)
select i.*, c.dias_gracia_pago,
       i.fecha_vencimiento + c.dias_gracia_pago as limite,
       pr.id as prorroga_id, pr.nueva_fecha as prorroga_hasta, pr.autorizada_por,
       (select coalesce(sum(p2.monto), 0) from pagos p2
         where p2.cliente_id = i.cliente_id and p2.fecha_pago is null
           and p2.estado <> 'incobrable' and p2.fecha_vencimiento <= current_date) as deuda
  from impagas i
  join clientes c on c.id = i.cliente_id and c.estado = 'activo'
  left join prorrogas pr on pr.pago_id = i.pago_id and pr.resultado is null
 where i.rn = 1;

-- --------------------------------------------------------------------------
-- RD-18 · CUOTA VENCIDA DENTRO DEL MARGEN DEL CONTRATO
-- Todavía corren los días que firmó este cliente. No es un incumplimiento
-- todavía: es la ventana en la que el cobro se resuelve bien.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-18', 'regla_dura', 'amarillo',
       'Cuota vencida dentro del margen del contrato',
       'Cuota ' || numero_cuota || ' venció el ' || fecha_vencimiento || ', hace '
         || (current_date - fecha_vencimiento) || ' día(s). El margen de este contrato es de '
         || dias_gracia_pago || ' días: el corte cae el ' || limite || '.',
       'Seguimiento por el canal de siempre, con la fecha de corte explícita. No negociar plazos nuevos sin autorización.',
       'admin', 24, 74
from _cobranza
where prorroga_id is null
  and fecha_vencimiento < current_date and current_date <= limite
  and not fn_alerta_abierta(cliente_id, 'RD-18')
  and not fn_suprimida(cliente_id, array['RD-19', 'RD-20', 'RD-03']);
get diagnostics v_count = row_count;
return query select 'RD-18'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-19 · CORTE DE ACCESOS PENDIENTE
-- Se cumplió el margen y el cliente sigue adentro. Cada día extra es servicio
-- regalado y, peor, un precedente que la próxima vez se invoca.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-19', 'regla_dura', 'rojo',
       'Corte de accesos pendiente',
       'Cuota ' || numero_cuota || ' vencida hace ' || (current_date - fecha_vencimiento)
         || ' días. El margen de ' || dias_gracia_pago || ' días terminó el ' || limite
         || ', hace ' || (current_date - limite) || '. Deuda exigible: ' || moneda || ' ' || deuda || '.',
       'Cortar accesos hoy y mandar el mensaje de corte.',
       'admin', 24, 94
from _cobranza
where prorroga_id is null and current_date > limite
  and not fn_alerta_abierta(cliente_id, 'RD-19')
  and not fn_suprimida(cliente_id, array['RD-03']);
get diagnostics v_count = row_count;
return query select 'RD-19'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-20 · PRÓRROGA VENCIDA SIN PAGO
-- La excepción tenía fecha y la fecha pasó. Una segunda excepción convierte el
-- contrato en una sugerencia.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-20', 'regla_dura', 'rojo',
       'Prórroga vencida sin pago',
       'La prórroga que autorizó ' || autorizada_por || ' venció el ' || prorroga_hasta
         || ', hace ' || (current_date - prorroga_hasta) || ' días, y la cuota ' || numero_cuota
         || ' sigue impaga.',
       'Corte hoy y registrar el resultado de la prórroga: sin ese dato la política se vuelve a discutir la próxima vez.',
       'admin', 24, 93
from _cobranza
where prorroga_id is not null and current_date > prorroga_hasta
  and not fn_alerta_abierta(cliente_id, 'RD-20');
get diagnostics v_count = row_count;
return query select 'RD-20'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-21 · BAJA CON EL CHECKLIST SIN TERMINAR
-- Un cliente dado de baja que sigue leyendo el Telegram es un problema que
-- vuelve, y es el paso que más se olvida.
-- --------------------------------------------------------------------------
with pendientes as (
  select b.cliente_id, b.fecha,
         (select count(*) from jsonb_array_elements(b.pasos) p
           where p->>'hechoAt' is null) as faltan
  from bajas b
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select cliente_id, 'RD-21', 'regla_dura',
       case when current_date - fecha > 7 then 'rojo' else 'amarillo' end,
       'Baja con el checklist sin terminar',
       'Baja del ' || fecha || ', hace ' || (current_date - fecha) || ' días, con '
         || faltan || ' paso(s) del checklist sin hacer.',
       'Completar el checklist hoy: accesos, Telegram, comunidad, mentorías, cobros recurrentes y Drive.',
       'admin', 24,
       case when current_date - fecha > 7 then 86 else 68 end
from pendientes
where faltan > 0 and current_date - fecha >= 2
  and not fn_alerta_abierta(cliente_id, 'RD-21');
get diagnostics v_count = row_count;
return query select 'RD-21'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-22 · CAMBIO DE CONSULTORA SIN SESIÓN DE TRANSICIÓN
-- Los dos casos de reclamo documentados este mes tienen un cambio de coach sin
-- transición atrás. El cliente no tiene que volver a contar su historia.
-- --------------------------------------------------------------------------
with ultimo as (
  select t.cliente_id, max(t.fecha) as fecha
  from traspasos t group by t.cliente_id
)
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select u.cliente_id, 'RD-22', 'regla_dura', 'amarillo',
       'Cambio de consultora sin sesión de transición',
       'Cambio de consultora el ' || u.fecha || ', hace ' || (current_date - u.fecha)
         || ' días, y todavía no hubo una sesión realizada con la nueva.',
       'Sesión de transición esta semana, con el expediente repasado antes.',
       'consultora', 72, 78
from ultimo u
join clientes c on c.id = u.cliente_id and c.estado = 'activo'
where current_date - u.fecha >= 7
  and not exists (
    select 1 from sesiones s
    where s.cliente_id = u.cliente_id and s.estado_agenda = 'realizada' and s.fecha >= u.fecha
  )
  and not fn_alerta_abierta(u.cliente_id, 'RD-22')
  and not fn_suprimida(u.cliente_id, array['RD-01']);
get diagnostics v_count = row_count;
return query select 'RD-22'::text, v_count;

-- --------------------------------------------------------------------------
-- RD-23 · EL PRODUCTO NO CORRESPONDE AL NIVEL DEL NEGOCIO
-- Compró una etapa y trajo un negocio de otra. No es un problema del cliente
-- ni de la consultora que lo recibe: se produjo en la venta.
-- --------------------------------------------------------------------------
insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo,
                     pedido, destinatario, plazo_horas, prioridad)
select c.id, 'RD-23', 'regla_dura', 'amarillo',
       'El producto no corresponde al nivel del negocio',
       'Compró ' || coalesce(c.nivel_vendido, 'el programa de entrada')
         || ' y el negocio que trajo está en otra etapa.',
       'Revisar la llamada de venta con dirección y definir si se recoloca el producto o se ajusta el acompañamiento. Antes de que lo diga él.',
       'admin', 96, 76
from clientes c
where c.estado = 'activo' and c.nivel_desalineado
  and current_date - c.fecha_alta >= 14
  and not fn_alerta_abierta(c.id, 'RD-23');
get diagnostics v_count = row_count;
return query select 'RD-23'::text, v_count;

end $$;

-- ============================================================================
-- La corrida completa incluye ahora el bloque de cobranza.
-- ============================================================================
create or replace function fn_correr_todas_las_reglas()
returns table (codigo text, emitidas int)
language plpgsql as $$
begin
  return query select * from fn_correr_reglas_duras();
  return query select * from fn_correr_reglas_fusion();
  return query select * from fn_correr_reglas_cobranza();
  perform fn_aplicar_techo_semanal(10);
end $$;

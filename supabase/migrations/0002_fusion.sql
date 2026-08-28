-- ============================================================================
-- FOUNDERS BRAIN · migración de fusión
--
-- El esquema de Brain (0001) es canónico y no se toca: está probado contra
-- Postgres 16 y su vocabulario es el que el equipo lee. Esta migración agrega
-- lo que el CRM de Customer Success traía y Brain no tenía, y nada más.
--
-- Qué se agrega y por qué:
--   1. objetivos_comerciales · la cuenta inversa deja de vivir dentro de un
--      JSON de onboarding y pasa a ser una tabla consultable. Es lo que
--      convierte "el volumen parece bajo" en "37 DMs contra los 104 que
--      necesita para su meta con su ticket".
--   2. hitos_def / hitos_cliente · el reloj del programa. El módulo mide
--      avance de programa; los hitos miden avance de negocio, que es lo que
--      define si el cliente vende antes del día 60.
--   3. lecturas_consultora · el juicio de la consultora, versionado. No se
--      promedia en ningún puntaje: dispara alertas (CR-01, CR-02).
--   4. sesiones.satisfaccion · la casilla que hoy está vacía en 818 filas.
--      Se captura en el cierre de sesión, en un toque.
--   5. alertas.veces_emitida · para poder decir "(2ª vez)" sin recontar, que
--      es la mitad del valor de una alerta de criterio.
-- ============================================================================

-- ---------------------------------------------------------------- 1 · objetivos
create table objetivos_comerciales (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references clientes(id) on delete cascade,
  meta_mensual           numeric(14,2) not null,
  ticket                 numeric(14,2) not null check (ticket > 0),
  moneda                 text not null default 'USD',
  -- Tasas usadas para la cuenta inversa. Si no se midieron, se usan las de
  -- objetivo; cuando el cliente tiene muestra propia, se reemplazan.
  tasa_cierre            numeric(4,3) not null default 0.320,
  tasa_asistencia        numeric(4,3) not null default 0.850,
  tasa_agendamiento      numeric(4,3) not null default 0.450,
  tasa_avance            numeric(4,3) not null default 0.600,
  tasa_dm_sobre_alcance  numeric(5,4) not null default 0.0050,
  dia_inicio_prospeccion int not null default 30,
  vigente_desde          date not null default current_date,
  creado_por             uuid references consultoras(id),
  created_at             timestamptz not null default now()
);
create index on objetivos_comerciales (cliente_id, vigente_desde desc);

comment on table objetivos_comerciales is
  'La cuenta inversa desde la meta. De acá sale el KPI semanal del cliente: cuántos DMs por semana necesita para su meta con su ticket.';

-- El KPI semanal, calculado en la base para que las reglas duras del cron no
-- tengan que replicar la aritmética.
create or replace function fn_kpi_semanal(p_cliente uuid)
returns table (dms_semana int, agendas_semana int, ventas_mes int)
language sql stable as $$
  select
    ceil(((o.meta_mensual / o.ticket) / o.tasa_cierre / o.tasa_asistencia
          / o.tasa_agendamiento / o.tasa_avance) / 4)::int,
    ceil(((o.meta_mensual / o.ticket) / o.tasa_cierre / o.tasa_asistencia) / 4)::int,
    ceil(o.meta_mensual / o.ticket)::int
  from objetivos_comerciales o
  where o.cliente_id = p_cliente
  order by o.vigente_desde desc
  limit 1;
$$;

-- ---------------------------------------------------------------- 2 · hitos
create type fase_negocio as enum ('definicion', 'mensaje', 'volumen', 'conversion', 'escala');

create type estado_hito as enum (
  'sin_trabajar', 'en_progreso', 'necesita_ajustes', 'bloqueado', 'cumplido'
);

-- Catálogo configurable: dirección puede mover un día esperado sin un deploy.
create table hitos_def (
  key         text primary key,
  label       text not null,
  dia         int not null,
  fase        fase_negocio not null,
  gate        boolean not null default false,
  confirma    rol_usuario not null default 'consultora',
  -- Los hitos automáticos se derivan de los números y nadie los tilda a mano.
  automatico  text,
  detalle     text,
  orden       int not null default 0
);

create table hitos_cliente (
  cliente_id     uuid not null references clientes(id) on delete cascade,
  hito_key       text not null references hitos_def(key),
  estado         estado_hito not null default 'sin_trabajar',
  nota           text,
  actualizado_at date not null default current_date,
  actualizado_por uuid references consultoras(id),
  cumplido_at    date,
  confirmado_por uuid references consultoras(id),
  primary key (cliente_id, hito_key)
);
create index on hitos_cliente (cliente_id) where estado <> 'cumplido';

-- Un gate lo confirma la administración, no la consultora del caso. Es lo que
-- hace que "oferta cerrada" signifique lo mismo para las seis consultoras.
create or replace function fn_valida_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gate boolean; v_confirma rol_usuario;
begin
  select gate, confirma into v_gate, v_confirma from hitos_def where key = new.hito_key;
  if coalesce(v_gate, false)
     and new.estado = 'cumplido'
     and v_confirma = 'admin'
     and not fn_es_admin() then
    raise exception 'El hito % es un gate: lo confirma administración, no la consultora del caso.', new.hito_key;
  end if;
  return new;
end $$;

create trigger tg_valida_gate
  before insert or update on hitos_cliente
  for each row execute function fn_valida_gate();

-- ---------------------------------------------------------------- 3 · lectura
create type percepcion_consultora as enum ('muy_bien', 'bien', 'atencion', 'riesgo');
create type potencial as enum ('alto', 'medio', 'bajo');

create table lecturas_consultora (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  consultora_id        uuid not null references consultoras(id),
  sesion_id            uuid references sesiones(id) on delete set null,
  fecha                date not null default current_date,
  percepcion           percepcion_consultora not null,
  -- Reusa el enum de bloqueo del método, más 'ninguno' cuando no hay.
  bloqueo_declarado    text not null default 'ninguno',
  necesita_intervencion boolean not null default false,
  potencial_renovacion potencial not null default 'medio',
  comentario           text,
  created_at           timestamptz not null default now()
);
create index on lecturas_consultora (cliente_id, fecha desc);

comment on table lecturas_consultora is
  'El juicio de la consultora, versionado. No se promedia en ningún puntaje: dispara alertas CR-01 y CR-02. Así el número sigue siendo objetivo y el criterio humano sigue siendo soberano.';

-- ---------------------------------------------------------------- 4 · satisfacción
alter table sesiones
  add column satisfaccion int check (satisfaccion between 0 and 10);

comment on column sesiones.satisfaccion is
  'Una sola pregunta al cierre de la sesión. Hoy esta casilla está vacía en las 818 filas de la planilla: el dato no existe porque nunca se pidió en el momento en que se puede pedir.';

-- ---------------------------------------------------------------- 5 · alertas
-- Nota de operación: en Postgres 12+ esto puede correr dentro de una
-- transacción siempre que el valor nuevo no se use en la misma transacción.
alter type origen_alerta add value if not exists 'lectura';

alter table alertas
  add column veces_emitida int not null default 1;

comment on column alertas.veces_emitida is
  'Para poder decir "(2ª vez)" sin recontar. Relacionar la alerta con la anterior es la mitad de su valor.';

-- ---------------------------------------------------------------- 6 · RLS
alter table objetivos_comerciales enable row level security;
alter table hitos_cliente         enable row level security;
alter table lecturas_consultora   enable row level security;
alter table hitos_def             enable row level security;

do $$
declare t text;
begin
  foreach t in array array['objetivos_comerciales', 'hitos_cliente', 'lecturas_consultora'] loop
    execute format($f$
      create policy p_%1$s_todo on %1$s for all
        using (
          fn_es_admin() or exists (
            select 1 from clientes c
            where c.id = %1$s.cliente_id and c.consultora_id = fn_consultora_id()
          )
        );
    $f$, t);
  end loop;
end $$;

create policy p_hitos_def_lectura on hitos_def for select using (auth.uid() is not null);
create policy p_hitos_def_admin on hitos_def for all
  using (fn_es_admin()) with check (fn_es_admin());

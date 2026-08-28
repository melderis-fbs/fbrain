-- 0006 · La ficha editable y el registro de llamadas al modelo
--
-- Dos cosas que el paquete pedía y no existían:
--
--  1. `telefono` en clientes. Estaba en la planilla de finanzas desde siempre
--     y no tenía dónde caer.
--  2. `llamadas_modelo`. `09-integraciones` es explícito: log de cada llamada
--     con motor, prompt_version, modelo, tokens y si validó al primer intento.
--     Sin esto el costo se descubre en la factura, y un motor que reintenta
--     mucho —la señal más temprana de que su prompt o su schema están mal— no
--     se nota hasta que alguien se queja de la salida.

alter table clientes add column if not exists telefono text;

create table if not exists llamadas_modelo (
  id                uuid primary key default gen_random_uuid(),
  motor             text        not null,
  cliente_id        uuid        references clientes(id) on delete set null,
  consultora_id     uuid        references consultoras(id) on delete set null,
  prompt_version    text        not null,
  modelo            text        not null,
  tokens_entrada    integer     not null default 0,
  tokens_salida     integer     not null default 0,
  cache_leido       integer     not null default 0,
  intentos          smallint    not null default 1,
  valido_primer_intento boolean not null default true,
  ms                integer     not null default 0,
  error             text,
  creado_at         timestamptz not null default now()
);

create index if not exists ix_llamadas_modelo_motor on llamadas_modelo (motor, creado_at desc);
create index if not exists ix_llamadas_modelo_cliente on llamadas_modelo (cliente_id, creado_at desc);

alter table llamadas_modelo enable row level security;

-- El gasto lo mira administración. Una consultora no necesita ver el costo de
-- la cartera entera para hacer su trabajo.
create policy llamadas_modelo_admin on llamadas_modelo
  for select using (
    exists (select 1 from consultoras c where c.auth_user_id = auth.uid() and c.rol = 'admin')
  );

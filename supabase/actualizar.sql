-- =====================================================================
--  FOUNDERS BRAIN · PONER LA BASE AL DÍA
-- =====================================================================
--
--  Para una base donde ya corriste `instalar.sql` alguna vez y quedó
--  atrás. Junta todo lo que se agregó después, en un solo pegado.
--
--  SE PUEDE CORRER VARIAS VECES SIN MIEDO. Todo es aditivo y con
--  `if not exists`: no borra datos, no pisa nada y no falla si algo ya
--  estaba. Si no sabés qué te falta, corré esto entero.
--
--  SQL Editor → New query → pegar → Run.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1 · Las columnas que faltan en `clientes`
-- ---------------------------------------------------------------------
--  Lo comercial que la planilla de finanzas ya tenía y se perdía al
--  importar, las renovaciones, y la marca de fecha de inicio estimada.

alter table clientes
  add column if not exists closer                 text,
  add column if not exists setter                 text,
  add column if not exists monto_total            numeric(12,2),
  add column if not exists cantidad_cuotas        smallint,
  add column if not exists estado_deuda           text,
  add column if not exists notas                  text,
  add column if not exists renovaciones           smallint not null default 0,
  add column if not exists ultima_renovacion      date,
  add column if not exists fecha_alta_provisional boolean not null default false;


-- ---------------------------------------------------------------------
--  1bis · Que la base acepte lo que el tipo declara opcional
-- ---------------------------------------------------------------------
--  Un default sólo se aplica cuando la columna NO viene en el insert. La
--  app las manda con valor null —porque el campo es opcional y está
--  vacío— y ahí Postgres las rechaza. Los defaults se quedan para las
--  filas que se cargan por SQL; lo que se levanta es la obligación.

alter table clientes alter column dias_gracia_pago       drop not null;
alter table clientes alter column nivel_desalineado      drop not null;
alter table clientes alter column renovaciones           drop not null;
alter table clientes alter column fecha_alta_provisional drop not null;


-- ---------------------------------------------------------------------
--  2 · Las políticas de INSERT que faltaban
-- ---------------------------------------------------------------------
--  `clientes` tenía política de SELECT y de UPDATE pero ninguna de
--  INSERT, así que con RLS activo ningún cliente nuevo podía entrar
--  nunca: la importación corría entera y Postgres descartaba cada fila.
--  Lo mismo con `alertas` y `llamadas_modelo`.
--
--  El `drop ... if exists` es para poder correr esto de nuevo: crear una
--  política que ya existe es lo único de este archivo que daría error.

drop policy if exists p_clientes_alta on clientes;
create policy p_clientes_alta on clientes for insert
  with check (fn_es_admin() or consultora_id = fn_consultora_id());

drop policy if exists p_alertas_alta on alertas;
create policy p_alertas_alta on alertas for insert
  with check (
    fn_es_admin() or exists (
      select 1 from clientes c
      where c.id = alertas.cliente_id and c.consultora_id = fn_consultora_id()
    )
  );

drop policy if exists p_llamadas_alta on llamadas_modelo;
create policy p_llamadas_alta on llamadas_modelo for insert
  with check (auth.uid() is not null);


-- ---------------------------------------------------------------------
--  3 · Avisarle a la API que el esquema cambió
-- ---------------------------------------------------------------------
--  Supabase sirve las tablas por PostgREST, que cachea el esquema. Sin
--  esto, agregar una columna y usarla enseguida devuelve
--  «Could not find the 'X' column of 'clientes' in the schema cache»,
--  que parece que la columna no se creó cuando en realidad sí.

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
--  4 · Verificar
-- 0014 · La propuesta de ficha
--
-- El extractor ya sabe convertir los documentos de un cliente en los campos
-- del expediente. Lo que faltaba es poder correrlo sobre la cartera entera sin
-- que alguien abra 104 fichas, y que el resultado espere a que una persona lo
-- lea.
--
-- Por eso la propuesta se guarda y no se aplica. La diferencia no es prolijidad:
-- la meta mensual y el ticket alimentan la cuenta inversa y el KPI semanal, así
-- que un número que el modelo dedujo mal no queda como un dato flojo — queda
-- como el objetivo que la consultora persigue toda la semana. Propuesto y sin
-- confirmar sí; confirmado sin que nadie lo mire, no.
--
-- Una fila por cliente: la propuesta no es un historial, es un borrador. Al
-- guardar la ficha se marca `aplicada_at` y el barrido no vuelve a gastar una
-- llamada en ese cliente.

create table if not exists propuestas_ficha (
  cliente_id    uuid primary key references clientes(id) on delete cascade,
  -- El objeto que devuelve el motor, tal cual, con sus citas y sus
  -- contradicciones. Se guarda entero porque la cita es lo que permite
  -- verificar el campo, y sin ella la propuesta no se puede auditar.
  datos         jsonb not null,
  -- Sobre cuántos documentos se extrajo. Una propuesta hecha sobre un
  -- documento no vale lo mismo que una hecha sobre seis.
  documentos    int not null default 0,
  motor_version text,
  creado_at     timestamptz not null default now(),
  aplicada_at   timestamptz
);

alter table propuestas_ficha enable row level security;

-- Mismo alcance que el expediente: la consultora ve y decide sobre sus
-- clientes; administración, sobre todos.
drop policy if exists propuestas_lectura on propuestas_ficha;
create policy propuestas_lectura on propuestas_ficha
  for select using (
    exists (
      select 1 from clientes c
      join consultoras k on k.auth_user_id = auth.uid()
      where c.id = propuestas_ficha.cliente_id
        and (k.rol = 'admin' or c.consultora_id = k.id)
    )
  );

drop policy if exists propuestas_escritura on propuestas_ficha;
create policy propuestas_escritura on propuestas_ficha
  for all using (
    exists (
      select 1 from clientes c
      join consultoras k on k.auth_user_id = auth.uid()
      where c.id = propuestas_ficha.cliente_id
        and (k.rol = 'admin' or c.consultora_id = k.id)
    )
  );

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
--  Tiene que devolver UNA fila: 9 columnas nuevas, 3 políticas, 4
--  opcionales y 1 tabla de propuestas. Si algún número es menor, algo
--  de arriba no corrió.

select
  (select count(*) from information_schema.columns
    where table_name = 'clientes'
      and column_name in ('closer','setter','monto_total','cantidad_cuotas',
                          'estado_deuda','notas','renovaciones',
                          'ultima_renovacion','fecha_alta_provisional')
  ) as columnas_nuevas_de_9,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and policyname in ('p_clientes_alta','p_alertas_alta','p_llamadas_alta')
  ) as politicas_de_3,
  (select count(*) from information_schema.columns
    where table_name = 'clientes' and is_nullable = 'YES'
      and column_name in ('dias_gracia_pago','nivel_desalineado',
                          'renovaciones','fecha_alta_provisional')
  ) as opcionales_de_4,
  (select count(*) from information_schema.tables
    where table_name = 'propuestas_ficha'
  ) as propuesta_de_1;

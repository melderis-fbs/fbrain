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
-- ---------------------------------------------------------------------
--  Tiene que devolver UNA fila con las nueve columnas y las tres
--  políticas. Si algún número es menor, algo de arriba no corrió.

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
  ) as politicas_de_3;

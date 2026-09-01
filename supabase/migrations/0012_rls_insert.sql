-- 0012 · Las políticas de INSERT que faltaban
--
-- `clientes` tenía política de SELECT y de UPDATE, pero ninguna de INSERT. Con
-- RLS activo eso significa que **ningún cliente nuevo podía entrar nunca**: la
-- importación corría entera, informaba las filas aplicadas, y Postgres las
-- descartaba una por una. Nadie se enteró porque el cliente de Supabase no
-- lanza una excepción cuando rechaza algo —devuelve `{ error }`— y el
-- repositorio no lo miraba. Las dos mitades están arregladas: ésta y el
-- `ok()` de `src/data/supabase/repo.ts`.
--
-- Lo mismo pasaba con `alertas` y con `llamadas_modelo`.
--
-- Las políticas de escritura repiten la condición de la de lectura, así que
-- nadie puede insertar una fila que después no podría ver — que es la forma
-- más común de crear datos huérfanos con RLS.

-- Se puede dar de alta un cliente si sos administración, o si te lo estás
-- asignando a vos misma. No se puede crear un cliente a nombre de otra.
create policy p_clientes_alta on clientes for insert
  with check (fn_es_admin() or consultora_id = fn_consultora_id());

-- Las alertas las emite el motor sobre un cliente concreto: la misma condición
-- de pertenencia que para leerlas.
create policy p_alertas_alta on alertas for insert
  with check (
    fn_es_admin() or exists (
      select 1 from clientes c
      where c.id = alertas.cliente_id and c.consultora_id = fn_consultora_id()
    )
  );

-- El registro de llamadas al modelo lo escribe el servidor después de cada
-- llamada. Alcanza con estar autenticado: leerlo sigue siendo de admin.
create policy p_llamadas_alta on llamadas_modelo for insert
  with check (auth.uid() is not null);

-- 0008 · Cerrar las cuatro tablas que quedaron sin RLS
--
-- El editor de Supabase lo detecta y tiene razón: `consultoras`, `score_items`,
-- `eval_casos` y `eval_corridas` se crearon sin Row Level Security. Sin RLS,
-- cualquiera con la anon key —que es pública y viaja en el JavaScript de la
-- app— puede leerlas enteras.
--
-- Las otras 29 tablas ya venían protegidas. Estas cuatro se quedaron afuera:
-- las tres del set de evaluación porque se agregaron pensando en un uso
-- interno, y `consultoras` probablemente porque es la tabla contra la que se
-- resuelven los permisos de todas las demás.
--
-- Se siguen los mismos helpers que usa el resto del esquema: `fn_es_admin()`
-- y `fn_consultora_id()`.

-- ---------------------------------------------------------------- consultoras
--
-- Todo el equipo necesita leerla: los nombres, colores y asignaciones aparecen
-- en casi toda la app —quién lleva a cada cliente, los avatares, la grilla—.
-- Escribir es de administración: una consultora no se reasigna clientes ni se
-- cambia el rol a sí misma.
--
-- Nota para cuando se use `notas_perfil` ("fortalezas y flancos documentados"):
-- con esta política la ve todo el equipo. Si va a contener algo que no debería
-- leer un par, hay que moverla a una tabla aparte, sólo admin. Hoy la app ni
-- siquiera la trae.

alter table consultoras enable row level security;

-- `auth.uid() is not null` en vez de `to authenticated`: dice lo mismo, no
-- depende de que exista un rol propio de Supabase, y se puede probar contra un
-- Postgres común.
create policy consultoras_lectura on consultoras
  for select using (auth.uid() is not null);

create policy consultoras_escritura_admin on consultoras
  for all using (fn_es_admin()) with check (fn_es_admin());

-- --------------------------------------------------------------- score_items
--
-- Es el detalle de un score, así que hereda exactamente su alcance: se ve si
-- se ve el score, y un score se ve si sos admin o si el cliente es tuyo.

alter table score_items enable row level security;

create policy score_items_sigue_al_score on score_items
  for all using (
    exists (
      select 1 from scores s
      join clientes c on c.id = s.cliente_id
      where s.id = score_items.score_id
        and (fn_es_admin() or c.consultora_id = fn_consultora_id())
    )
  );

-- ------------------------------------------------------- set de evaluación
--
-- Con qué se mide la calidad de los motores. No es material de trabajo diario
-- y contiene expedientes congelados de clientes reales: administración.

alter table eval_casos enable row level security;
alter table eval_corridas enable row level security;

create policy eval_casos_admin on eval_casos
  for all using (fn_es_admin()) with check (fn_es_admin());

create policy eval_corridas_admin on eval_corridas
  for all using (fn_es_admin()) with check (fn_es_admin());

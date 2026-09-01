-- =====================================================================
--  FOUNDERS BRAIN · INSTALACIÓN COMPLETA
-- =====================================================================
--
--  Este archivo es las 7 migraciones y el seed, uno detrás de otro, para
--  pegarlo de una sola vez en el SQL Editor de Supabase.
--
--  GENERADO — no lo edites. Sale de `npm run sql:instalar`, que lo arma
--  desde supabase/migrations/ y supabase/seed.sql. Si tocás una migración,
--  volvé a generarlo.
--
--  No necesita ninguna extensión habilitada a mano: crea las que usa
--  (pgcrypto y vector). El trabajo nocturno con pg_cron es aparte y
--  opcional: supabase/opcional/cron-nocturno.sql
--
--  Correrlo dos veces NO es seguro: creá una base limpia si algo falla.
-- =====================================================================



-- =====================================================================
--  0001_schema_brain.sql
-- =====================================================================

-- ============================================================================
-- FOUNDERS BRAIN · Esquema de base de datos · Postgres 15 / Supabase
-- Versión 1.0 · 25-08-2026
--
-- Orden de ejecución: extensiones → tipos → tablas → índices → vistas → RLS.
-- Todo el vocabulario de negocio está en español a propósito: el equipo lee
-- estas tablas.
--
-- Principios que el esquema impone por diseño:
--   1. estrategia_versiones es APPEND-ONLY. Es lo que permite detectar drift.
--   2. Una alerta no se puede cerrar sin texto escrito por una persona.
--   3. Toda evidencia apunta a su origen (sesión, planilla, pago).
--   4. Ningún cliente se borra. Estado 'perdido' + post mortem obligatorio.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";
-- pg_cron NO se crea acá: sólo lo necesita el trabajo nocturno, que es
-- opcional y vive en supabase/opcional/cron-nocturno.sql. En Supabase esta
-- extensión se habilita desde Database → Extensions, y tenerla acá hacía
-- fallar TODA esta migración —el esquema entero— en una base recién creada.

-- ============================================================================
-- TIPOS
-- ============================================================================

create type rol_usuario        as enum ('consultora', 'admin');

create type estado_cliente     as enum ('activo', 'pausado', 'finalizado', 'perdido');

create type semaforo           as enum ('verde', 'amarillo', 'rojo', 'negro');

create type origen_alerta      as enum ('regla_dura', 'criterio');

create type destinatario_alerta as enum ('consultora', 'revision_externa', 'admin');

-- Los ocho tipos de bloqueo del método. La acción es distinta según cuál sea:
-- confundir 'ejecucion' con 'estrategico' es el error que hace que un caso se
-- re-diagnostique cuatro veces.
create type tipo_bloqueo as enum (
  'estrategico',   -- no sabe qué vender o a quién
  'mensaje',       -- la propuesta está bien pero no se comunica
  'adquisicion',   -- la oferta funciona pero no hay distribución
  'comercial',     -- hay leads pero no convierten
  'entrega',       -- puede vender pero no entregar
  'operativo',     -- no hay capacidad, procesos o equipo
  'ejecucion',     -- sabe qué hacer y no lo hace
  'emocional'      -- miedo, perfeccionismo, vergüenza, aprobación
);

-- La cadena que el motor de diagnóstico recorre buscando la PRIMERA
-- incoherencia, no la más visible.
create type eslabon as enum (
  'cliente', 'problema', 'deseo', 'oferta', 'promesa', 'mensaje',
  'canal', 'lead', 'setting', 'venta', 'entrega', 'resultado'
);

create type dimension_score as enum (
  'cliente_ideal', 'problema', 'deseo', 'oferta', 'promesa', 'mensaje',
  'autoridad', 'adquisicion', 'volumen', 'ventas', 'entrega', 'ejecucion'
);

create type veredicto_coherencia as enum ('coherente', 'parcial', 'incoherente');

create type estado_compromiso as enum ('pendiente', 'cumplido', 'no_cumplido');

create type estado_pago as enum ('pendiente', 'pagado', 'vencido', 'incobrable');

create type tipo_material as enum (
  'anuncio', 'reel', 'guion', 'landing', 'dm', 'email', 'bio', 'otro'
);

create type tipo_documento_corpus as enum ('metodo', 'criterio', 'umbral', 'caso');

create type tipo_evidencia as enum ('hecho', 'hipotesis');


-- ============================================================================
-- EQUIPO
-- ============================================================================

create table consultoras (
  id              uuid primary key default gen_random_uuid(),
  auth_user_id    uuid unique,                    -- FK a auth.users de Supabase
  nombre          text not null,
  email           text not null unique,
  rol             rol_usuario not null default 'consultora',
  cupo_maximo     int not null default 12,        -- techo fijado por Founders
  acepta_nuevos   boolean not null default true,
  activa          boolean not null default true,
  notas_perfil    text,                           -- fortalezas y flancos documentados
  created_at      timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 1 · IDENTIDAD
-- ============================================================================

create table clientes (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  email              text,
  telefono           text,
  programa           text not null,               -- ej. 'GROWTH M1'
  fecha_alta         date not null,
  fecha_fin_prevista date,
  plan_pago          text,                        -- ej. '2000-1000-500'
  tiene_garantia     boolean not null default false,
  fuente             text,                        -- ej. 'IG', 'referido'
  consultora_id      uuid references consultoras(id),
  estado             estado_cliente not null default 'activo',
  drive_folder_id    text,                        -- carpeta de transcripciones
  horas_reales_semana numeric(4,1),               -- declaradas en sesión 1, NO las del pitch
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on column clientes.horas_reales_semana is
  'Horas que el cliente realmente tiene, preguntadas en la sesión 1. El plan se arma contra este número, no contra las horas del pitch.';

-- El traspaso es el momento de mayor mortandad de la cartera: se registra
-- explícitamente porque es un criterio de alerta por sí mismo.
create table traspasos (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id),
  consultora_origen_id uuid references consultoras(id),
  consultora_destino_id uuid not null references consultoras(id),
  fecha                date not null,
  motivo               text,
  created_at           timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 2 · NEGOCIO   (1:1, se actualiza; el historial vive en estrategia)
-- ============================================================================

create table negocio (
  cliente_id             uuid primary key references clientes(id) on delete cascade,
  que_vende              text,
  a_quien                text,
  precio                 numeric(14,2),
  moneda                 text default 'ARS',
  como_entrega           text,
  facturacion_mensual    numeric(14,2),
  facturacion_historica  text,
  cantidad_clientes      int,
  origen_clientes        text,                    -- de dónde vienen hoy
  intentos_previos       jsonb default '[]',      -- [{que, cuando, resultado}]
  que_funciono           text,
  que_no_funciono        text,
  activos               jsonb default '[]',       -- [{tipo, descripcion, estado}]
  actualizado_por        uuid references consultoras(id),
  actualizado_at         timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 3 · AUTORIDAD
-- Nunca se descarta experiencia previa porque el cliente diga "no quiero
-- trabajar con ese mercado". La oportunidad suele estar donde ya tiene
-- lenguaje, contactos y credibilidad.
-- ============================================================================

create table autoridad (
  cliente_id                uuid primary key references clientes(id) on delete cascade,
  hace_excepcionalmente_bien text,
  experiencia_profesional    text,
  resultados_propios         text,
  resultados_terceros        text,
  industrias_que_conoce      text[],
  autoridad_desperdiciada    text,
  testimonios_sin_usar       jsonb default '[]',
  actualizado_at             timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 4 · ESTRATEGIA VIGENTE  ·  APPEND-ONLY
-- La tabla más importante del esquema. Nunca se hace UPDATE: cada cambio es
-- una fila nueva. Sin esto no se puede detectar que un cliente bajó su precio
-- por iniciativa propia, que es un criterio de alerta rojo.
-- ============================================================================

create table estrategia_versiones (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references clientes(id) on delete cascade,
  version         int not null,
  cliente_ideal   text,
  problema        text,
  deseo           text,
  promesa         text,
  oferta          text,
  mecanismo       text,
  canal           text,
  precio          numeric(14,2),
  moneda          text default 'ARS',
  vigente_desde   date not null default current_date,
  motivo_cambio   text,
  iniciativa      text check (iniciativa in ('consultora','cliente','conjunta')),
  sesion_id       uuid,                            -- FK agregada más abajo
  creada_por      uuid references consultoras(id),
  created_at      timestamptz not null default now(),
  unique (cliente_id, version)
);

comment on column estrategia_versiones.iniciativa is
  'Si el cambio de precio u oferta salió del cliente sin llamada de venta de por medio, es criterio de alerta rojo.';

create rule estrategia_no_update as
  on update to estrategia_versiones do instead nothing;
create rule estrategia_no_delete as
  on delete to estrategia_versiones do instead nothing;


-- ============================================================================
-- BLOQUE 6 · TRAZABILIDAD · SESIONES
-- ============================================================================

create table sesiones (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete cascade,
  consultora_id        uuid references consultoras(id),
  fecha                timestamptz not null,
  duracion_minutos     int,
  estado_agenda        text not null default 'realizada'
                       check (estado_agenda in ('realizada','cancelada','reprogramada','no_asistio')),
  tiene_grabacion      boolean not null default false,
  transcripcion_texto  text,
  transcripcion_path   text,                       -- ruta en Drive o storage
  reporte              text,                       -- lo que escribe la consultora
  reporte_cargado_at   timestamptz,                -- para la alerta de +48h
  -- Señales que se calculan del análisis de la transcripción (bloque B de
  -- criterios): las ausencias también son señal.
  menciono_numeros     boolean,
  pct_habla_cliente    int check (pct_habla_cliente between 0 and 100),
  cerro_con_compromiso boolean,
  abrio_repasando      boolean,
  se_fue_en_herramienta boolean,
  tema_declarado       text,
  tema_tratado         text,                       -- si difieren, alerta de proceso
  procesada_at         timestamptz,                -- cuándo la leyó el extractor
  created_at           timestamptz not null default now()
);

alter table estrategia_versiones
  add constraint estrategia_sesion_fk
  foreign key (sesion_id) references sesiones(id);

create table compromisos (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references clientes(id) on delete cascade,
  sesion_id             uuid references sesiones(id),
  descripcion           text not null,
  responsable           text not null default 'cliente',  -- cliente, consultora, setter, agencia...
  fecha_vencimiento     date not null,
  estado                estado_compromiso not null default 'pendiente',
  verificado_en_sesion_id uuid references sesiones(id),
  nota_cierre           text,
  created_at            timestamptz not null default now()
);


-- ============================================================================
-- BLOQUE 5 · NÚMEROS · una fila por cliente y semana
-- Los umbrales de interpretación están en
-- 05-cerebro/06-umbrales-tracker-organico.md
-- ============================================================================

create table metricas_semanales (
  id                       uuid primary key default gen_random_uuid(),
  cliente_id               uuid not null references clientes(id) on delete cascade,
  semana_iso               date not null,          -- lunes de la semana
  contenido_publicado      int,
  alcance_total            int,
  alcance_no_seguidores    int,
  dms_iniciados            int,
  conversaciones_avanzadas int,
  leads                    int,
  leads_calificados        int,
  agendas                  int,
  asistencias              int,
  cancelaciones            int,
  llamadas                 int,
  ofertas_realizadas       int,
  ventas                   int,
  facturado                numeric(14,2),
  ticket_promedio          numeric(14,2),
  inversion_ads            numeric(14,2),
  objeciones               text[],
  origen_oportunidades     jsonb default '{}',     -- {"organico": 3, "ads": 1, "referido": 2}
  cargado_por              uuid references consultoras(id),
  created_at               timestamptz not null default now(),
  unique (cliente_id, semana_iso)
);

create table pagos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references clientes(id) on delete cascade,
  numero_cuota      int not null,
  monto             numeric(14,2) not null,
  moneda            text default 'USD',
  fecha_vencimiento date not null,
  fecha_pago        date,
  estado            estado_pago not null default 'pendiente',
  unique (cliente_id, numero_cuota)
);

create table asistencias_mentoria (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete cascade,
  mentoria     text not null,                      -- 'contenido','ventas','anuncios','setteo','mentalidad'
  fecha        date not null,
  asistio      boolean not null,
  unique (cliente_id, mentoria, fecha)
);


-- ============================================================================
-- ALERTAS
-- Formato obligatorio: verde es solo color. Amarillo, rojo y negro llevan
-- semáforo + 3 líneas + CITA TEXTUAL con fecha + PEDIDO concreto.
-- Sin cita textual la alerta es una interpretación y se discute; con cita es
-- un hecho y se trabaja.
-- ============================================================================

create table alertas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references clientes(id) on delete cascade,
  sesion_id           uuid references sesiones(id),
  codigo              text not null,               -- ver 04-reglas-duras/
  origen              origen_alerta not null,
  estado_semaforo     semaforo not null,
  titulo              text not null,
  cuerpo              text not null,               -- las 3 líneas
  cita_textual        text,                        -- obligatoria si origen='criterio'
  fecha_cita          date,
  pedido              text not null,               -- qué se espera y de quién
  destinatario        destinatario_alerta not null,
  plazo_horas         int not null,                -- 0 = mismo día
  prioridad           int not null default 50,     -- para el techo de 10/semana
  emitida_at          timestamptz not null default now(),
  emitida_en_semana   date not null default date_trunc('week', now())::date,
  diferida            boolean not null default false,  -- pasó el techo, va al informe mensual
  -- Cierre
  cerrada_at          timestamptz,
  cerrada_por         uuid references consultoras(id),
  texto_cierre        text,
  escalada_a_id       uuid references alertas(id),
  reabierta_de_id     uuid references alertas(id),

  -- Ninguna alerta se cierra sola por el paso del tiempo: se cierra porque
  -- alguien escribió qué hizo.
  constraint cierre_con_texto check (
    (cerrada_at is null and texto_cierre is null and cerrada_por is null)
    or
    (cerrada_at is not null and texto_cierre is not null
     and length(btrim(texto_cierre)) >= 20 and cerrada_por is not null)
  ),
  -- Una alerta de criterio sin cita textual no se emite.
  constraint criterio_con_cita check (
    origen <> 'criterio' or (cita_textual is not null and fecha_cita is not null)
  )
);

comment on constraint cierre_con_texto on alertas is
  'Regla de negocio: una alerta se cierra escribiendo qué se hizo, nunca por el paso del tiempo.';

-- Una alerta roja solo la puede cerrar quien hizo la revisión, no la
-- consultora del caso. Se aplica en el trigger, no en un check, porque
-- necesita mirar clientes.
create or replace function fn_valida_cierre_rojo()
returns trigger language plpgsql as $$
declare v_consultora uuid;
begin
  if new.cerrada_at is not null and old.cerrada_at is null
     and new.estado_semaforo in ('rojo','negro') then
    select consultora_id into v_consultora from clientes where id = new.cliente_id;
    if new.cerrada_por = v_consultora then
      raise exception
        'Una alerta % no la puede cerrar la consultora del caso. Requiere revisión externa.',
        new.estado_semaforo;
    end if;
  end if;
  return new;
end $$;

create trigger tg_valida_cierre_rojo
  before update on alertas
  for each row execute function fn_valida_cierre_rojo();


-- ============================================================================
-- MOTORES · registro de cada corrida
-- Se guarda siempre el prompt_version y el modelo: sin eso el set de
-- evaluación no significa nada.
-- ============================================================================

create table diagnosticos (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references clientes(id) on delete cascade,
  consultora_id         uuid not null references consultoras(id),
  pregunta              text,
  hipotesis_consultora  text not null,             -- OBLIGATORIA antes de ver la respuesta
  cuello_botella        text not null,             -- UNO. No es un array a propósito.
  tipo_bloqueo_v        tipo_bloqueo not null,
  eslabon_roto          eslabon not null,
  coincidio             boolean,                   -- vs. la hipótesis de la consultora
  payload               jsonb not null,            -- protocolo completo, valida contra el JSON Schema
  prompt_version        text not null,
  modelo                text not null,
  tokens_entrada        int,
  tokens_salida         int,
  costo_usd             numeric(10,4),
  created_at            timestamptz not null default now()
);

comment on column diagnosticos.cuello_botella is
  'Un solo cuello de botella. El campo es escalar a propósito: si el modelo devuelve dos, es un fallo de validación.';

create table coherencia_tests (
  id                     uuid primary key default gen_random_uuid(),
  cliente_id             uuid not null references clientes(id) on delete cascade,
  consultora_id          uuid references consultoras(id),
  material_tipo          tipo_material not null,
  material_texto         text not null,
  leads_adjuntos         jsonb default '[]',
  perfil_inferido_ciego  jsonb not null,           -- primera llamada, SIN ver la estrategia
  estrategia_version_id  uuid references estrategia_versiones(id),
  veredicto              veredicto_coherencia not null,
  payload                jsonb not null,
  prompt_version         text not null,
  modelo                 text not null,
  created_at             timestamptz not null default now()
);

comment on column coherencia_tests.perfil_inferido_ciego is
  'Resultado de la primera llamada, hecha sin acceso al cliente ideal declarado. El orden de las dos llamadas ES la funcionalidad.';

create table scores (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  payload        jsonb not null,
  prompt_version text not null,
  created_at     timestamptz not null default now()
);

create table score_items (
  id          uuid primary key default gen_random_uuid(),
  score_id    uuid not null references scores(id) on delete cascade,
  dimension   dimension_score not null,
  valor       int not null check (valor between 1 and 10),
  evidencia   text not null,                       -- un score sin evidencia no se cree dos veces
  es_limitante boolean not null default false,     -- true en los 3 que más limitan
  unique (score_id, dimension)
);

create table planes_onboarding (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  payload        jsonb not null,                   -- mapa 60 días + cuenta inversa + brief
  prompt_version text not null,
  created_at     timestamptz not null default now()
);

create table sprints (
  id                 uuid primary key default gen_random_uuid(),
  cliente_id         uuid not null references clientes(id) on delete cascade,
  numero             int not null,
  objetivo           text not null,
  hipotesis          text,
  acciones           jsonb not null,               -- máximo 5, se valida en la app
  metrica            text not null,
  resultado_esperado text,
  fecha_inicio       date not null,
  fecha_revision     date not null,
  resultado_real     text,
  created_at         timestamptz not null default now(),
  unique (cliente_id, numero),
  constraint acciones_max_5 check (jsonb_array_length(acciones) between 1 and 5)
);

create table casos_perdidos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null unique references clientes(id) on delete cascade,
  fecha               date not null,
  motivo              text not null,
  pidio_reembolso     boolean not null default false,
  senales_previas     jsonb default '[]',          -- alertas que existían y no se cerraron
  alertas_sin_cerrar  int,
  post_mortem         text,                        -- una carilla: qué señal hubo, cuándo, por qué no se actuó
  post_mortem_at      timestamptz,
  created_at          timestamptz not null default now()
);


-- ============================================================================
-- CEREBRO · corpus recuperable
-- ============================================================================

create table corpus_documentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           tipo_documento_corpus not null,
  titulo         text not null,
  path           text,
  contenido      text not null,
  cliente_ref_id uuid references clientes(id),     -- si es un caso, a quién refiere
  version        int not null default 1,
  actualizado_at timestamptz not null default now()
);

create table corpus_chunks (
  id            uuid primary key default gen_random_uuid(),
  documento_id  uuid not null references corpus_documentos(id) on delete cascade,
  orden         int not null,
  contenido     text not null,
  embedding     vector(1536),
  metadata      jsonb default '{}'
);

create index idx_corpus_embedding on corpus_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- ============================================================================
-- EVALUACIÓN · el activo que dice si la app razona bien
-- ============================================================================

create table eval_casos (
  id                      uuid primary key default gen_random_uuid(),
  titulo                  text not null,
  cliente_id              uuid references clientes(id),
  expediente_snapshot     jsonb not null,          -- entrada congelada
  cuello_botella_esperado text not null,           -- la conclusión de Vicky
  tipo_bloqueo_esperado   tipo_bloqueo not null,
  eslabon_esperado        eslabon,
  notas                   text,
  created_at              timestamptz not null default now()
);

create table eval_corridas (
  id                      uuid primary key default gen_random_uuid(),
  eval_caso_id            uuid not null references eval_casos(id) on delete cascade,
  prompt_version          text not null,
  modelo                  text not null,
  cuello_botella_obtenido text,
  tipo_bloqueo_obtenido   tipo_bloqueo,
  coincide                boolean not null,
  nota_revisor            text,
  created_at              timestamptz not null default now()
);


-- ============================================================================
-- ÍNDICES
-- ============================================================================

create index idx_clientes_consultora   on clientes(consultora_id) where estado = 'activo';
create index idx_clientes_estado       on clientes(estado);
create index idx_sesiones_cliente_fecha on sesiones(cliente_id, fecha desc);
create index idx_sesiones_sin_registro  on sesiones(cliente_id)
  where transcripcion_texto is null and transcripcion_path is null;
create index idx_alertas_abiertas       on alertas(cliente_id, estado_semaforo)
  where cerrada_at is null;
create index idx_alertas_semana         on alertas(emitida_en_semana);
create index idx_metricas_cliente       on metricas_semanales(cliente_id, semana_iso desc);
create index idx_compromisos_vencidos   on compromisos(cliente_id, fecha_vencimiento)
  where estado = 'pendiente';
create index idx_pagos_vencidos         on pagos(cliente_id, fecha_vencimiento)
  where estado in ('pendiente','vencido');
create index idx_estrategia_cliente     on estrategia_versiones(cliente_id, version desc);


-- ============================================================================
-- VISTAS
-- ============================================================================

-- La estrategia vigente de cada cliente: la última versión.
create view v_estrategia_vigente as
select ev.*
from estrategia_versiones ev
join (
  select cliente_id, max(version) as v
  from estrategia_versiones group by cliente_id
) ult on ult.cliente_id = ev.cliente_id and ult.v = ev.version;

-- Completitud del expediente. Con menos de 4 bloques, el motor de diagnóstico
-- no corre: devuelve qué falta y las preguntas para conseguirlo.
create view v_completitud_expediente as
select
  c.id as cliente_id,
  c.nombre,
  (c.programa is not null and c.fecha_alta is not null)                       as bloque_identidad,
  (n.que_vende is not null and n.a_quien is not null and n.precio is not null) as bloque_negocio,
  (a.hace_excepcionalmente_bien is not null)                                  as bloque_autoridad,
  (e.cliente_ideal is not null and e.oferta is not null)                      as bloque_estrategia,
  (exists (select 1 from metricas_semanales m
            where m.cliente_id = c.id
              and m.semana_iso > current_date - interval '28 days'))          as bloque_numeros,
  (exists (select 1 from sesiones s
            where s.cliente_id = c.id and s.transcripcion_texto is not null)) as bloque_trazabilidad
from clientes c
left join negocio   n on n.cliente_id = c.id
left join autoridad a on a.cliente_id = c.id
left join v_estrategia_vigente e on e.cliente_id = c.id;

create view v_bloques_cargados as
select cliente_id, nombre,
       (bloque_identidad::int + bloque_negocio::int + bloque_autoridad::int
        + bloque_estrategia::int + bloque_numeros::int + bloque_trazabilidad::int) as bloques,
       (bloque_identidad::int + bloque_negocio::int + bloque_autoridad::int
        + bloque_estrategia::int + bloque_numeros::int + bloque_trazabilidad::int) >= 4
        as habilita_diagnostico
from v_completitud_expediente;

-- Carga real por consultora contra el techo. Tres de seis estaban arriba del
-- techo en agosto de 2026: esta vista existe para que eso sea visible.
create view v_carga_consultoras as
select co.id, co.nombre, co.cupo_maximo, co.acepta_nuevos,
       count(cl.id) filter (where cl.estado = 'activo') as activos,
       count(cl.id) filter (where cl.estado = 'activo') - co.cupo_maximo as exceso
from consultoras co
left join clientes cl on cl.consultora_id = co.id
where co.activa
group by co.id, co.nombre, co.cupo_maximo, co.acepta_nuevos;

-- Severidad numérica del semáforo. No se puede usar max() sobre el enum
-- (Postgres no define ese agregado para enums) y el orden alfabético daría
-- 'rojo' > 'negro', que es al revés de lo que corresponde.
create or replace function fn_severidad(p semaforo) returns int
language sql immutable as $$
  select case p when 'verde' then 0 when 'amarillo' then 1
                when 'rojo'  then 2 when 'negro'   then 3 end;
$$;

-- Estado de semáforo vigente por cliente: el peor abierto manda.
create view v_semaforo_cliente as
select c.id as cliente_id, c.nombre,
       coalesce(
         (select a.estado_semaforo
          from alertas a
          where a.cliente_id = c.id and a.cerrada_at is null
            and a.estado_semaforo in ('negro','rojo','amarillo')
          order by fn_severidad(a.estado_semaforo) desc
          limit 1),
         'verde'::semaforo) as estado,
       (select count(*) from alertas a
        where a.cliente_id = c.id and a.cerrada_at is null) as alertas_abiertas,
       (select max(s.fecha) from sesiones s
        where s.cliente_id = c.id and s.estado_agenda = 'realizada') as ultima_sesion,
       (select coalesce(sum(m.ventas),0) from metricas_semanales m
        where m.cliente_id = c.id) as ventas_acumuladas
from clientes c
where c.estado = 'activo';


-- ============================================================================
-- RLS · cada consultora ve solo sus clientes; admin ve todo
-- Probar con un test autenticado como consultora: no debe poder leer el
-- cliente de otra.
-- ============================================================================

create or replace function fn_es_admin() returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from consultoras
    where auth_user_id = auth.uid() and rol = 'admin' and activa
  );
$$;

create or replace function fn_consultora_id() returns uuid
language sql stable security definer as $$
  select id from consultoras where auth_user_id = auth.uid() and activa;
$$;

alter table clientes              enable row level security;
alter table negocio               enable row level security;
alter table autoridad             enable row level security;
alter table estrategia_versiones  enable row level security;
alter table sesiones              enable row level security;
alter table compromisos           enable row level security;
alter table metricas_semanales    enable row level security;
alter table pagos                 enable row level security;
alter table alertas               enable row level security;
alter table diagnosticos          enable row level security;
alter table coherencia_tests      enable row level security;
alter table scores                enable row level security;
alter table planes_onboarding     enable row level security;
alter table sprints               enable row level security;
alter table casos_perdidos        enable row level security;
alter table asistencias_mentoria  enable row level security;
alter table traspasos             enable row level security;

create policy p_clientes_lectura on clientes for select
  using (fn_es_admin() or consultora_id = fn_consultora_id());

create policy p_clientes_escritura on clientes for update
  using (fn_es_admin() or consultora_id = fn_consultora_id());

-- Patrón para toda tabla con cliente_id. Repetir por tabla (o generarlo).
do $$
declare t text;
begin
  foreach t in array array[
    'negocio','autoridad','estrategia_versiones','sesiones','compromisos',
    'metricas_semanales','pagos','diagnosticos','coherencia_tests','scores',
    'planes_onboarding','sprints','casos_perdidos','asistencias_mentoria','traspasos'
  ] loop
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

-- Las alertas rojas y negras las tiene que poder ver quien hace la revisión,
-- que por definición NO es la consultora del caso.
create policy p_alertas_lectura on alertas for select
  using (
    fn_es_admin()
    or estado_semaforo in ('rojo','negro')
    or exists (
      select 1 from clientes c
      where c.id = alertas.cliente_id and c.consultora_id = fn_consultora_id()
    )
  );

create policy p_alertas_cierre on alertas for update
  using (fn_es_admin() or fn_consultora_id() is not null);

-- El corpus y el set de evaluación son de lectura para todo el equipo.
alter table corpus_documentos enable row level security;
alter table corpus_chunks     enable row level security;
create policy p_corpus_lectura on corpus_documentos for select using (auth.uid() is not null);
create policy p_chunks_lectura on corpus_chunks     for select using (auth.uid() is not null);


-- =====================================================================
--  0002_fusion.sql
-- =====================================================================

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


-- =====================================================================
--  0003_reglas_duras_brain.sql
-- =====================================================================

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
-- PROGRAMACIÓN · movida a supabase/opcional/cron-nocturno.sql
-- ============================================================================
--
-- Acá había un `cron.schedule(...)`. Se movió afuera por dos razones:
--
--  1. Obligaba a habilitar pg_cron sólo para poder aplicar esta migración. Sin
--     la extensión, esto fallaba y con ello toda la migración, que es lo que
--     define las reglas duras. Un requisito de infraestructura no debería
--     bloquear el esquema.
--
--  2. Dejaba el trabajo nocturno andando desde el minuto cero, sobre una base
--     todavía vacía. Eso emite decenas de alertas falsas la primera noche y el
--     equipo deja de leer la bandeja.
--
-- Las funciones quedan definidas acá arriba y se pueden llamar a mano. La app
-- no las necesita: corre las mismas reglas en TypeScript en cada request.


-- =====================================================================
--  0004_reglas_fusion.sql
-- =====================================================================

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


-- =====================================================================
--  0005_revision_cartera.sql
-- =====================================================================

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


-- =====================================================================
--  0006_ficha_y_llamadas.sql
-- =====================================================================

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


-- =====================================================================
--  0007_documentos_cliente.sql
-- =====================================================================

-- 0007 · Los documentos del cliente
--
-- La materia prima del expediente: transcripciones de sesión, la llamada de
-- venta, el formulario de onboarding, el contrato. Hasta ahora la
-- transcripción sólo podía entrar pegada dentro del cierre de sesión, que la
-- ata a una sesión concreta y deja afuera todo lo anterior al día 1 —
-- justamente lo que hace falta para el onboarding y el primer diagnóstico.
--
-- No va en `corpus_documentos`: eso es el corpus del método (jurisprudencia,
-- casos, constitución), compartido por toda la cartera. Esto es de un cliente
-- y se borra con él.

create type tipo_documento_cliente as enum (
  'transcripcion',
  'llamada_venta',
  'formulario_onboarding',
  'contrato',
  'reporte',
  'otro'
);

create table documentos_cliente (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  tipo        tipo_documento_cliente not null default 'otro',
  titulo      text not null,
  contenido   text not null,
  -- La fecha del hecho, no la de la carga: una transcripción es de su sesión.
  fecha       date not null,
  subido_por  uuid references consultoras(id) on delete set null,
  archivo     text,
  creado_at   timestamptz not null default now()
);

create index ix_documentos_cliente on documentos_cliente (cliente_id, fecha desc);

alter table documentos_cliente enable row level security;

-- Mismo alcance que el resto del expediente: la consultora ve y escribe los
-- documentos de sus clientes; administración, todos.
create policy documentos_lectura on documentos_cliente
  for select using (
    exists (
      select 1 from clientes c
      join consultoras k on k.auth_user_id = auth.uid()
      where c.id = documentos_cliente.cliente_id
        and (k.rol = 'admin' or c.consultora_id = k.id)
    )
  );

create policy documentos_escritura on documentos_cliente
  for all using (
    exists (
      select 1 from clientes c
      join consultoras k on k.auth_user_id = auth.uid()
      where c.id = documentos_cliente.cliente_id
        and (k.rol = 'admin' or c.consultora_id = k.id)
    )
  );


-- =====================================================================
--  0008_rls_faltante.sql
-- =====================================================================

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


-- =====================================================================
--  0009_ficha_comercial.sql
-- =====================================================================

-- 0009 · Lo comercial de la ficha
--
-- Seis columnas que la planilla de finanzas ya tiene y que hasta ahora se
-- leían y se tiraban, porque `clientes` no tenía dónde ponerlas. Son las que
-- hacen que la lista de cartera se lea como la planilla que el equipo ya mira:
-- quién cerró la venta, por cuánto, en cuántas cuotas y cómo viene el cobro.
--
-- `estado_deuda` es texto y no un enum a propósito. Lo escribe finanzas a mano
-- y ya tiene cuatro valores distintos ("Deudor", "Moroso", "En trámite" y
-- vacío); un enum obligaría a una migración cada vez que inventen uno nuevo, y
-- el precio de eso es que la sincronización falle entera por una celda.

alter table clientes
  add column if not exists closer          text,
  add column if not exists setter          text,
  add column if not exists monto_total     numeric(12,2),
  add column if not exists cantidad_cuotas smallint,
  add column if not exists estado_deuda    text,
  add column if not exists notas           text;

comment on column clientes.monto_total is
  'Lo contratado, según la planilla. No es la suma de las cuotas cargadas: si faltan cuotas por cargar, este número sigue siendo el bueno y la diferencia es justamente lo que hay que mirar.';

comment on column clientes.cantidad_cuotas is
  'En cuántas cuotas se pactó. Cuántas están pagas sale de `pagos`, no de acá.';

comment on column clientes.estado_deuda is
  'El juicio de finanzas sobre el cobro, que no siempre coincide con la aritmética de vencimientos: un cliente puede tener una cuota vencida y estar "En trámite" porque ya avisó que paga el martes.';

comment on column clientes.notas is
  'Notas libres de la planilla y de la ficha. No las lee ningún motor como si fueran un hecho: van al expediente como lo que son, algo que alguien anotó.';


-- =====================================================================
--  0010_renovaciones.sql
-- =====================================================================

-- 0010 · Las renovaciones
--
-- En la planilla de finanzas, un cliente que renueva aparece dos veces: una
-- fila por contrato, con su propio monto y sus propias cuotas. Hasta ahora la
-- segunda fila se salteaba por nombre repetido, lo que perdía las cuotas del
-- contrato nuevo — justo las que están vivas.
--
-- Ahora las dos filas son el mismo cliente: sus cuotas se acumulan y acá queda
-- el registro de que renovó. La fecha de alta sigue siendo la del PRIMER
-- contrato, porque el reloj del programa se cuenta desde que empezó a
-- trabajar con Founders, no desde la última factura.

alter table clientes
  add column if not exists renovaciones      smallint not null default 0,
  add column if not exists ultima_renovacion date;

comment on column clientes.renovaciones is
  'Cuántas veces volvió a contratar. Sale de las filas repetidas de la planilla, y es el único resultado del programa que se mide solo.';

comment on column clientes.ultima_renovacion is
  'Fecha del primer pago del último contrato. No pisa fecha_alta: el día 1 del programa es el del primer contrato.';


-- =====================================================================
--  0011_fecha_provisional.sql
-- =====================================================================

-- 0011 · La fecha de inicio provisional
--
-- En Notion hay clientes cargados sin «Fecha Inicio Programa» — al momento de
-- escribir esto, 72 de 194. Hasta ahora esos clientes no se importaban, y eso
-- es peor que importarlos mal: un cliente que no existe no se puede asignar,
-- ni abrir, ni corregir. La consultora que lo atiende no lo ve en su cartera.
--
-- Ahora entran con una fecha provisional —la de creación de la fila en
-- Notion— y esta marca puesta. Lo que la marca cambia es que el reloj del
-- programa NO corre para ellos: no se les calculan hitos ni se les emiten
-- alertas, porque estarían medidas contra una fecha inventada y serían peor
-- que no tener ninguna. Se apaga sola cuando alguien carga la fecha real.

alter table clientes
  add column if not exists fecha_alta_provisional boolean not null default false;

comment on column clientes.fecha_alta_provisional is
  'La fecha de alta es una estimación, no un dato. Mientras esté en true el cliente existe y se puede trabajar, pero no se le miden hitos ni se le emiten alertas: no se miente con un número.';


-- =====================================================================
--  seed.sql
-- =====================================================================

-- Catálogo de hitos. Generado por scripts/gen-seed.ts — no editar a mano.
-- Los días esperados son configurables: dirección los mueve sin un deploy.
begin;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'onboarding', 'Onboarding hecho y expediente base cargado', 7, 'definicion'::fase_negocio, false, 'consultora'::rol_usuario, 'expediente', 'Incluye las horas reales por semana. El plan se arma contra ese número, no contra el del pitch.', 0)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'cuenta_inversa', 'Cuenta inversa hecha con el cliente', 7, 'definicion'::fase_negocio, false, 'consultora'::rol_usuario, null, 'Cuántos DMs por semana necesita para su meta. Es lo primero de la sesión 1 y lo que más se saltea.', 1)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'cliente_ideal', 'Cliente ideal y problema cerrados', 21, 'definicion'::fase_negocio, false, 'consultora'::rol_usuario, null, 'Un comprador reconocible, no "emprendedores".', 2)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'oferta', 'Oferta y promesa cerradas', 30, 'definicion'::fase_negocio, true, 'admin'::rol_usuario, null, 'Sin esto el cliente no puede salir al mercado. Si sigue abierto en el mes 2, el programa está detenido.', 3)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'mensaje', 'Mensaje y canal definidos', 35, 'mensaje'::fase_negocio, false, 'consultora'::rol_usuario, null, null, 4)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'primera_conversacion', 'Primeras conversaciones que avanzan', 42, 'volumen'::fase_negocio, false, 'consultora'::rol_usuario, null, null, 5)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'kpi_sostenido', 'KPI semanal de DMs sostenido 3 semanas', 50, 'volumen'::fase_negocio, false, 'consultora'::rol_usuario, null, 'El compromiso operativo que sale de la cuenta inversa. No es una métrica de vanidad.', 6)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'primera_agenda', 'Primera agenda', 45, 'volumen'::fase_negocio, false, 'consultora'::rol_usuario, 'primera_agenda', null, 7)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'primera_llamada', 'Primera llamada realizada', 55, 'conversion'::fase_negocio, false, 'consultora'::rol_usuario, 'primera_llamada', null, 8)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'primera_venta', 'Primera venta', 60, 'conversion'::fase_negocio, true, 'admin'::rol_usuario, 'primera_venta', 'La promesa del programa. Todo el sistema existe para que este hito llegue a tiempo.', 9)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'venta_repetida', 'Segunda venta', 90, 'escala'::fase_negocio, true, 'admin'::rol_usuario, 'venta_repetida', 'Una venta puede ser suerte. Dos ya es sistema.', 10)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (
  'sistema', 'Sistema de seguimiento sostenible', 100, 'escala'::fase_negocio, false, 'consultora'::rol_usuario, null, null, 11)
  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;
commit;

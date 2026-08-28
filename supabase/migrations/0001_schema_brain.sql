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
create extension if not exists "pg_cron";

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

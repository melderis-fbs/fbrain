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

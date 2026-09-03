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

-- 0015 · La llave contra GHL
--
-- Founders vende en GoHighLevel y hasta hoy el cliente se volvía a tipear a
-- mano. Estas dos columnas son lo que permite traerlo solo.
--
-- `ghl_contact_id` es la llave, y es el CONTACTO, no la oportunidad. Un mismo
-- cliente tiene la oportunidad de la venta, la del programa y a veces una de
-- cobranza; todas cuelgan del contacto. Si la llave fuera la oportunidad, una
-- renovación —que es el mismo contacto pasando otra vez por las etapas—
-- entraría como un cliente nuevo y duplicaría la cartera.
--
-- Es único: dos filas con el mismo contacto son el mismo cliente dos veces, y
-- es mejor que la base lo rechace a que la app lo descubra en tres meses.

alter table clientes add column if not exists ghl_contact_id text;
alter table clientes add column if not exists ghl_opportunity_id text;

create unique index if not exists ux_clientes_ghl_contact
  on clientes (ghl_contact_id) where ghl_contact_id is not null;

comment on column clientes.ghl_contact_id is
  'Contacto de GHL. La llave del cliente contra el sistema donde se vende.';
comment on column clientes.ghl_opportunity_id is
  'Oportunidad del programa en el pipeline de clientes, para abrirla desde la ficha.';

-- El contrato firmado, como link y no como archivo: vive donde se firmó. Dos
-- copias de un documento legal es no saber cuál rige.
alter table clientes add column if not exists link_contrato text;

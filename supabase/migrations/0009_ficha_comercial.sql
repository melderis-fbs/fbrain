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

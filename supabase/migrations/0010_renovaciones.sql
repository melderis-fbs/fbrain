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

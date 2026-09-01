-- 0013 · Que la base acepte lo que el tipo declara opcional
--
-- Cuatro columnas de `clientes` eran NOT NULL con un default, pero en el
-- dominio son opcionales. La diferencia importa por cómo funciona un default:
-- sólo se aplica cuando la columna NO viene en el insert. La app la manda con
-- valor null —porque el campo es opcional y está vacío— y ahí Postgres la
-- rechaza en vez de usar el default.
--
-- El resultado era una importación que moría con «null value in column
-- dias_gracia_pago violates not-null constraint» sobre un cliente al que
-- simplemente nadie le había fijado un margen de pago propio.
--
-- Los defaults se quedan: sirven para las filas que se cargan por SQL. Lo que
-- se levanta es la obligación, porque no existe: un cliente puede no tener
-- días de gracia propios, y eso significa "usá el general", no "faltan datos".

alter table clientes alter column dias_gracia_pago       drop not null;
alter table clientes alter column nivel_desalineado      drop not null;
alter table clientes alter column renovaciones           drop not null;
alter table clientes alter column fecha_alta_provisional drop not null;

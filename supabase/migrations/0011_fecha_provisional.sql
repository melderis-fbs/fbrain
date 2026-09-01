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

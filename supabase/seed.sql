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

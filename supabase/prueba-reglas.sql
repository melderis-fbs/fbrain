\echo '--- ALERTAS EMITIDAS ---'
select codigo, estado_semaforo, titulo, destinatario, prioridad from alertas order by prioridad desc;

\echo ''
\echo '--- SEMAFORO DEL CLIENTE (debe ser rojo) ---'
select nombre, estado, alertas_abiertas, ultima_sesion::date, ventas_acumuladas from v_semaforo_cliente;

\echo ''
\echo '--- COMPLETITUD (debe NO habilitar diagnostico: faltan bloques) ---'
select nombre, bloques, habilita_diagnostico from v_bloques_cargados;

\echo ''
\echo '--- TEST 1: cerrar alerta sin texto debe FALLAR ---'
do $$ begin
  update alertas set cerrada_at = now() where codigo = 'RD-01';
  raise notice 'FALLO DEL TEST: se cerro sin texto';
exception when check_violation then raise notice 'OK: rechazado por constraint cierre_con_texto';
end $$;

\echo ''
\echo '--- TEST 2: cerrar una ROJA con la consultora del caso debe FALLAR ---'
do $$ begin
  update alertas set cerrada_at = now(), texto_cierre = 'hablamos con el cliente y quedo resuelto',
         cerrada_por = '11111111-1111-1111-1111-111111111111' where codigo = 'RD-07';
  raise notice 'FALLO DEL TEST: la consultora del caso cerro su propia roja';
exception when others then raise notice 'OK: %', SQLERRM;
end $$;

\echo ''
\echo '--- TEST 3: estrategia_versiones es append-only ---'
do $$ declare n int; begin
  update estrategia_versiones set precio = 99 where version = 2;
  select count(*) into n from estrategia_versiones where precio = 99;
  if n = 0 then raise notice 'OK: el UPDATE no tuvo efecto (append-only)';
  else raise notice 'FALLO DEL TEST: se pudo editar'; end if;
end $$;

\echo ''
\echo '--- TEST 4: sprint con mas de 5 acciones debe FALLAR ---'
do $$ begin
  insert into sprints (cliente_id, numero, objetivo, acciones, metrica, fecha_inicio, fecha_revision)
  values ('22222222-2222-2222-2222-222222222222', 1, 'test',
          '["a","b","c","d","e","f"]'::jsonb, 'ventas', current_date, current_date + 7);
  raise notice 'FALLO DEL TEST: acepto 6 acciones';
exception when check_violation then raise notice 'OK: rechazado por constraint acciones_max_5';
end $$;

\echo ''
\echo '--- TEST 5: alerta de criterio sin cita textual debe FALLAR ---'
do $$ begin
  insert into alertas (cliente_id, codigo, origen, estado_semaforo, titulo, cuerpo, pedido, destinatario, plazo_horas)
  values ('22222222-2222-2222-2222-222222222222','CT-A1','criterio','amarillo','sin cita','cuerpo','pedido','consultora',72);
  raise notice 'FALLO DEL TEST: acepto alerta de criterio sin cita';
exception when check_violation then raise notice 'OK: rechazado por constraint criterio_con_cita';
end $$;

\echo ''
\echo '--- TEST 6: idempotencia (segunda corrida no debe duplicar) ---'
select codigo, emitidas from fn_correr_reglas_duras();

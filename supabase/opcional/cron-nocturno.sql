-- OPCIONAL · El trabajo nocturno de reglas duras
--
-- NO hace falta para arrancar. La app corre las 23 reglas duras ella misma, en
-- TypeScript, cada vez que alguien abre una pantalla (`correrReglas` en
-- `src/server/workspace.ts`). Con ~85 clientes eso es instantáneo y es lo que
-- ves en la bandeja de alertas.
--
-- Esto es para cuando la cartera crezca lo suficiente como para que calcularlo
-- en cada request deje de ser gratis. Entonces el cálculo se mueve acá, a un
-- trabajo nocturno, sin tocar una sola pantalla: el motor no importa nada de
-- React ni de Supabase justamente para permitir esa mudanza.
--
-- ANTES DE CORRERLO, DOS COSAS:
--
--  1. Habilitar la extensión: Database → Extensions → pg_cron → Enable.
--     Sin eso esto falla.
--
--  2. Tener los datos cargados. Encenderlo sobre una base a medio cargar emite
--     decenas de alertas falsas —clientes "sin sesión hace 40 días" que en
--     realidad no tienen las sesiones importadas todavía— y el equipo deja de
--     leer la bandeja. Recuperar esa confianza cuesta semanas. Es el error más
--     caro del arranque.

select cron.schedule(
  'reglas-duras-nocturnas',
  '0 6 * * *',  -- 03:00 en Buenos Aires
  $$ select fn_correr_reglas_duras(); select fn_aplicar_techo_semanal(10); $$
);

-- Confirmar que quedó programado:
--   select jobname, schedule, active from cron.job;
--
-- Apagarlo:
--   select cron.unschedule('reglas-duras-nocturnas');

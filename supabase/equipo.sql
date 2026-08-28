-- =====================================================================
--  FOUNDERS BRAIN · EL EQUIPO
-- =====================================================================
--
--  Son DOS pegadas distintas, con un paso manual en el medio. Van las dos
--  en el mismo lugar: SQL Editor → New query → pegar → Run.
--
--  ORDEN:
--    1. Pegar la PARTE 1 de acá abajo (después de cambiar los emails)
--    2. Ir a Authentication → Users y crear los usuarios a mano
--    3. Volver y pegar la PARTE 2
--
--  No se puede hacer todo junto: la parte 2 enlaza las filas de la parte 1
--  con los usuarios del paso 2, y esos usuarios todavía no existen cuando
--  corrés la parte 1.
-- =====================================================================


-- =====================================================================
--  PARTE 1 · Quién es quién en el equipo
-- =====================================================================
--
--  CAMBIÁ LOS EMAILS POR LOS REALES ANTES DE CORRER ESTO.
--  El email tiene que ser EXACTAMENTE el mismo que vas a usar al crear
--  el usuario en Authentication. Si no coincide, la parte 2 no enlaza.
--
--  'admin'      → ve todo, más Cobranza, Consultoras y Planilla
--  'consultora' → ve sólo sus propios clientes

insert into consultoras (nombre, email, rol, cupo_maximo) values
  ('Vicky',  'vicky@foundersbs.com',  'admin',      0),
  ('Jay',    'jay@foundersbs.com',    'consultora', 12),
  ('Nati',   'nati@foundersbs.com',   'consultora', 12),
  ('Johann', 'johann@foundersbs.com', 'consultora', 12),
  ('Vic P',  'vicp@foundersbs.com',   'consultora', 12),
  ('Kathe',  'kathe@foundersbs.com',  'consultora', 12),
  ('Romi',   'romi@foundersbs.com',   'consultora', 12);


-- =====================================================================
--  PARTE 2 · Enlazar con los usuarios que pueden entrar
-- =====================================================================
--
--  CORRER ESTO RECIÉN DESPUÉS de haber creado los usuarios en
--  Authentication → Users → Add user (con "Auto Confirm User" activado).
--
--  Sin esto la app abre COMPLETAMENTE VACÍA y sin ningún mensaje de error:
--  la base no le devuelve nada a nadie porque no sabe quién es quién.

update consultoras c
set auth_user_id = u.id
from auth.users u
where u.email = c.email and c.auth_user_id is null;


-- Y ahora verificá. Esto TIENE que decir "No rows returned".
-- Si devuelve alguna fila, esa persona no va a ver nada, y casi siempre es
-- que el email de la parte 1 y el del usuario no coinciden exactamente.

select nombre, email from consultoras where auth_user_id is null;

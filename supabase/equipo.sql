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

--  LOS NOMBRES TIENEN QUE COINCIDIR CON LOS DE NOTION.
--  La asignación de cada cliente sale de la columna «Consultor» de
--  «Auditoría Clientes», que es un select con estos valores exactos. Si acá
--  escribís «Kathe» y en Notion dice «Kathering», la importación va a
--  reportar la fila como no asignable en vez de adivinar.

--  SI YA CARGASTE EL EQUIPO ANTES, esto NO borra nada y se puede correr de
--  nuevo sin miedo: el `on conflict` de abajo actualiza por email la fila que
--  ya exista —le corrige el nombre— e inserta sólo las que falten. El
--  `auth_user_id` no se toca, así que los usuarios que ya creaste y enlazaste
--  siguen funcionando. Lo único que cambia es el nombre, que es lo que tiene
--  que coincidir con Notion.
--
--  Lo que sí importa: los emails de acá abajo tienen que ser los MISMOS que
--  ya cargaste. Si no coinciden, en vez de corregir la fila vieja va a crear
--  una nueva y vas a terminar con el equipo duplicado. Antes de correr esto,
--  mirá qué hay:
--
--      select nombre, email, rol, activa,
--             auth_user_id is not null as enlazado
--      from consultoras order by nombre;

insert into consultoras (nombre, email, rol, cupo_maximo, activa) values
  ('Vicky',     'vicky@foundersbs.com',     'admin',      0,  true),
  ('Coti',      'coti@foundersbs.com',      'consultora', 12, true),
  ('Kathering', 'kathering@foundersbs.com', 'consultora', 12, true),
  ('Johann',    'johann@foundersbs.com',    'consultora', 12, true),
  ('Romina',    'romina@foundersbs.com',    'consultora', 12, true),
  ('Natalia',   'natalia@foundersbs.com',   'consultora', 12, true),
  ('Victoria',  'victoria@foundersbs.com',  'consultora', 12, true),
  ('Jhosanna',  'jhosanna@foundersbs.com',  'consultora', 12, true),

  -- Ya no están en Founders, pero sus nombres siguen apareciendo en filas
  -- viejas de Notion. Entran como inactivos para que esos clientes se puedan
  -- importar y se vea que quedaron sin dueño, en vez de que la fila se saltee
  -- y el cliente no exista. No se les crea usuario: no pueden entrar.
  ('Javier',    'javier@foundersbs.com',    'consultora', 0,  false),
  ('Angie',     'angie@foundersbs.com',     'consultora', 0,  false)

on conflict (email) do update set
  nombre      = excluded.nombre,
  rol         = excluded.rol,
  cupo_maximo = excluded.cupo_maximo,
  activa      = excluded.activa;


-- Si los nombres viejos quedaron con OTRO email del que usaste ahora, arriba
-- se insertaron filas nuevas y las viejas siguen ahí. Esto las muestra: son
-- las que no están en la lista de Notion y hay que borrar a mano.

select nombre, email from consultoras
where nombre not in ('Vicky','Coti','Kathering','Johann','Romina',
                     'Natalia','Victoria','Jhosanna','Javier','Angie');


-- =====================================================================
--  PARTE 2 · Enlazar con los usuarios que pueden entrar
-- =====================================================================
--
--  CORRER ESTO RECIÉN DESPUÉS de haber creado los usuarios en
--  Authentication → Users → Add user (con "Auto Confirm User" activado).
--
--  Sin esto la app abre COMPLETAMENTE VACÍA y sin ningún mensaje de error:
--  la base no le devuelve nada a nadie porque no sabe quién es quién.
--
--  A Javier y a Angie NO les crees usuario: están en la tabla sólo para que
--  sus clientes viejos se puedan importar. La verificación de abajo los va a
--  listar, y en su caso está bien.

update consultoras c
set auth_user_id = u.id
from auth.users u
where u.email = c.email and c.auth_user_id is null;


-- Y ahora verificá. Esto TIENE que decir "No rows returned".
-- Si devuelve alguna fila, esa persona no va a ver nada, y casi siempre es
-- que el email de la parte 1 y el del usuario no coinciden exactamente.

select nombre, email from consultoras where auth_user_id is null and activa;

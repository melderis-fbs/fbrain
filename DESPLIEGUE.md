# Poner Brain en producción · Supabase + Vercel

Para quien lo va a desplegar. Está escrita para hacerse de arriba abajo sin
volver a preguntar nada.

> **¿Nunca usaste Supabase?** Empezá por
> [`SUPABASE-PASO-A-PASO.md`](./SUPABASE-PASO-A-PASO.md), que es la parte 1
> explicada clic por clic. Después volvé acá para Vercel.

Tiempo: **una hora** hasta tener la app andando con la base conectada. La carga
de datos es aparte y no es código.

**No hace falta configurar ningún trabajo programado para arrancar.** La app
corre las 23 reglas duras ella misma en cada request. El cron es una
optimización para cuando la cartera crezca, y está al final como apéndice.

---

## Por qué Supabase + Vercel

La app está construida para Supabase: siete migraciones, RLS por rol y auth
contra `auth.users`. Y es Next.js con render en servidor —14 de sus 21 rutas
se renderizan por request, más Server Actions y middleware—, así que necesita
un host de Node, no una carpeta estática.

Vercel es el host nativo de Next: conectás el repo y deploya. No hay
`vercel.json` que escribir.

> **Sobre WebContainer (Bolt, StackBlitz).** Sirve para mirar la app en modo
> demostración, no para producción: `node_modules` son 1,1 GB de los cuales
> 320 MB son binarios que ese entorno no puede ejecutar. Ahí adentro hay que
> instalar con `npm install --omit=optional`. Para el uso real, esto.

---

## 1 · Supabase

### 1.1 · Crear el proyecto

En [supabase.com](https://supabase.com) → **New project**. Guardá la contraseña
de la base: no se vuelve a mostrar.

Región: la más cercana al equipo. Con ~85 clientes el plan gratuito alcanza de
sobra para empezar.

### 1.2 · Crear el esquema

En **SQL Editor → New query**, pegar entero `supabase/instalar.sql` y correrlo.
Son las siete migraciones y el seed en un solo archivo, en orden. No hace falta
habilitar ninguna extensión a mano: crea las que usa.

Si preferís correrlas una por una, están en `supabase/migrations/` numeradas en
el orden en que hay que aplicarlas, y el catálogo de hitos en `supabase/seed.sql`.

El editor de Supabase va a mostrar dos advertencias antes de correrlo —una
operación "destructiva" y tablas creadas sin RLS—. Las dos son esperables: la
primera es un `drop trigger if exists` que se recrea acto seguido, y la segunda
es cierta sólo mientras el archivo corre, porque las tablas se crean antes de
activarles la seguridad.

Verificado corriendo las nueve contra un PostgreSQL 16 limpio: aplican sin
errores, dejan 12 hitos y 16 funciones de reglas, y **las 33 tablas terminan
con RLS activo**. Probado además que una consultora ve al equipo pero no el set
de evaluación, que administración sí lo ve, y que sin sesión no se ve nada.

### 1.3 · Cargar el equipo

Siete filas a mano, en **Table Editor → consultoras**, o por SQL:

```sql
insert into consultoras (nombre, email, rol, cupo_maximo) values
  ('Vicky',  'vicky@foundersbs.com',  'admin',      0),
  ('Jay',    'jay@foundersbs.com',    'consultora', 12),
  ('Nati',   'nati@foundersbs.com',   'consultora', 12),
  ('Johann', 'johann@foundersbs.com', 'consultora', 12),
  ('Vic P',  'vicp@foundersbs.com',   'consultora', 12),
  ('Kathe',  'kathe@foundersbs.com',  'consultora', 12),
  ('Romi',   'romi@foundersbs.com',   'consultora', 12);
```

### 1.4 · Crear los usuarios y enlazarlos

En **Authentication → Users → Add user**, uno por persona, con el mismo email
que pusiste arriba.

Después hay que enlazarlos, y esto es lo que hace que RLS funcione: sin
`auth_user_id`, la base no le devuelve nada a nadie y la app se ve vacía.

```sql
update consultoras c
set auth_user_id = u.id
from auth.users u
where u.email = c.email and c.auth_user_id is null;

-- Verificar: no debería devolver ninguna fila.
select nombre, email from consultoras where auth_user_id is null;
```

---

## 2 · Vercel

### 2.1 · Importar

[vercel.com/new](https://vercel.com/new) → importar `melderis-fbs/fbrain`.
Framework: **Next.js**, detectado solo. No toques build command ni output
directory.

### 2.2 · Variables de entorno

En **Settings → Environment Variables**. Los valores de Supabase están en
**Project Settings → API**:

| Variable | De dónde sale | Sin ella |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API → Project URL | La app corre en modo demostración |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon public | Idem |
| `ANTHROPIC_API_KEY` | console.anthropic.com | Los motores quedan "sin conectar"; el resto anda |
| `SHEETS_PLANILLA_ID` | El ID de tu planilla de Drive | No entran las cuotas |
| `NOTION_TOKEN` | notion.so/profile/integrations → New integration | No entra la asignación: nadie ve su cartera |
| `NOTION_DB_CLIENTES` | El ID de «Auditoría Clientes» en su URL | Idem |

**`ANTHROPIC_API_KEY` nunca lleva `NEXT_PUBLIC_`.** Ese prefijo la mandaría al
browser de cualquiera que abra la app.

Opcionales: `MODELO_CRITERIO`, `MODELO_EXTRACCION` (por defecto los dos usan
`claude-opus-5`) y `MAX_REINTENTOS_VALIDACION` (3).

### 2.3 · Deploy

**Deploy**. Toma dos o tres minutos. Cada push a `main` redeploya solo.

### 2.4 · Cerrar el registro abierto

Por defecto Supabase deja que cualquiera se registre. Esto es una herramienta
interna: **Authentication → Providers → Email → desactivar "Enable sign-ups"**.
Los usuarios se crean a mano desde el panel.

---

## 3 · Cargar los datos

En este orden, porque cada paso depende del anterior:

0. **El equipo, con los nombres de Notion.** Los de `supabase/equipo.sql` ya
   son los reales —Coti, Kathering, Johann, Romina, Natalia, Victoria y
   Jhosanna, más Javier y Angie como inactivos—. **Los nombres tienen que
   coincidir exactamente con la columna `Consultor` de Notion**, que es un
   select con esos valores: si acá dice «Kathe» y allá «Kathering», la
   importación reporta la fila como no asignable en vez de adivinar.
   Cambiá los emails por los reales antes de correrlo. **Si ya lo habías
   cargado con los nombres viejos, no borres nada**: el archivo actualiza por
   email la fila que ya exista y deja intacto el enlace con el usuario. Lo
   único que cambia es el nombre.

1. **Clientes y cuotas** desde la planilla. Compartí *Control de ingresos |
   FOUNDERS 2026* como *cualquiera con el enlace puede ver*, poné el ID en
   `SHEETS_PLANILLA_ID` y entrá a `/planilla` como Vicky → **Sincronizar ahora**.

   Se lee una sola solapa, **`Seguimiento clientes`** (160 filas, 39 columnas).
   De ahí salen el cliente, su fecha de alta —de la fecha del primer pago,
   porque la columna `Fecha alta` está vacía en las 160 filas—, su estado
   (`Estatus`) y sus hasta cuatro cuotas con vencimiento y estado de pago.

   **Antes de sincronizar hay que llenar la columna `Consultor/a`.** Hoy está
   vacía en las 160 filas, y es la que asigna cada cliente a su consultora. Sin
   eso los clientes entran sin asignar: nadie los ve en `/mis-clientes` y el
   modelo de "cada consultora su espacio" no arranca. Los nombres tienen que
   coincidir con los de la tabla `consultoras` —*Jay*, *Nati*, *Johann*,
   *Vic P*, *Kathe*, *Romi*—; si no coincide, el reporte lo dice con el número
   de fila.

   También hay **cinco nombres repetidos** en la solapa. El cliente se
   identifica por nombre, así que la segunda fila de cada par se saltea y se
   informa: hay que distinguirlos en la planilla.

   Lo que **no** entra, porque la planilla no lo tiene: asistencias a mentorías
   (no hay solapa), y las columnas de estrategia y autoridad del expediente.
   Eso se carga desde la ficha de cada cliente.

   El reporte lista lo que quedó afuera con número de fila y motivo: eso es lo
   que hay que arreglar en la planilla, no en la app.

1bis. **La asignación, desde Notion.** En la misma pantalla, el botón
   **Sincronizar Notion**, y **después** del de la planilla. De «Auditoría
   Clientes» salen el consultor de cada cliente, su estado, la fecha en que
   arrancó el programa, su duración y el link a su carpeta de Drive.

   Las dos fuentes comparten el estado y la fecha de alta, y en esos dos campos
   manda Notion, porque es donde el equipo los mantiene al día. Por eso el
   orden: al revés, la planilla los pisaría.

   Antes de correrlo hay que darle acceso a la integración: en Notion, abrir
   «Auditoría Clientes» → ••• → **Conexiones** → agregar la integración. Sin
   ese paso la API responde 404 aunque el token esté bien.

2. **Objetivos comerciales** —meta y ticket de cada cliente. Se cargan desde la
   ficha o desde la planilla. **Sin esto no hay KPI semanal**: la cuenta inversa
   sale de la meta y el ticket propios de cada cliente, no de un benchmark.

3. **Métricas semanales.** No vienen de la planilla: viven en la base y se
   cargan desde el tracker de cada cliente. Para el histórico, importalas por
   SQL a `metricas_semanales` respetando que **vacío es `null` y no cero**.

4. **Estrategia versión 1** de cada cliente, con su fecha real. Sin esto el
   test de coherencia no tiene contra qué comparar.

5. **Documentos.** Cada consultora sube en `/clientes/[id]/documentos` la
   llamada de venta y las transcripciones que tenga. Es lo que le permite al
   diagnóstico citar textual.

---

## 4 · Verificar antes de abrirlo al equipo

- [ ] Entrás con tu usuario y ves la cartera completa en `/cartera`.
- [ ] Entrás con el usuario de una consultora y ves **sólo sus clientes**.
      Si ve los 85, `auth_user_id` o `consultora_id` no quedaron enlazados.
- [ ] Una consultora **no** ve Cobranza, Consultoras ni Planilla.
- [ ] `/modelo` muestra los seis motores en **conectado** (si cargaste la key).
- [ ] Abrís un cliente, cargás una semana en el tracker y el número aparece.
- [ ] El chat del cliente responde y cita datos reales del expediente.

---

## Listo

Con eso el equipo ya puede trabajar: ficha, tracker, sesiones, documentos,
alertas y los motores de IA. Lo que sigue es opcional.

---

## Apéndice · El trabajo nocturno (no lo necesitás todavía)

La app corre las 23 reglas duras en TypeScript cada vez que alguien abre una
pantalla. Con ~85 clientes eso es instantáneo, y es de donde salen las alertas
que ves en la bandeja. **No hay nada que programar.**

El día que la cartera crezca lo suficiente como para que calcularlo en cada
request deje de ser gratis, ese cálculo se muda a un trabajo nocturno en la
base sin tocar una sola pantalla —el motor no importa nada de React ni de
Supabase justamente para permitir esa mudanza.

Cuando llegue ese día: habilitá `pg_cron` en **Database → Extensions**, y corré
`supabase/opcional/cron-nocturno.sql`. Ese archivo explica lo único que hay que
cuidar: no encenderlo sobre una base a medio cargar, porque emite decenas de
alertas falsas y el equipo deja de leer la bandeja.

---

## Lo que conviene saber antes de que aparezca

- **La sincronización de la planilla la dispara una persona**, desde
  `/planilla`. Todavía no corre sola. Es el próximo paso natural.

- **Cuatro columnas de la planilla se leen pero no se guardan**: `Notas`,
  `Monto total`, `Cuotas` y `Estado deuda`. Las dos del medio se reconstruyen
  de las cuotas, así que no se pierde nada; las otras dos sí, hasta que existan
  los campos. Está anotado en `src/server/planilla-mapeo.ts`.

- **Drive y Slack no están conectados.** Las transcripciones entran subidas a
  mano en `/clientes/[id]/documentos`; las alertas no se enrutan a Slack.

- **El gasto en modelo se registra pero no se muestra.** Cada llamada se loguea
  con motor, versión de prompt, tokens e intentos, y la tabla `llamadas_modelo`
  existe, pero falta persistirlo y la pantalla que lo lee. Hasta entonces, el
  costo se mira en la consola de Anthropic.

- **Los umbrales son constantes en el código**, no configuración. El paquete
  pide que sean configurables porque van a cambiar cuando el equipo vea las
  primeras semanas de alertas reales. Cambiarlos hoy requiere un deploy.

- **Un PDF o un .docx hay que copiarlo y pegarlo** en Documentos. La extracción
  automática de esos formatos no está.

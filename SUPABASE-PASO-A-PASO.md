# Supabase paso a paso

Para quien nunca usó Supabase. Son diez pasos y unos veinte minutos. Al final
tenés la base de datos lista y las dos claves que necesita la app.

**Qué es Supabase.** Un PostgreSQL alojado, con un panel web, que además te
resuelve el login de los usuarios y los permisos. Es lo que va a guardar los
clientes, las sesiones, las alertas y todo lo demás. No hay que instalar nada:
se hace desde el navegador.

> Los nombres de los menús que menciono son los que tiene el panel hoy. Si
> alguno cambió de lugar, la idea es la misma y el buscador del panel te lleva.

---

## 1 · Crear la cuenta

Entrá a **[supabase.com](https://supabase.com)** → **Start your project**.

Podés entrar con GitHub, que es lo más rápido si ya tenés cuenta ahí.

---

## 2 · Crear el proyecto

Te va a pedir cuatro cosas:

| Campo | Qué poner |
|---|---|
| **Name** | `founders-brain` |
| **Database Password** | Generá una y **guardala en tu gestor de contraseñas** |
| **Region** | `South America (São Paulo)` |
| **Plan** | Free |

Sobre la contraseña: no la vas a necesitar para que la app funcione —eso va por
otro lado—, pero **no se vuelve a mostrar** y sin ella no podés conectarte por
fuera del panel. Guardala ahora.

Sobre la región: elegí la más cercana al equipo. Con 85 clientes el plan
gratuito sobra.

Dale a **Create new project** y esperá. Tarda uno o dos minutos en aprovisionar.

---

## 3 · Crear las tablas

Acá es donde se arma toda la estructura. Es un solo copiar y pegar.

**3.1 ·** Abrí este archivo del repo:

```
https://github.com/melderis-fbs/fbrain/blob/main/supabase/instalar.sql
```

Arriba a la derecha del archivo hay un botón para copiarlo entero (el ícono de
dos hojitas, "Copy raw file"). Copialo.

**3.2 ·** En Supabase, menú de la izquierda → **SQL Editor** → **New query**.

**3.3 ·** Pegá todo y apretá **Run** (o `Ctrl+Enter`).

Son 101 KB de SQL, así que tarda unos segundos. Cuando termina, abajo dice
algo como **Success. No rows returned**. Eso es lo correcto: crea tablas, no
devuelve filas.

**3.4 · Verificá que quedó.** Menú izquierdo → **Table Editor**. Tenés que ver
una lista larga de tablas: `alertas`, `clientes`, `consultoras`, `documentos_cliente`,
`metricas_semanales`, `pagos`, `sesiones` y varias más. Son 38 en total.

> **Si dio error.** Lo más probable es que se haya pegado sólo una parte.
> Andá a **Database → Tables**, borrá lo que haya quedado, o directamente creá
> un proyecto nuevo y volvé a empezar este paso. Correr el archivo dos veces
> sobre la misma base no es seguro.

---

## 4 · Cargar el equipo

Otra query en el **SQL Editor** → **New query**. Pegá esto y **Run**:

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

Cambiá los emails por los reales antes de correrlo. **El email tiene que ser
exactamente el mismo que vas a usar en el paso 5**, porque es lo que los enlaza.

`admin` ve todo y la parte de administración. `consultora` ve sólo sus clientes.

Cuando termina dice **Success. No rows returned**.

---

## 5 · Crear los usuarios que van a entrar

Las filas del paso 4 son *quién es quién en el equipo*. Ahora hay que crear
*con qué se loguea cada uno*. Son dos cosas distintas y las dos hacen falta.

Menú izquierdo → **Authentication** → **Users** → botón **Add user** → **Create
new user**.

Por cada persona:

- **Email**: el mismo del paso 4, exactamente igual
- **Password**: una provisoria; después cada uno la cambia
- **Auto Confirm User**: **activado** ← si no, la persona no puede entrar hasta
  confirmar un mail que probablemente nunca le llegue

Repetilo para las siete.

---

## 6 · Enlazar las dos cosas

Este es **el paso que más se saltea y el que rompe todo en silencio**. Si no lo
hacés, la app abre pero se ve completamente vacía, sin ningún mensaje de error:
la base no le devuelve nada a nadie porque no sabe quién es quién.

**SQL Editor** → **New query** → pegá y **Run**:

```sql
update consultoras c
set auth_user_id = u.id
from auth.users u
where u.email = c.email and c.auth_user_id is null;
```

Y ahora **verificá**, en otra query:

```sql
select nombre, email from consultoras where auth_user_id is null;
```

Tiene que decir **No rows returned**. Si te devuelve filas, esas personas no van
a ver nada: casi siempre es que el email del paso 4 y el del paso 5 no coinciden
exactamente —una mayúscula, un espacio, un dominio distinto—. Arreglá el email y
volvé a correr el `update`.

---

## 7 · Copiar las dos claves

Estas son las que va a necesitar Vercel.

Menú izquierdo → **Project Settings** (el engranaje, abajo de todo) → **API**.

Copiá dos valores:

| En Supabase | Se llama en la app |
|---|---|
| **Project URL** (`https://xxxxx.supabase.co`) | `NEXT_PUBLIC_SUPABASE_URL` |
| **Project API keys → `anon` `public`** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Guardalas en un bloc de notas por ahora.

> En esa misma pantalla hay una clave **`service_role`**. **No la uses y no la
> pongas en ningún lado.** Esa clave se saltea todos los permisos: cualquiera
> que la tenga ve y modifica la cartera entera. La app no la necesita.
>
> La `anon` sí se puede exponer: está pensada para eso, y los permisos los
> aplica la base según quién se logueó.

---

## 8 · Cerrar el registro abierto

Por defecto Supabase deja que **cualquiera con el link se cree una cuenta**.
Esto es una herramienta interna, así que hay que cerrarlo.

**Authentication** → **Sign In / Providers** (o **Providers**) → **Email** →
desactivá **Enable sign ups** → **Save**.

A partir de ahí los usuarios se crean sólo a mano, como hiciste en el paso 5.

---

## 9 · Conectar la app

Con las dos claves del paso 7, seguí con **[`DESPLIEGUE.md`](./DESPLIEGUE.md)**
a partir de la sección **2 · Vercel**. Son diez minutos más.

---

## 10 · Probar que quedó bien

Cuando la app esté desplegada:

- [ ] Entrás con tu email y ves la cartera completa en `/cartera`
- [ ] Entrás con el de una consultora y ves **sólo sus clientes**
- [ ] Una consultora **no** ve Cobranza, Consultoras ni Planilla en el menú

Si una consultora ve los 85 clientes, o si alguien ve todo vacío, el problema
está en el paso 6.

---

## Si algo sale mal

| Lo que ves | Qué pasó |
|---|---|
| La app abre pero está toda vacía | Falta el paso 6: `auth_user_id` sin enlazar |
| `relation "clientes" does not exist` | El paso 3 no terminó. Base limpia y de nuevo |
| `extension "pg_cron" is not available` | Estás corriendo un archivo viejo. Usá `supabase/instalar.sql` |
| Una consultora ve clientes que no son suyos | En `clientes`, `consultora_id` apunta a otra persona |
| Alguien no puede entrar | Al crear el usuario faltó **Auto Confirm User** |
| `duplicate key value violates unique constraint` | Corriste el paso 3 o el 4 dos veces |

**Empezar de cero es barato.** Si te enredaste, borrá el proyecto en
**Project Settings → General → Delete project** y creá otro. No perdés nada:
los datos reales todavía no están cargados.

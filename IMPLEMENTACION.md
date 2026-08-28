# FOUNDERS BRAIN · guía de implementación

Para quien va a poner esto en producción. Está escrita para que puedas trabajar
sin volver a preguntar nada, y para que sepas qué decisiones **no** conviene
tocar y por qué.

Tiempo estimado hasta tener el equipo usándolo: **dos semanas**, de las cuales
una es carga de datos y no código.

---

## 0 · Qué tenés en las manos

Una app Next.js 15 (App Router, React 19, TypeScript, Tailwind v4) que corre
**hoy, sin base de datos**, en modo demostración con 85 clientes ficticios.

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # 44 tests del motor
npm run inspect    # tabla en consola con el estado de los 85
```

El corazón del producto es `src/domain/`: TypeScript puro, sin React y sin
Supabase. Se testea sin infraestructura y el día que la cartera crezca se mueve
a un job sin tocar una pantalla. Si tenés que entender el sistema, empezá por
ahí y no por `src/app/`.

| Archivo | Qué resuelve |
|---|---|
| `domain/fases.ts` | 12 hitos con día esperado, 5 fases, la cadena de 12 eslabones |
| `domain/cuenta-inversa.ts` | El KPI semanal de cada cliente desde su meta y su ticket |
| `domain/expediente.ts` | El contexto del cliente: 6 bloques, acumulados que respetan `null` |
| `domain/embudo.ts` | Un solo eslabón roto, determinístico, con reglas de muestra mínima |
| `domain/indice.ts` | Índice de avance 0-100 en 5 pilares |
| `domain/alertas.ts` | 23 reglas duras + 22 criterios, ciclo de vida y techo semanal |
| `domain/atribucion.ts` | **¿Es el cliente o somos nosotros?** y el guion de confrontación |
| `domain/cobranza.ts` | El carril de cobranza, plantillas y checklist de baja |
| `domain/triage.ts` | Prioridad y carriles de «¿a quién ayudamos?» |
| `domain/motores/` | Constitución, prompts versionados y contratos Zod |

---

## 1 · Base de datos

Supabase (Postgres + Auth + RLS). Correr las migraciones **en este orden**:

```bash
psql "$DATABASE_URL" -f supabase/migrations/0001_schema_brain.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_fusion.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_reglas_duras_brain.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_reglas_fusion.sql
psql "$DATABASE_URL" -f supabase/migrations/0005_revision_cartera.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

`0005` es lo que salió de la revisión de cartera de agosto: días de gracia por
contrato, prórrogas con resultado, bajas con checklist, atribución y revisión de
caso, y las reglas RD-18 a RD-23.

Verificar que quedó bien:

```sql
select count(*) from information_schema.tables
 where table_name in ('prorrogas','bajas','atribuciones','revisiones_caso');  -- 4
select proname from pg_proc where proname = 'fn_correr_reglas_cobranza';       -- 1
```

---

## 2 · Carga de datos, en este orden y no en otro

Éste es el punto donde se arruina una implementación, así que va con detalle.

1. **`consultoras`** — 7 filas a mano (6 consultoras + administración). Cada una
   con su `auth_user_id` de Supabase Auth, o RLS no le devuelve nada.
2. **`clientes`** — CSV desde la base que ya armó Marialejandra. Campos mínimos:
   `nombre`, `programa`, `fecha_alta`, `consultora_id`, `estado`.
   - `fecha_alta` es obligatoria de verdad: sin ella no hay día del programa y
     el cliente no se puede calcular. Los que no la tengan, cargarlos igual y
     que aparezcan como expediente incompleto — es preferible a inventarla.
   - `dias_gracia_pago`: **5 para los contratos viejos, 3 para los nuevos.**
     No es una constante global: viaja con el cliente porque firmaron
     condiciones distintas.
3. **`metricas_semanales`** — desde la planilla del tracker.
   **Una semana que nadie cargó va como `null`, nunca como `0`.** Si el
   importador escribe ceros, el sistema entero miente: los acumulados dejan de
   declarar cuántas semanas tienen dato y los pilares puntúan cero en vez de
   quedar en `n/a`. Es el error más difícil de detectar después.
4. **`pagos`** — desde el CRM. Cuotas, montos y vencimientos.
5. **`estrategia_versiones`** — la versión 1 de cada cliente con su fecha real.
   La tabla es append-only por regla de Postgres: una corrección es una versión
   nueva, nunca un `UPDATE`.
6. **`objetivos_comerciales`** — meta mensual y ticket de cada cliente.
   **Sin esto no hay cuenta inversa**, y sin cuenta inversa la mitad de las
   reglas comparan contra nada. Si el dato no existe para todos, cargá los que
   tengas: el sistema distingue «no llega al número» de «no hay número».

Histórico y corriente: cargá el histórico una vez con estos importadores y a
partir del día del arranque que todo nazca en la app. Cargar todo a mano lleva
meses y no es necesario.

---

## 3 · El cron, y por qué va último

```sql
select cron.schedule('reglas', '0 6 * * *', 'select fn_correr_todas_las_reglas()');
```

**No lo actives hasta que los pasos 1 a 6 estén completos.** Activarlo antes
emite decenas de alertas falsas contra clientes que están bien, y el equipo
pierde la confianza en el sistema durante la primera semana. Recuperarla cuesta
meses. Es el error más caro del arranque y es totalmente evitable.

Cuando lo actives, la primera corrida sobre la cartera real **no va a emitir
diez alertas: va a emitir decenas.** Eso no es ruido del sistema, es el estado
de hoy — y ese número es el primer dato duro que Founders va a tener sobre su
propia cartera. La bandeja lo muestra separado del flujo semanal justamente para
que no se confunda con el trabajo de la semana. El backlog se baja una vez, a
mano, en una reunión.

---

## 4 · Configuración

`cp .env.example .env.local` y completar. Lo que importa:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # sólo server-side, nunca en el cliente
DATABASE_URL=
```

Las reglas de negocio son variables de entorno a propósito, no constantes:
van a cambiar cuando el equipo vea las primeras semanas de alertas reales, y ese
ajuste no debería requerir un deploy.

```
TECHO_ALERTAS_SEMANA=10
DIAS_CADENCIA_ROTA=21
DIAS_OBJETIVO_PRIMERA_VENTA=60
CUPO_MAXIMO_CONSULTORA=12
```

Con `NEXT_PUBLIC_MODO_DATOS=demo` la app vuelve al modo demostración aunque haya
credenciales cargadas. Sirve para mostrarla sin tocar datos reales.

---

## 5 · Roles y permisos

Viven en la base. La app no filtra «por las dudas»: filtra porque Postgres no le
devuelve otra cosa.

| Rol | Alcance |
|---|---|
| `consultora` | Sólo sus clientes. Escribe todo sobre ellos, salvo confirmar gates y cerrar rojas propias. |
| `admin` | Todo, más cobranza, bajas y configuración de hitos y umbrales. |

Tres triggers hacen el trabajo pesado, y ninguno es opcional:

- una consultora no puede cerrar una alerta roja de su propio caso;
- no puede confirmar un gate que le corresponde a administración;
- una revisión de caso no la escribe la consultora del caso.

La excepción deliberada de RLS: las alertas rojas y negras las ve todo el
equipo, porque por definición las revisa alguien que no es la consultora.

**Cobranza y bajas son sólo de administración**, y eso es una decisión de diseño,
no un descuido de permisos: la persona que hace el onboarding y sostiene la
relación es la que menos puede decir que no. Separar el rol es lo que hace que el
corte no dependa de la fuerza de voluntad de nadie.

---

## 6 · Conectar los motores de IA

Están **diseñados y no conectados**, con los prompts versionados en el repo y el
hash de la constitución en cada versión. Lo que falta es una llamada:

```
POST /api/clientes/[id]/diagnostico
  → construirPromptDiagnostico(ctx)
  → llamada al modelo
  → validar con diagnosticoSchema (Zod)
  → reintentar hasta 3 veces con el error de validación en el mensaje
  → persistir en `diagnosticos` con prompt_version, modelo, tokens y costo
```

Tres cosas que no hay que cambiar al conectarlos:

1. **La hipótesis previa de la consultora no se le manda al modelo.** Si la ve,
   acomoda su conclusión a la de ella y el ejercicio pierde el sentido. La
   comparación se hace después, en la app.
2. **`borradorLocal()` es el piso de calidad.** Resuelve el mismo diagnóstico con
   aritmética. Si el modelo dice algo peor que eso, está diciendo algo peor que
   una resta.
3. **Los contratos Zod se validan siempre**: un solo cuello de botella, máximo 5
   acciones, todo hecho con fuente, y nada de proponer CRM o funnel antes de que
   la oferta haya vendido.

---

## 7 · Lo que falta y no puede hacer un desarrollador

- **El set de evaluación.** Las tablas están (`eval_casos`, `eval_corridas`) y el
  runner es media jornada. Los 15 casos los tiene que escribir Vicky. Sin él,
  cada cambio de prompt es una apuesta a ciegas.
- **Integraciones** con Drive, Sheets y Slack: la arquitectura y las variables de
  entorno están; los conectores van en n8n o Make, no escritos a mano.
- **Post mortem como pantalla.** El dato está; falta el formulario. Va apenas
  haya un cliente en estado `perdido`.
- **Notificaciones.** Primero hay que saber si las alertas son accionables. Si no
  lo son, notificar sólo mueve el ruido de lugar.

---

## 8 · Las diez decisiones que no conviene tocar

Cada una está así por una razón, y todas se pueden discutir — pero conviene
saber qué se rompe antes de cambiarlas.

1. **Una alerta se cierra porque alguien escribió qué hizo** (mínimo 20
   caracteres), nunca por el paso del tiempo. Auto-resolver es cómodo y es
   exactamente lo que hace que nadie se haga cargo de nada.
2. **Semáforo e índice son dos instrumentos, no dos versiones de lo mismo.** El
   semáforo sale de las alertas abiertas; el índice responde «¿va camino a vender
   antes del día 60?» y no mueve el semáforo. Cuando se contradicen, esa
   contradicción es información.
3. **La expectativa comercial sale de la cuenta inversa de cada cliente**, no de
   un benchmark global. Convierte «el volumen parece bajo» en «37 DMs contra los
   104 que necesita para su meta».
4. **El eje son la fase del negocio y los hitos con fecha**, no los módulos del
   programa. Dos clientes en el mismo módulo pueden necesitar cosas opuestas.
5. **El criterio de la consultora no se promedia: emite alertas** (CR-01, CR-02).
   El número sigue siendo objetivo y el criterio humano sigue siendo soberano
   sobre el color.
6. **`null` no es `0`,** de punta a punta.
7. **No se puede atribuir un atraso al cliente mientras haya una falla nuestra
   sin corregir.** Si hace 37 días que nadie lo ve, no sabemos si ejecutó: no
   fuimos a preguntar. El motor evalúa primero nuestro lado, y el guion de
   confrontación queda bloqueado hasta que esté limpio.
8. **El amarillo de la grilla existe.** Un hito pasado de fecha pero dentro del
   margen de 12 días no abre alerta: se pinta de amarillo. Es el momento en que
   corregir sale barato, y hasta ahora era invisible.
9. **La cobranza no discute el servicio.** Nada del módulo lee el semáforo ni el
   índice. La única puerta al servicio es el reclamo sobre la llamada de venta, y
   va a otro carril con otro responsable.
10. **Cada prórroga guarda su resultado.** De ahí sale la tasa de recupero, que es
    lo que evita discutir la política caso por caso.

---

## 9 · Verificación antes de decir que está listo

```bash
npm run test      # 44 tests, todos en verde
npm run inspect   # semáforo, índice, atribución, cobranza sobre los 85
npx tsc --noEmit  # sin errores
npm run build     # compila
```

Y sobre la base real, después de cargar los datos y **antes** de activar el cron:

```sql
-- Clientes sin fecha de alta: no se pueden calcular
select count(*) from clientes where fecha_alta is null;

-- Clientes sin objetivo comercial: sin cuenta inversa
select count(*) from clientes c
 where c.estado = 'activo'
   and not exists (select 1 from objetivos_comerciales o where o.cliente_id = c.id);

-- Semanas cargadas con cero en vez de null: el error silencioso
select count(*) from metricas_semanales
 where dms_iniciados = 0 and agendas = 0 and ventas = 0 and contenido_publicado = 0;
```

Las tres cuentas deberían ser cero, o tener una explicación escrita.

---

## Sobre los datos de la demostración

Los nombres del equipo y la carga por consultora son reales, porque hay que
poder reconocer la cartera. **Todo lo demás es ficticio**: los 85 clientes, sus
números, sus sesiones, sus citas textuales, sus deudas y sus alertas. No hay
ningún dato cualitativo inventado sobre una persona real del equipo.

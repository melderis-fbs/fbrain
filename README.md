# FOUNDERS BRAIN

Expediente vivo por cliente, reglas de riesgo que corren solas y motores de criterio del método, en una sola aplicación para las seis consultoras y para dirección.

Esto es la fusión de dos cosas que existían por separado: el **paquete de Founders Brain** (expediente, diez reglas duras, cuatro motores, esquema probado) y el **CRM de Customer Success** (índice de avance, hitos por fase, triage, capa de dirección). No conviven: son un solo producto.

---

## Arrancar en 30 segundos

```bash
npm install
npm run dev
```

Sin configurar nada corre en **modo demostración**: 85 clientes ficticios repartidos entre las seis consultoras con la carga real de la operación, tracker semanal con semanas cargadas y semanas sin cargar, sesiones con y sin registro, alertas de criterio con cita textual y dos casos que reproducen los modos de falla ya documentados.

```bash
npm run test      # 44 tests del motor: reglas, atribución, cobranza, contratos
npm run inspect   # tabla en consola: semáforo, índice, eslabón roto y prioridad de los 85
npm run seed:sql  # regenera supabase/seed.sql (catálogo de hitos)
```

---

> **¿Vas a desplegarlo?** [`DESPLIEGUE.md`](./DESPLIEGUE.md) es Supabase + Vercel
> de arriba abajo. Si nunca usaste Supabase, empezá por
> [`SUPABASE-PASO-A-PASO.md`](./SUPABASE-PASO-A-PASO.md), que lo explica clic
> por clic.
>
> **¿Vas a implementarlo?** Seguí por [`IMPLEMENTACION.md`](./IMPLEMENTACION.md):
> orden de carga de datos y qué decisiones no conviene
> tocar. Este README explica el porqué; ése explica el cómo.

---

## Las seis decisiones de la fusión

**1 · Ganó el sistema de alertas de Brain, y con razón.**
El CRM auto-resolvía las alertas cuando la condición desaparecía. Cómodo, y exactamente lo que hace que nadie se haga cargo de nada. Acá una alerta se cierra porque una persona escribió qué hizo (mínimo 20 caracteres), una roja no la cierra la consultora del caso, y sin cita textual una alerta de criterio no se emite. Lo único que agregué encima: `condicionVigente`. Si la condición ya no se cumple, la bandeja lo dice y cerrarla es escribir una línea — se respeta el principio sin generar trabajo inútil.

**2 · Semáforo e índice son dos instrumentos, no dos versiones de lo mismo.**
El **semáforo** (verde/amarillo/rojo/negro) sale de las alertas abiertas: manda la peor. Responde "¿hay algo abierto que alguien tiene que atender?" y tiene dueño, plazo y texto de cierre. El **índice de avance** (0-100) responde otra cosa: "¿este cliente va camino a vender antes del día 60?". Se calcula solo, no consume tokens y **no mueve el semáforo**. Cuando se contradicen, eso mismo es información: índice bajo sin alertas significa que falta un dato o falta una regla.

**3 · La expectativa comercial sale de la cuenta inversa de cada cliente, no de un benchmark.**
El CRM comparaba a todos contra una tabla global ("20 conversaciones al mes 2"). Un cliente con ticket de USD 3.000 y otro de USD 400 no necesitan el mismo embudo ni de lejos. Acá el KPI semanal sale de la meta y el ticket del propio cliente, con la fórmula que el método ya usa en la sesión 1. Eso convierte "el volumen parece bajo" en "37 DMs contra los 104 que necesita para su meta".

**4 · El eje no son los módulos del programa: son la fase del negocio y los hitos con fecha.**
El módulo mide avance de programa; dos clientes en el mismo módulo pueden necesitar cosas opuestas. Doce hitos con día esperado, cinco de ellos derivados automáticamente de los números, y tres gates que confirma administración. El hito que define el producto es uno: **primera venta antes del día 60**.

**5 · El criterio de la consultora no se promedia: emite alertas.**
Era una variable ponderada del health score del CRM, lo que la diluía —marcar "en riesgo" movía doce puntos y el cliente seguía en amarillo. Acá su lectura dispara CR-01 y CR-02, con responsable, plazo y cierre. El número sigue siendo objetivo y el criterio humano sigue siendo soberano sobre el color.

**6 · Vacío no es cero.**
`metricas_semanales` guarda `null` cuando nadie cargó la semana, y el motor lo respeta en todos lados: los acumulados declaran cuántas semanas tienen dato, los pilares que no se pueden evaluar quedan en `n/a` en vez de puntuar cero, y el tracker dibuja distinto una semana en cero de una semana sin cargar.

---

## Lo que agregó la revisión de cartera de agosto

Cuatro cosas más, que salieron de una reunión de revisión y no del diseño
original. Las cuatro responden a lo mismo: el equipo veía que un cliente estaba
atrasado, pero no qué hacer con esa información.

**7 · «¿Es el cliente o somos nosotros?» es la pregunta, y tiene una regla.**
Un atraso sin responsable es una observación, no una decisión, y las dos ramas
terminan en acciones opuestas: si es el cliente, la consultora lo confronta con
el roadmap que él mismo aceptó; si somos nosotros, confrontarlo es injusto y
encima no arregla nada. La regla que ordena el módulo es incómoda a propósito:
**no se puede atribuir un atraso al cliente mientras haya una falla nuestra sin
corregir.** Si hace 37 días que nadie tuvo una sesión con él, no sabemos si
ejecutó — no fuimos a preguntar. El guion de confrontación queda literalmente
bloqueado hasta que nuestro lado esté limpio.

**8 · El amarillo existe.** «Está en la tercera semana y no avanzó con
contenidos. Todavía no es una red flag, pero yo ya lo marcaría naranja.» Ese
estado no existía en ningún lado: entre «va bien» y «hay una alerta abierta»
pasan tres semanas en las que corregir todavía sale barato. Un hito pasado de
fecha pero dentro del margen de 12 días se pinta de amarillo en la grilla y no
abre nada. Los gates tienen la mitad del margen, porque bloquean lo que viene
después.

**9 · La cobranza no discute el servicio.** Nada del módulo de cobranza lee el
semáforo, el índice ni la atribución: la cuota vence igual para el cliente
modelo y para el que está en rojo. Los días de margen salen del contrato de cada
uno —los viejos 5, los nuevos 3— porque aplicar la condición nueva a un contrato
viejo es indefendible. La única puerta al servicio es una: si el cliente dice que
lo que recibió no es lo que le vendieron, eso no es una excusa de pago sino un
reclamo sobre la llamada de venta, y va a otro carril con otro responsable. Y
cada prórroga guarda su resultado, así «creo que uno o dos cumplieron» pasa a ser
un porcentaje y la política se decide una vez en lugar de discutirse cada vez.

**10 · La baja es un checklist, no un estado.** Cerrar accesos, sacar del
Telegram, de la comunidad, del calendario de mentorías, cancelar cobros
recurrentes, cerrar Drive, avisar a la consultora, escribir el post mortem. Ocho
pasos que se olvidan de a uno —sobre todo el segundo— y una regla dura que los
reclama a los dos días.

---

## La grilla que se perdió en febrero

Founders tenía un Excel de clientes por hitos con cuadritos de color que en una
pasada decía quién iba en tiempo, y lo perdió al migrar al CRM. `/grilla` es esa
vista, reconstruida con dos diferencias: las columnas son hitos del negocio con
día esperado —así que el color sale de una resta y no del criterio de quien
completaba la planilla— y hay una columna que el Excel no tenía, que es la que
convierte la lectura en una decisión: de quién es el atraso.

---

## Pantallas

| Ruta | Qué pregunta responde | Quién |
|---|---|---|
| `/atencion` | ¿A quién ayudamos esta semana y con qué playbook? | Todos |
| `/grilla` | ¿Quién va en tiempo y quién no, en una pasada? | Todos |
| `/cobranza` | ¿A quién hay que cobrarle o cortarle hoy? | Administración |
| `/clientes/[id]/revision` | ¿Es el cliente o somos nosotros, y qué decidimos? | Todos |
| `/alertas` | ¿Qué se disparó, de quién es y para cuándo? | Todos |
| `/mis-clientes` | ¿A quién llamo hoy? | Consultora |
| `/clientes/[id]` | ¿Qué está pasando acá, en 30 segundos? | Todos |
| `/clientes/[id]/preparar` | ¿Con qué entro a la sesión y qué decisión tiene que salir? | Consultora |
| `/clientes/[id]/sesion` | ¿Cómo dejo todo actualizado en menos de 3 minutos? | Consultora |
| `/clientes/[id]/diagnostico` | ¿Cuál es el cuello de botella, y coincide con lo que yo pensaba? | Consultora |
| `/clientes/[id]/coherencia` | ¿A quién atrae de verdad lo que está publicando? | Consultora |
| `/cartera` | ¿Cómo está la operación y dónde acompaño? | Administración |
| `/consultoras` | ¿Qué carteras necesitan pensamiento estratégico? | Administración |
| `/modelo` | ¿Por qué este cliente está en rojo? | Todos |

---

## Estructura

```
src/
  domain/            # el motor: TypeScript puro, sin React ni Supabase
    fases.ts         #   hitos, fases del negocio, cadena de eslabones
    cuenta-inversa.ts#   la cuenta inversa desde la meta y los umbrales del embudo
    expediente.ts    #   contexto del cliente: bloques, acumulados null-aware, hitos
    embudo.ts        #   eslabón roto determinístico, con reglas de muestra
    indice.ts        #   índice de avance en cinco pilares
    alertas.ts       #   23 reglas duras + 22 criterios + ciclo de vida y techo semanal
    atribucion.ts    #   ¿es el cliente o somos nosotros? y el guion de confrontación
    cobranza.ts      #   el carril que no discute el servicio: gracia, prórrogas, bajas
    semaforo.ts      #   el peor estado abierto manda
    triage.ts        #   prioridad y carriles de "¿a quién ayudamos?"
    timeline.ts      #   línea de tiempo unificada, derivada
    motores/         #   constitución, prompts versionados y contratos Zod
    motor.test.ts    #   44 tests de los invariantes
  data/              # contrato + adaptador demo + adaptador Supabase
  server/            # ensamblado único de cálculo y autenticación
  components/        # sistema visual
  app/               # rutas (Next.js App Router)
supabase/
  migrations/
    0001_schema_brain.sql     # el esquema del paquete, sin tocar
    0002_fusion.sql           # objetivos, hitos, lecturas, satisfacción
    0003_reglas_duras_brain.sql  # las 10 reglas del paquete, sin tocar
    0004_reglas_fusion.sql    # RD-11 a RD-17, CR-01, CR-02
    0005_revision_cartera.sql # atribución, cobranza, bajas, RD-18 a RD-23
  contratos-json/    # los JSON Schema del paquete, como documentación del contrato
  seed.sql           # catálogo de hitos
  prueba-reglas.sql  # el test de las reglas del paquete
```

El motor no importa nada de React ni de Supabase: por eso se testea sin infraestructura y el día que la cartera crezca se mueve a un job sin tocar una pantalla.

---

## Producción

1. Crear el proyecto en Supabase y correr las migraciones **en orden**:
   ```bash
   psql "$DATABASE_URL" -f supabase/migrations/0001_schema_brain.sql
   psql "$DATABASE_URL" -f supabase/migrations/0002_fusion.sql
   psql "$DATABASE_URL" -f supabase/migrations/0003_reglas_duras_brain.sql
   psql "$DATABASE_URL" -f supabase/migrations/0004_reglas_fusion.sql
   psql "$DATABASE_URL" -f supabase/migrations/0005_revision_cartera.sql
   psql "$DATABASE_URL" -f supabase/seed.sql
   ```
2. Cargar `consultoras` (7 filas, a mano) y los 85 clientes por CSV.
3. Importar `metricas_semanales` desde la planilla del tracker, y `pagos` desde el CRM.
4. Cargar `estrategia_versiones` con la versión 1 de cada cliente, con la fecha real.
   Y `dias_gracia_pago` por cliente: 5 para los contratos viejos, 3 para los nuevos.
5. Cargar `objetivos_comerciales`: meta y ticket de cada cliente. Sin esto no hay KPI semanal.
6. Copiar `.env.example` a `.env.local` y completar Supabase.
7. Listo. **No hace falta configurar ningún cron**: la app corre las 23 reglas
   duras ella misma en cada request. Cuando la cartera crezca y convenga
   moverlo a un trabajo nocturno, está en `supabase/opcional/cron-nocturno.sql`
   con lo único que hay que cuidar.

### Permisos

Viven en la base. La app no filtra "por las dudas": filtra porque Postgres no le devuelve otra cosa.

| Rol | Alcance |
|---|---|
| `consultora` | Sólo sus clientes. Escribe todo sobre ellos, salvo confirmar gates y cerrar rojas propias. |
| `admin` | Todo, más configuración de hitos y umbrales. |

Dos triggers hacen el trabajo pesado: uno impide que una consultora cierre una roja de su propio caso, otro impide que confirme un gate que corresponde a administración. La excepción deliberada de RLS: las alertas rojas y negras las ve todo el equipo, porque por definición las revisa alguien que no es la consultora del caso.

---

## La primera corrida produce un backlog, y eso es el hallazgo

Cuando las reglas corren por primera vez sobre 85 clientes reales, no emiten diez alertas: emiten decenas. Ese número **es** el estado de hoy, no ruido del sistema.

El techo de diez por semana regula lo que entra de acá en adelante. El backlog se baja una vez, a mano, en una reunión — y cuántas eran, y de qué código, es el primer dato duro que Founders va a tener sobre su propia cartera. La bandeja lo muestra explícitamente separado del flujo semanal.

---

## IA

Los seis motores están **diseñados y no conectados**, con los prompts versionados en el repo y el hash de la constitución en cada versión.

- `src/domain/motores/constitucion.ts` — el prompt de sistema base, completo, sin recortar. Se envía en toda llamada de criterio.
- `diagnostico.ts` — protocolo de 10 pasos, serializador del expediente con origen y fecha en cada dato, y `borradorLocal()`: el mismo diagnóstico resuelto con aritmética. No es IA falsa, es el piso de calidad. Si el modelo dice algo peor que eso, está diciendo algo peor que una resta.
- `otros.ts` — onboarding, coherencia (dos llamadas, y el orden es la funcionalidad), score de 12 dimensiones, extractor y alertas por criterio.
- `contratos.ts` — los JSON Schema del paquete como validadores Zod ejecutables: un solo cuello de botella, máximo 5 acciones, todo hecho con fuente, y nada de proponer CRM o funnel antes de que la oferta haya vendido.

La hipótesis previa de la consultora **no se le manda al modelo**. Si la ve, acomoda su conclusión a la de ella y el ejercicio pierde el sentido: la comparación se hace después, en la app.

Para conectar: un `POST /api/clientes/[id]/diagnostico` que llame a la API con `construirPromptDiagnostico()`, valide con `diagnosticoSchema`, reintente hasta 3 veces con el error de validación en el mensaje, y persista en `diagnosticos` con `prompt_version`, modelo, tokens y costo.

---

## Lo que no está construido, a propósito

- **Integraciones reales** (Drive, Sheets, Slack). Está la arquitectura y las variables de entorno; los conectores van en n8n o Make, no escritos a mano.
- **El set de evaluación.** Las tablas están (`eval_casos`, `eval_corridas`) y el runner es media jornada, pero los 15 casos los tiene que escribir Vicky. Es el único entregable que no puede hacer un desarrollador, y sin él cada cambio de prompt es una apuesta a ciegas.
- **Post mortem como pantalla.** El dato está (`casos_perdidos`, alertas sin cerrar por cliente); falta el formulario. Va apenas haya un cliente en estado `perdido`.
- **Notificaciones.** Primero hay que saber si las alertas son accionables; si no, sólo se mueve el ruido de lugar.
- **Satisfacción en el tablero.** Se captura en el cierre de sesión desde hoy, pero no se muestra como promedio hasta que haya volumen: un promedio de tres respuestas no dice nada y quema la métrica para siempre.

---

## Sobre los datos de la demostración

Los nombres del equipo son los reales, y la carga por consultora también (Jay 30, Nati 21, Johann 12), porque salen del documento de contexto y hay que poder reconocer la cartera. **Todo lo demás es ficticio**: los 85 clientes, sus números, sus sesiones, sus citas textuales y sus alertas. No hay ningún dato cualitativo inventado sobre una persona real del equipo.

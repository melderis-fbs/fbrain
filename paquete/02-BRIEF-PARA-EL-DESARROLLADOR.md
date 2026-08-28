# Brief para el desarrollador · Founders Brain V1

**Cliente:** Founders · **Producto:** herramienta interna · **Usuarios:** 6 consultoras + 1 administradora · **Cartera:** ~85 clientes activos, ~10 altas por mes, ~340 sesiones por mes.

---

## 1 · Qué se está construyendo, en un párrafo

Una aplicación interna que mantiene un expediente estructurado de cada cliente de la consultora, lo alimenta automáticamente desde las transcripciones de las sesiones y las planillas que el equipo ya usa, corre alertas de riesgo sobre esa base, y ofrece cuatro motores de análisis que devuelven diagnósticos y planes con un formato fijo y validado. No es un chatbot. La entrada principal no es una caja de texto libre: es la ficha del cliente.

Leer `01-BLUEPRINT.html` antes de estimar.

---

## 2 · Stack definido

Está elegido para que lo pueda sostener una sola persona. No cambiarlo sin discutirlo.

| Pieza | Elección | Notas |
|---|---|---|
| Front + back | **Next.js** (App Router, TypeScript) en Vercel | Un repo, server actions, sin API separada |
| Base de datos | **Postgres en Supabase** | Auth, RLS y storage incluidos. Schema en `03-modelo-de-datos/schema.sql` |
| Búsqueda semántica | **pgvector** en la misma base | Para el corpus de método y precedentes |
| Modelo "criterio" | **Claude, modelo grande** | Diagnóstico, coherencia, onboarding, score |
| Modelo "extracción" | **Claude, modelo chico** | Transcripciones y clasificación. Corre por volumen |
| Validación de salida | **Zod** + JSON Schema de `06-contratos-json/` | Obligatorio en todos los motores |
| Jobs programados | **Supabase cron** (pg_cron) o Vercel Cron | Reglas duras, todas las noches |
| Ingesta | **n8n o Make** | Drive y Google Sheets. No escribir integraciones a mano |
| Notificaciones | **Slack** (webhook) + mail | La alerta va donde el equipo ya está |

**UI:** Tailwind + shadcn/ui está bien. No hace falta diseño custom; hace falta densidad de información y que el semáforo se lea de un vistazo. Ver `07-pantallas/`.

**Idioma:** todo en español rioplatense, incluida la interfaz y los mensajes de error.

---

## 3 · Hitos por semana

Ocho semanas, un desarrollador full-stack senior. El orden importa: cada hito deja algo usable en producción.

### Semanas 1-2 · Expediente y reglas duras
- Schema completo desplegado, con RLS: cada consultora ve solo sus clientes; el rol `admin` ve todo.
- Carga de los 85 clientes existentes (import por CSV, una sola vez).
- Pantallas **Mis clientes** y **Expediente** (lectura y edición manual de los 6 bloques, con los vacíos marcados).
- Las 10 reglas duras corriendo por cron y escribiendo en `alertas`.
- Pantalla **Bandeja de alertas** con cierre por texto obligatorio.
- Notificación a Slack.

**Criterio de aceptación:** las reglas duras corren sobre la cartera real y producen alertas verificables a mano. Ninguna alerta se puede cerrar sin texto. **Con esto solo, la app ya sirve.**

### Semanas 3-4 · El bucle central
- **Cerrar sesión:** subir o pegar transcripción → el extractor devuelve reporte propuesto, compromisos con fecha, números mencionados y frases candidatas a alerta → la consultora corrige y firma.
- Motor de **diagnóstico** con el protocolo de 10 pasos, salida validada.
- Hipótesis previa obligatoria antes de mostrar la respuesta, con comparación al final.
- Registro de cada corrida en `diagnosticos` (prompt version, modelo, tokens, costo).

**Criterio de aceptación:** cerrar una sesión con la app tarda menos que escribir el reporte a mano. Si no, este hito no está terminado — es el que decide si la app se usa o se abandona.

### Semana 5 · Alertas por criterio
- Clasificación de transcripciones contra los criterios A, B y C de `04-reglas-duras/especificacion-reglas.md`.
- Escalado automático: dos amarillas del mismo código en tres sesiones → rojo, sin intervención.
- Enrutamiento por estado: amarillo a la consultora, rojo a revisión con alguien que no sea su coach, negro a la administradora el mismo día.
- Techo duro de 10 alertas por semana, con priorización.

### Semana 6 · Coherencia y score
- Motor de coherencia con **brief inverso a ciegas** (ver el prompt: el orden de las dos llamadas es la funcionalidad, no un detalle).
- Score de 12 dimensiones con evidencia obligatoria por dimensión.
- Detección de drift contra `estrategia_versiones`.

### Semana 7 · Onboarding y sprints
- Motor de plan 60 días desde llamada de venta + formulario de onboarding.
- Cálculo de la cuenta inversa desde la meta (fórmula en `05-cerebro/06-umbrales-tracker-organico.md`).
- Generación del brief para pegar en el canal de la consultora.
- Sprints de 7 días con estado.

### Semana 8 · Cartera, evaluación y cierre
- Pantalla **Cartera** y pantalla **Post mortem**.
- Runner del set de evaluación: corre los 15 casos y reporta coincidencia.
- Ingesta automática desde Drive y Sheets.
- Documentación de operación y traspaso.

**Criterio de aceptación final:** el set de evaluación da **12 de 15** o más. Debajo de eso la app no se abre a las consultoras.

---

## 4 · Reglas de implementación no negociables

1. **Validación de salida.** Toda respuesta de modelo se valida contra su JSON Schema. Reintento con el error de validación en el mensaje; máximo 3 intentos; después falla visible al usuario. Nunca mostrar salida no validada.
2. **Un solo cuello de botella.** El schema de diagnóstico tiene un campo, no un array. Si el modelo insiste en dos, es un fallo de validación.
3. **Todo dato con origen.** Los campos de evidencia son objetos `{afirmacion, tipo: "hecho"|"hipotesis", fuente_tipo, fuente_id, fecha, cita}`. Sin `fuente_id`, `tipo` no puede ser `"hecho"`.
4. **Append-only donde importa.** `estrategia_versiones`, `alertas`, `diagnosticos` y `sesiones` no se borran ni se editan destructivamente. Correcciones = nueva fila.
5. **Umbral de expediente.** Si el cliente tiene menos de 4 de los 6 bloques con datos, el motor de diagnóstico no corre: devuelve qué falta y las preguntas para conseguirlo.
6. **Prompts versionados en el repo**, no en la base. Cada corrida guarda el hash del prompt usado. Sin esto el set de evaluación no significa nada.
7. **Costo observable.** Cada corrida registra tokens de entrada, salida y costo estimado. Debe haber una vista de gasto por mes y por motor.
8. **Sin borrado físico de clientes.** Estado `perdido` y post mortem obligatorio.

---

## 5 · Seguridad y privacidad

- Las transcripciones contienen información comercial y personal sensible de los clientes de Founders. No salen de Supabase ni de la API del modelo.
- RLS activo en todas las tablas, sin excepción. Probarlo con un test que se autentique como consultora y verifique que no puede leer el cliente de otra.
- Sin acceso público a storage. URLs firmadas con vencimiento.
- Logs sin contenido de transcripciones.
- No hay usuarios finales (clientes de Founders) en el V1. Todos los usuarios son del equipo.

---

## 6 · Fuera de alcance del V1

No cotizar ni construir: acceso del cliente final a su propio panel, escritura hacia el CRM o facturación, sugerencia automática de asignación de consultora, app móvil nativa, transcripción propia (se usa la de la plataforma de videollamadas), panel de patrones de cartera por programa.

---

## 7 · Presupuesto de operación estimado

Para dimensionar infraestructura, no para facturar. Verificar contra tarifas vigentes.

| Concepto | Orden de magnitud |
|---|---|
| Vercel + Supabase + automatizaciones | USD 45-70 / mes |
| Extracción (~340 sesiones/mes, modelo chico) | USD 40-120 / mes |
| Diagnósticos, coherencia, onboarding (modelo grande) | USD 80-250 / mes |
| Transcripción, si no la da la plataforma | USD 30-90 / mes |

El contexto de un diagnóstico ronda las 30-50k tokens de entrada (expediente + método recuperado + precedentes) y 2-4k de salida. Diseñar el armado de contexto con eso en mente: recuperar del corpus, no mandarlo entero.

---

## 8 · Preguntas para Founders

A resolver en la reunión de arranque:

1. ¿Qué CRM se usa hoy y expone API o export? Determina si `pagos` y `traspasos` se cargan a mano o se sincronizan.
2. ¿Qué plataforma de videollamadas se usa y transcribe automáticamente? Determina si hay que sumar transcripción.
3. ¿Cuál es la estructura exacta de carpetas de clientes en Drive? El watcher depende de una convención estable.
4. ¿Las planillas del tracker de orgánico son una por cliente o una general? Determina el ingestor de Sheets.
5. ¿Los 85 clientes se cargan con historia (sesiones pasadas) o desde cero? Con historia, el arranque es mucho más útil y hay un trabajo de import.
6. ¿Quién recibe las alertas negras si la administradora no está disponible?
7. ¿Confirmar el techo de 12 clientes por consultora y si es igual para todos los programas?

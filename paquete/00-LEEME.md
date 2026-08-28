# FOUNDERS BRAIN · Paquete de entrega

**Uso interno de Founders · 25 de agosto de 2026**

Este paquete contiene todo lo necesario para que un desarrollador externo construya Founders Brain sin tener que entrevistar a nadie para empezar. Está escrito para dos lectores distintos y conviene decirle a cada uno por dónde entrar.

---

## Si sos quien va a construir la app

Leé en este orden. No te saltees el 02: define el alcance contratado y los criterios de aceptación.

| # | Archivo | Qué es |
|---|---|---|
| 1 | `01-BLUEPRINT.html` | El producto explicado. Abrilo en el navegador. Es el "por qué" de cada decisión. |
| 2 | `02-BRIEF-PARA-EL-DESARROLLADOR.md` | Alcance, stack, hitos por semana, criterios de aceptación, qué está fuera de alcance. |
| 3 | `03-modelo-de-datos/schema.sql` | DDL completo de Postgres/Supabase, listo para correr. Con RLS. |
| 4 | `04-reglas-duras/` | Las 10 alertas determinísticas en SQL. **Esto es lo primero que hay que poner en producción.** |
| 5 | `05-cerebro/` | Los system prompts de cada motor y el conocimiento que consumen. |
| 6 | `06-contratos-json/` | Los JSON Schema de salida de cada motor. La validación es obligatoria, no opcional. |
| 7 | `07-pantallas/` | Especificación de pantallas y flujos. |
| 8 | `08-evaluacion/` | El set de evaluación: cómo se mide que el criterio esté bien antes de abrir la app. |
| 9 | `09-integraciones/` | Drive, Sheets, Slack, transcripción y variables de entorno. |

**El SQL de este paquete está probado, no es pseudocódigo.** `schema.sql` y `reglas-duras.sql` se corrieron contra PostgreSQL 16: 23 tablas, 5 vistas, 21 policies, cero errores, y las diez reglas emitiendo las alertas correctas sobre un caso de prueba que reproduce tres casos reales. El detalle está en `03-modelo-de-datos/verificacion.md` y el test en `04-reglas-duras/prueba-reglas.sql`.

**Las tres cosas que no se negocian**, porque son las que hacen que este producto sea distinto de un chat con un prompt largo:

1. **Salida tipada y validada.** Cada motor devuelve JSON validado contra su schema. Si el modelo devuelve dos cuellos de botella, la respuesta se rechaza y se reintenta. La disciplina va en el código, no en el prompt.
2. **Todo dato tiene origen.** Cada afirmación de un diagnóstico apunta a una sesión, una fecha o una fila de planilla. Lo que no tiene origen va en la sección `preguntas_abiertas` o marcado como hipótesis. Nunca inline como si fuera un hecho.
3. **Estrategia versionada, nunca editada.** `estrategia_versiones` es append-only. Es lo único que permite detectar drift, y sin drift el motor de coherencia no existe.

---

## Si sos de Founders y vas a supervisar esto

Tres avisos antes de contratar:

**Lo primero de la lista no necesita programador.** Las reglas duras de `04-reglas-duras/` son diez consultas sobre datos que ya existen. En una planilla, con fórmulas, funcionan igual y se pueden tener corriendo esta semana sobre los 85 clientes. Son aproximadamente la mitad del valor del producto. Ponerlas a correr antes de contratar el desarrollo también sirve para saber cuántas alertas reales genera la cartera hoy, que es un dato que hoy nadie tiene.

**El set de evaluación (`08-evaluacion/`) es el único entregable que no puede hacer el desarrollador.** Son 15 casos ya resueltos por Vicky, con el expediente como entrada y su conclusión como respuesta correcta. Sin eso no hay forma de saber si la app razona bien o solo escribe bien, y cada cambio de prompt pasa a ser una apuesta a ciegas. Si el desarrollo arranca sin este archivo lleno, se va a construir a ciegas.

**El prerrequisito operativo no es software.** Todas las sesiones tienen que quedar transcriptas en la carpeta del cliente en Drive. Hoy faltan reportes de unas veinte sesiones del período. La app puede alertar la ausencia; no puede analizar lo que nunca se grabó.

---

## Alcance del V1, en una tabla

| Motor | Estado en el V1 | Archivo del prompt |
|---|---|---|
| Reglas duras y alertas determinísticas | Completo, primero | `04-reglas-duras/reglas-duras.sql` |
| Extractor de transcripciones | Completo | `05-cerebro/05-extractor-transcripciones.md` |
| Diagnóstico (protocolo de 10 pasos) | Completo | `05-cerebro/01-motor-diagnostico.md` |
| Alertas por criterio | Completo | `05-cerebro/04-motor-score-alertas.md` |
| Test de coherencia (brief inverso a ciegas) | Completo | `05-cerebro/03-motor-coherencia.md` |
| Score de salud comercial | Completo | `05-cerebro/04-motor-score-alertas.md` |
| Plan de onboarding 60 días | Completo | `05-cerebro/02-motor-onboarding.md` |
| Acceso del cliente final | **Fuera de alcance** | — |
| Escritura al CRM / facturación | **Fuera de alcance** | — |
| Sugerencia automática de consultora | **Fuera de alcance** | — |

---

## Contacto y decisiones abiertas

Las decisiones que el desarrollador no puede tomar solo están listadas al final de `02-BRIEF-PARA-EL-DESARROLLADOR.md`, en la sección **Preguntas para Founders**. Conviene resolverlas en la reunión de arranque, no durante la semana 6.

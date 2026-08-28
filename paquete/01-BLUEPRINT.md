# FOUNDERS BRAIN · Blueprint de producto

**Versión navegable (recomendada para leer):** https://claude.ai/code/artifact/f999376d-5c59-4d78-89bd-8366c0fee5c9
**Versión offline:** `01-BLUEPRINT.html` en esta misma carpeta.

---

Un sistema que sostiene un expediente vivo de cada cliente y, cuando el consultor pregunta, contesta con un solo cuello de botella, la cita textual que lo prueba y qué hacer los próximos siete días.

V1 · **4 motores** Usuarios · **Consultoras + Vicky** Cartera · **~85 activos** **25 ago 2026**

## 01 · La decisión que define todo lo demás

Founders Brain no es un chat con el método. Es un expediente por cliente con un motor de criterio encima.

Esa distinción es todo el producto. Un chat es sin estado: cada consulta arranca de cero, el consultor tiene que volver a explicar el caso, y la calidad de la respuesta depende de cuánto contexto tuvo ganas de escribir ese día. Con seis consultoras y ochenta y cinco clientes, eso garantiza dos cosas: que nadie carga el contexto completo, y que la app nunca puede notar que algo *cambió*.

Y lo que hay que notar es justamente el cambio. Los dos casos que costaron plata este año —Parigi y Gianna— no se perdieron por falta de análisis. Se perdieron porque cinco escaladas emocionales en diez semanas quedaron cada una como una nota dentro de una sesión, y ninguna se comparó con la anterior. Una app sin memoria del caso vuelve a fallar igual, más rápido y con mejor prosa.

Principio de arquitectura

Si la app no puede responder *“¿qué cambió desde la sesión pasada?”*, no es Founders Brain. Es un prompt con buena letra.

### Dónde queda “Hablá con Vicky”

Son dos productos con el mismo cerebro y distinta unidad de trabajo. Conviene no fusionarlos: cada uno se rompe por motivos distintos.

|                    | Hablá con Vicky       | Founders Brain                            |
|--------------------|-----------------------|-------------------------------------------|
| **Unidad**         | La pregunta           | El cliente                                |
| **Memoria**        | La conversación       | El expediente, permanente                 |
| **Quién pregunta** | Cualquiera del equipo | La consultora del caso                    |
| **Dispara solo**   | No                    | Sí — alertas, vencimientos, incoherencias |
| **Falla cuando**   | La pregunta es vaga   | El expediente está vacío                  |

El corpus de conocimiento es compartido. La diferencia es que Brain nunca contesta sin leer primero el expediente, y nunca contesta sin dejar constancia de qué contestó.

## 02 · Las cuatro capas

Cada capa se puede construir, probar y romper por separado. Las de abajo no saben que existen las de arriba.

Capa 4

Superficie

Lo que ve la consultora: la ficha del cliente, el botón que pide un diagnóstico, la bandeja de alertas. Y lo que ves vos: el tablero de cartera. Nada de chat abierto como entrada principal.

Capa 3

Motores

Diagnóstico, Onboarding 60 días, Test de coherencia, Score y alertas. Cada uno con entrada definida, salida de formato fijo y una lista explícita de lo que se niega a hacer.

Capa 2

Expediente

El estado de cada cliente: qué vende, a quién, a qué precio, sus números por semana, su historial de compromisos, cada transcripción y cada alerta abierta o cerrada. La única fuente que los motores leen.

Capa 1

Cerebro

El rol de consultor estratégico como constitución, el método Founders, los umbrales del tracker de orgánico, los criterios de alerta, la cláusula de garantía y el corpus de casos ya resueltos. Es tu criterio, versionado.

### La decisión técnica que más importa

Hay dos tipos de inteligencia adentro de esto y mezclarlas es el error más caro que se puede cometer.

<table>
<colgroup>
<col style="width: 33%" />
<col style="width: 33%" />
<col style="width: 33%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 34%">Tipo</th>
<th>Qué resuelve</th>
<th style="width: 22%">Cómo se implementa</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Regla dura</strong><br />
determinística</td>
<td>Más de 21 días sin sesión. Dos cancelaciones seguidas. Cuota vencida hace 30 días. Cambio de coach en los últimos 30 días. Sesión sin transcripción. Día 90 sin una venta. Dos amarillas iguales en tres sesiones.</td>
<td>Consulta SQL programada. Sin modelo de lenguaje.</td>
</tr>
<tr class="even">
<td><strong>Criterio</strong><br />
interpretación</td>
<td>¿Esta frase es desesperanza sobre el proceso o un mal día? ¿Este mensaje atrae al cliente que declaramos? ¿Cuál de los ocho bloqueos es el que manda acá?</td>
<td>Modelo de lenguaje, obligado a citar la fuente.</td>
</tr>
</tbody>
</table>

Gianna dijo *“no nos vemos hace 3 o 4 semanas”* en la primera línea de su propia sesión. Eso no requiere inteligencia artificial: requiere una resta de fechas que nadie estaba haciendo. La mitad del valor de esta app son ocho consultas SQL que corren todas las noches, y son también la mitad más barata, más rápida y más confiable de construir. Empezá por ahí.

## 03 · El expediente: la unidad de la app

Todo lo demás es una vista de esto. El expediente tiene seis bloques, y el diseño de la pantalla debería hacer visible qué bloques están vacíos, porque un bloque vacío es exactamente lo que hace que un diagnóstico sea una opinión.

| Bloque                 | Contenido                                                                                                                                                               | De dónde sale                 |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------|
| **Identidad**          | Programa, fecha de alta, plan de pago, garantía sí/no, fuente, consultora asignada, historial de traspasos.                                                             | Alta manual · CRM             |
| **Negocio**            | Qué vende, a quién, precio, cómo entrega, facturación actual e histórica, cantidad de clientes, de dónde vienen, qué intentó antes, qué funcionó, activos que ya tiene. | Onboarding + llamada de venta |
| **Autoridad**          | Qué sabe hacer excepcionalmente bien, experiencia profesional, resultados propios y de terceros, industrias que conoce, autoridad desperdiciada.                        | Extraído de transcripciones   |
| **Estrategia vigente** | Cliente ideal, problema, promesa, oferta, mecanismo, canal. **Con versión y fecha** — este bloque es el que permite detectar drift.                                     | Sesiones · entregables        |
| **Números**            | Alcance, conversaciones, avance, agendas, asistencia, llamadas, ofertas, ventas, ticket, origen. Por semana.                                                            | Google Sheets del tracker     |
| **Trazabilidad**       | Cada sesión con fecha, transcripción y reporte; cada compromiso con fecha de vencimiento y si se cumplió; cada alerta con quién la cerró y qué escribió.                | Drive + la app                |

Restricción de producto

El bloque **Estrategia vigente** se guarda versionado, no editado. Cuando el cliente cambia su oferta, la versión anterior no se sobreescribe: queda con su fecha. Sin eso no se puede detectar que Parigi bajó su precio de 20.000 a 15.000 por iniciativa propia el 02/07, que es un criterio rojo y pasó de largo.

### La regla de entrada

Un expediente con menos de cuatro bloques cargados no habilita diagnóstico. La app no responde “no vende porque su oferta es débil” con tres datos; responde con la lista de lo que falta y las preguntas exactas para conseguirlo en la próxima sesión. Es la única forma de que el producto no se convierta en una máquina de opiniones bien escritas.

## 04 · Los cuatro motores del V1

Cada motor tiene entrada definida, salida con formato fijo, y una lista de lo que se niega a hacer. Esa última fila es la que hace que la app tenga criterio en lugar de ganas de ayudar.

Motor 1

### Diagnóstico · ¿por qué no está vendiendo?

El caso de uso central. La consultora no describe el caso: lo abre. La app ya tiene el expediente.

Por dentro recorre la cadena completa buscando la primera incoherencia, no la más visible:

ClienteProblemaDeseoOfertaPromesaMensajeCanalLeadSettingVentaEntregaResultado

Y clasifica el bloqueo en uno de ocho tipos —estratégico, mensaje, adquisición, comercial, entrega, operativo, ejecución, emocional— porque la acción es completamente distinta según cuál sea, y la confusión entre *ejecución* y *estrategia* es la que hace que un caso se re-diagnostique cuatro veces.

Entrada  
Expediente + la pregunta de la consultora + su hipótesis previa (obligatoria).

Salida  
El protocolo de 10 pasos, en ese orden: diagnóstico en 5 puntos · **un** cuello de botella · evidencia con hechos separados de hipótesis · qué no haría · hipótesis principal · plan ordenado con responsables · métricas · checkpoint · criterio de decisión (si X continuar, si Y corregir, si Z replantear) · preguntas abiertas.

Además  
Tipo de bloqueo, eslabón donde se rompe la cadena, y el Principio Founders generalizable detrás de la conclusión.

Se niega a  
Dar más de un cuello de botella. Listar más de cinco acciones. Decir “no funciona” sin declarar el tamaño de la muestra. Inventar un dato que no está en el expediente. Diagnosticar “mindset” cuando los números muestran un problema de oferta.

Motor 2

### Onboarding · plan de 60 días desde cero

Hoy este trabajo lo hacés vos, a mano, y el resultado es un documento como el de Alejandrina: qué necesita en orden, con la evidencia textual de la llamada al lado de cada necesidad. Eso es exactamente el formato de salida que hay que reproducir, no un plan genérico de doce semanas.

El motor arranca de la transcripción de la llamada de venta más el formulario de onboarding, y lo primero que hace es lo que más se saltea: **calcular la cuenta inversa desde la meta**. Con el ticket y el objetivo del cliente, cuántas ventas, asistencias, agendas, conversaciones y cuánto alcance por semana. Ese número es lo que convierte un plan en un compromiso.

Entrada  
Llamada de venta + onboarding + programa contratado + garantía sí/no + horas reales por semana declaradas.

Salida  
Mapa 1-7 / 8-14 / 15-30 / 31-45 / 46-60 · el sprint de los primeros 7 días con 3 a 5 acciones · la cuenta inversa con sus números · las tres cosas para la sesión 1 · el brief para pegar en el canal de la consultora.

Además  
Riesgos del caso con su evidencia textual, y las condiciones de la garantía si aplica, listadas para leer en voz alta.

Se niega a  
Armar el plan contra las horas del pitch en lugar de las horas reales. Aplicar el mismo ritmo a todos los negocios. Poner “definir nicho” como tarea de la semana 4 cuando el cliente ya tiene seis mercados abiertos.

Motor 3 · el caso de Pame

### Test de coherencia · ¿a quién atrae esto realmente?

Es el motor que resuelve el problema que trajiste: el cliente comunica y le llega otro tipo de cliente. La consultora pega un anuncio, un reel, un guion, una landing o diez DMs reales.

El truco de diseño está en el orden, y es lo que hace que este motor funcione mejor que preguntarle a un chat. La app corre **un brief inverso a ciegas**: lee el mensaje *sin* mirar el cliente ideal declarado en el expediente y escribe quién se reconocería en ese texto —nivel de facturación, madurez, tipo de dolor, si está escapando de un problema o capturando una oportunidad—. Después, y solo después, abre el expediente y compara las dos definiciones.

Ese es el diferencial: la app no puede autoengañarse confirmando la intención, porque cuando escribió su respuesta no conocía la intención.

Entrada  
El material tal cual está publicado. Opcional: los leads que trajo, con lo que dijeron.

Salida  
Perfil inferido a ciegas · perfil declarado · veredicto Coherente Parcial Incoherente · las palabras exactas que corren el mensaje hacia el público equivocado · qué eslabón tocar primero, con la advertencia explícita de no ir directo a segmentación.

Además  
Dolor de principiante vs. dolor de crecimiento, marcado. Y drift: en qué se fue moviendo el mensaje respecto de la versión de estrategia anterior, con fechas.

Se niega a  
Recomendar cambiar segmentación antes de revisar qué dice el mensaje. Concluir sobre la calidad de los leads con menos de una decena de casos. Reescribir el material antes de decir qué está mal y por qué.

Motor 4

### Score de salud comercial y alertas

Doce dimensiones del 1 al 10 —cliente ideal, problema, deseo, oferta, promesa, mensaje, autoridad, adquisición, volumen, ventas, entrega, ejecución— con las tres que más están limitando las ventas destacadas, y cada puntaje con la evidencia que lo justifica. Un score sin evidencia al lado es un número que nadie va a creer la segunda vez.

Encima corre el sistema de alertas, con la regla de formato que ya definiste: verde es solo color, y amarillo, rojo o negro son semáforo más tres líneas con cita textual y fecha. Así se ve una alerta en la bandeja:

Amarillo · 2ª vez Eleonora Rolandi · sesión del 06/08

Sigue sin sentir la oferta como propia y dice que el sistema la abruma. Textual: *“son muchas cosas juntas y no sé por dónde empezar”*. Es el mismo bloqueo que en la sesión del 23/07, dos sesiones después del cambio de coach.

**Pedido** · que la consultora cierre este punto en la próxima sesión o lo escale. Si vuelve a aparecer, pasa a rojo automático.

Entrada  
Transcripción de cada sesión + datos duros del CRM, finanzas y agenda.

Detecta  
Lo que el cliente dice · las ausencias (ningún número en toda la sesión, sesión que se fue en configurar herramientas, cierre sin compromiso con fecha, el cliente habló menos del 30%) · las alertas sobre nosotros (sesión sin registro, reporte con más de 48 h de atraso, Coaching Log que no coincide) · los cruces duros de fechas y pagos.

Salida  
Estado, las tres líneas, el pedido concreto, y a quién le llega: consultora, revisión de caso en 48 h con alguien que no sea su coach, o a vos el mismo día.

Se niega a  
Cerrar una alerta por el paso del tiempo. Emitir una alerta sin cita textual y fecha. Alertar por dudas técnicas, mal día, o emoción fuerte con avance. Alertar sobre un cliente en sus primeras dos semanas. Y un techo duro: **máximo 10 alertas por semana**; si el sistema genera más, prioriza y guarda el resto para el informe mensual.

Principio Founders

Ninguna alerta se cierra sola. Se cierra porque alguien escribió qué hizo. Y una alerta roja solo la puede cerrar quien hizo la revisión, no la consultora del caso.

## 05 · Cómo se logra que piense con tu criterio

Esto no se resuelve con un prompt largo. Son cinco piezas, y la quinta es la que casi nadie construye y la única que te dice si funcionó.

#### 1 · Constitución

El rol que ya escribiste, fijo, versionado, idéntico en todas las corridas. No se edita por caso. Es lo que hace que dos consultoras distintas obtengan el mismo criterio.

#### 2 · Jurisprudencia

El corpus de casos ya resueltos —Parigi, Gianna, Andy Videla, Curia, Catalina, Gaspar, Alejandrina— indexado y recuperable. No como ejemplos de estilo: como precedentes. Cuando aparece un caso nuevo, la app trae los dos o tres casos anteriores más parecidos y los cita. Un cliente que baja su precio solo tiene un precedente con nombre y fecha, y eso vale más que cualquier razonamiento desde cero.

#### 3 · Umbrales, no adjetivos

Los números del tracker de orgánico entran como tabla, no como prosa: qué es alcance bajo, qué es cierre bajo, qué significa cada rojo. Sin esto la app dice “el alcance parece bajo”. Con esto dice “el alcance está en X, el objetivo para su meta y su ticket es Y, y con el embudo en rojo necesitaría cuatro veces más para facturar lo mismo”.

#### 4 · Formato de salida obligatorio

Cada motor devuelve una estructura tipada, validada por el sistema, no texto libre. Si el modelo devuelve dos cuellos de botella, la respuesta se rechaza y se vuelve a pedir. La disciplina se impone en el código, no se le pide al modelo por favor.

#### 5 · Evaluación contra tus propias respuestas

Acá está la diferencia entre una app que suena bien y una que sirve. Tomás quince casos que ya resolviste vos —los que están en el proyecto— y los convertís en un set de prueba: el expediente como entrada, tu conclusión como respuesta correcta. Cada vez que se cambia el prompt, el corpus o el modelo, se corre el set y se mide en cuántos casos la app llega al mismo cuello de botella que vos.

Ese número es la única definición honesta de “piensa como Vicky”, y es también el que te avisa cuando una mejora aparente empeoró el criterio. Sin este paso, cada cambio en el prompt es una apuesta a ciegas.

Meta razonable

Coincidencia con tu diagnóstico en **12 de 15** casos antes de abrir la app a las consultoras. Debajo de eso, el producto todavía no está listo y va a enseñar criterio equivocado, que es peor que no enseñar ninguno.

## 06 · Lo que la app tiene prohibido

Los guardarraíles son parte de la especificación, no una nota al pie. Van implementados como validaciones, no como sugerencias en el prompt.

- **Completar información faltante imaginándola.** Todo dato del diagnóstico apunta a su origen: sesión, fecha, planilla. Lo que no tiene origen se declara como hipótesis, en su propia sección.
- **Devolver más de un cuello de botella** o más de cinco acciones por sprint.
- **Concluir sin muestra.** Toda afirmación sobre qué funciona o no viene con cuántos casos, sobre cuántos y qué porcentaje.
- **Recomendar construcción antes de validar.** CRM, funnels, automatizaciones, más inversión en ads y equipo comercial quedan bloqueados hasta que el expediente registre que alguien compró la oferta.
- **Escalar lo que todavía no funciona.** La jerarquía cliente → problema → oferta → promesa → mensaje → validación → adquisición → ventas → entrega → escala se respeta en el orden del plan.
- **Cambiar de estrategia por un caso aislado.** Un comentario, una llamada, una objeción no mueven nada. Se piden patrones.
- **Cerrar una alerta sin texto escrito por una persona.**
- **Contradecir al consultor es obligatorio, no opcional.** Si la lectura de la consultora no coincide con el expediente, la app lo dice: “no veo evidencia suficiente para concluir eso todavía”, “esto es un síntoma y no la causa”, “antes de cambiar la oferta quiero revisar el mensaje”.

## 07 · La app enseña criterio o lo reemplaza

Tu misión declarada es que la consultora aprenda a pensar. Una app que devuelve la respuesta perfecta al primer click hace exactamente lo contrario: forma gente que consulta bien y diagnostica cada vez peor. El diseño tiene que empujar en la dirección opuesta, y se resuelve con dos decisiones de producto muy chicas.

### Primero tu hipótesis, después la mía

Para pedir un diagnóstico, la consultora escribe antes, en dos líneas, cuál cree que es el cuello de botella. Es obligatorio y no se puede saltear. La app responde y, arriba de todo, muestra si coincidieron y en qué se separaron.

Eso convierte cada consulta en una repetición de entrenamiento en lugar de una consulta a un oráculo. Y te da, además, el dato de management que hoy no tenés: qué consultora acierta el cuello de botella y en qué tipo de caso se equivoca siempre.

### “Estoy concluyendo esto porque…”

Toda respuesta incluye el razonamiento en una línea y el Principio Founders generalizable detrás. No para justificarse: para que la consultora reconozca el patrón sola en el próximo cliente.

### Las pantallas

<table>
<colgroup>
<col style="width: 50%" />
<col style="width: 50%" />
</colgroup>
<thead>
<tr class="header">
<th style="width: 30%">Pantalla</th>
<th>Para qué existe</th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>Mis clientes</strong><br />
consultora</td>
<td>Lista con semáforo, días desde la última sesión, compromiso vigente y qué le toca a cada uno esta semana. Es la pantalla de inicio.</td>
</tr>
<tr class="even">
<td><strong>Expediente</strong><br />
consultora</td>
<td>Los seis bloques, con los vacíos marcados. Línea de tiempo de sesiones, compromisos y cambios de estrategia con fecha.</td>
</tr>
<tr class="odd">
<td><strong>Preparar sesión</strong><br />
consultora</td>
<td>Objetivo en una frase, diagnóstico actual, las 5 preguntas que más información producirían, la decisión que tiene que salir de la sesión, y el sprint de 7 días. Se genera antes de cada reunión.</td>
</tr>
<tr class="even">
<td><strong>Cerrar sesión</strong><br />
consultora</td>
<td>Sube o pega la transcripción; la app propone el reporte, el compromiso con fecha y las alertas que detectó. La consultora corrige y firma. Esto es lo que hace que cargar el expediente cueste menos que no cargarlo.</td>
</tr>
<tr class="odd">
<td><strong>Bandeja de alertas</strong><br />
consultora + Vicky</td>
<td>Amarillas, rojas y negras abiertas, con su pedido y su plazo. Se cierran escribiendo qué se hizo.</td>
</tr>
<tr class="even">
<td><strong>Cartera</strong><br />
Vicky</td>
<td>Los 85 clientes por estado, carga real por consultora contra el techo de 12, altas de la semana, clientes en día 60 y en día 90 sin venta, y expedientes ciegos por falta de registro.</td>
</tr>
<tr class="odd">
<td><strong>Post mortem</strong><br />
Vicky</td>
<td>Todo cliente perdido: qué señal hubo, cuándo, y por qué no se actuó. Es la pantalla que audita si el sistema de alertas sirve.</td>
</tr>
</tbody>
</table>

## 08 · De dónde entran los datos

| Fuente                       | Qué trae                                                                                                                                            | Cómo                                                                                          |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| **Transcripciones**          | Casi todo el bloque de negocio y autoridad, los compromisos, las citas textuales de las alertas. Es la fuente más rica y la que hoy se desperdicia. | Watcher sobre la carpeta del cliente en Drive → extracción automática → la consultora valida. |
| **Google Sheets**            | Los números semanales del tracker de orgánico y los datos de cartera y cupos por consultora.                                                        | Lectura programada, sin migrar nada de lugar.                                                 |
| **Formulario de onboarding** | La línea de base del cliente nuevo el día 1.                                                                                                        | Ya existe. Se conecta y se completa lo que falte.                                             |
| **Carga manual**             | Lo que ninguna fuente tiene: precio real, activos, correcciones. Y el cierre de alertas.                                                            | Formularios cortos dentro de la app.                                                          |

Lo que hay que arreglar antes, y no es software

Hoy faltan reportes de unas veinte sesiones del período y las dos sesiones donde el caso Parigi se rompió no tienen registro. La app puede detectar y alertar esa ausencia, pero no puede inventar lo que nunca se grabó. **Que todas las sesiones se transcriban y queden en la carpeta del cliente es un prerrequisito, no una funcionalidad.** Sin eso, Founders Brain funciona a media máquina y la mitad ciega va a ser siempre la mitad donde están los casos que se pierden.

## 09 · Plan de construcción

Tres etapas, y la primera no necesita programador. El orden está elegido para que el valor aparezca antes que la app: si la etapa cero no cambia nada en la operación, la app tampoco lo va a hacer.

### V0 · Semanas 1 y 2 · sin código

El objetivo es probar el criterio, no el producto. Se hace con lo que ya tenés.

- El rol y el método quedan como skill fija, y cada cliente como un expediente en el proyecto, con los seis bloques y el formato de salida obligatorio.
- Las **ocho reglas duras** se implementan como fórmulas en la planilla de cartera: días sin sesión, cancelaciones seguidas, cuota vencida, cambio de coach, día 90 sin venta, sesión sin registro. Esto solo, sin nada más, es lo que hubiera atrapado a Gianna.
- Dos consultoras usan el protocolo a mano en diez casos reales, y se compara con lo que hubieras dicho vos. Ese es el set de evaluación del V1.

**Costo:** tu tiempo y el de dos consultoras. **Lo que se decide con esto:** si el criterio se transfiere, y qué motor duele más. Si el V0 no se usa, no construyas el V1.

### V1 · Semanas 3 a 10 · la app

| Pieza               | Elección                  | Por qué                                                                                                   |
|---------------------|---------------------------|-----------------------------------------------------------------------------------------------------------|
| Front y back        | Next.js en Vercel         | Un solo repo, un solo lenguaje, deploy sin infraestructura.                                               |
| Base y auth         | Postgres en Supabase      | Login, permisos por rol y almacenamiento resueltos. El expediente es relacional: no lo pongas en Notion.  |
| Búsqueda del corpus | pgvector en la misma base | Recuperar método y precedentes sin sumar otro servicio.                                                   |
| Criterio            | Claude · modelo grande    | Diagnóstico, coherencia, onboarding. Salida tipada y validada.                                            |
| Extracción          | Claude · modelo chico     | Leer transcripciones, sacar compromisos, números y frases candidatas. Corre por volumen, cuesta centavos. |
| Reglas duras        | Cron sobre SQL            | Las ocho alertas determinísticas, todas las noches. Sin modelo.                                           |
| Ingesta             | n8n o Make                | Drive y Sheets sin escribir integraciones a mano.                                                         |
| Notificación        | Slack + mail              | La alerta va donde el equipo ya está. Nadie entra a una app a buscar alertas.                             |

#### Orden de construcción

1.  **Expediente y reglas duras** (semanas 3-4). Sin motores de criterio todavía. Ya sirve.
2.  **Motor de diagnóstico + cerrar sesión con transcripción** (semanas 5-6). El bucle central: cargar la sesión sale casi gratis y devuelve el reporte hecho.
3.  **Alertas por criterio y bandeja** (semana 7).
4.  **Test de coherencia y score** (semana 8).
5.  **Onboarding 60 días y tablero de cartera** (semanas 9-10).

#### Costos, en orden de magnitud

| Concepto                  | Estimado                        | Nota                                                                 |
|---------------------------|---------------------------------|----------------------------------------------------------------------|
| Desarrollo V1             | 8 semanas · 1 full-stack senior | Único costo grande. Un solo desarrollador alcanza con este stack.    |
| Infraestructura           | ≈ USD 45–70 / mes               | Vercel + Supabase + automatizaciones.                                |
| Extracción de sesiones    | ≈ USD 40–120 / mes              | Unas 340 sesiones mensuales con modelo chico.                        |
| Diagnósticos y coherencia | ≈ USD 80–250 / mes              | Modelo grande, contexto largo. Escala con el uso, no con la cartera. |
| Transcripción             | ≈ USD 30–90 / mes               | Cero si la plataforma de videollamadas ya transcribe.                |

Los rangos son estimaciones de orden de magnitud sobre volumen propio y precios de lista vigentes; hay que confirmarlos contra la tarifa del día antes de presupuestar. El costo mensual de operación es chico. La decisión real es la del desarrollo.

### V2 · después del mes 3

Solo lo que el uso pida: acceso del cliente a su propio sprint y sus números, cierre del circuito con el CRM y facturación, panel de patrones de cartera (qué cuello de botella predomina por programa y por consultora), y sugerencia de asignación de consultora con cupos, que hoy resolvés a mano cada vez.

### La alternativa honesta, sin programador

Se puede llegar a un 70% con Airtable como expediente, formularios para la carga, Make llamando a la API de Claude, y Slack para las alertas. Se arma en dos o tres semanas sin escribir una línea de código.

Los dos límites, para que la decisión sea informada: la salida tipada y validada es frágil —difícil garantizar que nunca devuelva dos cuellos de botella—, y el versionado del bloque de estrategia, que es lo que detecta drift, es incómodo de hacer en Airtable. Si el V0 muestra que el motor de diagnóstico es lo que más falta, saltá directo al V1. Si muestra que lo que más falta son las alertas, la versión sin código puede ser suficiente por varios meses.

## 10 · Cómo fracasa esto

Cuatro modos de falla, en orden de probabilidad, y cómo se desactiva cada uno.

| Falla                                                                                                                                                    | Antídoto                                                                                                                                                                           |
|----------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Nadie carga el expediente.** El modo de falla más probable de todos: si cargar cuesta más que abrir un doc, la app queda vacía en tres semanas.        | La única entrada de carga es “cerrar sesión”, y devuelve el reporte y el compromiso ya escritos. Cargar tiene que *ahorrar* trabajo el mismo día, no prometerlo para más adelante. |
| **Fatiga de alertas.** Más de diez por semana y en un mes nadie las lee.                                                                                 | Techo duro de diez, priorizadas. Y la lista explícita de lo que no dispara alerta: dudas técnicas, mal día, emoción con avance, cliente en sus primeras dos semanas.               |
| **Las consultoras dejan de pensar.** Se vuelven buenas pidiéndole diagnósticos y malas haciéndolos.                                                      | Hipótesis obligatoria antes de la respuesta, el porqué en cada conclusión, y medición de aciertos por consultora.                                                                  |
| **Basura entra, criterio sale.** Con expedientes a medias la app produce opiniones bien escritas, que es peor que no producir nada porque parecen datos. | Umbral mínimo de bloques para habilitar diagnóstico, origen obligatorio para cada dato, y sección separada de hipótesis.                                                           |

## 11 · Cómo medimos si funciona

No con uso. Una app muy usada que no mueve las ventas del cliente es exactamente el problema que el método intenta evitar: actividad confundida con resultado. Cinco números, medidos contra los tres meses anteriores al lanzamiento.

- **Clientes con su primera venta antes del día 60.** El número que define el producto.
- **Casos perdidos que tenían señal previa sin actuar.** Tiene que tender a cero. Es la razón por la que el sistema de alertas existe.
- **Alertas amarillas cerradas con texto dentro del plazo.** Mide si el circuito se cierra o solo se enciende.
- **Horas para armar un plan de onboarding.** Hoy son tus horas, y son el cuello de botella de la operación con diez altas por mes.
- **Aciertos de cuello de botella por consultora, mes a mes.** Mide lo único que escala de verdad: criterio en el equipo.

Regla final

La misma pregunta que la app le hace a cada cliente vale para la app: *¿esto acerca a una venta o solo mantiene ocupado a alguien?*

## 12 · Lo primero, esta semana

En este orden, y sin empezar por el software.

1.  **Las ocho reglas duras, en la planilla de cartera.** Un día de trabajo, cero código, y es la mitad del valor de la app. Corren sobre los 85 clientes el viernes.
2.  **Transcripción obligatoria de todas las sesiones**, en la carpeta del cliente en Drive. Es el prerrequisito de todo lo demás y no depende de nadie externo.
3.  **El set de evaluación.** Quince casos que ya resolviste, con expediente y conclusión. Es el activo más valioso del proyecto y solo lo podés armar vos.
4.  **Dos consultoras usando el protocolo a mano** en sus próximos diez casos, con hipótesis escrita antes.

Con eso, en dos semanas vas a saber tres cosas que hoy no sabés: qué motor duele más, si el criterio se transfiere por escrito, y si el equipo carga el expediente cuando nadie lo obliga. Recién ahí conviene contratar el desarrollo.

Founders Brain Blueprint V1 25 · 08 · 2026


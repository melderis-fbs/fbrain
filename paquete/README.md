# El paquete de Founders Brain

Esta carpeta es el **método**: el documento de origen del que salió la app.
Vino del repo `melderis-fbs/brain-founders` y se incorporó acá para que no
haya dos fuentes de verdad en dos lugares distintos.

La app **ya implementa** este paquete. Lo que sigue es el mapa de dónde está
cada cosa, verificado archivo por archivo.

## Lo que ya vive en el código, idéntico

Estos archivos del paquete no están duplicados acá porque ya son parte del
repo, byte a byte:

| Del paquete | Vive en |
|---|---|
| `03-modelo-de-datos/schema.sql` | `supabase/migrations/0001_schema_brain.sql` |
| `04-reglas-duras/reglas-duras.sql` | `supabase/migrations/0003_reglas_duras_brain.sql` |
| `04-reglas-duras/prueba-reglas.sql` | `supabase/prueba-reglas.sql` |
| `05-cerebro/00-constitucion-rol.md` | `src/domain/motores/constitucion.md` |
| `06-contratos-json/*.json` (6) | `supabase/contratos-json/` |

## Dónde está implementado cada especificación

| Documento | Implementación |
|---|---|
| `03-modelo-de-datos/diccionario-de-datos.md` | Las 23 tablas del esquema, más 8 que agregó la revisión de cartera |
| `04-reglas-duras/especificacion-reglas.md` | `src/domain/alertas.ts` y las migraciones `0003`–`0005` |
| `05-cerebro/01-motor-diagnostico.md` | `src/domain/motores/diagnostico.ts` |
| `05-cerebro/02-motor-onboarding.md` | `PROMPT_ONBOARDING` en `motores/otros.ts` |
| `05-cerebro/03-motor-coherencia.md` | `PROMPT_COHERENCIA_A/B` en `motores/otros.ts` |
| `05-cerebro/04-motor-score-alertas.md` | `PROMPT_SCORE` y `PROMPT_ALERTAS_CRITERIO` |
| `05-cerebro/05-extractor-transcripciones.md` | `PROMPT_EXTRACTOR` |
| `05-cerebro/06-umbrales-tracker-organico.md` | `src/domain/cuenta-inversa.ts` y `embudo.ts` |
| `05-cerebro/07-jurisprudencia-casos.md` | Los casos que reproduce `src/data/demo/generar.ts` |
| `07-pantallas/especificacion-pantallas.md` | Las rutas de `src/app/(app)/` |
| `08-evaluacion/` | Tablas `eval_casos` y `eval_corridas` |
| `09-integraciones/integraciones-y-entorno.md` | **Sin implementar.** Ver abajo |

## Reglas y criterios · conteo verificado

- **23 reglas duras** (`RD-01` … `RD-23`). El catálogo de `src/domain/alertas.ts`
  y las funciones SQL de las migraciones coinciden exactamente: mismas 23 en
  los dos lados, sin desfasaje.
- **22 criterios de transcripción** (`CT-*`, familias A, B y C), definidos en
  `04-reglas-duras/especificacion-reglas.md` e implementados en el catálogo de
  `alertas.ts`. Los dos códigos del documento que no aparecen en ese catálogo
  son `CT-C1` y `CT-C2`, y es correcto: el propio documento aclara que van
  implementados como `RD-05` y `RD-06`.
- **2 alertas de lectura de la consultora** (`CR-01`, `CR-02`), que no vienen
  del paquete sino del CRM de Customer Success.

## La capa de modelo · construida

`09-integraciones` especificaba la llamada a modelo y no existía. Ahora sí:

| Pieza | Dónde |
|---|---|
| Cliente, reintentos y observabilidad | `src/server/modelo.ts` |
| Un botón por motor | `src/server/acciones-motores.ts` |
| Chat sobre el expediente de un cliente | `src/app/api/clientes/[id]/chat/route.ts` |
| Extractor de ficha desde documentos | `src/domain/motores/ficha.ts` |
| Log de cada llamada | `supabase/migrations/0006_ficha_y_llamadas.sql` |

Cómo se comporta:

- **La disciplina está en el código, no en el prompt.** La salida se valida
  contra su schema Zod. Si no cumple, el error de validación vuelve *dentro del
  mensaje* y el modelo corrige sobre lo que ya escribió. Tres intentos
  (`MAX_REINTENTOS_VALIDACION`); después el fallo es visible, nunca silencioso.
- **El test de coherencia son dos llamadas y el orden es la funcionalidad.** La
  primera lee el material sin saber nada del negocio; recién la segunda ve el
  cliente ideal declarado. En una sola llamada el modelo acomodaría el perfil
  inferido al declarado y el test no mediría nada.
- **La hipótesis de la consultora no viaja al modelo.** Si la viera, acomodaría
  su conclusión, y la franja de comparación es la razón de ser del flujo.
- **Sin `ANTHROPIC_API_KEY` la app funciona igual.** Los motores quedan
  `sin conectar`, `/modelo` lo muestra, y responde el motor de reglas local.
- La constitución y el prompt de cada motor van cacheados: no cambian entre
  llamadas y son la mayor parte de los tokens de entrada.

## La ficha y el tracker

- `/clientes/[id]/ficha` — los cuatro bloques del expediente en un formulario.
  Arriba, una caja donde pegar la transcripción de la llamada de venta o el
  formulario de onboarding: el extractor completa los campos vacíos y deja la
  cita de dónde sacó cada dato. No pisa lo que ya escribió una persona, y lo
  que no está en el documento lo deja en blanco. Si el documento se contradice,
  no elige: deja el campo vacío y lo dice.
- `/clientes/[id]/tracker` — la carga semanal, con las últimas 12 semanas a la
  vista. Un campo vacío se guarda como `null`, no como cero: el guión de la
  grilla es una semana que nadie cargó, y el motor los trata distinto.
- Estrategia y objetivo son append-only. Cambiar la meta no borra contra qué se
  venía midiendo, y el drift entre versiones es lo que mira el test de
  coherencia.

## La planilla consolidada · construida

Una sola planilla en Drive con cuatro solapas, que la app lee desde
`/planilla`. Las plantillas con los encabezados exactos están en
`paquete/planilla/`.

| Solapa | Qué entra |
|---|---|
| `Clientes` | Las columnas de finanzas tal como están, **las cuatro cuotas con su fecha y estado**, y el expediente: negocio, autoridad, estrategia y meta |
| `Pagos` | Las cuotas en formato largo, si se prefiere sobre las columnas |
| `Asistencias` | Una fila por mentoría |

Las **métricas semanales no vienen de la planilla**: viven en la base del CRM y
se cargan desde el tracker de cada cliente. Tenerlas en los dos lados obliga a
decidir cuál gana cada vez que difieren, y la que cargó la consultora mirando
el caso es justamente la que una importación diaria pisaría sin avisar.

- Se lee por el **export CSV de Google**: alcanza con compartir la planilla por
  enlace. Sin service account, sin credenciales, y funciona en WebContainer.
- El mapeo de columnas vive en `src/server/planilla-mapeo.ts` con alias por
  campo, así que renombrar una columna en Drive no requiere tocar nada más.
- **Celda vacía no es cero.** Vacío entra como `null`.
- **Una fila con cliente no identificable se saltea y se informa**, con el
  número de fila y el motivo. No se adivina por parecido de nombre.
- **La planilla no pisa lo que se carga en la app**: sesiones, reportes,
  compromisos, lecturas y alertas no se tocan desde ahí.
- Estrategia y objetivo entran append-only, y sólo si algo cambió.

## Los documentos del cliente

`/clientes/[id]/documentos` es donde el consultor sube todo lo que tiene: la
transcripción de la llamada de venta, el formulario de onboarding, las
transcripciones de sesión, el contrato. Archivos de texto (.txt, .md, .vtt,
.srt) leídos en el navegador, o pegado directo. Un PDF o un .docx hay que
copiarlo y pegarlo: extraerlos necesitaría librerías nativas que no corren en
WebContainer, y es mejor decirlo que fallar en silencio.

Van a la tabla `documentos_cliente` —no a `corpus_documentos`, que es el corpus
del método y lo comparte toda la cartera— y **el diagnóstico, el onboarding y el
chat los leen**. Es lo que permite que el motor cite textual: sin cita textual
el método no emite nada.

Si por tamaño algún documento queda afuera del contexto, el prompt lo dice con
nombre y fecha. Truncar en silencio es la forma más rápida de que el modelo
concluya sobre la mitad del caso y nadie se entere.

## Correr esto en WebContainer (Bolt / StackBlitz)

Un `npm install` normal deja `node_modules` en **1,1 GB**, y 320 MB de eso son
binarios nativos que WebContainer no puede ejecutar: `@next/swc-linux-x64-gnu`
y `-musl` (137 MB cada uno, y npm baja los dos porque no puede decidir la
libc) más `sharp`. Ahí adentro `npm install --omit=optional` deja 347 MB, cero
binarios nativos, y el build y el dev funcionan igual: Next usa su compilador
WASM, que es lo que usa en WebContainer de todos modos.

Lo que ese flag rompe es `npm test`, porque vitest necesita el binding de
rolldown y también es opcional. Los tests se corren fuera del contenedor.

Aun así, Next.js instalado son ~145 MB de base y el runtime del framework es
pesado para un sandbox del navegador. Para uso real conviene un host de Node
de verdad.

## Lo que todavía no existe

Del resto de `09-integraciones`:

- **La sincronización automática.** Hoy la dispara una persona desde
  `/planilla`. Falta el cron diario.
- **Google Drive** para transcripciones: siguen entrando pegadas a mano en el
  cierre de sesión.
- **Slack**: el enrutamiento de alertas (amarillo → DM a la consultora, rojo →
  canal de revisión, negro → DM a administración) y la lectura del canal de
  asistencias a mentorías.
- **Vista de gasto por mes y por motor.** La tabla `llamadas_modelo` ya existe
  y cada llamada se registra en el log del servidor, pero falta persistirla y
  la pantalla que la lee.
- **Los umbrales como configuración** en vez de constantes en el código.
- **Pantalla 9 · Post mortem.** Existe como paso del checklist de baja, no como
  pantalla propia.

## Lo que no se trajo, y por qué

La app de `brain-founders` (Vite + React Router, 4 pantallas, 1.062 líneas)
**no se incorporó**. Es un prototipo anterior de lo mismo que esta app ya hace
con 17 rutas y 12.575 líneas, sobre un esquema que contiene sus 23 tablas
completas —sin perder una sola columna— más 8 tablas nuevas. Traerla sería
sumar código muerto que hace lo mismo peor.

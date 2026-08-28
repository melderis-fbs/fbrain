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

## Lo que el paquete especifica y todavía no existe

`09-integraciones/integraciones-y-entorno.md` describe la capa que conecta la
app con el mundo, y **nada de eso está construido**:

- La llamada a modelo. El documento define `ANTHROPIC_API_KEY`,
  `MODELO_CRITERIO`, `MODELO_EXTRACCION`, `MODELO_JUEZ` y
  `MAX_REINTENTOS_VALIDACION`. Hoy los 6 motores figuran con
  `estado: 'sin_conectar'` en `src/domain/motores/otros.ts`, la pantalla
  `/modelo` los muestra así, y `diagnostico/page.tsx` pasa `conectado={false}`
  fijo. Los prompts, los contratos Zod y el armado del contexto están hechos;
  falta quien haga la llamada.
- Google Drive (transcripciones) y Google Sheets (tracker y cartera).
- Slack para el enrutamiento de alertas.
- Observabilidad: log por llamada con `prompt_version`, tokens y costo.
- Los umbrales como configuración en vez de constantes en el código.

## Lo que no se trajo, y por qué

La app de `brain-founders` (Vite + React Router, 4 pantallas, 1.062 líneas)
**no se incorporó**. Es un prototipo anterior de lo mismo que esta app ya hace
con 17 rutas y 12.575 líneas, sobre un esquema que contiene sus 23 tablas
completas —sin perder una sola columna— más 8 tablas nuevas. Traerla sería
sumar código muerto que hace lo mismo peor.

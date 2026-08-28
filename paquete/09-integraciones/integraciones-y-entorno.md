# Integraciones y variables de entorno

Regla general: **no migrar nada de lugar.** Las planillas y las carpetas de Drive siguen donde están y con la estructura que tienen. La app lee de ahí. Cualquier propuesta que empiece con "primero pasemos todo a…" agrega tres semanas y un punto de fricción con el equipo.

---

## 1 · Google Drive · transcripciones

**Qué hace:** detecta transcripciones nuevas en la carpeta del cliente y las encola para extracción.

**Cómo:** service account con acceso de lectura a la carpeta raíz de clientes. Watcher cada 15 minutos vía n8n o Make, o webhook de Drive si la estructura lo permite.

**Identificación del cliente:** por `clientes.drive_folder_id`. Si un archivo aparece en una carpeta que no matchea ningún cliente, va a una cola de asignación manual. **No adivinar por nombre de archivo.**

**Prerrequisito operativo:** que todas las sesiones queden transcriptas en la carpeta del cliente. Hoy faltan reportes de unas veinte sesiones del período, y las sesiones donde el caso Parigi se rompió no tienen registro. La app detecta y alerta la ausencia (regla RD-05), pero no puede analizar lo que nunca se grabó.

**A confirmar con Founders:** la estructura exacta de carpetas. El watcher depende de una convención estable.

## 2 · Google Sheets · números y cartera

**Qué trae:** las métricas semanales del tracker de orgánico por cliente, y los datos de cartera y cupos por consultora.

**Cómo:** lectura programada, una vez por día, con la misma service account. Upsert sobre `metricas_semanales` por `(cliente_id, semana_iso)`.

**Reglas de ingesta:**
- Celda vacía ≠ cero. Vacío es `null`; un cero significa que se midió y dio cero. La diferencia importa para el diagnóstico: cero conversaciones es un dato, "no sabemos cuántas conversaciones hubo" es otro.
- Fila con cliente no identificable: se saltea y se loguea, no se inventa.
- El mapeo de columnas va en un archivo de configuración, no hardcodeado. Las planillas cambian de forma.

**A confirmar:** si es una planilla por cliente o una general.

## 3 · Slack · alertas

**Qué hace:** manda cada alerta amarilla, roja o negra a donde corresponde, con sus tres líneas completas y un link a la ficha del cliente.

**Enrutamiento:** amarillo → DM a la consultora del caso. Rojo → canal de revisión de casos. Negro → DM a la administradora, el mismo día.

**No mandar:** resúmenes diarios, alertas verdes, ni digest de "todo bien". El canal se ignora en dos semanas si trae ruido.

**Formato:** las tres líneas completas en el mensaje, con la cita textual visible sin tener que abrir nada. La cita es el contenido de la alerta, no un detalle.

## 4 · Transcripción de audio

Solo si la plataforma de videollamadas no transcribe. Verificar primero: si ya lo hace, esta integración no existe y se ahorra un costo mensual.

Si hace falta: Whisper vía API sobre el archivo de audio en Drive, resultado escrito al lado del original como `.txt`.

## 5 · CRM y facturación

**Fuera de alcance de escritura en el V1.** Solo lectura, y solo si expone API o export programado, para alimentar `pagos` y `traspasos`. Si no, se cargan a mano: son pocos registros por mes y no justifican una integración frágil.

---

## 6 · Variables de entorno

```bash
# --- Base de datos y auth ---
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # solo server-side, nunca en el cliente

# --- Modelos ---
ANTHROPIC_API_KEY=
MODELO_CRITERIO=                  # motor de diagnóstico, coherencia, onboarding, score
MODELO_EXTRACCION=                # extractor de transcripciones, clasificador de alertas
MODELO_JUEZ=                      # comparación del set de evaluación
MAX_REINTENTOS_VALIDACION=3

# --- Embeddings del corpus ---
EMBEDDINGS_MODELO=
EMBEDDINGS_DIMENSIONES=1536       # debe coincidir con vector(N) en el schema

# --- Google ---
GOOGLE_SERVICE_ACCOUNT_JSON=      # base64
DRIVE_CARPETA_RAIZ_CLIENTES=
SHEETS_TRACKER_ID=
SHEETS_CARTERA_ID=
SHEETS_MAPEO_COLUMNAS=            # ruta al archivo de configuración

# --- Slack ---
SLACK_BOT_TOKEN=
SLACK_CANAL_REVISION_CASOS=
SLACK_USER_ID_ADMIN=

# --- Reglas de negocio (configurables, no hardcodeadas) ---
TECHO_ALERTAS_SEMANA=10
DIAS_CADENCIA_ROTA=21
DIAS_CADENCIA_CRITICA=30
DIAS_CUOTA_VENCIDA=30
DIAS_HITO_SIN_VENTA=90
DIAS_CLIENTE_NUEVO=14
CUPO_MAXIMO_CONSULTORA=12
MIN_BLOQUES_PARA_DIAGNOSTICO=4
MIN_LEADS_PARA_CONCLUIR=10

# --- Operación ---
TZ=America/Argentina/Buenos_Aires
CRON_REGLAS_DURAS=0 6 * * *       # 03:00 hora de Buenos Aires
```

**Los umbrales van como configuración, no como constantes en el código.** Van a cambiar cuando el equipo vea las primeras semanas de alertas reales, y ese ajuste no debería requerir un deploy.

## 7 · Observabilidad mínima

- Log de cada llamada a modelo: motor, `prompt_version`, modelo, tokens de entrada y salida, costo estimado, si validó al primer intento.
- Vista de gasto por mes y por motor. Sin esto, el costo se descubre en la factura.
- Contador de reintentos de validación por motor: si un motor reintenta mucho, su prompt o su schema están mal, y es la señal más temprana de que algo se rompió.
- Alerta de operación si el cron de reglas duras no corrió. Un sistema de alertas que se cae en silencio es peor que no tenerlo.

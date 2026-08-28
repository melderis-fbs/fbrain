# Diccionario de datos

Referencia rápida de `schema.sql`. Las decisiones que parecen raras están explicadas: casi todas responden a un caso real que se perdió.

---

## Tablas por bloque del expediente

| Bloque | Tablas |
|---|---|
| 1 · Identidad | `clientes`, `consultoras`, `traspasos` |
| 2 · Negocio | `negocio` |
| 3 · Autoridad | `autoridad` |
| 4 · Estrategia vigente | `estrategia_versiones` *(append-only)* |
| 5 · Números | `metricas_semanales`, `pagos`, `asistencias_mentoria` |
| 6 · Trazabilidad | `sesiones`, `compromisos`, `alertas` |

Motores y registro: `diagnosticos`, `coherencia_tests`, `scores` + `score_items`, `planes_onboarding`, `sprints`, `casos_perdidos`.
Cerebro: `corpus_documentos`, `corpus_chunks`.
Evaluación: `eval_casos`, `eval_corridas`.

---

## Decisiones del esquema y por qué

| Decisión | Por qué |
|---|---|
| `estrategia_versiones` es append-only, con `rule` que bloquea UPDATE y DELETE | Es lo único que permite detectar drift. Sin historial no se puede ver que un cliente bajó su precio de 20.000 a 15.000 el 02/07 por iniciativa propia — criterio rojo que pasó de largo |
| `estrategia_versiones.iniciativa` | Un cambio de precio a iniciativa del cliente, sin llamada de venta de por medio, es una alerta. A iniciativa de la consultora, no |
| `diagnosticos.cuello_botella` es `text`, no `text[]` | Un solo cuello de botella. Si el modelo devuelve dos, es un fallo de validación, no una respuesta más completa |
| `alertas` con constraint `cierre_con_texto` | Ninguna alerta se cierra por el paso del tiempo. Se cierra porque alguien escribió qué hizo. Mínimo 20 caracteres |
| `alertas` con constraint `criterio_con_cita` | Una alerta de criterio sin cita textual es una interpretación y se discute. Con cita es un hecho y se trabaja |
| Trigger `tg_valida_cierre_rojo` | Una roja o negra no la puede cerrar la consultora del caso. Requiere revisión externa |
| `alertas.diferida` | Techo de 10 por semana. Las que pasan no se borran: no compiten por la atención y van al informe mensual |
| `sesiones` con `menciono_numeros`, `pct_habla_cliente`, `cerro_con_compromiso`, `se_fue_en_herramienta`, `abrio_repasando` | Las ausencias también son señal, y son baratas de detectar. Cerca de la mitad de las sesiones de un caso perdido se fueron en configurar herramientas |
| `sesiones.tema_declarado` vs `tema_tratado` | Cuando difieren es una alerta de proceso: el registro no coincide con lo que pasó |
| `clientes.horas_reales_semana` separado del programa | El plan se arma contra las horas que el cliente tiene, no contra las del pitch. Un plan que asume diez horas cuando hay tres falla en la semana 3 y parece falta de compromiso del cliente |
| `sprints` con constraint `acciones_max_5` | Nunca 25 recomendaciones simultáneas. La restricción va en la base para que no dependa de la disciplina de nadie |
| `casos_perdidos` con `post_mortem` obligatorio y `alertas_sin_cerrar` | Si un cliente llega a perdido con dos amarillas sin cerrar, el problema no fue el cliente. Es la tabla que audita si el sistema de alertas funciona |
| `metricas_semanales`: vacío es `null`, no `0` | Cero conversaciones es un dato. "No sabemos cuántas hubo" es otro. Confundirlos hace que la app concluya sobre nada |
| `diagnosticos.prompt_version` en cada corrida | Sin esto el set de evaluación no significa nada: no se puede saber contra qué versión se midió |
| `traspasos` como tabla propia | El traspaso es el momento de mayor pérdida de clientes de la cartera. Necesita ser consultable, no un campo sobreescrito |

---

## Vistas

| Vista | Para qué |
|---|---|
| `v_estrategia_vigente` | La última versión de estrategia de cada cliente. Lo que usan los motores |
| `v_completitud_expediente` | Qué bloques tiene cargados cada cliente, uno por columna |
| `v_bloques_cargados` | Cuenta de bloques y flag `habilita_diagnostico` (4 o más) |
| `v_carga_consultoras` | Activos por consultora contra el techo de 12, con el exceso |
| `v_semaforo_cliente` | El peor estado abierto por cliente, última sesión y ventas acumuladas. Alimenta la lista de "Mis clientes" |

---

## Enums

| Enum | Valores |
|---|---|
| `rol_usuario` | consultora · admin |
| `estado_cliente` | activo · pausado · finalizado · perdido |
| `semaforo` | verde · amarillo · rojo · negro |
| `origen_alerta` | regla_dura · criterio |
| `destinatario_alerta` | consultora · revision_externa · admin |
| `tipo_bloqueo` | estrategico · mensaje · adquisicion · comercial · entrega · operativo · ejecucion · emocional |
| `eslabon` | cliente · problema · deseo · oferta · promesa · mensaje · canal · lead · setting · venta · entrega · resultado |
| `dimension_score` | las 12 dimensiones del score |
| `veredicto_coherencia` | coherente · parcial · incoherente |
| `estado_compromiso` | pendiente · cumplido · no_cumplido |
| `estado_pago` | pendiente · pagado · vencido · incobrable |

La severidad del semáforo se resuelve con la función `fn_severidad()`, no con `max()`: Postgres no define ese agregado para enums, y el orden alfabético pondría `rojo` por encima de `negro`, que es al revés de lo que corresponde. Si se agrega un estado, hay que actualizar esa función.

---

## RLS

Dos funciones de seguridad: `fn_es_admin()` y `fn_consultora_id()`, ambas `security definer` sobre `auth.uid()`.

Política general: una consultora ve solo los clientes donde figura como asignada; el rol `admin` ve todo.

**Excepción deliberada:** las alertas rojas y negras son visibles para todo el equipo, porque por definición las tiene que revisar alguien que no sea la consultora del caso.

**Test obligatorio antes de producción:** autenticarse como consultora y verificar que no puede leer el cliente de otra. Es la clase de bug que no se nota hasta que se nota.

---

## Migración inicial

1. Correr `schema.sql` completo.
2. Cargar `consultoras` (6 filas, a mano).
3. Import de `clientes` por CSV: ~85 filas.
4. Cargar `pagos` desde el CRM o el export de facturación.
5. Import de `metricas_semanales` desde la planilla del tracker.
6. Cargar `estrategia_versiones` con la versión 1 de cada cliente, con la fecha real de cuando se definió. Si no se conoce, usar la fecha de alta y anotarlo en `motivo_cambio`.
7. Cargar el corpus (`corpus_documentos` + embeddings).
8. **Recién después**, activar el cron de reglas duras. Si se activa antes de que los datos estén cargados, va a emitir decenas de alertas falsas y el equipo va a perder la confianza en el sistema la primera semana.

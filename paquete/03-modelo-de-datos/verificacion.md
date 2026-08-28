# Verificación del esquema

El esquema y las reglas duras de este paquete se corrieron contra **PostgreSQL 16** antes de entregarse. No son pseudocódigo.

## Resultado

```
schema.sql        → 23 tablas · 5 vistas · 21 policies · 0 errores
reglas-duras.sql  → 10 reglas cargadas · 0 errores
```

Con un caso de prueba que reproduce tres casos reales (cadencia rota tipo Gianna, cuota vencida tipo Andy, precio bajado por iniciativa propia tipo Parigi), las reglas emitieron exactamente las cinco alertas esperadas, con la prioridad correcta:

| Código | Estado | Título | Va a | Prioridad |
|---|---|---|---|---|
| RD-07 | 🔴 | Día 120 sin una venta registrada | revisión externa | 100 |
| RD-03 | 🔴 | Cuota 2 vencida hace 62 días | administradora | 95 |
| RD-10 | 🔴 | Bajó su precio por iniciativa propia | revisión externa | 92 |
| RD-09 | 🟡 | Sin mentorías en 3 semanas | consultora | 75 |
| RD-01 | 🟡 | Cadencia rota · 26 días sin sesión | consultora | 70 |

Y las reglas de negocio implementadas en la base rechazaron correctamente lo que tienen que rechazar:

| Test | Resultado |
|---|---|
| Cerrar una alerta sin texto de cierre | Rechazado por `cierre_con_texto` |
| Cerrar una alerta roja con la consultora del caso | Rechazado por `tg_valida_cierre_rojo` |
| Editar una versión de estrategia | Sin efecto (append-only) |
| Cargar un sprint con 6 acciones | Rechazado por `acciones_max_5` |
| Emitir una alerta de criterio sin cita textual | Rechazado por `criterio_con_cita` |
| Segunda corrida de las reglas | 0 alertas duplicadas (idempotente) |

Las vistas también dieron lo esperado: el semáforo del cliente resolvió en `rojo` (el peor abierto manda) y `v_bloques_cargados` marcó `habilita_diagnostico = false` con solo 2 de 6 bloques, que es el comportamiento correcto: con el expediente incompleto el motor de diagnóstico no corre.

## Cómo reproducirlo

`prueba-reglas.sql`, en la carpeta `04-reglas-duras/`, es el archivo de test tal como se corrió. Se ejecuta después de `schema.sql` y `reglas-duras.sql`.

Para correrlo fuera de Supabase hacen falta dos stubs, porque `auth.uid()`, `pg_cron` y `pgvector` no existen en un Postgres pelado:

```sql
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create schema if not exists cron;
create or replace function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
create domain vector as text;   -- solo para el test; en Supabase se usa pgvector real
```

Y hay que comentar el índice `ivfflat` sobre `corpus_chunks`, que requiere pgvector de verdad.

En Supabase nada de esto hace falta: las tres extensiones están disponibles.

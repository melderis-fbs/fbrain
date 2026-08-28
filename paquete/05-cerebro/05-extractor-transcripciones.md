# Extractor de transcripciones

**Contrato de salida:** `06-contratos-json/extraccion-sesion.schema.json`
**Modelo:** chico. **Temperatura:** 0.1.
**Volumen:** ~340 sesiones por mes. Es la llamada de mayor volumen del sistema y la que hay que mantener barata.

Este componente es el que decide si la app se usa o se abandona. Su trabajo es hacer que **cerrar una sesión en la app cueste menos que escribir el reporte a mano.** Si no logra eso, el expediente queda vacío en tres semanas y todo lo demás no importa.

---

## Flujo

```
Transcripción (pegada por la consultora, o detectada en Drive)
        ↓
Extractor · una sola llamada
        ↓
Propuesta editable en pantalla:
  · reporte redactado
  · compromisos con fecha
  · números mencionados → prellenan métricas de la semana
  · cambios de estrategia detectados
  · frases candidatas a alerta
  · señales de la familia B
        ↓
La consultora corrige y firma  ← nada se guarda sin este paso
        ↓
Escribe en: sesiones, compromisos, metricas_semanales,
            estrategia_versiones (si hubo cambio), alertas
```

**Nada de lo que produce el extractor se guarda como dato confirmado sin que una persona lo firme.** El extractor propone; la consultora decide. Eso vale también para los números: un número mal leído en una transcripción envenena el tracker.

---

## Instrucción

> Vas a leer la transcripción de una sesión de consultoría entre una consultora de Founders y su cliente. Extraé información, no la interpretes ni la mejores.
>
> Devolvé:
>
> **1 · Reporte.** De 5 a 10 líneas: qué se trabajó, a qué se llegó, qué quedó abierto. Escrito para que alguien que no estuvo entienda el caso en treinta segundos. Tono de registro interno: directo, sin adornos, sin "se abordó la temática de".
>
> **2 · Compromisos.** Todo lo que el cliente o la consultora se comprometió a hacer, con responsable y fecha. Si se dijo "esta semana", convertilo a fecha concreta contando desde la fecha de la sesión. Si un compromiso no tiene fecha, marcalo `sin_fecha: true` — eso es en sí mismo una señal.
>
> **3 · Números mencionados.** Todo dato cuantitativo que se haya dicho: alcance, DMs, conversaciones, agendas, asistencias, llamadas, ofertas, ventas, facturación, ticket, inversión en ads, precios. Con la cita donde aparece. **No estimes, no completes, no redondees.** Si el cliente dijo "unos veinte", devolvé 20 con `aproximado: true`.
>
> **4 · Cambios de estrategia.** Si el cliente cambió o dijo que va a cambiar su cliente ideal, su oferta, su promesa, su precio, su mecanismo o su canal: qué cambió, de qué a qué, y **de quién fue la iniciativa** (consultora, cliente o conjunta). Este último campo importa: un cambio de precio a iniciativa del cliente sin llamada de venta de por medio es un criterio de alerta rojo.
>
> **5 · Frases candidatas a alerta.** Citas textuales que podrían corresponder a un criterio de riesgo. Literales, sin corregir la gramática. No clasifiques el estado: eso lo hace el motor de alertas.
>
> **6 · Señales de la sesión.** Booleanos, no prosa:
> - `menciono_numeros`: se dijo al menos un número del embudo en toda la sesión.
> - `se_fue_en_herramienta`: la mayor parte de la sesión fue pantalla, configuración o herramienta.
> - `cerro_con_compromiso`: la sesión cierra con un compromiso concreto y con fecha.
> - `abrio_repasando`: la sesión abre repasando el compromiso de la anterior.
> - `pct_habla_cliente`: porcentaje aproximado del tiempo que habló el cliente.
> - `tema_declarado` y `tema_tratado`: si difieren, es una alerta de proceso.
>
> **7 · Datos del expediente.** Si en la sesión apareció información que llena un bloque vacío del expediente —qué vende, precio, facturación, experiencia previa, resultados anteriores, activos que tiene, industrias que conoce—, extraela con su cita. Esto es lo que hace que el expediente se llene solo con el tiempo.
>
> **Reglas:**
> - No inventes nada. Si un campo no aparece en la transcripción, devolvelo null.
> - No mejores lo que dijo el cliente. Las citas son literales.
> - No opines sobre el desempeño de la consultora.
> - Si la transcripción está incompleta o cortada, decilo en `calidad_transcripcion` y extraé lo que haya.

---

## Restricciones

| Restricción | Validación |
|---|---|
| Citas literales | Toda `cita` debe existir como substring de la transcripción (chequeo por normalización de espacios) |
| Fechas resueltas | `compromisos[].fecha_vencimiento` en formato ISO, calculada desde `fecha_sesion` |
| Sin invención | Cualquier campo sin respaldo textual = null |
| Nada se persiste sin firma | La escritura a las tablas ocurre después de la confirmación de la consultora, no en el callback del modelo |

## Notas de implementación

- Chunkear transcripciones de más de 40 minutos y hacer un pase de consolidación. Los compromisos suelen estar al final; los números, repartidos.
- Cachear la constitución: no hace falta enviarla completa para esta tarea. El extractor puede usar un prompt de sistema propio, mucho más corto. Es la única excepción a la regla de enviar siempre la constitución completa, y se justifica por volumen.
- Guardar `procesada_at` en `sesiones` para no reprocesar.
- Si la transcripción viene de Drive y el cliente no se puede identificar por carpeta, encolar para asignación manual. No adivinar.

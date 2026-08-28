# Motor 3 · Test de coherencia

**Contrato de salida:** `06-contratos-json/coherencia.schema.json`
**Modelo:** grande. **Temperatura:** 0.3 en la llamada A, 0.2 en la llamada B.

Este es el motor que resuelve el problema más frecuente de la cartera: **el cliente comunica y le llega otro tipo de cliente**, porque su oferta o su mensaje no corresponden al comprador que declaró.

---

## La arquitectura es la funcionalidad

**Son dos llamadas al modelo, en orden, y la primera no puede ver lo que ve la segunda.** Esto no es una optimización: es la razón por la que este motor funciona mejor que preguntarle a un chat.

```
Llamada A · BRIEF INVERSO A CIEGAS
  Entrada:  SOLO el material (anuncio, reel, guion, landing, DMs).
            NADA del expediente. Ni el cliente ideal, ni el nicho, ni el
            precio, ni el nombre del cliente.
  Salida:   ¿Quién se reconocería en este texto?
                ↓
Llamada B · COMPARACIÓN
  Entrada:  el perfil inferido en A (como dato cerrado, no revisable)
            + el cliente ideal declarado en estrategia_versiones
            + los números de leads si existen
  Salida:   veredicto, palabras que desvían, qué tocar primero
```

Si el modelo ve el cliente ideal declarado antes de inferir, confirma la intención en lugar de leer el mensaje. Eso es exactamente el error que comete un humano releyendo su propio anuncio, y el motor existe para no cometerlo.

**Implementación:** dos requests separados. El perfil inferido se persiste en `coherencia_tests.perfil_inferido_ciego` antes de hacer la segunda llamada. No compartir historial de conversación entre A y B.

---

## Llamada A · prompt

Después de la constitución:

> Vas a leer un material de comunicación de un negocio. No sabés nada del negocio, ni de su dueño, ni de su cliente ideal, y no vas a poder preguntarlo. No especules sobre qué quiso decir el autor.
>
> Tu única tarea es responder una pregunta: **¿qué tipo de persona se sentiría profundamente identificada con este mensaje?**
>
> No "¿para quién parece escrito?". No "¿a quién le convendría?". Quién se reconoce, tal como está escrito, leído por alguien que ve esto por primera vez mientras scrollea.
>
> Describí a esa persona con la precisión de un comprador reconocible: industria o profesión, tipo de negocio si tiene uno, nivel de facturación aproximado, madurez, tamaño de equipo, y momento de vida del negocio.
>
> Y respondé además:
> - **Nivel de dolor:** ¿es dolor de principiante (no vende, no arrancó, no sabe por dónde empezar) o dolor de crecimiento (factura y no escala, depende de sí mismo, tiene equipo y desorden)?
> - **Movimiento:** ¿esta persona está escapando de un problema o capturando una oportunidad?
> - **Capacidad de pago inferida:** ¿cuánto podría pagar razonablemente alguien que se reconoce acá?
> - **Quién NO se reconoce:** a quién repele este mensaje. Si no repele a nadie, decilo: es un hallazgo, no un vacío.
> - **Frases decisivas:** las 3 a 6 expresiones textuales del material que más definen a quién atrae, y qué señal manda cada una.
>
> No evalúes si el material está bien o mal escrito. No lo reescribas. No des recomendaciones.

## Llamada B · prompt

> Tenés dos definiciones de cliente para el mismo negocio.
>
> **A · Inferida:** quién se reconoce en el material publicado, según una lectura a ciegas hecha sin conocer el negocio. Este resultado es un dato cerrado: no lo cuestiones ni lo ajustes.
>
> **B · Declarada:** el cliente ideal registrado en la estrategia vigente del cliente, con su fecha y su versión.
>
> Compará y devolvé:
>
> 1. **Veredicto:** `coherente` · `parcial` · `incoherente`. Y por qué, en dos líneas.
> 2. **La brecha, dimensión por dimensión:** madurez, facturación, tipo de dolor, capacidad de pago, industria. Marcá cuáles coinciden y cuáles no.
> 3. **Las palabras responsables.** Las expresiones textuales del material que corren el mensaje hacia el público equivocado, y qué diría en su lugar alguien que quisiera atraer al cliente declarado. Sé literal: citá el texto.
> 4. **Qué eslabón tocar primero.** Y acá la regla que no se negocia: si los leads son incorrectos, **no** concluyas que hay un problema de segmentación. El orden de revisión es mensaje → problema descrito → nivel de madurez → deseo activado → palabras → y solo al final targeting.
> 5. **Drift.** Compará contra las versiones anteriores de la estrategia. ¿El mensaje se fue moviendo? ¿Desde cuándo, y hacia dónde? Si la versión declarada cambió por iniciativa del cliente, decilo.
> 6. **Qué no haría todavía.**
> 7. **Muestra.** Si te pasaron leads, cuántos son y qué porcentaje encaja. Si son menos de diez, decí explícitamente que no alcanzan para concluir sobre calidad de leads, y qué habría que juntar.
> 8. **Principio Founders** aplicable.
>
> No reescribas el material. Primero decimos qué está mal y por qué. La reescritura es otra conversación, y con el diagnóstico hecho sale mejor.

---

## Restricciones duras

| Restricción | Validación |
|---|---|
| El perfil ciego se produce sin acceso al expediente | Dos requests separados; auditar que el request A no contenga el `cliente_id` ni campos de estrategia |
| No recomendar segmentación primero | Si `eslabon_a_tocar == "canal"` o el texto menciona segmentación como primer paso, se rechaza |
| No concluir sobre leads con muestra chica | Si `leads_adjuntos.length < 10`, el campo `conclusion_leads` debe declarar muestra insuficiente |
| No reescribir el material | El schema no tiene campo de reescritura |
| Citas literales | `palabras_responsables[].cita` debe existir como substring del material |

## Casos de borde

| Situación | Qué hace el motor |
|---|---|
| El material no tiene cliente reconocible (habla a todos) | Veredicto `incoherente`, hallazgo: "no repele a nadie", y ese es el problema |
| Coincide el perfil pero los leads siguen siendo malos | El problema no es el mensaje: derivar a setting, calificación o canal, y decirlo |
| No hay estrategia declarada cargada | El motor no puede comparar. Devuelve solo el perfil inferido y pide cerrar el bloque de estrategia primero |
| El cliente cambió su oferta hace menos de 3 semanas | Advertir que todavía no hay muestra suficiente del mensaje nuevo |
| Material en imagen o video sin texto | No corre. Pedir el guion o la transcripción del creativo |

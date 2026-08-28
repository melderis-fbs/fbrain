# Motor 4 · Score de salud comercial y alertas por criterio

Son dos funciones distintas que comparten el mismo insumo. Van en el mismo archivo porque comparten los criterios, pero se ejecutan en momentos distintos: el score cuando alguien lo pide o una vez por mes; las alertas después de cada sesión.

**Contratos:** `06-contratos-json/score.schema.json` y `06-contratos-json/alerta.schema.json`
**Especificación completa de criterios:** `04-reglas-duras/especificacion-reglas.md`

---

# 4A · Score de salud comercial

**Modelo:** grande. **Cuándo:** a pedido, y automáticamente el día 30, 60 y 90.

## Instrucción

> Calificá el negocio del 1 al 10 en estas doce dimensiones: cliente ideal, problema, deseo, oferta, promesa, mensaje, autoridad, adquisición, volumen, ventas, entrega, ejecución.
>
> **Cada puntaje lleva su evidencia al lado, con origen y fecha.** Un score sin evidencia es un número que nadie va a creer la segunda vez, y con doce números sin respaldo el equipo deja de usar la herramienta.
>
> Si no tenés información suficiente para calificar una dimensión, no inventes un 5: devolvé `null` y explicá qué dato falta. Un `null` honesto es más útil que un promedio inventado.
>
> Después indicá **los 3 scores que más están limitando las ventas** — no los tres más bajos: los tres cuya mejora movería más la aguja, que no es lo mismo. Un 4 en entrega no importa si todavía no hay ventas; un 6 en mensaje puede ser lo único que importa.
>
> Y respetá la jerarquía al recomendar: cliente → problema → oferta → promesa → mensaje → validación → adquisición → ventas → entrega → escala. No propongas trabajar el eslabón 8 si el 3 está en 4.
>
> Para la promesa, además, calificá por separado especificidad, relevancia, deseo, credibilidad, diferenciación y claridad. Si alguno está por debajo de 7, explicá por qué.

## Restricciones

- `valor` entre 1 y 10, o `null` con `dato_faltante` explicado.
- Exactamente 3 dimensiones marcadas `es_limitante`.
- Cada dimensión con `evidencia` no vacía cuando `valor` no es null.
- Se persiste en `scores` + `score_items` para poder graficar evolución.

---

# 4B · Alertas por criterio

**Modelo:** chico para clasificar, grande solo si el caso ya tiene alerta abierta o si el clasificador marca rojo o negro. Esto baja el costo por sesión de forma significativa.
**Cuándo:** al cerrar cada sesión, sobre la transcripción.

## Instrucción

> Vas a leer la transcripción de una sesión de consultoría y detectar si hay señales de riesgo, según criterios fijos. No estás evaluando la calidad de la sesión ni juzgando a nadie: estás buscando frases y ausencias específicas.
>
> Los criterios están numerados en la especificación adjunta (familias A, B y C). Para cada señal que encuentres devolvé el código, la **cita textual exacta**, el estado y el pedido.
>
> **Reglas que no se negocian:**
>
> 1. **Sin cita textual no hay alerta.** Si no podés citar la frase, no la reportes. Sin cita es una interpretación y se discute; con cita es un hecho y se trabaja.
> 2. **La cita es literal.** No la parafrasees, no la limpies, no le arregles la gramática. Copiala como se dijo.
> 3. **Si el criterio es una ausencia** (familia B), el "textual" es la constatación: qué se buscó y no apareció.
> 4. **No inventes códigos.** Si algo te preocupa y no encaja en ningún criterio, va en `observaciones`, sin estado de semáforo. Esa lista se revisa cada tanto para decidir si hace falta un criterio nuevo.
>
> **Y lo que explícitamente NO es alerta:**
>
> - Una queja aislada sobre algo que se resolvió en esa misma sesión.
> - Dudas técnicas, por más frustradas que suenen ("no entiendo el administrador de Meta"). Eso es un agujero de contenido y va a otro tablero.
> - Mal día, cansancio o un tema personal que no toca el programa.
> - **Emoción fuerte con avance.** El que llora y a la vez trajo sus 30 conversaciones hechas no está en riesgo. Este es el falso positivo más común y el que más rápido hace que el equipo deje de leer las alertas.
> - Cliente nuevo en sus primeras dos semanas: todavía no hay línea de base.
>
> Además, extraé las **señales de la familia B** como campos, no como texto: si se dijo algún número en toda la sesión, si la sesión se fue en pantalla o configuración, si cerró con un compromiso con fecha, si abrió repasando el compromiso anterior, y el porcentaje aproximado de tiempo que habló el cliente.

## Formato de salida de cada alerta

Tres líneas, con esta forma exacta:

```
{Cliente} · {ESTADO} ({n}ª vez) · sesión del {DD/MM} con {consultora}
{Qué pasa, una o dos oraciones}. Textual: "{cita}". {Con qué se relaciona:
la sesión anterior, un cambio de coach, un patrón}.
Pedido: {qué se espera, de quién, qué pasa si vuelve a aparecer}.
```

## Enrutamiento

| Estado | Destinatario | Plazo |
|---|---|---|
| Amarillo | Consultora del caso | Próxima sesión |
| Rojo | **Revisión con alguien que no sea su consultora** | 48 h |
| Negro | Administradora | Mismo día |

El escalado de dos amarillas iguales en tres sesiones a rojo **no lo decide el modelo**: lo hace la regla dura RD-08 en SQL, para que no dependa de la interpretación de nadie.

## Contexto que necesita el modelo

Junto con la transcripción hay que pasarle:

- Las alertas abiertas y cerradas de los últimos 60 días de ese cliente, con código y fecha. Sin esto no puede decir "2ª vez" ni relacionar con la sesión anterior, y esa relación es la mitad del valor de la alerta.
- Si hubo cambio de consultora en los últimos 30 días.
- Si tiene garantía firmada.
- Si es cliente nuevo (menos de 14 días).
- El compromiso vigente de la sesión anterior.

## Costo y volumen

Con ~340 sesiones por mes, esta es la llamada de mayor volumen del sistema. Usar modelo chico para la clasificación y escalar a modelo grande solo cuando: el clasificador marcó rojo o negro, el cliente ya tiene una alerta abierta, o el cliente está en día 60+ sin venta. Eso deja el gasto del volumen en el modelo barato.

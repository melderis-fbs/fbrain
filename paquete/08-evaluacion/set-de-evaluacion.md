# El set de evaluación

**Este es el entregable más importante del paquete y el único que no puede hacer el desarrollador.**

Es lo que separa una app que suena bien de una que sirve. Sin esto, cada cambio en un prompt es una apuesta a ciegas: no hay forma de saber si una mejora aparente empeoró el criterio.

---

## 1 · Qué es

Quince casos que Vicky ya resolvió, convertidos en pruebas:

- **Entrada:** el expediente del cliente tal como estaba cuando ella lo analizó.
- **Respuesta correcta:** el cuello de botella que ella identificó, con su tipo de bloqueo.

Cada vez que se cambia la constitución, un prompt de motor, el corpus o el modelo, se corren los quince y se mide en cuántos la app llega a la misma conclusión.

**Ese número es la única definición honesta de "piensa como Vicky".**

## 2 · La meta

| Coincidencia | Qué significa |
|---|---|
| **12 de 15 o más** | Se puede abrir la app a las consultoras |
| 9 a 11 | Sigue en calibración. Revisar qué tipo de caso falla |
| Menos de 9 | El producto va a enseñar criterio equivocado, que es peor que no enseñar ninguno |

## 3 · Cómo armarlo

Los casos ya están escritos. El trabajo es partirlos en dos: lo que se sabía **antes** y lo que se concluyó **después**.

1. Elegir 15 casos de los documentos existentes. Buscar **variedad de modos de falla**, no de nombres: el valor está en cubrir los ocho tipos de bloqueo, no en tener quince clientes distintos.
2. Para cada uno, escribir el expediente como estaba en ese momento. Sin la conclusión. Sin las pistas que se descubrieron después. Este es el paso que lleva tiempo y el que hay que hacer con cuidado: **si el expediente contiene la respuesta, el caso no prueba nada.**
3. Escribir la conclusión aparte: cuello de botella, tipo de bloqueo, eslabón, y una nota de por qué.
4. Cargarlo en `eval_casos`.

Se puede empezar con 8 y llegar a 15. Ocho casos bien construidos valen más que quince apurados.

## 4 · Cobertura mínima recomendada

Al menos un caso de cada tipo de bloqueo, y en particular estos, que son los que más se confunden:

| Debe cubrir | Por qué |
|---|---|
| Un caso `emocional` con estrategia sana | Es el que la app va a querer resolver rediseñando la oferta |
| Un caso `ejecucion` (sabe qué hacer y no lo hace) | Se confunde con `estrategico` todo el tiempo |
| Un caso `comercial` con embudo sano hasta el cierre | El rojo que más veces se confunde con problema de contenido |
| Un caso `mensaje` con leads malos | Donde la app va a querer ir directo a segmentación |
| Un caso con muy pocos datos | Donde la respuesta correcta es "todavía no hay muestra", no un diagnóstico |
| Un caso `estrategico` puro | La línea de base |
| Un caso `adquisicion` (oferta validada, sin volumen) | Para que no confunda falta de distribución con falta de demanda |
| Un caso donde la lectura de la consultora estaba equivocada | Para verificar que la app contradice cuando corresponde |

## 5 · Cómo se corre

```
para cada caso en eval_casos:
    resultado = motor_diagnostico(caso.expediente_snapshot)
    coincide  = comparar(resultado.cuello_botella,
                         caso.cuello_botella_esperado)
    guardar en eval_corridas
```

La comparación no puede ser textual: dos formulaciones distintas del mismo cuello de botella son un acierto. Dos opciones, y conviene tener las dos:

- **Automática:** un modelo juez recibe las dos conclusiones y responde si son el mismo diagnóstico, sí o no, con una línea de justificación. Rápido, sirve para iterar durante el desarrollo.
- **Humana:** Vicky revisa las quince y marca. Más lento, pero es la que vale para la decisión de abrir la app.

`tipo_bloqueo` sí se compara exacto: es un enum, y equivocarlo es un error real aunque la prosa suene parecida.

## 6 · Qué hacer con los fallos

Un fallo no se arregla parcheando el prompt hasta que ese caso pase. Eso sobreajusta y rompe otros.

El orden correcto:

1. ¿El expediente tenía la información necesaria? Si no, el fallo es del caso, no del modelo. Corregir el caso.
2. ¿Falta un umbral o un precedente en el corpus? Agregarlo al corpus, no al prompt.
3. ¿La constitución no cubre este tipo de razonamiento? Ahí sí, modificar la constitución, y volver a correr **los quince**.
4. Registrar qué cambió y cómo se movió el número. Ese registro es la memoria del proyecto.

## 7 · Después del lanzamiento

El set no se congela: crece. Todo caso donde la app y la consultora discreparon y la consultora tenía razón es un caso nuevo para el set. Es el mecanismo por el que la app mejora con el uso en lugar de quedarse quieta.

Y el número a seguir mes a mes, que además es una métrica de management: **aciertos de cuello de botella por consultora**. Mide lo único que escala de verdad, que es criterio en el equipo.

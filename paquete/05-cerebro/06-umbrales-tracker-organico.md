# Umbrales del embudo orgánico y cuenta inversa

Este archivo entra al contexto de los motores **como tabla, no como prosa**. Es la diferencia entre que la app diga "el alcance parece bajo" y que diga "el alcance está en 1.200 por semana, para su meta y su ticket necesita 3.750, y con el embudo en rojo necesitaría 15.400 para facturar exactamente lo mismo".

---

## 1 · La cuenta inversa desde la meta

Es lo primero que hay que hacer en la sesión 1 con cada cliente, y lo que más se saltea. Se calcula hacia atrás desde la meta de facturación.

```
ventas_necesarias      = meta_mensual / ticket
asistencias            = ventas / tasa_cierre
agendas                = asistencias / tasa_asistencia
conversaciones_avanzan = agendas / tasa_agendamiento
dms                    = conversaciones_avanzan / tasa_avance
alcance_semanal        = (dms / 4) / tasa_dm_sobre_alcance
```

### Ejemplo trabajado · ticket USD 1.800, meta USD 10.000 por mes

| Eslabón | Con el embudo en **objetivo** | Con el embudo en **rojo** |
|---|---|---|
| Ventas necesarias | 6 / mes | 6 / mes |
| Asistencias | 19 | 28 |
| Agendas | 22 | 40 |
| Conversaciones que avanzan | 48 | 132 |
| DMs | 81 / mes · **19 por semana** | 331 / mes · **77 por semana** |
| Alcance necesario (a 0,5% de tasa de DM) | **~3.750 por semana** | **~15.400 por semana** |

**Un cliente con el embudo en objetivo necesita una cuarta parte del alcance que necesita el mismo cliente con el embudo en rojo, para facturar exactamente lo mismo.**

Ese es el argumento que hace que un cliente deje de pedir más alcance y se ocupe del seguimiento. Vale más que cualquier umbral de esta lista, y conviene tenerlo hecho, con sus números, antes de la primera sesión.

De acá sale el KPI operativo del cliente: en el ejemplo, **19 DMs y 5-6 agendas por semana**. El resto de la planilla explica por qué se cumple o no.

---

## 2 · Diagnóstico por eslabón · qué significa cada rojo

El valor de esta tabla no son los umbrales: es que **cada rojo tiene una causa distinta y una acción distinta**, y confundirlos es lo que hace perder meses.

| # | Eslabón en rojo | Qué significa realmente | Qué NO es |
|---|---|---|---|
| 1 | **Alcance no seguidores bajo** | El contenido circula solo entre los que ya te siguen. Es problema de formato y de tema, no de gancho. Típicamente contenido de comunidad ("gracias por los 1.000"), muy interno de nicho, o sin ángulo. | No es falta de frecuencia |
| 2 | **Avance de conversación bajo** | El CTA trae curiosos, no compradores — o el setter pide la llamada en el primer mensaje. Es el eslabón que más rápido se arregla y el que más gente ignora. | **Si este número está bien y la venta no aparece, el problema NO está en el CTA y no hay que tocar el contenido** |
| 3 | **Agendamiento bajo** | No hay diagnóstico antes de ofrecer la llamada, o la llamada se presenta como una venta en vez de como una conversación con un resultado. | — |
| 4-5 | **Asistencia baja / cancelación alta** | Casi siempre: no hay confirmación previa, o se agenda a más de 72 horas. En orgánico esto no debería fallar nunca. | Si falla, es proceso, no mercado |
| 6 | **Cierre bajo** | Oferta, precio, estructura de llamada. | **No es contenido.** Este es el rojo que más veces se confunde con un problema de contenido y hace perder meses |
| 7 | **Ticket abajo del precio de lista** | Descuento sistemático o cuotas mal presentadas. Un cierre del 40% con ticket al 70% del precio es peor negocio que un cierre del 25% a precio completo. | — |
| 8 | **Muchas ventas sin atribuir** | No se está preguntando "¿cómo llegaste?". | No es problema del cliente. Sin esto, todo el análisis por pilar y formato es decorativo |

---

## 3 · Reglas de lectura para los motores

1. **Ningún eslabón se juzga sin muestra.** Antes de declarar un eslabón en rojo, verificar el denominador. Un 0% de cierre sobre 2 llamadas no es un problema de cierre: es falta de datos.
2. **Un solo eslabón manda.** Si hay tres en rojo, el que importa es el primero de la cadena, porque los de abajo pueden ser consecuencia.
3. **Actividad no es resultado.** Un cliente puede publicar todos los días, tener alcance creciente y cero conversaciones. Eso no es "va bien pero le falta tiempo": es un problema de mensaje o de CTA.
4. **La cuenta inversa se recalcula cuando cambia el ticket.** Si el cliente sube o baja precio, todos los números operativos cambian, y ese recálculo es una de las cosas más valiosas que la app puede hacer sola.
5. **Sin origen de oportunidad no hay análisis de canal.** Si más del 30% de las ventas está sin atribuir, la app lo declara y no concluye sobre qué canal funciona.

---

## 4 · Números de la operación de Founders

Contexto para los motores que analizan la cartera, no un cliente.

| Dato | Valor |
|---|---|
| Clientes activos | ~85 |
| Consultoras | 6 |
| Techo de clientes por consultora | 12 |
| Altas nuevas por consultora | 1 por semana, máximo |
| Altas por mes | ~10 |
| Sesiones por mes | ~340 |
| Cadencia de sesión 1:1 acordada | Semanal |
| Mentorías grupales exigidas con garantía | 2 por semana |
| Techo de alertas por semana | 10 |

Cuando tres de seis consultoras están arriba del techo y entran diez altas nuevas por mes, el problema de asignación no es del caso individual: es de capacidad. La app tiene que poder decir eso.

# Especificación de alertas

Dos familias, y mezclarlas es el error más caro que se puede cometer en este producto.

- **Reglas duras (RD).** Restas de fechas y sumas de filas. Sin modelo de lenguaje. Confiables, baratas, inmediatas. Están en `reglas-duras.sql`.
- **Criterios de transcripción (CT).** Requieren interpretar lenguaje. Van al modelo, siempre con cita textual obligatoria. El prompt está en `05-cerebro/04-motor-score-alertas.md`.

---

## 1 · Estados, quién responde y en cuánto tiempo

| Estado | Qué es | Quién responde | Plazo | Qué genera |
|---|---|---|---|---|
| 🟢 Verde | En proceso, con números y compromisos | Consultora | — | **Solo el color en el tablero. Cero texto.** |
| 🟡 Amarillo | Un criterio de las familias A o B | Consultora, y lo escribe en el reporte | Próxima sesión | Semáforo + 3 líneas |
| 🔴 Rojo | Un criterio rojo, o 2 amarillas iguales en 3 sesiones | **Revisión de caso con alguien que no sea su consultora** | 48 h | Semáforo + 3 líneas |
| ⚫ Negro | Fuga verbalizada, reembolso, garantía | Administradora | Mismo día | Semáforo + 3 líneas |
| ⚪ Perdido | Se fue o pidió reembolso | Post mortem de una carilla | 7 días | Registro obligatorio |

El estado **Perdido** no es decorativo: si un cliente llega a perdido y en su historial había dos amarillas sin cerrar, el problema no fue el cliente. La pantalla de post mortem existe para auditar eso.

## 2 · Formato obligatorio de toda alerta amarilla, roja o negra

Tres líneas, con esta forma exacta. La app no emite nada que no la cumpla.

```
{Cliente} · {ESTADO} ({n}ª vez) · sesión del {DD/MM} con {consultora}
{Qué está pasando, en una o dos oraciones}. Textual: "{cita}". {Con qué se
relaciona: la sesión anterior, un cambio de coach, un patrón}.
Pedido: {qué se espera, de quién, y qué pasa si vuelve a aparecer}.
```

**Sin cita textual la alerta es una interpretación y se discute. Con cita textual es un hecho y se trabaja.** Los dos casos que costaron plata este año tenían la frase escrita y a nadie le disparó nada.

---

## 3 · Reglas duras · tabla de referencia

| Código | Disparo | Estado | Va a | Equivalente en planilla |
|---|---|---|---|---|
| **RD-01** | Más de 21 días sin sesión realizada (más de 30 → rojo) | 🟡 / 🔴 | Consultora / revisión | `HOY() - MAX(fecha sesión) > 21` |
| **RD-02** | Dos cancelaciones, reprogramaciones o ausencias seguidas | 🟡 | Consultora | Contar los dos últimos estados de agenda |
| **RD-03** | Cuota vencida hace más de 30 días | 🔴 | Administradora | `HOY() - vencimiento > 30` y sin fecha de pago |
| **RD-04** | Cambio de consultora en los últimos 30 días | 🟡 | Administradora | `HOY() - fecha traspaso < 30` |
| **RD-05** | Sesión realizada sin transcripción, grabación ni reporte. **Si el cliente ya tiene amarillo abierto → rojo automático** | 🟡 / 🔴 | Consultora | Fila de sesión con las tres columnas vacías |
| **RD-06** | Reporte cargado con más de 48 h de atraso | 🟡 | Consultora | `HOY() - fecha sesión > 2` y reporte vacío |
| **RD-07** | Día 90 desde el alta sin una venta registrada | 🔴 | Revisión externa | `HOY() - alta ≥ 90` y `SUMA(ventas) = 0` |
| **RD-08** | Dos amarillas del mismo código en tres sesiones → **rojo, sin que nadie opine** | 🔴 | Revisión externa | Contar alertas por código en la ventana |
| **RD-09** | Cero asistencia a mentorías en 3 semanas (prioridad alta si hay garantía) | 🟡 | Consultora | Sin filas de asistencia en 21 días |
| **RD-10** | El cliente bajó su precio más de 10% por iniciativa propia, sin llamada de venta | 🔴 | Revisión externa | Comparar precio contra la versión anterior de estrategia |

**Las cuatro primeras y RD-07 son las que se pueden tener corriendo esta semana en una planilla, sin app.** RD-05, RD-06 y RD-08 requieren registro de sesiones; RD-10 requiere el versionado de estrategia.

---

## 4 · Criterios de transcripción · los que necesitan modelo

### Familia A · lo que el cliente dice

**NEGRO — fuga verbalizada. Llega a la administradora el mismo día.**

| Código | Criterio | Ejemplo real |
|---|---|---|
| CT-N1 | Nombra irse, cortar, pausar, cambiar de consultora o pedir reembolso | Parigi, 11/08: *"si no, me voy a tener que ir con otra consultora y voy a tener que pedir un reembolso"* |
| CT-N2 | Dice que esto no es lo que compró, o compara contra lo prometido en la venta | — |
| CT-N3 | Cuestiona al equipo entero, no a una persona | Parigi, 27/07: *"me parece que **nadie** la tiene clara con esto"* |
| CT-N4 | Menciona abogado, contracargo o la garantía | — |

**ROJO — riesgo activo. Revisión de caso en 48 h con alguien que no sea su consultora.**

| Código | Criterio | Ejemplo real |
|---|---|---|
| CT-R1 | Desesperanza sobre el proceso, no sobre el día | Parigi, junio: *"no veo esa luz al final del camino"*; julio: *"como perro que se muerde la cola"* |
| CT-R2 | Dice que no sabe qué está haciendo mal, o que no entiende el orden de lo que se le pide | — |
| CT-R3 | Le baja el precio a su servicio o cambia su oferta por iniciativa propia | Parigi, 02/07: de 20.000 a 15.000 |
| CT-R4 | Pide cambio de consultora, o se queja del equipo con nombre y apellido | — |
| CT-R5 | Dice que no puede sostener el pago | — |
| CT-R6 | El mismo bloqueo por tercera sesión consecutiva | El criterio de Eleonora |

**AMARILLO — atención. Lo resuelve la consultora y queda registrado.**

| Código | Criterio |
|---|---|
| CT-A1 | No puede explicar su oferta en voz alta, o dice que no la siente propia |
| CT-A2 | "El sistema me abruma", "no sé por dónde empezar", "son muchas cosas juntas" |
| CT-A3 | Segunda sesión seguida diciendo que no tuvo tiempo o no llegó a lo comprometido |
| CT-A4 | Compara con otro cliente del programa o pregunta cuánto tardan los demás |
| CT-A5 | Queja de contradicción entre lo que dijo la consultora y lo que dijo un mentor |
| CT-A6 | Menciona por primera vez una consultoría, curso o coach externo |

### Familia B · las ausencias también son señal

Son baratas de detectar y hoy no las mira nadie. Todas amarillas.

| Código | Criterio |
|---|---|
| CT-B1 | No se dijo un solo número en toda la sesión (conversaciones, agendas, ventas, inversión) |
| CT-B2 | La sesión se fue en pantalla, configuración o herramienta. **Dos seguidas → rojo** |
| CT-B3 | La sesión cierra sin un compromiso concreto con fecha |
| CT-B4 | La sesión abre sin repasar el compromiso de la anterior *(alerta de proceso: le llega a la consultora)* |
| CT-B5 | El cliente habló menos del 30% del tiempo |

### Familia C · alertas sobre nosotros, no sobre el cliente

Mismo tablero, distinto color, porque estos son los que dejan el caso ciego.

| Código | Criterio |
|---|---|
| CT-C1 | Sesión sin transcripción, grabación ni reporte *(implementado como RD-05)* |
| CT-C2 | Reporte cargado con más de 48 h de atraso *(implementado como RD-06)* |
| CT-C3 | El registro no coincide con la transcripción: tema declarado ≠ tema tratado, fases en "pendiente" a los tres meses, dos precios distintos para el mismo servicio |

---

## 5 · Qué NO dispara alerta

Con ~85 clientes activos, si el sistema tira más de 10 alertas por semana se deja de leer en un mes. Estos casos se ignoran explícitamente:

- Una queja aislada, en una sesión, sobre algo que se resolvió en esa misma sesión.
- Dudas técnicas, por más frustradas que suenen ("no entiendo el administrador de Meta"). Eso es un agujero de contenido y va a otro tablero.
- Mal día, cansancio o un tema personal que no toca el programa.
- Emoción fuerte con avance: el que llora y a la vez trajo sus 30 conversaciones hechas no está en riesgo.
- **Cliente nuevo en sus primeras dos semanas.** Todavía no hay línea de base. (Excepción: las alertas de pago corren siempre.)

## 6 · Techo semanal

Máximo **10 alertas por semana**. Las que pasan el techo se marcan `diferida = true` y van al informe mensual: no se borran, pero no compiten por la atención del equipo. **Las negras nunca se difieren.**

Prioridad, de mayor a menor: día 90 sin venta (100) → alerta negra → cuota vencida (95) → precio bajado (92) → escalado automático (98) → cadencia rota grave (90) → sesión sin registro (80) → garantía en riesgo (75) → resto.

## 7 · Reglas de cierre

1. **Ninguna alerta se cierra sola por el paso del tiempo.** Se cierra porque alguien escribió qué se hizo. Implementado como constraint en la base (`cierre_con_texto`, mínimo 20 caracteres).
2. **Una alerta roja o negra solo la puede cerrar quien hizo la revisión, no la consultora del caso.** Implementado como trigger (`tg_valida_cierre_rojo`).
3. Si una alerta roja sigue abierta tres semanas, el sistema de alertas no está funcionando. Eso debería ser visible en la pantalla de cartera como su propio número.

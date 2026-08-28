# Pantallas y flujos

No hace falta diseño custom. Hace falta densidad de información y que el semáforo se lea de un vistazo. Tailwind + shadcn/ui alcanza.

**La entrada principal no es una caja de texto libre.** Es la lista de clientes. Un chat abierto invita a pedirle cosas al modelo; una ficha invita a mirar el caso. Esa diferencia define el producto.

---

## 1 · Mis clientes · pantalla de inicio de la consultora

Tabla densa, una fila por cliente, ordenada por urgencia y no alfabéticamente.

| Columna | Detalle |
|---|---|
| Semáforo | 🟢 🟡 🔴 ⚫ · el peor abierto manda. Color en la celda, no un ícono chico |
| Cliente | Nombre + programa + día del programa (`día 47`) |
| Última sesión | Días transcurridos. **Rojo si > 21** |
| Compromiso vigente | Descripción corta + fecha. Rojo si venció |
| Alertas | Cantidad de abiertas, con el estado peor |
| Ventas | Acumuladas. **Destacar si es 0 y el cliente pasó el día 60** |
| Esta semana | Qué le toca: sprint activo o "sin sprint" |

Filtros: solo con alertas abiertas · sin sesión hace más de 14 días · sin ventas · día 60+.

Vacío intencional: si no hay nada que atender, la pantalla lo dice. No inventar tarjetas de resumen para llenar espacio.

## 2 · Expediente

Los seis bloques, cada uno como sección colapsable, **con los vacíos marcados de forma visible** (no un campo en blanco: un aviso de "sin datos" con el botón de completar al lado). Arriba, la barra de completitud: `4 de 6 bloques · habilita diagnóstico`.

Debajo, la línea de tiempo unificada, en orden cronológico inverso, con todo mezclado: sesiones, cambios de estrategia con su versión, compromisos y su cumplimiento, alertas abiertas y cerradas, pagos, traspasos.

**Esa línea de tiempo es la pantalla más valiosa del producto.** Es lo que hoy no existe en ningún lado y lo que hace visible que cinco escaladas emocionales pasaron en diez semanas.

## 3 · Preparar sesión

Se genera antes de cada reunión, con un botón. Devuelve una página imprimible:

- **Objetivo de la sesión**, en una sola frase.
- **Diagnóstico actual**: qué creemos que está pasando.
- **Las 5 preguntas** que mayor información producirían.
- **La decisión que tiene que salir de la sesión.** No se permite una reunión que termine solo en conversación.
- **Próximo sprint**: qué debería ejecutar el cliente los próximos 7 días.
- Compromiso de la sesión anterior y si se cumplió, arriba de todo.

## 4 · Cerrar sesión · el flujo que decide si la app se usa

```
[Pegar transcripción]  o  [Detectada en Drive · revisar]
        ↓  (una llamada al extractor, ~15 segundos)
Propuesta editable, todo en una pantalla:
  Reporte              [texto editable, ya redactado]
  Compromisos          [lista con fecha, editable, se puede agregar]
  Números de la semana [prellenados, editables]
  Cambios de estrategia[detectados, con "de → a" y quién lo pidió]
  Frases marcadas      [las candidatas a alerta, con checkbox]
  Señales              [los booleanos, editables]
        ↓
[Firmar y guardar]  ← un solo botón, y recién acá se persiste
```

**Criterio de aceptación de esta pantalla:** cerrar una sesión acá tarda menos que escribir el reporte a mano. Si tarda más, el hito no está terminado, porque el expediente va a quedar vacío y todo lo demás deja de funcionar.

## 5 · Diagnóstico

Antes de mostrar nada, un campo obligatorio de dos líneas: **"¿cuál creés que es el cuello de botella?"**. No se puede saltear, no hay botón de "ver directamente".

Después, la respuesta con el protocolo de 10 pasos, y arriba de todo una franja: **coincidieron** o **se separaron**, y en qué. Esa franja es la razón de ser de este flujo: convierte cada consulta en una repetición de entrenamiento en lugar de una consulta a un oráculo.

Cada afirmación de la sección de evidencia es clickeable y lleva a su origen: la sesión, la fila de la planilla, el pago.

## 6 · Test de coherencia

Un campo grande para pegar el material, un selector de tipo, y opcionalmente los leads que trajo.

La salida se muestra **en dos columnas enfrentadas**: a la izquierda el perfil inferido a ciegas, a la derecha el declarado. En el medio, el veredicto. Debajo, las palabras responsables con la cita resaltada dentro del material original.

Mostrar de forma explícita que el perfil de la izquierda se produjo sin ver el de la derecha. Es lo que hace que la consultora le crea.

## 7 · Bandeja de alertas

Lista por estado, con las negras arriba. Cada alerta muestra sus tres líneas completas, no un resumen: la cita textual es el contenido, no un detalle expandible.

Cerrar una alerta abre un campo de texto obligatorio (mínimo 20 caracteres) que pregunta **qué se hizo**, no "¿resuelto?". Las rojas y negras no muestran el botón de cerrar a la consultora del caso: muestran quién puede cerrarla.

Sección aparte, colapsada: **diferidas** — las que pasaron el techo de 10 de la semana. No se esconden, pero no compiten por la atención.

## 8 · Cartera · pantalla de la administradora

Cuatro bloques, en este orden:

1. **Semáforo de los 85**, agrupado por estado, con las negras y rojas nombradas.
2. **Carga por consultora** contra el techo de 12, con el exceso en rojo. Y altas de la semana por consultora.
3. **Los números que definen el sistema:** clientes en día 60 sin venta · en día 90 sin venta · alertas rojas abiertas hace más de una semana · sesiones sin registro en los últimos 30 días · reportes atrasados.
4. **Expedientes ciegos:** clientes con menos de 4 bloques o sin transcripciones. Son los casos donde la app no puede ayudar y hay que arreglarlo a mano.

## 9 · Post mortem

Se abre automáticamente cuando un cliente pasa a `perdido`. Formulario de una carilla, obligatorio en 7 días:

- Qué señal hubo, y cuándo. **Precargado con el historial de alertas del cliente**, incluidas las que quedaron sin cerrar.
- Por qué no se actuó.
- Qué regla o criterio habría que agregar.

Y un número arriba: **cuántas alertas quedaron abiertas sin cerrar en su historial.** Si un cliente llega a perdido con dos amarillas sin cerrar, el problema no fue el cliente. Esta pantalla existe para auditar el sistema de alertas, no para archivar.

---

## Notas transversales

- **Todo dato muestra su origen y su fecha al hacer hover.** Sin excepción. Es lo que hace que el equipo confíe en la app.
- **Nada se guarda sin firma humana** en los flujos donde el modelo propone.
- Sin notificaciones dentro de la app: las alertas van a Slack y a mail. Nadie entra a una app a buscar alertas.
- Español rioplatense en toda la interfaz, incluidos los mensajes de error. Un error dice qué pasó y cómo arreglarlo.
- Vista imprimible para "preparar sesión" y para el brief de onboarding: se usan fuera de la pantalla.

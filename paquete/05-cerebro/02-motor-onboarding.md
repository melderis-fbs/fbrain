# Motor 2 · Plan de onboarding 60 días

**Contrato de salida:** `06-contratos-json/onboarding.schema.json`
**Modelo:** grande. **Temperatura:** 0.3.
**Cuándo corre:** el día del alta, con la transcripción de la llamada de venta y el formulario de onboarding. Hoy este trabajo lo hace la administradora a mano, y con ~10 altas por mes es el cuello de botella de la operación.

---

## Entrada

1. Transcripción completa de la llamada de venta.
2. Formulario de onboarding.
3. Programa contratado, plan de pago, si tiene garantía, fuente.
4. **Horas reales por semana**, si ya se preguntaron. Si no, el plan las marca como el primer dato a conseguir en la sesión 1 y no asume nada.
5. Cupos y perfiles de consultoras, si se va a sugerir asignación (fuera de alcance del V1, pero el dato ayuda al brief).

---

## Instrucción

> Vas a preparar el arranque de un cliente nuevo. El objetivo no es un cronograma de doce semanas: es que este negocio tenga la mejor posibilidad de generar una venta antes del día 60.
>
> Antes de escribir, resolvé esto internamente:
>
> - ¿Qué está comprando realmente? Separá lo que dijo que quiere de lo que su situación indica que necesita.
> - ¿Qué activos ya tiene y no está usando? Contenido grabado, comunidad, testimonios, contactos, autoridad de su profesión anterior. El arranque más rápido casi siempre sale de acá.
> - ¿Cuántas horas reales tiene? El plan se arma contra ese número, **nunca contra las horas del pitch**.
> - ¿Qué es lo único que no puede quedar abierto en las primeras dos semanas?
>
> Y devolvé, en este orden:
>
> **1 · QUÉ NECESITA, EN ORDEN.** Máximo 5 necesidades, cada una con la evidencia textual de la llamada o del onboarding que la justifica, con cita y fecha. Ordenadas por lo que más mueve una venta, no por lo que es más fácil.
>
> **2 · LA CUENTA INVERSA DESDE LA META.** Con su ticket y su meta declarada: cuántas ventas por mes, cuántas asistencias, cuántas agendas, cuántas conversaciones que avanzan, cuántos DMs por semana y cuánto alcance semanal. Dos columnas: con el embudo en objetivo y con el embudo en rojo. La fórmula y los umbrales están en `06-umbrales-tracker-organico.md`.
>
> Esto es lo primero que hay que hacer en la sesión 1 y lo que más se saltea. Es el argumento que hace que un cliente deje de pedir más alcance y se ocupe del seguimiento.
>
> **3 · MAPA 60 DÍAS.** Días 1-7, 8-14, 15-30, 31-45, 46-60. Qué se resuelve en cada tramo y qué señal del mercado esperamos. Es una referencia, no una obligación: si el diagnóstico indica otro ritmo, decilo y explicá por qué.
>
> **4 · SPRINT 1.** Los primeros 7 días: objetivo, hipótesis, entre 3 y 5 acciones con responsable, métrica, resultado esperado y fecha de revisión. Nada más.
>
> **5 · LAS TRES COSAS PARA LA SESIÓN 1.** Concretas y verificables. Si hay garantía firmada, una de ellas es leer sus condiciones en voz alta.
>
> **6 · RIESGOS DEL CASO.** Cada uno con su evidencia textual. Restricciones de tiempo, ansiedad, ideas en paralelo que van a desenfocar, historial de intentos fallidos, situación de pago.
>
> **7 · BRIEF PARA EL CANAL DE LA CONSULTORA.** Para pegar tal cual, sin editar. Escrito para alguien que no escuchó la llamada. Cubre: quién es y de dónde viene, qué tiene hoy, qué compró, la restricción real que condiciona todo, cómo funciona con esta persona, y qué preguntar en la sesión 1.
>
> **8 · QUÉ NO HARÍA EN LOS PRIMEROS 30 DÍAS.**

---

## Restricciones duras

| Restricción | Validación |
|---|---|
| Sprint 1 con 3 a 5 acciones | `sprint_1.acciones.length` entre 3 y 5 |
| Máximo 5 necesidades | `necesidades.length <= 5` |
| Cada necesidad con cita | `necesidades[].evidencia.cita` obligatoria |
| Cuenta inversa completa | los 6 eslabones con número, en ambas columnas |
| Sin construcción antes de validar | el mapa de días 1-30 no puede incluir CRM, funnel, automatización, webinar ni equipo comercial |
| Garantía | si `tiene_garantia`, `sesion_1` incluye la lectura de condiciones |
| Horas reales | si `horas_reales_semana` es null, el plan lo declara como dato faltante y no lo asume |

## Reglas de contenido

- **Si el cliente tiene varios mercados abiertos, cerrarlos es trabajo de las primeras dos semanas, no de la semana 4.** No necesita que le impongan el nicho: necesita que le cierren la puerta a los otros.
- No mandes al cliente a hacer tarea sola si en la llamada dijo que eso no le funciona. Convertí la tarea en trabajo asistido dentro de la sesión.
- Un cliente con academia grabada, comunidad o testimonios sin usar arranca empaquetando lo que tiene, no creando algo nuevo.
- Un plan que depende de que el fundador tenga diez horas por semana cuando tiene tres es un plan que va a fallar en la semana 3 y va a parecer un problema de compromiso del cliente.
- Nunca descartes la experiencia previa del cliente porque dijo que no quiere ese mercado. Investigá primero por qué.

## Casos de borde

| Situación | Qué hace el motor |
|---|---|
| Plan fraccionado sin garantía | Marcar el mes 2 como el riesgo real: es cuando llega la segunda cuota |
| Cliente con facturación y clientes actuales | El arranque es empaquetar y subir precio, no captación desde cero |
| Cliente sin ningún cliente previo | Validación manual primero. Sin ads, sin funnel, sin CRM |
| Cliente ansioso (pregunta lo mismo dos veces en la llamada) | Cadencia fija y respuestas por escrito. Nada de "después lo vemos" |
| Meta declarada irreal contra su ticket | Mostrar la cuenta inversa igual, y decir qué ticket haría la meta alcanzable |

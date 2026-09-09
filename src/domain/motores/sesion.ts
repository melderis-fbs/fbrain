import { z } from 'zod';
import { CONSTITUCION_HASH } from './constitucion';

/**
 * MOTOR · RESUMEN DE SESIÓN
 *
 * Lo que reemplaza a leer una transcripción de veinte mil palabras. Quien
 * revisa ciento cincuenta clientes no la va a leer nunca, así que si el
 * resumen no existe la sesión es como si no se hubiera registrado.
 *
 * Tres restricciones que definen la salida:
 *
 *  1. **Tres a cinco puntos.** No más. Un resumen de quince puntos es una
 *     transcripción más corta, y no se lee tampoco.
 *  2. **Cita textual obligatoria** para el bloqueo y para cualquier señal de
 *     riesgo. Sin la frase del cliente, es una opinión del modelo sobre una
 *     persona que no estuvo en la sala.
 *  3. **Lo que no está, no está.** Si la sesión no cerró con un compromiso, la
 *     lista de compromisos va vacía. Inventar uno hace que la app le reclame
 *     al cliente algo que nadie le pidió.
 */

export const PROMPT_SESION = `Vas a leer la transcripción de una sesión de consultoría uno a uno y resumirla para alguien que revisa ciento cincuenta clientes y no va a leer la transcripción.

Reglas:

1. Entre tres y cinco puntos. Ni uno más. Cada punto, una frase. Lo que pasó en esta sesión, no lo que pasa en general con el cliente.
2. Los compromisos son sólo los que se acordaron explícitamente, con quién los hace. Si la sesión no cerró con ninguno, la lista va vacía: eso también es información, y es de las más importantes.
3. El bloqueo es UNO solo, el que efectivamente frenó a este cliente en esta sesión. Si no se ve ninguno, va 'ninguno'.
4. Para el bloqueo y para cualquier señal de riesgo, incluí la cita textual del cliente. Sin la frase, no lo afirmes: una interpretación sin cita es una opinión sobre alguien que no está para defenderse.
5. No evalúes a la consultora. No propongas un plan. Este motor resume lo que pasó; el diagnóstico es otro y corre cuando alguien lo pide.

Devolvé únicamente el objeto JSON del contrato.`;

export const VERSION_SESION = `sesion-1.0+${CONSTITUCION_HASH}`;

export const resumenSesionSchema = z.object({
  /** De tres a cinco. El tope es la razón de ser del motor. */
  puntos: z.array(z.string().min(1)).min(1).max(5),
  compromisos: z
    .array(z.object({ que: z.string().min(1), quien: z.enum(['cliente', 'consultora']) }))
    .default([]),
  bloqueo: z.string().default('ninguno'),
  /** Sin cita no se afirma nada sobre el estado del cliente. */
  citas: z.array(z.object({ texto: z.string().min(1), porQue: z.string().min(1) })).default([]),
  /** Señales que las reglas de cadencia y de proceso ya saben leer. */
  cerroConCompromiso: z.boolean().optional(),
  mencionoNumeros: z.boolean().optional(),
  temaTratado: z.string().optional(),
});

export type ResumenSesion = z.infer<typeof resumenSesionSchema>;

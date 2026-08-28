/**
 * Todas las tablas del esquema usan `uuid` como clave primaria. La app tiene
 * que generar ids que Postgres acepte, y no cadenas legibles: un
 * `c-001-e1740000000000` es cómodo para depurar y es rechazado por la base en
 * la primera escritura.
 *
 * La idempotencia no depende de esto. Donde importa —métricas por semana,
 * cuotas por número, hitos por clave— la da el `unique` natural de la tabla y
 * el `onConflict` del upsert, no el id.
 */
export function nuevoId(): string {
  return crypto.randomUUID();
}

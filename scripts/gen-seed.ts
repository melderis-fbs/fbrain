/**
 * Genera supabase/seed.sql desde la misma fuente que usa la app.
 * npm run seed:sql
 *
 * Sólo el catálogo de hitos: es lo único de la fusión que hay que sembrar en
 * producción. La cartera se importa por CSV desde las planillas que el equipo
 * ya usa, como dice el paquete de Brain.
 */
import { writeFileSync } from 'node:fs';
import { HITOS } from '../src/domain/fases';

const q = (v: unknown) => (v === undefined || v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const b = (v: boolean) => (v ? 'true' : 'false');

const lineas = [
  '-- Catálogo de hitos. Generado por scripts/gen-seed.ts — no editar a mano.',
  '-- Los días esperados son configurables: dirección los mueve sin un deploy.',
  'begin;',
];

HITOS.forEach((h, i) => {
  lineas.push(
    `insert into hitos_def (key, label, dia, fase, gate, confirma, automatico, detalle, orden) values (`,
    `  ${q(h.key)}, ${q(h.label)}, ${h.dia}, ${q(h.fase)}::fase_negocio, ${b(h.gate)}, ${q(h.confirma)}::rol_usuario, ${q(h.automatico)}, ${q(h.detalle)}, ${i})`,
    '  on conflict (key) do update set label = excluded.label, dia = excluded.dia, gate = excluded.gate;',
  );
});

lineas.push('commit;');
writeFileSync('supabase/seed.sql', lineas.join('\n') + '\n');
console.log(`seed.sql · ${HITOS.length} hitos`);

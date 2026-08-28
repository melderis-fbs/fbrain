/**
 * Arma `supabase/instalar.sql`: las migraciones y el seed en un solo archivo,
 * para pegar una vez en el SQL Editor de Supabase en vez de ocho veces.
 *
 * El orden es el de los nombres, que por eso están numerados.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname ?? '.', '..');
const dirMig = path.join(raiz, 'supabase', 'migrations');

const cabecera = `-- =====================================================================
--  FOUNDERS BRAIN · INSTALACIÓN COMPLETA
-- =====================================================================
--
--  Este archivo es las 7 migraciones y el seed, uno detrás de otro, para
--  pegarlo de una sola vez en el SQL Editor de Supabase.
--
--  GENERADO — no lo edites. Sale de \`npm run sql:instalar\`, que lo arma
--  desde supabase/migrations/ y supabase/seed.sql. Si tocás una migración,
--  volvé a generarlo.
--
--  No necesita ninguna extensión habilitada a mano: crea las que usa
--  (pgcrypto y vector). El trabajo nocturno con pg_cron es aparte y
--  opcional: supabase/opcional/cron-nocturno.sql
--
--  Correrlo dos veces NO es seguro: creá una base limpia si algo falla.
-- =====================================================================

`;

const archivos = [
  ...readdirSync(dirMig).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(dirMig, f)),
  path.join(raiz, 'supabase', 'seed.sql'),
];

const cuerpo = archivos
  .map((f) => {
    const n = path.basename(f);
    return `\n\n-- =====================================================================\n--  ${n}\n-- =====================================================================\n\n${readFileSync(f, 'utf8')}`;
  })
  .join('');

writeFileSync(path.join(raiz, 'supabase', 'instalar.sql'), cabecera + cuerpo);
console.log(`supabase/instalar.sql · ${archivos.length} archivos · ${Math.round((cabecera + cuerpo).length / 1024)} KB`);

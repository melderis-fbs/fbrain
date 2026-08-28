/**
 * Parser CSV mínimo pero correcto: comillas, comas adentro de comillas,
 * comillas escapadas y saltos de línea dentro de un campo. Vive acá y no
 * dentro del importador para poder testearlo sin levantar nada.
 */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') { enComillas = true; continue; }
    if (c === ',') { fila.push(campo); campo = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ''));
}

/** Sin acentos, sin mayúsculas, sin puntuación: para comparar encabezados. */
export function normalizarEncabezado(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Vacío es null, nunca cero.
 *
 * Miles y decimales son ambiguos entre es-AR y en-US: "1.500" son mil quinientos
 * para el equipo y uno coma cinco para JavaScript. La regla es explícita: si el
 * último separador viene seguido de exactamente tres dígitos, todos los
 * separadores son de miles; si no, el último es el decimal. Eso resuelve bien
 * "1.234,56", "1,234.56", "1.500" y "1.5".
 *
 * El caso que pierde es un decimal de tres cifras —"1234.567" se lee 1234567—
 * pero en una planilla de plata eso no existe, y equivocarse en un monto por
 * mil es mucho peor que no soportar milésimas.
 */
export function numeroDePlanilla(v: string): number | null {
  const s = v.replace(/[^\d,.-]/g, '').trim();
  if (s === '' || s === '-') return null;

  const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const decimales = ultimo === -1 ? 0 : s.length - ultimo - 1;
  const normal =
    ultimo === -1 || decimales === 3
      ? s.replace(/[.,]/g, '')
      : s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1);

  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** ISO, dd/mm/aaaa y dd-mm-aaaa, que es lo que escribe la gente. */
export function fechaDePlanilla(v: string): string | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!m) return undefined;
  const [, d, mes, a] = m;
  const anio = a.length === 2 ? `20${a}` : a;
  return `${anio}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

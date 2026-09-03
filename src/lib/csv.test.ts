import { describe, expect, it } from 'vitest';
import { aCsv, fechaDePlanilla, normalizarEncabezado, numeroDePlanilla, parsearCsv } from './csv';

describe('parsearCsv', () => {
  it('separa filas y columnas', () => {
    expect(parsearCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('respeta las comas dentro de comillas', () => {
    expect(parsearCsv('nombre,notas\n"Pérez, Ana","debe 2, 3 cuotas"')).toEqual([
      ['nombre', 'notas'],
      ['Pérez, Ana', 'debe 2, 3 cuotas'],
    ]);
  });

  it('entiende comillas escapadas y saltos de línea dentro de un campo', () => {
    const csv = 'a,b\n"dijo ""no puedo""","linea 1\nlinea 2"';
    expect(parsearCsv(csv)).toEqual([['a', 'b'], ['dijo "no puedo"', 'linea 1\nlinea 2']]);
  });

  it('descarta las filas totalmente vacías que Drive agrega al final', () => {
    expect(parsearCsv('a,b\n1,2\n,\n,,\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('conserva las celdas vacías del medio, que no son lo mismo que ausentes', () => {
    expect(parsearCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});

describe('normalizarEncabezado', () => {
  it('iguala acentos, mayúsculas y puntuación', () => {
    const esperado = 'facturacion mensual';
    for (const h of ['Facturación mensual', 'FACTURACION MENSUAL', 'facturacion_mensual', ' Facturación  Mensual ']) {
      expect(normalizarEncabezado(h)).toBe(esperado);
    }
  });
});

describe('numeroDePlanilla · vacío es null, nunca cero', () => {
  it('devuelve null para vacío y para basura', () => {
    expect(numeroDePlanilla('')).toBeNull();
    expect(numeroDePlanilla('   ')).toBeNull();
    expect(numeroDePlanilla('—')).toBeNull();
    expect(numeroDePlanilla('n/d')).toBeNull();
  });

  it('distingue el cero medido del dato ausente', () => {
    expect(numeroDePlanilla('0')).toBe(0);
    expect(numeroDePlanilla('')).toBeNull();
  });

  it('lee los dos formatos de miles que llegan desde Drive', () => {
    expect(numeroDePlanilla('1.234,56')).toBeCloseTo(1234.56);
    expect(numeroDePlanilla('1,234.56')).toBeCloseTo(1234.56);
    expect(numeroDePlanilla('$ 900')).toBe(900);
    expect(numeroDePlanilla('USD 1.500')).toBe(1500);
    expect(numeroDePlanilla('1,500')).toBe(1500);
    expect(numeroDePlanilla('1.5')).toBe(1.5);
    expect(numeroDePlanilla('900000')).toBe(900000);
  });

  it('ante la ambigüedad de miles elige lo que significa en una planilla de plata', () => {
    // "1.500" es mil quinientos para el equipo, no uno coma cinco.
    expect(numeroDePlanilla('1.500')).toBe(1500);
    // El costo de la regla: un decimal de tres cifras se lee como miles.
    expect(numeroDePlanilla('1234.567')).toBe(1234567);
  });
});

describe('fechaDePlanilla', () => {
  it('acepta ISO y los formatos que escribe la gente', () => {
    expect(fechaDePlanilla('2026-03-04')).toBe('2026-03-04');
    expect(fechaDePlanilla('2026-03-04T10:00:00Z')).toBe('2026-03-04');
    expect(fechaDePlanilla('4/3/2026')).toBe('2026-03-04');
    expect(fechaDePlanilla('04-03-26')).toBe('2026-03-04');
  });

  it('devuelve undefined en vez de inventar una fecha', () => {
    expect(fechaDePlanilla('')).toBeUndefined();
    expect(fechaDePlanilla('marzo')).toBeUndefined();
    expect(fechaDePlanilla('pendiente')).toBeUndefined();
  });
});

describe('aCsv', () => {
  it('entrecomilla lo que hay que entrecomillar, y nada más', () => {
    expect(aCsv([['a', 'b']])).toBe('a,b');
    expect(aCsv([['con, coma']])).toBe('"con, coma"');
    expect(aCsv([['dijo "hola"']])).toBe('"dijo ""hola"""');
    expect(aCsv([['dos\nlineas']])).toBe('"dos\nlineas"');
  });

  it('vacío y cero no son lo mismo', () => {
    expect(aCsv([[undefined, 0, '']])).toBe(',0,');
  });

  it('ida y vuelta: lo que escribe, lo lee', () => {
    const filas = [
      ['nombre', 'que vende', 'cliente ideal'],
      ['Ana, la de marca', 'Consultoría "premium"', 'Arquitecto\ncon estudio'],
    ];
    // Es el riesgo real: un campo con una coma sin escapar corre todas las
    // columnas de esa fila y el «cliente ideal» termina guardado en «promesa».
    expect(parsearCsv(aCsv(filas))).toEqual(filas);
  });
});

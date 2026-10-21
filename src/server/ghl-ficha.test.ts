import { describe, expect, it } from 'vitest';
import { CAMPO_CONTACTO, fichaDeContacto, numeroFirme, primero, valorDe } from './ghl-ficha';

const campo = (id: string, value: unknown) => ({ id, value });

describe('leer un campo del contacto venga como venga', () => {
  it('acepta las tres formas en que GHL devuelve un valor', () => {
    expect(valorDe({ id: 'x', value: 'hola' })).toBe('hola');
    expect(valorDe({ id: 'x', fieldValue: 'hola' })).toBe('hola');
    expect(valorDe({ id: 'x', fieldValueString: 'hola' })).toBe('hola');
  });

  it('une las casillas múltiples con coma, como se leen', () => {
    expect(valorDe({ id: 'x', value: ['Instagram', 'Email'] })).toBe('Instagram, Email');
  });

  it('un campo en blanco es como no tenerlo', () => {
    expect(valorDe({ id: 'x', value: '   ' })).toBeUndefined();
    expect(valorDe({ id: 'x', value: null })).toBeUndefined();
    expect(valorDe(undefined)).toBeUndefined();
  });
});

describe('la misma pregunta está en varios formularios', () => {
  it('toma el primero que tenga valor', () => {
    // En la subcuenta hay tres versiones de «¿cuánto facturás?»: el cliente
    // respondió una sola y las otras dos le quedaron vacías. Mirar un campo
    // solo dejaría media cartera sin el dato.
    const c = { id: 'ct', customFields: [campo(CAMPO_CONTACTO.facturacion[2], '3000 USD')] };
    expect(primero(c, CAMPO_CONTACTO.facturacion)).toBe('3000 USD');
  });

  it('respeta el orden de preferencia', () => {
    const c = {
      id: 'ct',
      customFields: [
        campo(CAMPO_CONTACTO.clienteIdeal[1], 'el de la versión vieja'),
        campo(CAMPO_CONTACTO.clienteIdeal[0], 'el bueno'),
      ],
    };
    expect(primero(c, CAMPO_CONTACTO.clienteIdeal)).toBe('el bueno');
  });
});

describe('un número sólo si es un número', () => {
  it('acepta un número inequívoco, con o sin separadores', () => {
    expect(numeroFirme('4500')).toBe(4500);
    expect(numeroFirme('USD 4.500')).toBe(4500);
    expect(numeroFirme('$ 1200 aprox')).toBe(1200);
  });

  it('rechaza un rango: de ahí sale la cuenta inversa', () => {
    // «Entre 5.000 y 10.000» no es 5.000 ni 10.000. Elegir uno le fija al
    // cliente un objetivo que nadie acordó, y contra ese objetivo se le pide
    // una cantidad de conversaciones por semana.
    expect(numeroFirme('Entre 5.000 y 10.000 USD')).toBeUndefined();
    expect(numeroFirme('de 2000 a 6500')).toBeUndefined();
  });

  it('rechaza lo que no tiene número', () => {
    expect(numeroFirme('No sé todavía')).toBeUndefined();
    expect(numeroFirme('')).toBeUndefined();
    expect(numeroFirme(undefined)).toBeUndefined();
  });
});

describe('del formulario de onboarding al expediente', () => {
  const completo = {
    id: 'ct_1',
    customFields: [
      campo(CAMPO_CONTACTO.oferta[0], 'Mentoría de nutrición deportiva de 12 semanas'),
      campo(CAMPO_CONTACTO.clienteIdeal[0], 'Corredores amateur de 30 a 45'),
      campo(CAMPO_CONTACTO.problema[0], 'Entrenan mucho y no bajan de peso'),
      campo(CAMPO_CONTACTO.promesa[0], 'Ayudo a corredores a rendir más comiendo mejor'),
      campo(CAMPO_CONTACTO.canal[0], 'Instagram'),
      campo(CAMPO_CONTACTO.modeloNegocio[0], 'Servicio uno a uno'),
      campo(CAMPO_CONTACTO.ventaja[0], 'Fui atleta federada diez años'),
      campo(CAMPO_CONTACTO.profesion[0], 'Nutricionista'),
      campo(CAMPO_CONTACTO.ticket[0], '350'),
      campo(CAMPO_CONTACTO.meta[0], 'Entre 5.000 y 10.000 USD'),
      campo(CAMPO_CONTACTO.linkContrato[0], 'https://docs.ejemplo/contrato-123'),
    ],
  };

  it('arma la estrategia, que es el método de Founders', () => {
    const { valores } = fichaDeContacto(completo);
    expect(valores.clienteIdeal).toBe('Corredores amateur de 30 a 45');
    expect(valores.problema).toBe('Entrenan mucho y no bajan de peso');
    expect(valores.promesa).toBe('Ayudo a corredores a rendir más comiendo mejor');
    expect(valores.oferta).toContain('Mentoría');
    expect(valores.canal).toBe('Instagram');
  });

  it('arma también el negocio y la autoridad', () => {
    const { valores } = fichaDeContacto(completo);
    expect(valores.queVende).toContain('Mentoría');
    expect(valores.aQuien).toBe('Corredores amateur de 30 a 45');
    expect(valores.comoEntrega).toBe('Servicio uno a uno');
    expect(valores.haceExcepcionalmenteBien).toBe('Fui atleta federada diez años');
    expect(valores.experienciaProfesional).toBe('Nutricionista');
  });

  it('trae el contrato como link', () => {
    expect(fichaDeContacto(completo).linkContrato).toBe('https://docs.ejemplo/contrato-123');
  });

  it('carga el ticket firme y deja la meta sin cargar, diciendo por qué', () => {
    const { valores, sinConvertir } = fichaDeContacto(completo);
    expect(valores.ticket).toBe(350);
    expect(valores.metaMensual).toBeUndefined();
    expect(sinConvertir).toEqual([{ campo: 'meta mensual', texto: 'Entre 5.000 y 10.000 USD' }]);
  });

  it('un formulario a medias trae lo que hay y omite el resto', () => {
    // La mitad de la cartera está así. Lo omitido no viaja, y más arriba
    // un valor ausente nunca borra lo que ya estaba cargado.
    const { valores } = fichaDeContacto({
      id: 'ct_2',
      customFields: [campo(CAMPO_CONTACTO.clienteIdeal[0], 'Pymes de servicios')],
    });
    expect(valores.clienteIdeal).toBe('Pymes de servicios');
    expect('oferta' in valores).toBe(false);
    expect('promesa' in valores).toBe(false);
    expect('ticket' in valores).toBe(false);
  });

  it('un contacto sin ningún campo no trae nada que escribir', () => {
    const { valores, linkContrato } = fichaDeContacto({ id: 'ct_3', customFields: [] });
    // Sólo queda el motivo del cambio, que no es un dato del cliente.
    expect(Object.keys(valores)).toEqual(['motivoCambio']);
    expect(linkContrato).toBeUndefined();
  });
});

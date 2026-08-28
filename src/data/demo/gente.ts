import type { Consultora } from '@/domain/types';

/**
 * El equipo real de Founders, con la carga documentada en agosto de 2026:
 * tres de las seis consultoras están por encima del techo de 12.
 *
 * Los nombres del equipo son reales porque Vicky tiene que reconocer su
 * cartera. Todo lo demás —clientes, sesiones, citas, alertas— es ficticio y
 * generado. En esta demostración no hay ningún dato cualitativo sobre una
 * persona real del equipo: sólo cuántos clientes tiene cada una.
 */
export const CONSULTORAS: Consultora[] = [
  { id: 'u-jay', nombre: 'Jay', email: 'jay@foundersbs.com', rol: 'consultora', cupoMaximo: 12, aceptaNuevos: false, activa: true, color: '#4a3aa7' },
  { id: 'u-nati', nombre: 'Nati', email: 'nati@foundersbs.com', rol: 'consultora', cupoMaximo: 12, aceptaNuevos: false, activa: true, color: '#1baf7a' },
  { id: 'u-johann', nombre: 'Johann', email: 'johann@foundersbs.com', rol: 'consultora', cupoMaximo: 10, aceptaNuevos: false, activa: true, color: '#eb6834' },
  { id: 'u-vicp', nombre: 'Vic P', email: 'vicp@foundersbs.com', rol: 'consultora', cupoMaximo: 12, aceptaNuevos: true, activa: true, color: '#2a78d6' },
  // La única señal cualitativa del equipo en la demo es ésta, y es una que la
  // propia consultora declara: levantó la mano. No hay ninguna evaluación
  // inventada sobre nadie.
  { id: 'u-kathe', nombre: 'Kathe', email: 'kathe@foundersbs.com', rol: 'consultora', cupoMaximo: 12, aceptaNuevos: true, activa: true, color: '#e87ba4', manoLevantadaAt: 'RELATIVO-5', manoLevantadaNota: 'Se siente sobrepasada con la cantidad de casos nuevos de las últimas dos semanas.', sesionesBackToBack: 4 },
  { id: 'u-romi', nombre: 'Romi', email: 'romi@foundersbs.com', rol: 'consultora', cupoMaximo: 12, aceptaNuevos: true, activa: true, color: '#eda100' },
];

export const ADMIN: Consultora = {
  id: 'u-vicky',
  nombre: 'Vicky',
  email: 'vicky@foundersbs.com',
  rol: 'admin',
  cupoMaximo: 0,
  aceptaNuevos: false,
  activa: true,
  color: '#14131a',
};

export const EQUIPO: Consultora[] = [...CONSULTORAS, ADMIN];

/** Cartera documentada: Jay 30, Nati 21, Johann 12, y el resto repartido. */
export const CARGA: Record<string, number> = {
  'u-jay': 30,
  'u-nati': 21,
  'u-johann': 12,
  'u-vicp': 8,
  'u-kathe': 7,
  'u-romi': 7,
};

export const NOMBRES = [
  'Belén Ferraro', 'Gonzalo Prieto', 'Malena Ortiz', 'Tomás Bianchi', 'Carolina Méndez',
  'Ignacio Vera', 'Lucía Sandoval', 'Federico Lynch', 'Ramiro Castro', 'Ana Puig',
  'Diego Sarmiento', 'Paula Iriarte', 'Santiago Roldán', 'Verónica Lastra', 'Emilio Cárdenas',
  'Rocío Benítez', 'Martín Oliva', 'Sebastián Duarte', 'Natalia Quiroga', 'Alejandro Sosa',
  'Julieta Ponce', 'Hernán Cabral', 'Rodrigo Antúnez', 'Silvina Bravo', 'Pablo Otero',
  'Agustina Rey', 'Leandro Fuentes', 'Micaela Bustos', 'Damián Rosales', 'Florencia Arce',
  'Nicolás Peralta', 'Guadalupe Ferrari', 'Esteban Molina', 'Camila Aguilar', 'Joaquín Segura',
  'Antonella Ruiz', 'Facundo Ledesma', 'Bárbara Nieto', 'Cristian Villalba', 'Sofía Maldonado',
  'Matías Bertoni', 'Valentina Cáceres', 'Gabriel Ibarra', 'Renata Soler', 'Andrés Colombo',
  'Milagros Paz', 'Lucas Zabala', 'Delfina Correa', 'Franco Urquiza', 'Josefina Real',
  'Marcos Vidal', 'Abril Guzmán', 'Bruno Salinas', 'Catalina Ferreyra', 'Iván Montoya',
  'Pilar Escudero', 'Tobías Alvarado', 'Manuela Godoy', 'Axel Ramírez', 'Clara Bustamante',
  'Simón Alegre', 'Victoria Nardi', 'Elías Palacios', 'Rocío Miranda', 'Lisandro Peña',
  'Emilia Torrents', 'Ariel Ojeda', 'Noelia Grimaldi', 'Mateo Sarasola', 'Ludmila Prat',
  'Nahuel Ayala', 'Serena Bianco', 'Gastón Rivarola', 'Aldana Ferrer', 'Ezequiel Roca',
  'Trinidad Olmos', 'Kevin Aráoz', 'Magalí Bordón', 'Cristóbal Nieva', 'Fiorella Sanz',
  'Ulises Marín', 'Amparo Vega', 'Thiago Lozano', 'Constanza Ávila', 'Ramón Estévez',
];

export const RUBROS = [
  'Coaching ejecutivo', 'Nutrición', 'Marketing digital', 'Consultoría IT', 'Diseño',
  'Fitness', 'Psicología', 'Servicios legales', 'Arquitectura', 'Fotografía',
  'Recursos humanos', 'Finanzas personales', 'Educación', 'Desarrollo web', 'Logística',
  'Eventos', 'Seguros', 'Inmobiliaria', 'Producción audio', 'Indumentaria',
  'Automatización', 'Branding', 'Interiorismo', 'Terapias', 'Idiomas',
];

export const PROGRAMAS = ['GROWTH M1', 'GROWTH M2', 'CORE', 'CORE PLUS'];

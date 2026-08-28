/**
 * Tailwind v3 corre en JavaScript puro. Es lo que permite compilar este
 * proyecto en entornos sin binarios nativos (Bolt / StackBlitz WebContainer),
 * donde `lightningcss` de Tailwind v4 no puede cargarse.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;

import type { Config } from 'tailwindcss';

/**
 * Los colores no son valores: son referencias a las variables CSS que define
 * `globals.css`. Por eso el tema oscuro se resuelve en una sola media query y
 * ninguna clase necesita variante `dark:`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        good: 'var(--good)',
        'good-ink': 'var(--good-ink)',
        'good-soft': 'var(--good-soft)',
        warning: 'var(--warning)',
        'warning-ink': 'var(--warning-ink)',
        'warning-soft': 'var(--warning-soft)',
        serious: 'var(--serious)',
        'serious-ink': 'var(--serious-ink)',
        'serious-soft': 'var(--serious-soft)',
        critical: 'var(--critical)',
        'critical-ink': 'var(--critical-ink)',
        'critical-soft': 'var(--critical-soft)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      boxShadow: {
        card: 'var(--shadow)',
      },
    },
  },
  plugins: [],
};

export default config;

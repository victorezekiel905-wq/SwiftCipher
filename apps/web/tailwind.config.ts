import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        surface: '#0b1220',
        accent: '#7c3aed',
      },
      boxShadow: {
        glow: '0 10px 40px rgba(124,58,237,.22)',
      },
    },
  },
  plugins: [],
} satisfies Config;

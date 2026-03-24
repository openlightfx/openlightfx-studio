/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0f0f1a',
          light: '#f8fafc',
        },
        surface: {
          DEFAULT: '#1a1a2e',
          light: '#ffffff',
        },
        surface2: {
          DEFAULT: '#252540',
          light: '#f1f5f9',
        },
        accent: {
          DEFAULT: '#6c63ff',
          hover: '#7b73ff',
        },
        accent2: {
          DEFAULT: '#00d9ff',
          hover: '#33e1ff',
        },
        'text-primary': {
          DEFAULT: '#e2e8f0',
          light: '#1e293b',
        },
        'text-muted': {
          DEFAULT: '#94a3b8',
          light: '#64748b',
        },
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};

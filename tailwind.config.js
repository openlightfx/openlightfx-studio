/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f1a',
        surface: '#1a1a2e',
        surface2: '#252540',
        surface3: '#2f2f4a',
        accent: '#6c63ff',
        'accent-hover': '#7b73ff',
        accent2: '#00d9ff',
        'text-base': '#e2e8f0',
        textMuted: '#94a3b8',
        danger: '#ef4444',
        success: '#22c55e',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': '0.625rem',
      },
      spacing: {
        'toolbar-h': '2.5rem',
        'menubar-h': '1.75rem',
      },
      animation: {
        'fade-in': 'fadeIn 150ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(108, 99, 255, 0.4)' },
          '50%': { boxShadow: '0 0 12px rgba(108, 99, 255, 0.8)' },
        },
      },
    },
  },
  plugins: [],
};

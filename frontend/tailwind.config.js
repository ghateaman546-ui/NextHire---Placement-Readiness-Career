/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#2563EB', 50: '#EFF6FF', 500: '#2563EB', 600: '#1D4ED8' },
        secondary: { DEFAULT: '#4F46E5' },
        accent: { DEFAULT: '#06B6D4' },
        surface: { DEFAULT: '#0F172A', card: '#111827' },
      },
      backdropBlur: { glass: '12px' },
      borderRadius: { card: '1rem' },
    },
  },
  plugins: [],
};

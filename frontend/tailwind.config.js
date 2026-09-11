/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Charte : blanc et vert
      colors: {
        primary: {
          50: '#f0faf4',
          100: '#dcf3e5',
          200: '#bce6cd',
          300: '#8dd2ab',
          400: '#55b781',
          500: '#2f9a61',
          600: '#0f7a43',
          700: '#0c6238',
          800: '#0d4e2f',
          900: '#0b4028',
          950: '#052416',
        },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 3px rgba(5, 36, 22, 0.08), 0 1px 2px rgba(5, 36, 22, 0.04)' },
    },
  },
  plugins: [],
};

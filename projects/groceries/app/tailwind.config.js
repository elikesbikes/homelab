/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#070d1a',
          900: '#0b1526',
          800: '#0f1c30',
          700: '#132036',
          600: '#1a2d4a',
          500: '#1e3558',
          400: '#4a6080',
          300: '#7a94b4',
          200: '#a8bdd6',
          100: '#dce8f4',
        },
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F0F4F8',
          100: '#D9E2EC',
          500: '#1E3A8A', // Deep Navy
          600: '#172554',
          700: '#0F172A',
        },
        income: '#16A34A', // Emerald green
        expense: '#E11D48', // Coral red
        transfer: '#2563EB', // Blue
        pending: '#D97706', // Amber
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

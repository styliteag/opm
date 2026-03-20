/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        display: ['Space Grotesk', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        opm: {
          ink: 'var(--opm-ink)',
          bg: 'var(--opm-bg)',
          card: 'var(--opm-card)',
        },
      },
      zIndex: {
        header: '30',
        dropdown: '40',
        modal: '50',
        toast: '60',
      },
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /*
         * I grigi sono ridefiniti caldi, come la carta della proposta mobile:
         * le pagine usano gray-50 per il fondo, gray-200 per i bordi,
         * gray-500 per il testo secondario, e cambiandoli qui cambiano tutte
         * insieme senza toccarle una per una.
         */
        gray: {
          50: '#F7F6F2',
          100: '#EFEDE6',
          200: '#E6E3DA',
          300: '#D8D4C8',
          400: '#8A8478',
          500: '#6E6B62',
          600: '#57544C',
          700: '#4A4437',
          800: '#2E2C27',
          900: '#1C1B18',
        },
        /* Il verde fa da colore di link, selezione e avanzamento. */
        primary: {
          50: '#F1F7F4',
          100: '#E9F1EC',
          200: '#C9DED4',
          300: '#9CC2B1',
          400: '#5E9A84',
          500: '#2F7E69',
          600: '#1F6B5A',
          700: '#185647',
          800: '#134438',
          900: '#0E332A',
        },
        /* Il giallo della Brigata è solo per l'azione principale di una
           pagina, sempre con testo scuro: sul bianco non si legge. */
        giallo: {
          DEFAULT: '#F2C200',
          scuro: '#DDB000',
          tenue: '#FDF6DC',
        },
      },
      fontFamily: {
        sans: ['"Source Sans 3"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['Archivo', '"Source Sans 3"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

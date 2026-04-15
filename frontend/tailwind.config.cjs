/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Define 'primary' as a custom color scale based on rose/crimson
        // We will use rose-950 for the darkest black/red background
        rose: {
          50: '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239', // Deep Red Accent
          900: '#881337', // Dark Crimson
          950: '#4C0519', // Darkest Background Accent (Deep Maroon)
        },
      },
    },
  },
  plugins: [],
};
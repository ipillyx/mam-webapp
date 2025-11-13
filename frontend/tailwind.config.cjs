/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],

  theme: {
    extend: {
      colors: {
        midnight: "#0a0f0a",
        emeraldGlass: "rgba(16, 185, 129, 0.15)", 
        panel: "#0d1510",
      },
    },
  },

  plugins: [],
};
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#050509',
        rose: '#c44569',
        roseSoft: '#e6678a'
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        body: ['system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}", // Scans all JS, TS, JSX, TSX files in your src directory
    "./public/index.html",        // Scans your main HTML file
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter', 'sans-serif'], // Adds 'Inter' to Tailwind's font families
      },      
    },
  },
  plugins: [],
}


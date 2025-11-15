/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'game': {
          'background': '#0f0f23',
          'primary': '#00cc00',
          'secondary': '#009900',
          'accent': '#ffff66',
          'player-a': '#3B82F6',
          'player-b': '#EF4444',
        }
      },
      animation: {
        'pulse-waiting': 'pulse-waiting 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'piece-move': 'piece-move 0.4s ease-in-out',
      },
      keyframes: {
        'pulse-waiting': {
          '0%, 100%': {
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            boxShadow: '0 0 0 rgba(59, 130, 246, 0.4)',
          },
          '50%': {
            backgroundColor: 'rgba(59, 130, 246, 0.3)',
            boxShadow: '0 0 20px rgba(59, 130, 246, 0.3)',
          },
        },
        'piece-move': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.2)' },
          '100%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
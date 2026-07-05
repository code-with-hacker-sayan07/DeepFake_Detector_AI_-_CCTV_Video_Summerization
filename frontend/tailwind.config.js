/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          dark: '#030712',      // Dark slate/black
          card: '#0f172a',      // Slate 900
          border: '#1e293b',    // Slate 800
          accent: '#06b6d4',    // Cyan neon
          success: '#10b981',   // Emerald green neon
          warning: '#f59e0b',   // Amber neon
          danger: '#ef4444',    // Red neon
          glow: '#14b8a6',      // Teal glow
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'Outfit', 'sans-serif'],
      },
      boxShadow: {
        'cyber-glow': '0 0 15px rgba(6, 182, 212, 0.15)',
        'success-glow': '0 0 15px rgba(16, 185, 129, 0.25)',
        'danger-glow': '0 0 15px rgba(239, 68, 68, 0.25)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

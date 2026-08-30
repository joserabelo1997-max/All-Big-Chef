/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Semáforo de validade. Usado no painel, nas listas e nas bordas dos cards.
        // Mantido como token nomeado para que o significado (e não o tom) apareça no JSX.
        validade: {
          ok: '#15803d',
          atencao: '#b45309',
          hoje: '#c2410c',
          vencido: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      spacing: {
        // Alvo mínimo de toque para uso com luva molhada na bancada.
        toque: '3.5rem',
      },
    },
  },
  plugins: [],
}

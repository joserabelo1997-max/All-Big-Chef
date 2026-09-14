/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tema escuro por padrão: o app vive numa cozinha, muitas vezes
        // com a tela no balcão e a mão suja. Fundo escuro cansa menos.
        fundo: '#0f1115',
        painel: '#171a21',
        painel2: '#1f232c',
        borda: '#2b303b',
        texto: '#e8eaee',
        texto2: '#9aa3b2',
        brasa: '#ff7a3d',
        brasa2: '#ffa06b',
        erva: '#4ade80',
        alerta: '#fbbf24',
        perigo: '#f87171',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

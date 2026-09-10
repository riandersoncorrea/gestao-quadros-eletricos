import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages serves this project at /<repo>/, Netlify serves it at /.
const base = process.env.GITHUB_PAGES === 'true' ? '/gestao-quadros-eletricos/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  logLevel: 'error', // Suppress warnings, only show errors
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
  ]
});

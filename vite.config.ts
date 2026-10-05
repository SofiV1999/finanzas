import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages sirve el sitio en https://sofiv1999.github.io/finanzas/
  base: '/finanzas/',
  plugins: [react()],
})

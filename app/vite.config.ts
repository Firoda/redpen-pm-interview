import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: { port: 5173 },
  // Pre-bundle lazily imported deps so the dev server never reloads mid-mock.
  optimizeDeps: { include: ['pdfjs-dist', 'mammoth', '@anthropic-ai/sdk', 'zod', 'ulid'] },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: { input: { main: path.resolve(import.meta.dirname, 'index.html') } },
  },
})

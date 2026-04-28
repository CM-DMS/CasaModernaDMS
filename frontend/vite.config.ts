import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Dev proxy: target cms.local on bench-v3 (port 8001).
// Override via .env.local:
//   VITE_BENCH_URL=http://localhost:8001
//   VITE_BENCH_HOST=cms.local
const BENCH_URL  = process.env.VITE_BENCH_URL  || 'http://localhost:8001'
const BENCH_HOST = process.env.VITE_BENCH_HOST || 'cms.local'

export default defineConfig(({ mode }) => ({
  // Production: served at /dms/ (matching nginx location block)
  // Dev: served at root so proxy works
  base: mode === 'development' ? '/' : '/dms/',

  plugins: [
    react(),
    tailwindcss(),
  ],

  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: BENCH_URL,
        changeOrigin: true,
        headers: { Host: BENCH_HOST },
      },
      '/assets': {
        target: BENCH_URL,
        changeOrigin: true,
        headers: { Host: BENCH_HOST },
      },
      '/files': {
        target: BENCH_URL,
        changeOrigin: true,
        headers: { Host: BENCH_HOST },
      },
      '/socket.io': {
        target: BENCH_URL,
        ws: true,
        changeOrigin: true,
        headers: { Host: BENCH_HOST },
      },
    },
  },
}))

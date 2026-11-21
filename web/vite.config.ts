import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const ENGINE = process.env.GLIMPSE_ENGINE ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // The Python engine owns the camera. The browser talks to it through these paths.
    proxy: {
      '/api': ENGINE,
      '/video.mjpg': ENGINE,
      '/ws': { target: ENGINE.replace(/^http/, 'ws'), ws: true },
    },
  },
})

import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import { localApiOrigin } from './dev/apiOrigin.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    localApiOrigin(loadEnv(mode, fileURLToPath(new URL('./server', import.meta.url)), 'APP_ORIGIN').APP_ORIGIN || 'http://localhost:5173'),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: false,
    proxy: { '/api': 'http://127.0.0.1:5000' },
  },
}))

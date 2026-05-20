import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { continueApiPlugin } from './vite-plugin-continue-api.mjs'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    if (value && process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  return {
    plugins: [react(), continueApiPlugin()],
    devtools: false,
    envDir: '.',
  }
})

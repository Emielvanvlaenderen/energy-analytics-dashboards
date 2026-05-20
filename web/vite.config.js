import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { continueApiPlugin } from './vite-plugin-continue-api.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), continueApiPlugin()],
  devtools: false,
})

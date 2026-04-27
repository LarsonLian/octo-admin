import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(Date.now()),
  },
  base: command === 'build' ? '/admin/' : '/',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'https://api-test.example.com',
        changeOrigin: true,
        secure: false,
      },
    },
  },
}))

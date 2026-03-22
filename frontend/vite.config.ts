import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ quoteStyle: 'single', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('node_modules/react/')) return 'vendor-react'
          if (id.includes('node_modules/@tanstack/react-router')) return 'vendor-router'
          if (id.includes('node_modules/@tanstack/react-query')) return 'vendor-router'
          if (id.includes('node_modules/@tanstack/react-table')) return 'vendor-table'
          if (id.includes('node_modules/recharts')) return 'vendor-recharts'
          if (id.includes('node_modules/@codemirror') || id.includes('node_modules/@uiw/react-codemirror')) return 'vendor-codemirror'
          if (id.includes('node_modules/@radix-ui')) return 'vendor-radix'
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.DOCKER
          ? 'http://backend:8000'
          : 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})

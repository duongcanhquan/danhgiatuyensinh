import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * - GitHub Pages: `https://<user>.github.io/<repo>/` → đặt `base` = `/<repo>/`.
 * - Vercel: app ở gốc `/` — khi build trên Vercel biến môi trường `VERCEL` được set.
 * Có thể ghi đè: `VITE_BASE=/my-subpath/ npm run build`
 */
function appBase(mode: string): string {
  const fromEnv = process.env.VITE_BASE?.trim()
  if (fromEnv) return fromEnv.endsWith('/') ? fromEnv : `${fromEnv}/`
  if (process.env.VERCEL) return '/'
  return mode === 'production' ? '/danhgiatuyensinh/' : '/'
}

export default defineConfig(({ mode }) => ({
  base: appBase(mode),
  plugins: [react(), tailwindcss()],
}))

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

function openAiProxyForAppBase(base: string): Record<string, object> {
  const prefix = base === '/' ? '' : base.replace(/\/$/, '')
  const mount = `${prefix}/openai-proxy`.replace(/^\/{2,}/, '/')
  const escaped = mount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return {
    [mount]: {
      target: 'https://api.openai.com',
      changeOrigin: true,
      rewrite: (path: string) => path.replace(new RegExp(`^${escaped}`), '') || '/',
    },
  }
}

export default defineConfig(({ mode, command }) => {
  const base = appBase(mode)
  const openAiProxy = openAiProxyForAppBase(base)
  return {
    base,
    plugins: [react(), tailwindcss()],
    /** Dev + preview: tránh CORS khi gọi OpenAI — URL proxy khớp `import.meta.env.BASE` (xem `getOpenAiChatCompletionsUrl`). */
    server:
      command === 'serve'
        ? {
            proxy: openAiProxy,
          }
        : undefined,
    preview: {
      proxy: openAiProxy,
    },
  }
})

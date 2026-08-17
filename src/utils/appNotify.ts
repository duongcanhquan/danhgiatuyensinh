import { appNoticeToneFromMessage, type AppNoticeTone } from './appNoticeTone'

export type AppNotifyItem = {
  id: string
  message: string
  title?: string
  tone: AppNoticeTone
  durationMs: number
}

type Listener = (items: AppNotifyItem[]) => void

let items: AppNotifyItem[] = []
const listeners = new Set<Listener>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function emit() {
  for (const fn of listeners) fn(items)
}

export function subscribeAppNotify(fn: Listener): () => void {
  listeners.add(fn)
  fn(items)
  return () => {
    listeners.delete(fn)
  }
}

export function dismissAppNotify(id: string) {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
  const next = items.filter((x) => x.id !== id)
  if (next.length === items.length) return
  items = next
  emit()
}

export function appNotify(opts: {
  message: string
  title?: string
  tone?: AppNoticeTone
  durationMs?: number
}) {
  const message = opts.message.trim()
  if (!message) return
  const tone = opts.tone ?? appNoticeToneFromMessage(message)
  const durationMs = opts.durationMs ?? (tone === 'error' ? 8000 : 4500)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  items = [...items.slice(-2), { id, message, title: opts.title, tone, durationMs }]
  emit()
  if (durationMs > 0) {
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id)
        dismissAppNotify(id)
      }, durationMs),
    )
  }
}

/** Thay `window.alert` — thông báo trong app, không chặn thao tác. */
export function appAlert(message: string, tone?: AppNoticeTone) {
  appNotify({ message, tone })
}

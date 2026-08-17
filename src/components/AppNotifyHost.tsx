import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AppNotice } from './AppNotice'
import { dismissAppNotify, subscribeAppNotify, type AppNotifyItem } from '../utils/appNotify'

/**
 * Toast toàn app — gắn một lần trong App.
 * `appAlert()` / `appNotify()` hiện ở đây thay cho window.alert.
 */
export function AppNotifyHost() {
  const [items, setItems] = useState<AppNotifyItem[]>([])

  useEffect(() => subscribeAppNotify(setItems), [])

  if (typeof document === 'undefined' || !items.length) return null

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[320] flex flex-col items-center gap-2 px-3"
      aria-live="polite"
    >
      {items.map((item) => (
        <div key={item.id} className="pointer-events-auto w-full max-w-md shadow-lg">
          <AppNotice
            tone={item.tone}
            role={item.tone === 'error' ? 'alert' : 'status'}
            onDismiss={() => dismissAppNotify(item.id)}
          >
            {item.title ? `${item.title} — ${item.message}` : item.message}
          </AppNotice>
        </div>
      ))}
    </div>,
    document.body,
  )
}

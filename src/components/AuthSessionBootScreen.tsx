import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'

const BRAND_LOGO_SRC = `${import.meta.env.BASE_URL}brand/logo-vietmy-trang.png`

/** Thời gian tối thiểu giữ màn motion (ms). */
export const AUTH_BOOT_MIN_HOLD_MS = 3000

const ORBIT_DOTS = [
  { angle: 0, delay: 0, size: 10 },
  { angle: 72, delay: 0.12, size: 8 },
  { angle: 144, delay: 0.24, size: 9 },
  { angle: 216, delay: 0.36, size: 7 },
  { angle: 288, delay: 0.48, size: 8 },
] as const

/**
 * Giữ màn boot tối thiểu `minMs` sau khi `busy` từng bật.
 * `skip` (vd. chưa đăng nhập → về /login): tắt hold ngay, không kéo dài.
 */
export function useAuthBootMinHold(
  busy: boolean,
  opts?: { minMs?: number; skip?: boolean },
): boolean {
  const minMs = opts?.minMs ?? AUTH_BOOT_MIN_HOLD_MS
  const skip = opts?.skip ?? false
  const [holding, setHolding] = useState(false)
  const startedRef = useRef<number | null>(null)

  useEffect(() => {
    if (skip) {
      startedRef.current = null
      setHolding(false)
      return
    }
    if (busy) {
      if (startedRef.current == null) startedRef.current = Date.now()
      setHolding(true)
      return
    }
    if (startedRef.current == null) {
      setHolding(false)
      return
    }
    const remain = Math.max(0, minMs - (Date.now() - startedRef.current))
    const id = window.setTimeout(() => {
      startedRef.current = null
      setHolding(false)
    }, remain)
    return () => window.clearTimeout(id)
  }, [busy, minMs, skip])

  return busy || holding
}

/**
 * Màn đệm phiên đăng nhập — motion logo giữa màn, thay chữ «đang đăng nhập…».
 */
export function AuthSessionBootScreen({
  statusLabel = 'Đang mở phiên làm việc',
  detail,
  actions,
}: {
  /** Chỉ cho trình đọc màn hình; UI chính là motion. */
  statusLabel?: string
  detail?: string
  actions?: ReactNode
}) {
  return (
    <div
      className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[var(--vm-ink)] px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={statusLabel}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(79,70,229,0.35),transparent_55%),radial-gradient(ellipse_at_80%_80%,rgba(14,165,233,0.18),transparent_45%),linear-gradient(180deg,#0b1220_0%,#111827_55%,#0b1220_100%)]"
        aria-hidden
      />
      <motion.div
        className="pointer-events-none absolute -left-24 top-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
        aria-hidden
        animate={{ x: [0, 40, 0], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="pointer-events-none absolute -right-16 bottom-1/4 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl"
        aria-hidden
        animate={{ y: [0, -30, 0], opacity: [0.25, 0.45, 0.25] }}
        transition={{ duration: 7.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <div className="relative flex h-44 w-44 items-center justify-center sm:h-52 sm:w-52">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-[8%] rounded-full border border-indigo-300/35"
              aria-hidden
              initial={{ scale: 0.7, opacity: 0.55 }}
              animate={{ scale: [0.7, 1.4], opacity: [0.55, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeOut',
                delay: i * 0.75,
              }}
            />
          ))}

          <motion.div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          >
            {ORBIT_DOTS.map((d) => (
              <span
                key={d.angle}
                className="absolute left-1/2 top-1/2"
                style={{ transform: `rotate(${d.angle}deg) translateY(-5.1rem)` }}
              >
                <motion.span
                  className="block rounded-full bg-gradient-to-br from-white to-indigo-200 shadow-[0_0_14px_rgba(199,210,254,0.9)]"
                  style={{ width: d.size, height: d.size, marginLeft: -d.size / 2 }}
                  animate={{ scale: [0.8, 1.25, 0.8], opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: d.delay,
                  }}
                />
              </span>
            ))}
          </motion.div>

          <motion.div
            className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full bg-white/10 shadow-[0_0_40px_rgba(79,70,229,0.45)] ring-1 ring-white/25 backdrop-blur-md sm:h-32 sm:w-32"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <motion.img
              src={BRAND_LOGO_SRC}
              alt=""
              className="h-16 w-auto max-w-[4.5rem] object-contain drop-shadow-lg sm:h-[4.5rem] sm:max-w-[5.25rem]"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </div>

        <div className="mt-8 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-indigo-200"
              animate={{ opacity: [0.25, 1, 0.25], scale: [0.85, 1.2, 0.85] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.15,
              }}
            />
          ))}
        </div>

        <p className="sr-only">{statusLabel}</p>
        {detail ? <p className="sr-only">{detail}</p> : null}

        {actions ? (
          <div className="mt-10 flex flex-col items-center gap-2 opacity-90">{actions}</div>
        ) : null}
      </div>
    </div>
  )
}

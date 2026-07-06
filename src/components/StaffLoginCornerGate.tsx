import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'

/** Sư tử nhỏ — biểu tượng nội bộ VietMy (LION scholarship). */
function VietMyLionMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="16" cy="16" r="14" fill="#F59E0B" opacity="0.35" />
      <circle cx="16" cy="16" r="10.5" fill="#FBBF24" />
      <circle cx="11.5" cy="14" r="1.35" fill="#78350F" />
      <circle cx="20.5" cy="14" r="1.35" fill="#78350F" />
      <ellipse cx="16" cy="18.2" rx="2.2" ry="1.5" fill="#D97706" />
      <path
        d="M6 12c1.2-3.5 4.2-6 10-6s8.8 2.5 10 6c-2.2-1.8-5.2-2.8-10-2.8S8.2 10.2 6 12z"
        fill="#F59E0B"
        opacity="0.85"
      />
      <path
        d="M5.5 18c.8 2.2 2.8 3.8 5.5 4.5M26.5 18c-.8 2.2-2.8 3.8-5.5 4.5"
        stroke="#D97706"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Cổng ẩn cho nhân viên — góc phải dưới, cực mờ; hover hiện sư tử → /login.
 * Dùng trên màn công khai `/dang-ky` để sinh viên không thấy đường vào quản trị.
 */
export function StaffLoginCornerGate() {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      to="/login"
      className="group fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] right-[max(0.75rem,env(safe-area-inset-right,0px))] z-50 flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2"
      aria-label="Đăng nhập quản trị"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <span
        className="absolute inset-0 rounded-full bg-slate-400/5 transition-colors duration-300 group-hover:bg-transparent"
        aria-hidden
      />
      <AnimatePresence>
        {hovered ? (
          <motion.span
            key="lion"
            initial={{ opacity: 0, scale: 0.55, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 2 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
            className="pointer-events-none relative flex h-9 w-9 items-center justify-center drop-shadow-md"
          >
            <VietMyLionMark className="h-9 w-9" />
          </motion.span>
        ) : (
          <motion.span
            key="dot"
            initial={false}
            className="h-1.5 w-1.5 rounded-full bg-slate-400/20"
            aria-hidden
          />
        )}
      </AnimatePresence>
    </Link>
  )
}

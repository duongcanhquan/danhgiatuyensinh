import type { ReactNode } from 'react'

export type VietMyAccentHeadingTone = 'onDark' | 'onLight'
export type VietMyAccentHeadingSize = 'sm' | 'md' | 'lg' | 'xl'

export type VietMyAccentHeadingTag = 'h1' | 'h2' | 'h3' | 'p' | 'span'

const toneGradients: Record<VietMyAccentHeadingTone, string> = {
  /** Nền tối: đỏ sáng → đỏ đậm → gần đen (vẫn đọc được trên slate). */
  onDark:
    'bg-gradient-to-r from-rose-200 via-red-500 to-zinc-950 bg-clip-text font-bold uppercase text-transparent',
  /** Nền sáng: đỏ đậm sang đen. */
  onLight:
    'bg-gradient-to-r from-rose-600 via-red-600 to-zinc-950 bg-clip-text font-bold uppercase text-transparent',
}

const sizes: Record<VietMyAccentHeadingSize, string> = {
  sm: 'text-xs md:text-sm tracking-[0.2em]',
  md: 'text-sm md:text-base tracking-[0.16em]',
  lg: 'text-lg md:text-2xl tracking-[0.1em]',
  /** Tiêu đề trang chính — đồng bộ màn hình */
  xl: 'text-2xl md:text-3xl tracking-[0.08em]',
}

/**
 * Tiêu đề VietMy: chữ HOA + gradient nửa đỏ nửa đen (trang trí thương hiệu).
 */
export function VietMyAccentHeading({
  as = 'h2',
  tone,
  size = 'lg',
  className = '',
  children,
}: {
  as?: VietMyAccentHeadingTag
  tone: VietMyAccentHeadingTone
  size?: VietMyAccentHeadingSize
  className?: string
  children: ReactNode
}) {
  const Comp = as
  const raw = typeof children === 'string' ? children : String(children)
  const text = raw.toLocaleUpperCase('vi-VN')
  return (
    <Comp className={[toneGradients[tone], sizes[size], 'leading-tight', className].filter(Boolean).join(' ')}>
      {text}
    </Comp>
  )
}

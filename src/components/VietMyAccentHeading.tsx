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

/** Một thang cỡ cho mọi trang (sans, gần text-sm / text-lg trang). */
const sizes: Record<VietMyAccentHeadingSize, string> = {
  sm: 'text-xs tracking-widest',
  md: 'text-sm tracking-wide',
  lg: 'text-base tracking-tight md:text-lg',
  xl: 'text-lg tracking-tight md:text-xl',
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
    <Comp
      className={[toneGradients[tone], sizes[size], 'font-sans leading-tight antialiased', className]
        .filter(Boolean)
        .join(' ')}
    >
      {text}
    </Comp>
  )
}

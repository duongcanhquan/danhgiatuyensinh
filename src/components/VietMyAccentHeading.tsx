import type { ReactNode } from 'react'

export type VietMyAccentHeadingTone = 'onDark' | 'onLight'
export type VietMyAccentHeadingSize = 'sm' | 'md' | 'lg' | 'xl'

export type VietMyAccentHeadingTag = 'h1' | 'h2' | 'h3' | 'p' | 'span'

const toneClass: Record<VietMyAccentHeadingTone, string> = {
  /** Nền tối — fallback chữ sáng; gradient chỉ khi clip text ổn định (xem `index.css`). */
  onDark: 'vm-accent-heading-dark',
  /** Nền sáng — fallback đỏ đậm đọc được. */
  onLight: 'vm-accent-heading-light',
}

/** Một thang cỡ cho mọi trang (sans, gần text-sm / text-lg trang). */
const sizes: Record<VietMyAccentHeadingSize, string> = {
  sm: 'text-xs tracking-widest',
  md: 'text-sm tracking-wide',
  lg: 'text-base tracking-tight md:text-lg',
  xl: 'text-lg tracking-tight md:text-xl',
}

/**
 * Tiêu đề VietMy: chữ HOA + gradient thương hiệu, có màu đặc dự phòng khi `background-clip: text` lỗi.
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
    <Comp className={[toneClass[tone], sizes[size], 'font-sans leading-tight antialiased', className].filter(Boolean).join(' ')}>
      {text}
    </Comp>
  )
}

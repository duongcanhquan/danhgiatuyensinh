import { useEffect, useState } from 'react'

function sanitizeSignedIntInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.-]/g, '')
  const neg = cleaned.startsWith('-')
  const digits = cleaned.replace(/-/g, '')
  return neg ? `-${digits}` : digits
}

/**
 * Ô điểm / % có thể âm — dùng text + inputMode để gõ «-» trước số không bị mất (tránh bug input number điều khiển).
 */
export function ScoringAllocationValueInput({
  rowId,
  value,
  disabled,
  onCommit,
  className = '',
  'aria-label': ariaLabel,
}: {
  rowId: string
  value: number
  disabled?: boolean
  onCommit: (n: number) => void
  className?: string
  'aria-label'?: string
}) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
  }, [rowId])

  const shown = text !== null ? text : String(Number.isFinite(value) ? value : 0)

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      aria-label={ariaLabel}
      value={shown}
      onFocus={() => setText(String(Number.isFinite(value) ? value : 0))}
      onChange={(e) => {
        const next = sanitizeSignedIntInput(e.target.value)
        setText(next)
        const t = next.trim()
        if (t !== '' && t !== '-' && t !== '+') {
          const n = Number(t)
          if (Number.isFinite(n)) onCommit(n)
        }
      }}
      onBlur={() => {
        if (text === null) return
        const t = text.trim()
        const n = t === '' || t === '-' || t === '+' ? 0 : Number(t)
        onCommit(Number.isFinite(n) ? n : value)
        setText(null)
      }}
      className={className}
    />
  )
}

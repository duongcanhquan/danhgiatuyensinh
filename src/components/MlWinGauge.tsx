import { useId } from 'react'

/** Compact circular win-probability indicator (Aurora / glass accent). */
export function MlWinGauge({ value }: { value: number }) {
  const gid = useId().replace(/:/g, '')
  const v = Math.max(0, Math.min(100, Math.round(value)))
  const r = 17
  const c = 2 * Math.PI * r
  const offset = c - (v / 100) * c
  return (
    <div
      className="relative flex h-10 w-10 shrink-0 items-center justify-center"
      title={`Win probability: ${v}%`}
    >
      <svg
        className="h-10 w-10 -rotate-90 drop-shadow-[0_0_10px_rgba(167,139,250,0.35)]"
        viewBox="0 0 40 40"
        aria-hidden
      >
        <defs>
          <linearGradient id={`mlg-${gid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c4b5fd" />
            <stop offset="55%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(148,163,184,0.28)" strokeWidth="3.5" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={`url(#mlg-${gid})`}
          strokeWidth="3.5"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="pointer-events-none absolute text-xs font-bold tabular-nums text-violet-950">{v}</span>
    </div>
  )
}

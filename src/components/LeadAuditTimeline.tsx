import type { AuditLog, AuditLogActionType } from '../types'

const ACTION_GLOW: Record<AuditLogActionType, string> = {
  STATUS_CHANGE: 'shadow-[0_0_14px_rgba(245,158,11,0.45)] ring-amber-400/60',
  REASSIGNMENT: 'shadow-[0_0_14px_rgba(168,85,247,0.5)] ring-violet-400/55',
  NOTE_ADDED: 'shadow-[0_0_14px_rgba(52,211,153,0.45)] ring-emerald-400/50',
  AI_RUN: 'shadow-[0_0_16px_rgba(244,114,182,0.5)] ring-fuchsia-400/55',
  SYSTEM_UPDATE: 'shadow-[0_0_12px_rgba(251,191,36,0.45)] ring-amber-400/50',
}

const ACTION_LABEL: Record<AuditLogActionType, string> = {
  STATUS_CHANGE: 'Trạng thái',
  REASSIGNMENT: 'Phân công',
  NOTE_ADDED: 'Ghi chú / tương tác',
  AI_RUN: 'AI',
  SYSTEM_UPDATE: 'Hệ thống',
}

function formatTs(log: AuditLog): string {
  try {
    return log.timestamp.toDate().toLocaleString('vi-VN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export function LeadAuditTimeline({
  entries,
  loading,
  error,
}: {
  entries: AuditLog[]
  loading: boolean
  error: string | null
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900 shadow-sm">
        {error}
        <p className="mt-2 text-sm text-rose-800">
          Nếu đây là lỗi index: tạo composite index <code className="rounded bg-rose-100 px-1">leadId</code> +{' '}
          <code className="rounded bg-rose-100 px-1">timestamp</code> trên collection{' '}
          <code className="rounded bg-rose-100 px-1">auditLogs</code>.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4">
            <div className="h-10 w-10 shrink-0 rounded-full border border-slate-200 bg-slate-100 ai-skeleton-shimmer" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-1/3 rounded bg-slate-200 ai-skeleton-shimmer" />
              <div className="h-3 w-full rounded bg-slate-200 ai-skeleton-shimmer" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!entries.length) {
    return (
      <p className="rounded-xl border border-slate-200/90 bg-white/80 px-4 py-8 text-center text-base text-slate-600 shadow-sm backdrop-blur-md">
        Chưa có nhật ký thao tác cho hồ sơ này. Các thao tác sau khi bật tính năng sẽ hiển thị tại đây.
      </p>
    )
  }

  return (
    <div className="relative pl-2">
      <div
        className="pointer-events-none absolute left-[21px] top-3 bottom-3 w-px bg-gradient-to-b from-amber-400/50 via-violet-400/35 to-fuchsia-500/40"
        aria-hidden
      />
      <ul className="space-y-0">
        {entries.map((log, idx) => {
          const glow =
            log.actionType in ACTION_GLOW ? ACTION_GLOW[log.actionType] : 'ring-slate-200 shadow-sm'
          return (
            <li key={log.id} className="relative flex gap-4 pb-8 last:pb-0">
              <div className="relative z-10 flex shrink-0 flex-col items-center pt-1">
                <span
                  className={[
                    'flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-gradient-to-br from-white to-sky-50 text-xs font-bold uppercase tracking-tight text-slate-800 ring-2',
                    glow,
                  ].join(' ')}
                >
                  {ACTION_LABEL[log.actionType]?.slice(0, 2) ?? '•'}
                </span>
              </div>
              <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm backdrop-blur-xl">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-900">
                    {ACTION_LABEL[log.actionType] ?? log.actionType}
                  </span>
                  <span>{formatTs(log)}</span>
                  {idx === 0 ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900">
                      Mới nhất
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-base leading-relaxed text-slate-800">{log.description}</p>
                <p className="mt-2 text-xs text-slate-600">
                  <span className="text-slate-500">Thực hiện:</span>{' '}
                  <span className="font-medium text-slate-900">{log.performedByName}</span>
                  <span className="ml-1 font-mono text-xs text-slate-600">({log.performedBy.slice(0, 8)}…)</span>
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

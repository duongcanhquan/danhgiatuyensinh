import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  BookOpen,
  GraduationCap,
  Loader2,
  MessageSquareText,
  Search,
  Send,
  X,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useKnowledgeDocuments } from '../hooks/useKnowledgeDocuments'
import { useKnowledgeCategories } from '../hooks/useKnowledgeCategories'
import { useConsultingPlaybooks } from '../hooks/useConsultingPlaybooks'
import { useScriptSnippets } from '../hooks/useScriptSnippets'
import { useOrgAiIntegration } from '../contexts/OrgAiIntegrationContext'
import { canAccessConsultingSkillLab, canChatInConsultingSkillLab } from '../auth/consultingSkillAccess'
import { callOpenAiCompatibleChat } from '../services/aiClient'
import { getAiIntegrationDiagnostics } from '../utils/aiEngine'
import { SETTINGS_AI_ADVISE_HREF } from '../utils/settingsNavigation'
import {
  buildSkillLabContextBlock,
  buildSkillLabSystemPrompt,
  collectSkillLabItems,
  filterSkillLabItems,
  pickSkillLabContext,
  skillLabStarterPrompts,
  trimChatTurns,
  type SkillLabKind,
  type SkillLabMode,
} from '../utils/consultingSkillLab'
import { canAccessSettingsPage } from '../auth/permissions'

type ChatTurn = { id: string; role: 'user' | 'assistant'; content: string }

const KIND_TABS: { id: SkillLabKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'knowledge', label: 'Tri thức' },
  { id: 'playbook', label: 'Mẫu tư vấn' },
  { id: 'snippet', label: 'Mảnh thoại' },
]

function newTurnId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function kindBadgeClass(kind: SkillLabKind): string {
  if (kind === 'knowledge') return 'bg-amber-100 text-amber-900'
  if (kind === 'playbook') return 'bg-sky-100 text-sky-900'
  return 'bg-emerald-100 text-emerald-900'
}

export function ConsultingSkillLabView() {
  const { can, permissions } = useAuth()
  const { orgConfig } = useOrgAiIntegration()
  const allowed = canAccessConsultingSkillLab(can)
  const canChat = canChatInConsultingSkillLab(can)
  const canOpenSettings = canAccessSettingsPage(permissions)

  const { documents, loading: docsLoading, error: docsError } = useKnowledgeDocuments()
  const { categories } = useKnowledgeCategories()
  const { playbooks, loading: pbLoading } = useConsultingPlaybooks()
  const { snippets, loading: snLoading } = useScriptSnippets()

  const [kind, setKind] = useState<SkillLabKind | 'all'>('all')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mode, setMode] = useState<SkillLabMode>('ask')
  const [mobilePane, setMobilePane] = useState<'library' | 'chat'>('chat')
  const [draft, setDraft] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [busy, setBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  const libraryLoading = docsLoading || pbLoading || snLoading
  const allItems = useMemo(
    () => collectSkillLabItems({ documents, playbooks, snippets, categories }),
    [documents, playbooks, snippets, categories],
  )
  const visible = useMemo(
    () => filterSkillLabItems(allItems, { kind, query }),
    [allItems, kind, query],
  )
  const selected = useMemo(
    () => allItems.find((i) => i.key === selectedKey) ?? null,
    [allItems, selectedKey],
  )
  const starters = useMemo(() => skillLabStarterPrompts(selected, mode), [selected, mode])
  const aiReady = Boolean(orgConfig?.apiKey?.trim() || getAiIntegrationDiagnostics().apiKeyPresent)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])

  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  if (!allowed) return <Navigate to="/leads" replace />

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return
    setMobilePane('chat')
    if (!canChat) {
      setChatError('Tài khoản chưa được bật quyền dùng AI. Liên hệ quản trị.')
      return
    }
    if (!aiReady) {
      setChatError(
        canOpenSettings
          ? 'Chưa có khóa AI. Vào Cài đặt → Tư vấn & AI → Máy AI để gắn khóa.'
          : 'Chưa có khóa AI. Nhờ quản trị gắn khóa trong Cài đặt → Máy AI.',
      )
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    const userTurn: ChatTurn = { id: newTurnId(), role: 'user', content: q }
    const history = trimChatTurns([...turns, userTurn], 10)
    setTurns(history)
    setDraft('')
    setChatError(null)
    setBusy(true)
    setMobilePane('chat')
    try {
      const ctxItems = pickSkillLabContext({ all: allItems, selected, userText: q })
      const context = buildSkillLabContextBlock(ctxItems)
      const system = buildSkillLabSystemPrompt({ mode, context })
      const messages = [
        { role: 'system' as const, content: system },
        ...history.map((t) => ({
          role: t.role,
          content: t.content,
        })),
      ]
      const reply = await callOpenAiCompatibleChat(messages, ac.signal)
      setTurns((prev) => [...prev, { id: newTurnId(), role: 'assistant', content: reply.trim() }])
    } catch (e) {
      if (ac.signal.aborted) return
      setChatError(e instanceof Error ? e.message : 'Không gọi được AI. Thử lại.')
    } finally {
      if (abortRef.current === ac) setBusy(false)
    }
  }

  const switchMode = (next: SkillLabMode) => {
    if (mode === next) return
    abortRef.current?.abort()
    setMode(next)
    setTurns([])
    setChatError(null)
    setBusy(false)
  }

  const libraryPane = (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col border-slate-200 bg-white lg:border-r" aria-label="Thư viện">
      <div className="shrink-0 space-y-2 border-b border-slate-100 px-3 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm ngành, học phí, mẫu thoại…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-300/50"
          />
        </label>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Nguồn">
          {KIND_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={kind === t.id}
              onClick={() => setKind(t.id)}
              className={[
                'rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                kind === t.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
        {docsError ? <p className="text-xs text-rose-700">{docsError}</p> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {libraryLoading ? <p className="px-3 py-4 text-xs text-slate-500">Đang tải kho…</p> : null}
        {!libraryLoading && visible.length === 0 ? (
          <p className="px-3 py-4 text-sm leading-relaxed text-slate-600">
            Không có mục khớp.
            {canOpenSettings ? (
              <>
                {' '}
                Quản trị nạp nội dung tại{' '}
                <Link to="/settings?tab=advise&sub=consulting" className="font-semibold text-amber-800 underline">
                  Tư vấn &amp; AI → Nạp nội dung
                </Link>
                .
              </>
            ) : (
              ' Nhờ quản trị nạp tri thức / mẫu thoại.'
            )}
          </p>
        ) : null}
        <ul className="divide-y divide-slate-100" role="listbox" aria-label="Kết quả">
          {visible.map((item) => {
            const active = item.key === selectedKey
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedKey(item.key)
                    setMobilePane('library')
                  }}
                  className={[
                    'w-full px-3 py-2.5 text-left transition',
                    active ? 'bg-amber-50' : 'bg-white hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium leading-snug text-slate-900">{item.title}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${kindBadgeClass(item.kind)}`}>
                      {item.kind === 'knowledge' ? 'TL' : item.kind === 'playbook' ? 'Mẫu' : 'Thoại'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">{item.categoryLabel}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {selected ? (
        <div className="max-h-[38%] shrink-0 overflow-y-auto border-t border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{selected.title}</p>
            <button
              type="button"
              className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-800"
              aria-label="Bỏ chọn"
              onClick={() => setSelectedKey(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{selected.body}</p>
          <button
            type="button"
            className="mt-2 text-xs font-semibold text-amber-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              setMobilePane('chat')
              void send(
                mode === 'roleplay'
                  ? `Tôi là phụ huynh, đang băn khoăn về: ${selected.title}.`
                  : `Tóm tắt «${selected.title}» thành lời gọi điện 45 giây.`,
              )
            }}
            disabled={busy}
          >
            Hỏi AI về mục này
          </button>
        </div>
      ) : null}
    </section>
  )

  const chatPane = (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-50" aria-label="Chat kỹ năng">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="Chế độ">
          <button
            type="button"
            onClick={() => switchMode('ask')}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-semibold',
              mode === 'ask' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
            ].join(' ')}
          >
            Hỏi đáp
          </button>
          <button
            type="button"
            onClick={() => switchMode('roleplay')}
            className={[
              'rounded-md px-2.5 py-1 text-xs font-semibold',
              mode === 'roleplay' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
            ].join(' ')}
          >
            Luyện thoại
          </button>
        </div>
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-500">
          {mode === 'roleplay'
            ? 'AI đóng vai khách. Bạn luyện câu như đang gọi.'
            : 'AI chỉ trả lời từ kho tri thức / mẫu đã duyệt.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {turns.length === 0 ? (
          <div className="mx-auto max-w-lg py-4">
            <p className="text-sm font-semibold text-slate-900">Bắt đầu từ một câu hỏi hoặc tình huống</p>
            <p className="mt-1 text-sm text-slate-600">
              Chọn tài liệu bên trái, hoặc bấm gợi ý. AI không bịa học phí / quy chế ngoài kho.
            </p>
            <ul className="mt-3 space-y-1.5">
              {starters.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    disabled={busy}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-amber-300 hover:bg-amber-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="mx-auto max-w-2xl space-y-3">
            <AnimatePresence initial={false}>
              {turns.map((t) => (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={t.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={[
                      'max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                      t.role === 'user'
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200/90 bg-white text-slate-800 shadow-sm',
                    ].join(' ')}
                  >
                    {t.content}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
            {busy ? (
              <li className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Đang soạn…
              </li>
            ) : null}
            <div ref={endRef} />
          </ul>
        )}
      </div>

      {chatError ? (
        <p className="shrink-0 border-t border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {chatError}{' '}
          {canOpenSettings && !aiReady ? (
            <Link to={SETTINGS_AI_ADVISE_HREF} className="font-semibold underline">
              Mở Máy AI
            </Link>
          ) : null}
        </p>
      ) : null}

      <form
        className="shrink-0 border-t border-slate-200 bg-white px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          void send(draft)
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(draft)
              }
            }}
            rows={2}
            placeholder={mode === 'roleplay' ? 'Câu bạn nói với khách…' : 'Hỏi về ngành, học phí, kịch bản…'}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-300/40"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-600 text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="Gửi"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </form>
    </section>
  )

  return (
    <div className="-mx-3 -my-3 flex min-h-[calc(100dvh-5.25rem)] flex-col bg-slate-100 sm:-mx-4 sm:-my-4 md:-mx-6 md:-my-5 lg:-mx-8">
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Kỹ năng tư vấn với AI</h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Tra cứu tài liệu đã duyệt, luyện hội thoại, hỏi đáp — không bịa ngoài kho tri thức.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 lg:hidden">
            <button
              type="button"
              onClick={() => setMobilePane('library')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                mobilePane === 'library' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              ].join(' ')}
            >
              <BookOpen className="h-3.5 w-3.5" aria-hidden />
              Thư viện
            </button>
            <button
              type="button"
              onClick={() => setMobilePane('chat')}
              className={[
                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold',
                mobilePane === 'chat' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
              ].join(' ')}
            >
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              Chat
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className={['min-h-0 w-full max-w-none flex-col lg:w-[min(24rem,38%)] lg:shrink-0', mobilePane === 'library' ? 'flex' : 'hidden lg:flex'].join(' ')}>
          {libraryPane}
        </div>
        <div className={['min-h-0 min-w-0 flex-1 flex-col', mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'].join(' ')}>
          {chatPane}
        </div>
      </div>
    </div>
  )
}

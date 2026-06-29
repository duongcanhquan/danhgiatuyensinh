import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CallEvalDimension, Interaction } from '../types'
import type { EvaluationSelections } from '../utils/callSessionEvaluation'

export type CallSessionDraft = {
  selections: EvaluationSelections
  freeNote: string
  callOutcome: NonNullable<Interaction['callOutcome']>
}

const EMPTY: CallSessionDraft = {
  selections: {},
  freeNote: '',
  callOutcome: 'CONNECTED',
}

type Ctx = {
  callUid: string | null
  draft: CallSessionDraft
  setCallUid: (uid: string | null) => void
  toggleOption: (dimension: CallEvalDimension, optionId: string) => void
  isOptionSelected: (dimensionId: string, optionId: string) => boolean
  setFreeNote: (note: string) => void
  setCallOutcome: (outcome: NonNullable<Interaction['callOutcome']>) => void
  resetDraft: () => void
}

const CallSessionDraftContext = createContext<Ctx | null>(null)

export function CallSessionDraftProvider({ children }: { children: ReactNode }) {
  const [callUid, setCallUidState] = useState<string | null>(null)
  const [draft, setDraft] = useState<CallSessionDraft>(EMPTY)

  const setCallUid = useCallback((uid: string | null) => {
    setCallUidState(uid)
    setDraft(EMPTY)
  }, [])

  const resetDraft = useCallback(() => {
    setDraft(EMPTY)
    setCallUidState(null)
  }, [])

  const toggleOption = useCallback((dimension: CallEvalDimension, optionId: string) => {
    setDraft((prev) => {
      const current = prev.selections[dimension.id] ?? []
      if (dimension.selectionMode === 'single') {
        const next = current[0] === optionId ? [] : [optionId]
        return { ...prev, selections: { ...prev.selections, [dimension.id]: next } }
      }
      const exists = current.includes(optionId)
      const next = exists ? current.filter((id) => id !== optionId) : [...current, optionId]
      return { ...prev, selections: { ...prev.selections, [dimension.id]: next } }
    })
  }, [])

  const isOptionSelected = useCallback(
    (dimensionId: string, optionId: string) => (draft.selections[dimensionId] ?? []).includes(optionId),
    [draft.selections],
  )

  const setFreeNote = useCallback((freeNote: string) => {
    setDraft((prev) => ({ ...prev, freeNote }))
  }, [])

  const setCallOutcome = useCallback((callOutcome: NonNullable<Interaction['callOutcome']>) => {
    setDraft((prev) => ({ ...prev, callOutcome }))
  }, [])

  const value = useMemo(
    () => ({
      callUid,
      draft,
      setCallUid,
      toggleOption,
      isOptionSelected,
      setFreeNote,
      setCallOutcome,
      resetDraft,
    }),
    [callUid, draft, setCallUid, toggleOption, isOptionSelected, setFreeNote, setCallOutcome, resetDraft],
  )

  return <CallSessionDraftContext.Provider value={value}>{children}</CallSessionDraftContext.Provider>
}

export function useCallSessionDraft(): Ctx {
  const ctx = useContext(CallSessionDraftContext)
  if (!ctx) throw new Error('useCallSessionDraft phải dùng trong CallSessionDraftProvider')
  return ctx
}

export function useCallSessionDraftOptional(): Ctx | null {
  return useContext(CallSessionDraftContext)
}

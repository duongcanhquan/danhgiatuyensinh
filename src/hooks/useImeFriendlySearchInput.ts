import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'

/**
 * Ô tìm thân thiện bộ gõ IME (Telex/VNI): giữ bản nháp local, không commit khi đang composition,
 * debounce khi gõ Latin / sau khi kết thúc dấu.
 */
export function useImeFriendlySearchInput(
  committedValue: string,
  onCommit: (value: string) => void,
  debounceMs = 320,
) {
  const [draft, setDraft] = useState(committedValue)
  const composingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCommitRef = useRef(onCommit)
  const lastCommittedRef = useRef(committedValue)
  onCommitRef.current = onCommit

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearTimer()
  }, [])

  // Chỉ nhận thay đổi từ ngoài (xóa lọc, back/forward) — không ghi đè nháp đang gõ.
  useEffect(() => {
    if (composingRef.current) return
    if (committedValue === lastCommittedRef.current) return
    lastCommittedRef.current = committedValue
    setDraft(committedValue)
  }, [committedValue])

  const commit = useCallback((value: string) => {
    clearTimer()
    lastCommittedRef.current = value
    onCommitRef.current(value)
  }, [])

  const scheduleCommit = useCallback(
    (value: string) => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        lastCommittedRef.current = value
        onCommitRef.current(value)
      }, debounceMs)
    },
    [debounceMs],
  )

  const onChange = useCallback(
    (value: string) => {
      setDraft(value)
      if (composingRef.current) return
      scheduleCommit(value)
    },
    [scheduleCommit],
  )

  const onCompositionStart = useCallback(() => {
    composingRef.current = true
    clearTimer()
  }, [])

  const onCompositionEnd = useCallback(
    (e: CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false
      const v = e.currentTarget.value
      setDraft(v)
      commit(v)
    },
    [commit],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      if (e.nativeEvent.isComposing || composingRef.current) return
      e.preventDefault()
      commit(draft)
    },
    [commit, draft],
  )

  const onBlur = useCallback(
    (_e: FocusEvent<HTMLInputElement>) => {
      if (!composingRef.current) commit(draft)
    },
    [commit, draft],
  )

  return {
    value: draft,
    onChange,
    onCompositionStart,
    onCompositionEnd,
    onKeyDown,
    onBlur,
  }
}

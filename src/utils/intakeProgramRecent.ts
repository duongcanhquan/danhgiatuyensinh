/** Gợi ý chương trình gần đây khi nhập / gán hàng loạt (localStorage theo trình duyệt). */

const STORAGE_KEY = 'vietmy.intakePrograms.v1'
const MAX = 24

export function normalizeIntakeProgramLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120)
}

export function loadRecentIntakePrograms(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((x): x is string => typeof x === 'string')
      .map(normalizeIntakeProgramLabel)
      .filter(Boolean)
      .slice(0, MAX)
  } catch {
    return []
  }
}

export function rememberIntakeProgram(label: string): string[] {
  const name = normalizeIntakeProgramLabel(label)
  if (!name) return loadRecentIntakePrograms()
  const prev = loadRecentIntakePrograms().filter((x) => x.toLowerCase() !== name.toLowerCase())
  const next = [name, ...prev].slice(0, MAX)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}

/** So khớp nhãn chương trình (không phân biệt hoa/thường) — lọc client. */
export function intakeProgramsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  const left = normalizeIntakeProgramLabel(a ?? '')
  const right = normalizeIntakeProgramLabel(b ?? '')
  if (!left && !right) return true
  if (!left || !right) return false
  return left.toLowerCase() === right.toLowerCase()
}

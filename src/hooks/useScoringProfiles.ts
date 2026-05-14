import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, Timestamp } from 'firebase/firestore'
import type {
  ProfileScoringCondition,
  RuleCategory,
  ScoringProfile,
  ScoringRule,
  ScoringRuleAllocationKind,
  ScoringRuleBlock,
  ScoringRuleConditionRow,
} from '../types'
import { FS_COLLECTIONS, RULE_CATEGORIES } from '../types'
import { getFirestoreDb, isFirebaseConfigured } from '../services/firebase'
import { inferRuleCategory, legacyRulesToBlocks } from '../utils/scoring'

const CONDITIONS: ProfileScoringCondition[] = [
  'EQUALS',
  'CONTAINS',
  'IS_NOT_EMPTY',
  'IN_LIST',
  'PHONE_VN_10_DIGITS',
  'PHONE_VN_NOT_10_DIGITS',
]

function mapEmbeddedRule(raw: unknown, index: number): ScoringRule | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const c = o.condition as string
  if (!CONDITIONS.includes(c as ProfileScoringCondition)) return null
  const id = String(o.id ?? `rule-${index}`)
  const targetField = String(o.targetField ?? '')
  if (!targetField) return null
  const points = Number(o.points ?? 0)
  let value: string | string[] = ''
  if (c === 'IN_LIST' && Array.isArray(o.value)) {
    value = o.value.map((x) => String(x))
  } else if (o.value !== undefined && o.value !== null) {
    value = o.value as string | string[]
  }
  return {
    id,
    targetField,
    condition: c as ProfileScoringCondition,
    value,
    points: Number.isFinite(points) ? points : 0,
  }
}

function mapConditionRow(raw: unknown, index: number): ScoringRuleConditionRow | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const c = o.condition as string
  if (!CONDITIONS.includes(c as ProfileScoringCondition)) return null
  const id = String(o.id ?? `row-${index}`)
  let value: string | string[] = ''
  if (c === 'IN_LIST' && Array.isArray(o.value)) {
    value = o.value.map((x) => String(x))
  } else if (o.value !== undefined && o.value !== null) {
    value = o.value as string | string[]
  }
  const kindRaw = o.allocationKind as string
  const allocationKind: ScoringRuleAllocationKind =
    kindRaw === 'percent_of_max' || kindRaw === 'absolute' ? kindRaw : 'absolute'
  const allocationValue = Number(
    o.allocationValue ?? o.allocatedPoints ?? (typeof o.points === 'number' ? o.points : 0) ?? 0,
  )
  return {
    id,
    condition: c as ProfileScoringCondition,
    value,
    allocationKind,
    allocationValue: Number.isFinite(allocationValue) ? allocationValue : 0,
  }
}

function mapScoringRuleBlock(raw: unknown, index: number): ScoringRuleBlock | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = String(o.id ?? `block-${index}`)
  const targetField = String(o.targetField ?? '')
  if (!targetField) return null
  const catRaw = String(o.category ?? '')
  const category: RuleCategory = (RULE_CATEGORIES as readonly string[]).includes(catRaw)
    ? (catRaw as RuleCategory)
    : inferRuleCategory(targetField)
  const label = String(o.label ?? targetField)
  const maxWeight = Number(o.maxWeight ?? 0)
  const rowsRaw = o.rows
  const rows: ScoringRuleConditionRow[] = []
  if (Array.isArray(rowsRaw)) {
    rowsRaw.forEach((r, i) => {
      const m = mapConditionRow(r, i)
      if (m) rows.push(m)
    })
  }
  return {
    id,
    category,
    label,
    targetField,
    maxWeight: Number.isFinite(maxWeight) ? maxWeight : 0,
    rows,
  }
}

function mapRuleBlocksArray(raw: unknown): ScoringRuleBlock[] {
  if (!Array.isArray(raw)) return []
  const out: ScoringRuleBlock[] = []
  raw.forEach((b, i) => {
    const m = mapScoringRuleBlock(b, i)
    if (m) out.push(m)
  })
  return out
}

function mapProfile(id: string, data: Record<string, unknown>): ScoringProfile | null {
  try {
    const now = Timestamp.now()
    const rulesRaw = data.rules
    const rules: ScoringRule[] = []
    if (Array.isArray(rulesRaw)) {
      rulesRaw.forEach((r, i) => {
        const m = mapEmbeddedRule(r, i)
        if (m) rules.push(m)
      })
    }
    let ruleBlocks = mapRuleBlocksArray(data.ruleBlocks)
    if (!ruleBlocks.length && rules.length) {
      ruleBlocks = legacyRulesToBlocks(rules)
    }
    const th = data.thresholds as Record<string, unknown> | undefined
    const hotMinScore = Number(th?.hotMinScore ?? 80)
    const warmMinScore = Number(th?.warmMinScore ?? 50)
    return {
      id,
      profileName: String(data.profileName ?? 'Chưa đặt tên'),
      description: String(data.description ?? ''),
      rules,
      ruleBlocks,
      thresholds: {
        hotMinScore: Number.isFinite(hotMinScore) ? hotMinScore : 80,
        warmMinScore: Number.isFinite(warmMinScore) ? warmMinScore : 50,
      },
      isDefaultForImport: Boolean(data.isDefaultForImport),
      createdAt: (data.createdAt as Timestamp) ?? now,
      updatedAt: (data.updatedAt as Timestamp) ?? now,
      createdBy: data.createdBy ? String(data.createdBy) : undefined,
    }
  } catch {
    return null
  }
}

/** Profile dùng khi import Excel: cờ mặc định, không có thì profile đầu tiên */
export function pickProfileForImport(profiles: ScoringProfile[]): ScoringProfile | null {
  const def = profiles.find((p) => p.isDefaultForImport)
  if (def) return def
  return profiles[0] ?? null
}

/** Real-time `scoringProfiles`. */
export function useScoringProfiles() {
  const [profiles, setProfiles] = useState<ScoringProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configured = useMemo(() => isFirebaseConfigured(), [])

  useEffect(() => {
    const firestore = getFirestoreDb()
    if (!firestore) {
      queueMicrotask(() => {
        setProfiles([])
        setLoading(false)
        setError(
          configured ? null : 'Chưa cấu hình Firebase. Không thể tải scoring profiles.',
        )
      })
      return
    }

    const q = query(collection(firestore, FS_COLLECTIONS.scoringProfiles))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: ScoringProfile[] = []
        snap.forEach((d) => {
          const p = mapProfile(d.id, d.data() as Record<string, unknown>)
          if (p) next.push(p)
        })
        next.sort((a, b) => a.profileName.localeCompare(b.profileName, 'vi'))
        setProfiles(next)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(err)
        setError(err.message || 'Lỗi đọc scoringProfiles')
        setLoading(false)
      },
    )
    return () => unsub()
  }, [configured])

  return { profiles, loading, error, configured }
}

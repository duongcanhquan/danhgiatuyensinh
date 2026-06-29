import { useEffect, useRef } from 'react'
import type { Firestore } from 'firebase/firestore'
import type { Lead, ProfileCustomScoringSignal, ScoringProfile, VietMyUserProfile } from '../types'
import type { LeadScorePreview } from './useLeadScoring'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import type { LeadClassificationRuntime } from '../utils/leadClassificationConfig'
import { persistLeadRescoresToFirestore, rescoreLeadList } from '../utils/bulkLeadRescore'
import type { MasterDataBuckets } from '../utils/scoring'
import { profileHasActiveRules } from '../utils/scoringProfileUtils'

const AUTO_SYNC_DEBOUNCE_MS = 1200
const AUTO_SYNC_MAX_LEADS = 80

export type UseAutoPersistLeadScoresOptions = {
  db: Firestore | null
  user: VietMyUserProfile | null
  activeScoringProfile: ScoringProfile | null
  leads: Lead[]
  scoreByLeadId: Map<string, LeadScorePreview>
  masterBuckets?: MasterDataBuckets
  schoolTvvSignalDefs?: ProfileCustomScoringSignal[] | null
  infoScoreRuntime?: InfoScoreRuntime | null
  classificationRuntime?: LeadClassificationRuntime | null
  applyLocalLeadPatch: (id: string, patch: Partial<Lead>) => void
  /** Admin / quản lý: tự chạy tính lại toàn phạm vi một lần mỗi phiên khi phát hiện lệch điểm. */
  onRequestFullRescore?: () => void
  enabled?: boolean
}

/**
 * Tự ghi điểm/nhãn lên Firestore khi dữ liệu hồ sơ đã đủ nhưng `calculatedScore` cũ (0 hoặc lệch profile).
 * Tránh bắt TVV mở từng hồ sơ và bấm Lưu chỉ để chấm lại.
 */
export function useAutoPersistLeadScores(opts: UseAutoPersistLeadScoresOptions): void {
  const {
    db,
    user,
    activeScoringProfile,
    leads,
    scoreByLeadId,
    masterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime,
    applyLocalLeadPatch,
    onRequestFullRescore,
    enabled = true,
  } = opts

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)
  const fullRescorePromptedRef = useRef<string | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!enabled || !db || !user || !activeScoringProfile || !profileHasActiveRules(activeScoringProfile)) {
      return
    }

    debounceRef.current = setTimeout(() => {
      if (syncingRef.current) return

      const mismatched: Lead[] = []
      for (const l of leads) {
        const ev = scoreByLeadId.get(l.id)
        if (!ev) continue
        if (ev.calculatedScore !== l.calculatedScore || ev.priorityTag !== l.priorityTag) {
          mismatched.push(l)
        }
      }
      if (!mismatched.length) return

      const profileKey = `${activeScoringProfile.id}:${activeScoringProfile.updatedAt?.toMillis?.() ?? '0'}`
      const mismatchRatio = mismatched.length / Math.max(1, leads.length)
      if (
        onRequestFullRescore &&
        mismatchRatio >= 0.35 &&
        fullRescorePromptedRef.current !== profileKey &&
        leads.length >= 10
      ) {
        fullRescorePromptedRef.current = profileKey
        onRequestFullRescore()
        return
      }

      const batch = mismatched.slice(0, AUTO_SYNC_MAX_LEADS)
      syncingRef.current = true
      void (async () => {
        try {
          const results = rescoreLeadList(
            batch,
            activeScoringProfile,
            masterBuckets,
            schoolTvvSignalDefs,
            infoScoreRuntime,
            classificationRuntime?.enabled ? classificationRuntime : null,
          )
          await persistLeadRescoresToFirestore(db, results)
          for (const r of results) {
            if (!r.changed) continue
            applyLocalLeadPatch(r.leadId, {
              calculatedScore: r.calculatedScore,
              priorityTag: r.priorityTag,
              ...(r.leadScoreProfilePart !== undefined ? { leadScoreProfilePart: r.leadScoreProfilePart } : {}),
              ...(r.leadScoreEngagementPart !== undefined
                ? { leadScoreEngagementPart: r.leadScoreEngagementPart }
                : {}),
            })
          }
        } catch (e) {
          console.error('autoPersistLeadScores', e)
        } finally {
          syncingRef.current = false
        }
      })()
    }, AUTO_SYNC_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [
    enabled,
    db,
    user,
    activeScoringProfile,
    leads,
    scoreByLeadId,
    masterBuckets,
    schoolTvvSignalDefs,
    infoScoreRuntime,
    classificationRuntime,
    applyLocalLeadPatch,
    onRequestFullRescore,
  ])
}

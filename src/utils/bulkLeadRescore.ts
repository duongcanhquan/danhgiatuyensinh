import { doc, writeBatch, type Firestore } from 'firebase/firestore'
import type { Lead, PriorityTag, ProfileCustomScoringSignal, ScoringProfile } from '../types'
import { FS_COLLECTIONS } from '../types'
import { evaluateLead, leadToEvaluationRecord, type MasterDataBuckets } from './scoring'
import type { InfoScoreRuntime } from './infoScoreRules'
import type { LeadClassificationRuntime } from './leadClassificationConfig'
import { evaluateLeadWithClassification } from './leadClassificationScore'

export type RescoreLeadResult = {
  leadId: string
  calculatedScore: number
  priorityTag: PriorityTag
  leadScoreProfilePart?: number
  leadScoreEngagementPart?: number
  changed: boolean
}

export function computeLeadScoringResult(
  lead: Lead,
  profile: ScoringProfile,
  buckets?: MasterDataBuckets,
  schoolDefs?: ProfileCustomScoringSignal[] | null,
  infoScoreRuntime?: InfoScoreRuntime | null,
  classificationRuntime?: LeadClassificationRuntime | null,
): RescoreLeadResult {
  if (classificationRuntime?.enabled) {
    const r = evaluateLeadWithClassification(lead, profile, classificationRuntime, buckets, schoolDefs, {
      infoScoreRuntime,
    })
    const changed =
      lead.calculatedScore !== r.compositeScore ||
      lead.priorityTag !== r.priorityTag ||
      lead.leadScoreProfilePart !== r.profilePart ||
      lead.leadScoreEngagementPart !== r.engagementPart
    return {
      leadId: lead.id,
      calculatedScore: r.compositeScore,
      priorityTag: r.priorityTag,
      leadScoreProfilePart: r.profilePart,
      leadScoreEngagementPart: r.engagementPart,
      changed,
    }
  }

  const rec = leadToEvaluationRecord(lead)
  delete rec.calculatedScore
  delete rec.priorityTag
  const ev = evaluateLead(rec, profile, buckets, schoolDefs, {
    lead,
    infoScoreRuntime,
    includeAuxScores: true,
  })
  const changed = lead.calculatedScore !== ev.calculatedScore || lead.priorityTag !== ev.priorityTag
  return { leadId: lead.id, calculatedScore: ev.calculatedScore, priorityTag: ev.priorityTag, changed }
}

export function rescoreLeadList(
  leads: Lead[],
  profile: ScoringProfile,
  buckets?: MasterDataBuckets,
  schoolDefs?: ProfileCustomScoringSignal[] | null,
  infoScoreRuntime?: InfoScoreRuntime | null,
  classificationRuntime?: LeadClassificationRuntime | null,
): RescoreLeadResult[] {
  return leads.map((lead) =>
    computeLeadScoringResult(lead, profile, buckets, schoolDefs, infoScoreRuntime, classificationRuntime),
  )
}

const FIRESTORE_BATCH_LIMIT = 450

/** Ghi điểm/nhãn mới lên Firestore (chỉ hồ sơ có thay đổi). */
export async function persistLeadRescoresToFirestore(
  db: Firestore,
  results: RescoreLeadResult[],
): Promise<number> {
  const toWrite = results.filter((r) => r.changed)
  if (!toWrite.length) return 0

  let batch = writeBatch(db)
  let ops = 0
  let written = 0

  for (const r of toWrite) {
    const payload: Record<string, unknown> = {
      calculatedScore: r.calculatedScore,
      priorityTag: r.priorityTag,
    }
    if (r.leadScoreProfilePart !== undefined) payload.leadScoreProfilePart = r.leadScoreProfilePart
    if (r.leadScoreEngagementPart !== undefined) payload.leadScoreEngagementPart = r.leadScoreEngagementPart
    batch.update(doc(db, FS_COLLECTIONS.leads, r.leadId), payload)
    ops++
    written++
    if (ops >= FIRESTORE_BATCH_LIMIT) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops) await batch.commit()
  return written
}

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore'
import type {
  CallAiAssessment,
  CallEvalPick,
  Interaction,
  Lead,
  PriorityTag,
  ProfileCustomScoringSignal,
  ScoringProfile,
  UserRole,
  VietMyUserProfile,
} from '../types'
import { FS_COLLECTIONS } from '../types'
import { commitAuditLog } from './auditLog'
import { runCallSessionAiAnalysis } from '../utils/callSessionAiAnalysis'
import {
  composeEvaluationCounselorNote,
  evaluationRecordFromPicks,
  formatEvaluationSummaryLine,
  picksToLegacyTags,
} from '../utils/callSessionEvaluation'
import type { AIIntegrationConfig } from '../types'
import { behaviorScoreFromPicks } from '../utils/callSessionBehaviorScore'
import { mergeCallEvalPriorityBoost } from '../utils/callSessionPriorityFromEvaluation'
import { leadTouchPatch } from '../utils/leadTouch'
import { mapDoc } from '../hooks/useLeads'
import { persistedLeadScoringFields, type MasterDataBuckets } from '../utils/scoring'
import type { InfoScoreRuntime } from '../utils/infoScoreRules'
import type { LeadClassificationRuntime } from '../utils/leadClassificationConfig'

function mapLeadFromSnap(id: string, data: Record<string, unknown>): Lead {
  const mapped = mapDoc(id, data)
  if (mapped) return mapped
  const ts = (data.updatedAt as Lead['updatedAt']) ?? Timestamp.now()
  const created = (data.createdAt as Lead['createdAt']) ?? ts
  return {
    id,
    customerId: String(data.customerId ?? id),
    fullName: String(data.fullName ?? ''),
    phone: String(data.phone ?? ''),
    parentPhone: String(data.parentPhone ?? ''),
    source: String(data.source ?? ''),
    educationLevel: String(data.educationLevel ?? ''),
    assignedTo: (data.assignedTo as Lead['assignedTo']) ?? null,
    status: (data.status as Lead['status']) ?? 'NEW',
    description: String(data.description ?? ''),
    highSchool: String(data.highSchool ?? ''),
    gradeClass: String(data.gradeClass ?? ''),
    province: String(data.province ?? ''),
    address: String(data.address ?? ''),
    calculatedScore: Number(data.calculatedScore ?? 0),
    priorityTag: (data.priorityTag as PriorityTag) ?? 'COLD',
    callEvalPriorityBoost: data.callEvalPriorityBoost as Lead['callEvalPriorityBoost'],
    uploadedAt: (data.uploadedAt as Lead['uploadedAt']) ?? created,
    updatedAt: ts,
    pipelineStatus: (data.pipelineStatus as Lead['pipelineStatus']) ?? 'NEW',
    uniqueHash: String(data.uniqueHash ?? id),
    createdAt: created,
  }
}

export type SaveCallSessionInput = {
  leadId: string
  callUid: string
  evaluationPicks: CallEvalPick[]
  freeNote: string
  callOutcome: NonNullable<Interaction['callOutcome']>
  durationSeconds?: number
  direction?: 'inbound' | 'outbound'
  phone?: string
  runAi: boolean
  aiConfig: AIIntegrationConfig | null
  institutionalRagBlock?: string
  scoring?: {
    profile: ScoringProfile | null
    masterBuckets?: MasterDataBuckets
    schoolDefs?: ProfileCustomScoringSignal[] | null
    infoScoreRuntime?: InfoScoreRuntime | null
    classificationRuntime?: LeadClassificationRuntime | null
  }
}

export type SaveCallSessionResult = {
  interactionId: string
  counselorNote: string
  callAiAssessment?: CallAiAssessment
}

export async function saveCallSessionInteraction(
  db: Firestore,
  profile: Pick<VietMyUserProfile, 'id' | 'role' | 'displayName' | 'email'>,
  input: SaveCallSessionInput,
): Promise<SaveCallSessionResult> {
  const leadRef = doc(db, FS_COLLECTIONS.leads, input.leadId)
  const leadSnap = await getDoc(leadRef)
  if (!leadSnap.exists()) throw new Error('Không tìm thấy hồ sơ.')
  const leadData = leadSnap.data() as Record<string, unknown>
  const lead = mapLeadFromSnap(leadSnap.id, leadData)

  const picks = input.evaluationPicks
  const legacyTags = picksToLegacyTags(picks)
  const counselorNote = composeEvaluationCounselorNote(picks, input.freeNote)
  const evaluationRecord = evaluationRecordFromPicks(picks)
  evaluationRecord.evaluatedAt = Timestamp.now()
  const sub = collection(db, FS_COLLECTIONS.leads, input.leadId, FS_COLLECTIONS.interactions)

  let interactionId: string | null = null
  if (input.callUid) {
    const dup = await getDocs(query(sub, where('providerCallId', '==', input.callUid), limit(1)))
    if (!dup.empty) interactionId = dup.docs[0]!.id
  }

  const snapCrm = lead.status
  const snapPipe = lead.pipelineStatus
  const snapTag = lead.priorityTag

  let callAiAssessment: CallAiAssessment | undefined
  if (input.runAi && input.aiConfig?.apiKey?.trim()) {
    callAiAssessment = await runCallSessionAiAnalysis(input.aiConfig, {
      lead,
      counselorNote,
      evaluationPicks: picks,
      callMeta: {
        durationSec: input.durationSeconds,
        outcome: input.callOutcome,
        direction: input.direction,
        phone: input.phone,
      },
      institutionalRagBlock: input.institutionalRagBlock,
    })
  }

  const payload: Record<string, unknown> = {
    leadId: input.leadId,
    channel: 'CALL',
    authorUid: profile.id,
    authorRole: profile.role as UserRole,
    timestamp: Timestamp.now(),
    counselorNote,
    callOutcome: input.callOutcome,
    callSessionTags: legacyTags,
    callSessionEvaluation: evaluationRecord,
    snapshotCrmStatus: snapCrm,
    snapshotPipelineStatus: snapPipe,
    snapshotPriorityTag: snapTag,
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    ...(input.callUid ? { provider: 'OMICALL', providerCallId: input.callUid, syncedFrom: 'sdk' } : {}),
    ...(callAiAssessment ? { callAiAssessment } : {}),
  }

  if (interactionId) {
    await updateDoc(doc(sub, interactionId), payload)
  } else {
    const ref = await addDoc(sub, payload)
    interactionId = ref.id
  }

  const touch = leadTouchPatch()
  const leadPatch: Record<string, unknown> = { ...touch }
  const evalLine = formatEvaluationSummaryLine(picks)
  const readinessFromEval = picks.find((p) => p.dimensionId === 'readiness')?.optionLabel
  if (callAiAssessment) {
    leadPatch.aiSentimentScore = callAiAssessment.diemCamXuc
    leadPatch.lastCallAiSummary = callAiAssessment.tomTatCuocGoi.trim().slice(0, 500)
    leadPatch.lastCallAiReadiness = callAiAssessment.mucDoSanSang.trim().slice(0, 64)
    leadPatch.lastCallAiAt = callAiAssessment.analyzedAt
    if (callAiAssessment.hanhDongTiepTheo.trim()) {
      leadPatch.recommendedAction = callAiAssessment.hanhDongTiepTheo.trim().slice(0, 4000)
    }
  } else if (evalLine) {
    leadPatch.lastCallAiSummary = evalLine.slice(0, 500)
    leadPatch.lastCallAiReadiness = readinessFromEval?.slice(0, 64)
    leadPatch.lastCallAiAt = Timestamp.now()
  }

  const { behaviorScore } = behaviorScoreFromPicks(picks)
  if (picks.some((p) => typeof p.points === 'number')) {
    leadPatch.lastCallBehaviorScore = behaviorScore
  }
  const enrollPick = picks.find((p) => p.dimensionId === 'enrollment_signal')
  const readyPick = picks.find((p) => p.dimensionId === 'readiness')
  if (enrollPick) leadPatch.lastCallEnrollmentSignalId = enrollPick.optionId
  if (readyPick) leadPatch.lastCallReadinessId = readyPick.optionId

  const boostDelta = mergeCallEvalPriorityBoost(lead.callEvalPriorityBoost, picks)
  if (boostDelta) {
    leadPatch.callEvalPriorityBoost = boostDelta
    leadPatch.callEvalPriorityBoostAt = Timestamp.now()
    const signalLabel = enrollPick?.optionLabel
    if (signalLabel) {
      const hint = `Ưu tiên sau gọi: ${signalLabel} (boost ${boostDelta}).`
      const prevAction = String((leadSnap.data() as Record<string, unknown>).recommendedAction ?? '').trim()
      if (!prevAction.includes('Ưu tiên sau gọi:')) {
        leadPatch.recommendedAction = hint.slice(0, 4000)
      }
    }
  }

  if (input.scoring?.profile) {
    const scoreFields = persistedLeadScoringFields(
      lead,
      leadPatch as Partial<Lead>,
      input.scoring.profile,
      input.scoring.masterBuckets,
      input.scoring.schoolDefs,
      {
        infoScoreRuntime: input.scoring.infoScoreRuntime,
        includeAuxScores: true,
        classificationRuntime: input.scoring.classificationRuntime?.enabled
          ? input.scoring.classificationRuntime
          : null,
      },
    )
    Object.assign(leadPatch, scoreFields)
  }

  await updateDoc(leadRef, leadPatch)

  const performer = profile.displayName?.trim() || profile.email || profile.id
  await commitAuditLog(db, {
    leadId: input.leadId,
    actionType: callAiAssessment ? 'AI_RUN' : 'NOTE_ADDED',
    description: callAiAssessment
      ? `Đánh giá cuộc gọi + AI (${picks.length} mục)`
      : `Đánh giá cuộc gọi (${picks.length} mục)`,
    performedBy: profile.id,
    performedByName: performer,
  })

  return {
    interactionId,
    counselorNote,
    callAiAssessment,
  }
}

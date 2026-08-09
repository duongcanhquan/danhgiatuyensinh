import type { Firestore } from 'firebase/firestore'
import type { OmicallCallTarget, OmicallCallUserData, VietMyUserProfile } from '../types'
import { formatCallDuration } from '../utils/omicallCallMap'
import { logOmicallInteraction } from './logOmicallInteraction'
import { reportOmicallCallFromClient } from './reportOmicallCallFromClient'
import { upsertOmicallCallFromClient } from './upsertOmicallCallFromClient'
import type { OmicallCallData } from './omicallSdk'

export type FinalizeOmicallInput = {
  callUid: string
  callUuid?: string
  leadId: string
  phone: string
  target?: OmicallCallTarget
  counselorUid?: string
  orgId?: string
  direction?: 'inbound' | 'outbound'
  billSeconds?: number
  /** Đầu số gọi ra (hotline). */
  sipNumber?: string
  /** Số nội bộ SIP của TVV — map lịch sử / KPI. */
  sipUser?: string
  userDataJson?: string
}

export function buildEndedOmicallData(input: FinalizeOmicallInput): OmicallCallData {
  const bill = Math.max(0, Math.floor(input.billSeconds ?? 0))
  const meta: OmicallCallUserData = {
    leadId: input.leadId,
    phone: input.phone,
    target: input.target ?? 'student',
    counselorUid: input.counselorUid,
  }
  return {
    uid: input.callUid,
    uuid: input.callUuid ?? input.callUid,
    state: 'ended',
    direction: input.direction === 'inbound' ? 'inbound' : 'outbound',
    remoteNumber: input.phone,
    displayNumber: input.phone,
    userData: input.userDataJson ?? JSON.stringify(meta),
    callingDuration: bill > 0 ? { value: bill, text: formatCallDuration(bill) } : undefined,
    sipNumber: input.sipNumber ? { number: input.sipNumber } : undefined,
  }
}

/** Ghi interaction + omicallCalls/KPI — dùng khi SDK `ended`, dập máy, hoặc webhook Firestore (click2call). */
export async function finalizeOmicallCallLogging(
  db: Firestore,
  profile: Pick<VietMyUserProfile, 'id' | 'role' | 'displayName' | 'omicallSipUser'>,
  input: FinalizeOmicallInput,
): Promise<{ leadId: string } | null> {
  const call = buildEndedOmicallData(input)
  const logged = await logOmicallInteraction(db, call, profile)

  // 1) Ghi omicallCalls ngay trên client — Lịch sử cuộc gọi không phụ thuộc webhook/CF.
  try {
    await upsertOmicallCallFromClient(db, {
      transactionId: input.callUid,
      callUuid: input.callUuid ?? input.callUid,
      leadId: input.leadId,
      phone: input.phone,
      counselorUid: input.counselorUid || profile.id,
      orgId: input.orgId,
      target: input.target,
      direction: input.direction === 'inbound' ? 'inbound' : 'outbound',
      billSeconds: input.billSeconds,
      hotline: input.sipNumber,
      sipUser: input.sipUser || profile.omicallSipUser,
    })
  } catch (e) {
    console.warn('[OMICall] upsert omicallCalls client', e)
  }

  // 2) CF bổ sung KPI / merge webhook — lỗi không chặn đã ghi ở trên.
  try {
    await reportOmicallCallFromClient(call, {
      leadId: input.leadId,
      phone: input.phone,
      target: input.target,
      sipUser: input.sipUser || profile.omicallSipUser,
    })
  } catch (e) {
    console.warn('[OMICall] report KPI', e)
  }
  return logged
}

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

  // 1) omicallCalls — bắt buộc với uid thật; lỗi → throw để caller giữ snapshot retry.
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

  // 2) CF bổ sung KPI / merge webhook — best-effort.
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

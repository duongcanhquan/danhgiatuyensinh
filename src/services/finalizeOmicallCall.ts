import type { Firestore } from 'firebase/firestore'
import type { OmicallCallTarget, OmicallCallUserData, VietMyUserProfile } from '../types'
import { formatCallDuration } from '../utils/omicallCallMap'
import { logOmicallInteraction } from './logOmicallInteraction'
import { reportOmicallCallFromClient } from './reportOmicallCallFromClient'
import type { OmicallCallData } from './omicallSdk'

export type FinalizeOmicallInput = {
  callUid: string
  callUuid?: string
  leadId: string
  phone: string
  target?: OmicallCallTarget
  counselorUid?: string
  direction?: 'inbound' | 'outbound'
  billSeconds?: number
  sipNumber?: string
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
  try {
    await reportOmicallCallFromClient(call, {
      leadId: input.leadId,
      phone: input.phone,
      target: input.target,
    })
  } catch (e) {
    console.warn('[OMICall] report KPI', e)
  }
  return logged
}

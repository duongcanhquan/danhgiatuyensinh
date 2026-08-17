import { getFunctions, httpsCallable } from 'firebase/functions'
import { callableErrorMessage } from '../utils/callableErrorMessage'
import { getFirebaseApp } from './firebase'
import type { PortalMatchKind } from '../utils/portalRegistrationControl'

export type PortalSuggestedLead = {
  id: string
  fullName: string
  phone: string
  gradeClass: string
  highSchool: string
  assigneeId: string
  assigneeName: string
  hadActivity: boolean
}

export type PortalRegistrationRow = {
  id: string
  orgId: string
  status: string
  matchKind: PortalMatchKind
  counselorId: string
  counselorName: string
  studentFullName: string
  studentPhone: string
  studentNationalId: string
  suggestedLeadId: string
  suggestedLeadIds: string[]
  suggestedLeads: PortalSuggestedLead[]
  createdAtMs: number
  resolvingAtMs?: number
  studentHighSchool?: string
  studentDob?: string
  studentGradeClass?: string
}

function fns() {
  const app = getFirebaseApp()
  if (!app) return null
  return getFunctions(app, 'asia-southeast1')
}

export async function resolvePortalRegistration(input: {
  registrationId: string
  action: 'merge' | 'create_new'
  leadId?: string
}): Promise<{ ok: boolean; action: string; leadId?: string; systemCode?: string; hadActivity?: boolean }> {
  const f = fns()
  if (!f) throw new Error('Chưa cấu hình Firebase.')
  try {
    const call = httpsCallable<typeof input, { ok: boolean; action: string; leadId?: string; systemCode?: string; hadActivity?: boolean }>(
      f,
      'resolvePortalRegistration',
    )
    const res = await call(input)
    return res.data
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không xử lý được phiếu đăng ký.'), { cause: e })
  }
}

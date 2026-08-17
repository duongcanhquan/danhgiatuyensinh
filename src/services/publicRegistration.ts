import { getFunctions, httpsCallable } from 'firebase/functions'
import { callableErrorMessage } from '../utils/callableErrorMessage'
import { getFirebaseApp } from './firebase'

export type PublicCatalogOption = {
  id: string
  label: string
  departmentId?: string
  departmentIds?: string[]
  labelEn?: string
}

export type PublicPortalCounselor = {
  id: string
  displayName: string
  role?: string
}

export type PublicRegistrationMeta = {
  enabled: boolean
  portalTitle: string
  introText: string
  successMessage: string
  orgId?: string
  trainingPrograms: PublicCatalogOption[]
  majors: PublicCatalogOption[]
  /** Đối tượng dự tuyển từ masterData `applicant_categories`. */
  applicantCategories?: PublicCatalogOption[]
  counselors: PublicPortalCounselor[]
  contactAddress?: string
  contactPhone?: string
  logoUrl?: string
  /** @deprecated legacy */
  provinces?: string[]
}

export type PublicRegistrationFormInput = {
  fullName: string
  phone: string
  studentEmail: string
  dateOfBirth: string
  gender: string
  placeOfBirth: string
  ethnicity: string
  nationalId: string
  nationalIdNotAvailable: boolean
  permanentAddress: string
  fatherName: string
  fatherPhone: string
  motherName: string
  motherPhone: string
  highSchool: string
  schoolProvince: string
  applicantCategory: string
  educationLevel: string
  studyIntention: string
  majorInterest: string
  academicPerformance: string
  scorePreset: string
  customScore: string
  counselorId: string
  description?: string
  /** legacy optional */
  parentPhone?: string
  province?: string
  gradeClass?: string
}

export type SubmitPublicLeadResult = {
  ok: boolean
  leadId: string
  systemCode: string
  successMessage: string
  counselorName: string | null
  n8nOk: boolean
  n8nError: string | null
  queued?: boolean
  registrationId?: string
}

function functionsRegion() {
  const app = getFirebaseApp()
  if (!app) throw new Error('Chưa cấu hình Firebase.')
  return getFunctions(app, 'asia-southeast1')
}

export async function fetchPublicRegistrationMeta(orgSlug?: string): Promise<PublicRegistrationMeta> {
  const fn = httpsCallable<{ orgSlug?: string }, PublicRegistrationMeta>(
    functionsRegion(),
    'getPublicRegistrationMeta',
  )
  try {
    const res = await fn(orgSlug ? { orgSlug } : {})
    const data = res.data
    return {
      ...data,
      trainingPrograms: Array.isArray(data.trainingPrograms) ? data.trainingPrograms : [],
      majors: Array.isArray(data.majors) ? data.majors : [],
      applicantCategories: Array.isArray(data.applicantCategories) ? data.applicantCategories : [],
      counselors: Array.isArray(data.counselors) ? data.counselors : [],
    }
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không tải được cấu hình cổng đăng ký.'), { cause: e })
  }
}

export async function submitPublicRegistration(
  input: Record<string, unknown> & { orgSlug?: string },
): Promise<SubmitPublicLeadResult> {
  const fn = httpsCallable<Record<string, unknown>, SubmitPublicLeadResult>(
    functionsRegion(),
    'submitPublicLead',
  )
  try {
    const res = await fn(input)
    return res.data
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không gửi được đăng ký — thử lại sau.'), { cause: e })
  }
}

export type NotifyCrmPortalRegistrationResult = {
  ok: boolean
  n8nOk: boolean
  n8nError: string | null
  systemCode: string
  leadId: string
}

/** CRM tạo hồ sơ → CF bắn n8n student_registration (không CORS). */
export async function notifyCrmPortalRegistration(input: {
  leadId: string
  orgId: string
  createdByName?: string
}): Promise<NotifyCrmPortalRegistrationResult> {
  const fn = httpsCallable<
    { leadId: string; orgId: string; createdByName?: string },
    NotifyCrmPortalRegistrationResult
  >(functionsRegion(), 'notifyCrmPortalRegistration')
  try {
    const res = await fn(input)
    return res.data
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không gửi được tin đăng ký sang n8n.'), { cause: e })
  }
}

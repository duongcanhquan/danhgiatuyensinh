import { getFunctions, httpsCallable } from 'firebase/functions'
import { callableErrorMessage } from '../utils/callableErrorMessage'
import { getFirebaseApp } from './firebase'

export type PublicRegistrationMeta = {
  enabled: boolean
  portalTitle: string
  introText: string
  successMessage: string
  provinces: string[]
}

export type PublicRegistrationFormInput = {
  fullName: string
  phone: string
  studentEmail: string
  dateOfBirth?: string
  parentPhone?: string
  province?: string
  highSchool?: string
  gradeClass?: string
  educationLevel?: string
  studyIntention?: string
  majorInterest?: string
  academicPerformance?: string
  description?: string
}

export type SubmitPublicLeadResult = {
  ok: boolean
  leadId: string
  systemCode: string
  successMessage: string
  counselorName: string | null
  n8nOk: boolean
  n8nError: string | null
}

function functionsRegion() {
  const app = getFirebaseApp()
  if (!app) throw new Error('Chưa cấu hình Firebase.')
  return getFunctions(app, 'asia-southeast1')
}

export async function fetchPublicRegistrationMeta(): Promise<PublicRegistrationMeta> {
  const fn = httpsCallable<Record<string, never>, PublicRegistrationMeta>(
    functionsRegion(),
    'getPublicRegistrationMeta',
  )
  try {
    const res = await fn({})
    return res.data
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không tải được cấu hình cổng đăng ký.'))
  }
}

export async function submitPublicRegistration(
  input: PublicRegistrationFormInput,
): Promise<SubmitPublicLeadResult> {
  const fn = httpsCallable<PublicRegistrationFormInput, SubmitPublicLeadResult>(
    functionsRegion(),
    'submitPublicLead',
  )
  try {
    const res = await fn(input)
    return res.data
  } catch (e) {
    throw new Error(callableErrorMessage(e, 'Không gửi được đăng ký — thử lại sau.'))
  }
}

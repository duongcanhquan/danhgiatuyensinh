import { getFunctions, httpsCallable } from 'firebase/functions'
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
  const res = await fn({})
  return res.data
}

export async function submitPublicRegistration(
  input: PublicRegistrationFormInput,
): Promise<SubmitPublicLeadResult> {
  const fn = httpsCallable<PublicRegistrationFormInput, SubmitPublicLeadResult>(
    functionsRegion(),
    'submitPublicLead',
  )
  const res = await fn(input)
  return res.data
}

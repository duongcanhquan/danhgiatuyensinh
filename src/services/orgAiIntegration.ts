import { deleteDoc, doc, setDoc, Timestamp, type Firestore } from 'firebase/firestore'
import type { AIIntegrationConfig, AIProviderId } from '../types'
import { FS_COLLECTIONS, SCORING_AUX_ORG_AI_DOC_ID } from '../types'

const DEFAULT_MODEL_BY_PROVIDER: Record<AIProviderId, string> = {
  Gemini: 'gemini-2.0-flash',
  OpenAI: 'gpt-4o-mini',
  DeepSeek: 'deepseek-chat',
}

export function parseOrgAiIntegrationDoc(data: Record<string, unknown>): AIIntegrationConfig | null {
  const providerRaw = String(data.provider ?? '').trim()
  const provider: AIProviderId =
    providerRaw === 'Gemini' ? 'Gemini' : providerRaw === 'DeepSeek' ? 'DeepSeek' : providerRaw === 'OpenAI' ? 'OpenAI' : 'OpenAI'
  const apiKey = String(data.apiKey ?? '').trim()
  if (!apiKey) return null
  const modelRaw = String(data.model ?? '').trim()
  const model = modelRaw || DEFAULT_MODEL_BY_PROVIDER[provider]
  return { provider, apiKey, model }
}

export async function saveOrgAiIntegration(
  db: Firestore,
  config: AIIntegrationConfig,
  actorUid: string,
): Promise<void> {
  const parsed = parseOrgAiIntegrationDoc({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
  })
  if (!parsed) throw new Error('Cấu hình không hợp lệ: cần nhà cung cấp và API key.')
  const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_ORG_AI_DOC_ID)
  await setDoc(
    ref,
    {
      provider: parsed.provider,
      apiKey: parsed.apiKey,
      model: parsed.model,
      updatedAt: Timestamp.now(),
      updatedBy: actorUid,
    },
    { merge: true },
  )
}

export async function clearOrgAiIntegration(db: Firestore): Promise<void> {
  const ref = doc(db, FS_COLLECTIONS.scoringAux, SCORING_AUX_ORG_AI_DOC_ID)
  await deleteDoc(ref)
}

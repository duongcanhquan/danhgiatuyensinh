import { describe, expect, it } from 'vitest'
import {
  getDeepSeekChatCompletionsUrl,
  getOpenAiChatCompletionsUrl,
  loadAIConfigFromStorage,
  resolveAIIntegrationConfig,
  resolveAiConfigSource,
  setOrgAiIntegrationCache,
} from './aiEngine'

describe('aiEngine LLM endpoints', () => {
  it('defaults OpenAI to same-origin proxy path', () => {
    expect(getOpenAiChatCompletionsUrl()).toMatch(/\/openai-proxy\/v1\/chat\/completions$/)
  })

  it('defaults DeepSeek to same-origin proxy path', () => {
    expect(getDeepSeekChatCompletionsUrl()).toMatch(/\/deepseek-proxy\/v1\/chat\/completions$/)
  })

  it('resolveAIIntegrationConfig returns null without org, storage or env key', () => {
    setOrgAiIntegrationCache(null)
    expect(loadAIConfigFromStorage()).toBeNull()
    expect(resolveAIIntegrationConfig()).toBeNull()
  })

  it('prefers Firestore org config over localStorage and env', () => {
    setOrgAiIntegrationCache({
      provider: 'DeepSeek',
      apiKey: 'sk-org',
      model: 'deepseek-chat',
    })
    expect(resolveAiConfigSource()).toBe('firestore')
    expect(resolveAIIntegrationConfig()?.apiKey).toBe('sk-org')
    setOrgAiIntegrationCache(null)
  })
})

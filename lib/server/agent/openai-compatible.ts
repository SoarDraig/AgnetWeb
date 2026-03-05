import type { OpenAICompatibleApiConfig } from '@/lib/types'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

export function resolveLlmApiConfig(input: OpenAICompatibleApiConfig): OpenAICompatibleApiConfig {
  const apiKey = input.apiKey?.trim() || process.env.OPENAI_API_KEY || ''
  const baseUrl = input.baseUrl?.trim() || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  const model = input.model?.trim() || process.env.OPENAI_MODEL || 'gpt-4o-mini'
  return {
    ...input,
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    model,
    temperature: clamp(input.temperature, 0, 2),
    maxTokens: clamp(Math.round(input.maxTokens), 64, 8192),
  }
}

export async function requestOpenAICompatibleSummary(
  config: OpenAICompatibleApiConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const resolved = resolveLlmApiConfig(config)
  if (!resolved.enabled) {
    return ''
  }
  if (!resolved.apiKey) {
    throw new Error('LLM API key is missing. Set apiConfig.apiKey or OPENAI_API_KEY.')
  }

  const endpoint = `${resolved.baseUrl}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: resolved.model,
        temperature: resolved.temperature,
        max_tokens: resolved.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })

    const json = (await response.json()) as ChatCompletionResponse
    if (!response.ok) {
      const message = json?.error?.message || `HTTP ${response.status}`
      throw new Error(`LLM request failed: ${message}`)
    }

    const content = json?.choices?.[0]?.message?.content?.trim() || ''
    if (!content) {
      throw new Error('LLM response content is empty.')
    }

    return content
  } finally {
    clearTimeout(timer)
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value?.trim() || 'https://api.openai.com/v1'
  return trimmed.replace(/\/+$/, '')
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min
  return Math.max(min, Math.min(max, value))
}

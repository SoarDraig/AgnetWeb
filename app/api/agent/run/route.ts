import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { AgentRunRequest } from '@/lib/agent-run-contract'
import { executeAgentRun } from '@/lib/server/agent/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  currentBranch: z.string().trim().min(1).max(128),
  apiConfig: z.object({
    enabled: z.boolean(),
    baseUrl: z.string(),
    apiKey: z.string(),
    model: z.string(),
    temperature: z.number(),
    maxTokens: z.number(),
  }),
  conversationHistory: z.array(
    z.object({
      role: z.enum(['user', 'agent']),
      content: z.string().trim().min(1).max(4000),
    }),
  ).max(20).optional(),
  workflow: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    lastUpdated: z.number(),
    components: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        name: z.string(),
        phase: z.string(),
        enabled: z.boolean(),
        description: z.string(),
        color: z.string(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
    options: z.object({
      autonomousToolAgent: z.boolean(),
      enableCausalMemory: z.boolean(),
      includeProjectManifest: z.boolean(),
      forceManifestFirst: z.boolean(),
      includePreviousOutput: z.boolean(),
      debugVerboseReport: z.boolean(),
      causalMemoryTopK: z.number(),
      causalMemoryMaxChars: z.number(),
      budget: z.object({
        maxSteps: z.number(),
        maxRequests: z.number(),
        maxTotalTokens: z.number(),
        maxParallelRequests: z.number(),
      }),
      toolPermissions: z.object({
        allowTelemetryRead: z.boolean(),
        allowCodeSearch: z.boolean(),
        allowCodeRead: z.boolean(),
      }),
      actionQuotas: z.object({
        maxCodeReadActions: z.number(),
        maxCodeSearchActions: z.number(),
        maxTelemetrySliceActions: z.number(),
      }),
    }),
  }),
})

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const parsed = requestSchema.parse(payload) as AgentRunRequest
    const result = await executeAgentRun(parsed, process.cwd())
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid run request payload',
          issues: error.issues,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        error: 'Failed to execute workflow run',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

import type { ComponentExecutionContext, ComponentHandler } from '@/lib/server/agent/context'
import { pushEvidence, pushMessage } from '@/lib/server/agent/context'

export const runOrchestratorHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  state.currentPhase = 'discover'

  const budget = state.request.workflow.options.budget
  pushEvidence(
    state,
    `orchestrator budget: steps=${budget.maxSteps}, requests=${budget.maxRequests}, tokens=${budget.maxTotalTokens}`,
  )

  pushMessage(state, {
    id: `${state.runId}-msg-orchestrator`,
    role: 'agent',
    content: `RunAnalysis 兼容执行已启动（RunId: ${state.runId}）。`,
    thinking: '执行路径：Baseline -> Investigate Loop(Plan/Gov/Tool/Memory) -> Synthesis。',
    timestamp: Date.now(),
    status: 'success',
  })
}

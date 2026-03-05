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
    content: `后端执行已启动（RunId: ${state.runId}）。`,
    thinking: '按前端工作流配置执行组件链路。',
    timestamp: Date.now(),
    status: 'success',
  })
}

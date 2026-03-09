import type { ComponentExecutionContext, ComponentHandler } from '@/lib/server/agent/context'
import { pushEvidence, pushMessage } from '@/lib/server/agent/context'
import { requestOpenAICompatibleSummary } from '@/lib/server/agent/openai-compatible'

export const summarySynthesizerHandler: ComponentHandler = async (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  state.currentPhase = 'synthesize'

  const successfulTools = state.toolExecutions.filter(item => item.status === 'success').length
  const failedTools = state.toolExecutions.filter(item => item.status === 'error').length

  const summary = [
    `已完成 RunAnalysis 兼容执行，共 ${state.request.workflow.components.filter(c => c.enabled).length} 个启用组件。`,
    `工具执行：成功 ${successfulTools}，失败 ${failedTools}。`,
    `当前阶段：${state.currentPhase}。`,
    state.stopReason ? `停止原因：${state.stopReason}。` : '',
    '可继续在前端调整 workflow 配置并再次执行。',
  ].filter(Boolean).join(' ')

  let finalSummary = summary
  const llmApi = state.request.apiConfig
  if (llmApi.enabled) {
    try {
      const evidence = state.evidence.slice(-18).join('\n')
      const conversation = (state.request.conversationHistory ?? [])
        .slice(-10)
        .map(item => `${item.role}: ${item.content}`)
        .join('\n')
      const generated = await requestOpenAICompatibleSummary(
        llmApi,
        'You are an analysis summarizer. Return concise Chinese summary with actionable next steps.',
        [
          `UserPrompt: ${state.request.prompt}`,
          conversation ? `ConversationHistory:\n${conversation}` : '',
          `StopReason: ${state.stopReason || 'none'}`,
          `Evidence:\n${evidence || '(empty)'}`,
          `ToolExecutions: ${state.toolExecutions.length}`,
        ].join('\n\n'),
      )
      if (generated.trim()) {
        finalSummary = generated.trim()
      }
    } catch (error) {
      pushEvidence(
        state,
        `llm summary fallback: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  state.summary = finalSummary
  pushEvidence(state, `summary: ${finalSummary}`)

  pushMessage(state, {
    id: `${state.runId}-msg-summary`,
    role: 'agent',
    content: finalSummary,
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

export const critiqueRefinerHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  if (!state.summary.trim()) {
    return
  }

  const critique =
    state.toolExecutions.some(item => item.status === 'error')
      ? '注意：存在失败动作，建议优先检查 tool permissions 与预算上限。'
      : '本次执行未出现失败动作，可将当前 workflow 打上 stable 标签。'

  state.summary = `${state.summary}\n${critique}`
  pushEvidence(state, `critique: ${critique}`)

  pushMessage(state, {
    id: `${state.runId}-msg-critique`,
    role: 'agent',
    content: critique,
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

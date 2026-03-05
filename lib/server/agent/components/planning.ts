import type { ComponentExecutionContext, ComponentHandler } from '@/lib/server/agent/context'
import { pushEvidence, pushMessage } from '@/lib/server/agent/context'
import type { AgentActionType, ToolExecution } from '@/lib/types'

function getExecutedActionCount(executions: ToolExecution[], actionType: AgentActionType) {
  return executions.reduce((count, item) => {
    const executedType = item.input?.actionType
    return executedType === actionType ? count + 1 : count
  }, 0)
}

function shouldRequestTelemetry(prompt: string) {
  const text = prompt.toLowerCase()
  return text.includes('telemetry') || text.includes('埋点') || text.includes('运行数据')
}

function pickSearchQuery(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) return 'RunAnalysisAgentOrchestrator'
  if (trimmed.length <= 40) return trimmed
  return trimmed.slice(0, 40)
}

export const baselineAnalyzerHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  state.currentPhase = 'discover'

  const baseline = `基线分析：用户目标为「${state.request.prompt.slice(0, 120)}」`
  pushEvidence(state, baseline)
  pushMessage(state, {
    id: `${state.runId}-msg-baseline-${state.loopStep || 0}`,
    role: 'agent',
    content: baseline,
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

export const plannerHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  state.currentPhase = 'investigate'
  state.requestsUsed += 1

  const options = state.request.workflow.options
  const { toolPermissions, actionQuotas, budget } = options

  const hasManifest = state.evidence.some(line => line.includes('manifest files='))
  const searchCount = getExecutedActionCount(state.toolExecutions, 'search_code')
  const readCount = getExecutedActionCount(state.toolExecutions, 'read_code_file')
  const telemetryCount =
    getExecutedActionCount(state.toolExecutions, 'query_telemetry_aggregate') +
    getExecutedActionCount(state.toolExecutions, 'read_telemetry_slice')

  const actions: Array<{ actionType: AgentActionType; query?: string; why: string }> = []

  if (options.includeProjectManifest && !hasManifest && state.loopStep === 1) {
    actions.push({ actionType: 'get_project_manifest', why: '首轮先建立项目边界。' })
  }

  if (toolPermissions.allowCodeSearch && searchCount < actionQuotas.maxCodeSearchActions) {
    actions.push({
      actionType: 'search_code',
      query: pickSearchQuery(state.request.prompt),
      why: searchCount === 0 ? '先检索候选代码位置。' : '补充检索证据。',
    })
  }

  if (toolPermissions.allowCodeRead && readCount < actionQuotas.maxCodeReadActions) {
    actions.push({
      actionType: 'read_code_file',
      why: readCount === 0 ? '至少精读一个文件确认实现路径。' : '补充精读上下文。',
    })
  }

  if (toolPermissions.allowTelemetryRead && telemetryCount < actionQuotas.maxTelemetrySliceActions && shouldRequestTelemetry(state.request.prompt)) {
    actions.push({
      actionType: 'query_telemetry_aggregate',
      why: '用户请求包含 telemetry 关键词。',
    })
  }

  const nearBudget = state.loopStep >= Math.max(1, budget.maxSteps - 1)
  const enoughEvidence = state.evidence.length >= 6 || (searchCount > 0 && readCount > 0)
  const shouldFinishNow = nearBudget || enoughEvidence || actions.length === 0

  if (shouldFinishNow) {
    actions.push({
      actionType: 'finish',
      why: nearBudget
        ? '接近 step budget，收敛输出。'
        : enoughEvidence
          ? '关键证据已满足，进入总结阶段。'
          : '无可执行动作，直接结束。',
    })
  }

  state.plannedActions = actions.map(action => ({
    actionType: action.actionType,
    query: action.query,
    path: undefined,
    why: action.why,
  }))

  state.tokenEstimate += Math.ceil((state.request.prompt.length + state.plannedActions.length * 80) / 4)

  pushEvidence(
    state,
    `planner step=${state.loopStep} requests=${state.requestsUsed}/${budget.maxRequests}: ${state.plannedActions.map(item => item.actionType).join(', ')}`,
  )

  pushMessage(state, {
    id: `${state.runId}-msg-plan-${state.loopStep}`,
    role: 'agent',
    content: `Planner(step ${state.loopStep}) 生成 ${state.plannedActions.length} 个动作。`,
    thinking: state.plannedActions.map(item => `${item.actionType}: ${item.why}`).join('\n'),
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

export const governanceHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  const { actionQuotas } = state.request.workflow.options

  const deduped = state.plannedActions.filter(action => {
    const key = `${action.actionType}|${action.query ?? ''}|${action.path ?? ''}`
    state.actionHits[key] = (state.actionHits[key] ?? 0) + 1
    return state.actionHits[key] <= 2
  })

  const quotaFiltered = deduped.filter(action => {
    if (action.actionType === 'search_code') {
      return getExecutedActionCount(state.toolExecutions, 'search_code') < actionQuotas.maxCodeSearchActions
    }
    if (action.actionType === 'read_code_file') {
      return getExecutedActionCount(state.toolExecutions, 'read_code_file') < actionQuotas.maxCodeReadActions
    }
    if (action.actionType === 'query_telemetry_aggregate' || action.actionType === 'read_telemetry_slice') {
      const used =
        getExecutedActionCount(state.toolExecutions, 'query_telemetry_aggregate') +
        getExecutedActionCount(state.toolExecutions, 'read_telemetry_slice')
      return used < actionQuotas.maxTelemetrySliceActions
    }
    return true
  })

  if (quotaFiltered.length === 0 || quotaFiltered[quotaFiltered.length - 1]?.actionType !== 'finish') {
    quotaFiltered.push({ actionType: 'finish', why: 'Governance appended finish.' })
  }

  state.plannedActions = quotaFiltered
  state.shouldFinish =
    state.plannedActions.length === 1 && state.plannedActions[0].actionType === 'finish'

  if (state.shouldFinish) {
    state.stopReason = state.stopReason || `Planner requested finish at step ${state.loopStep}.`
  }

  pushEvidence(state, `governance step=${state.loopStep}: ${quotaFiltered.map(item => item.actionType).join(', ')}`)
}

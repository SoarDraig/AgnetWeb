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

function normalizePathToken(path: string | undefined) {
  return (path ?? '').trim().replace(/\\/g, '/').replace(/^\.?\//, '')
}

function buildActionSignature(actionType: AgentActionType, query?: string, path?: string) {
  const q = (query ?? '').trim()
  const p = normalizePathToken(path)
  return `${actionType}|${q}|${p}`
}

function isInvestigationReadyToFinish(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const enoughEvidence = state.evidence.length >= 6
  const enoughTools = state.searchSuccessCount >= 1 && state.codeReadSuccessCount >= 1
  return enoughEvidence || enoughTools || state.successfulActionCount >= 3
}

function buildNextSearchQuery(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const prompt = state.request.prompt.trim()
  const candidates = [
    prompt.length > 48 ? prompt.slice(0, 48) : prompt,
    'RunAnalysisAgentOrchestrator',
    'LLMAgentPlanner',
    'AgentToolExecutor',
    'governance',
    'causal memory',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const text = candidate.trim()
    if (!text) continue
    if (!state.searchedQueries[text.toLowerCase()]) {
      return text
    }
  }
  return 'RunAnalysisAgentOrchestrator'
}

function ensureAutonomousPlan(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const options = state.request.workflow.options
  if (state.plannedActionClasses.length > 0) return

  if (state.currentPhase === 'synthesize') {
    state.plannedActionClasses.push('finish')
    return
  }

  const hasManifest = state.evidence.some(line => line.includes('manifest files='))
  if (options.includeProjectManifest && options.forceManifestFirst && !hasManifest) {
    state.plannedActionClasses.push('get_project_manifest')
  }

  if (state.searchSuccessCount <= 0 && options.toolPermissions.allowCodeSearch) {
    state.plannedActionClasses.push('search_code')
  }

  if (
    options.toolPermissions.allowCodeRead &&
    (state.pendingCodeReadPaths.length > 0 || state.codeReadSuccessCount < 2)
  ) {
    state.plannedActionClasses.push('read_code_file')
  }

  if (
    options.toolPermissions.allowTelemetryRead &&
    shouldRequestTelemetry(state.request.prompt) &&
    state.telemetrySliceSuccessCount <= 0
  ) {
    state.plannedActionClasses.push('query_telemetry_aggregate')
  }

  if (isInvestigationReadyToFinish(ctx)) {
    state.plannedActionClasses.push('finish')
  } else if (state.plannedActionClasses.length === 0) {
    state.plannedActionClasses.push('search_code')
  }
}

function tryBuildContinueAction(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const options = state.request.workflow.options

  if (options.toolPermissions.allowCodeRead && state.pendingCodeReadPaths.length > 0) {
    return {
      actionType: 'read_code_file' as const,
      path: state.pendingCodeReadPaths[0],
      why: '从待读队列继续补证。',
    }
  }

  if (options.toolPermissions.allowCodeSearch) {
    return {
      actionType: 'search_code' as const,
      query: buildNextSearchQuery(ctx),
      why: '继续搜索补证，避免过早收敛。',
    }
  }

  return {
    actionType: 'finish' as const,
    why: '无可执行补证动作，结束。',
  }
}

function buildActionForClass(
  ctx: ComponentExecutionContext,
  actionType: AgentActionType,
  fallbackWhy: string,
) {
  const { state } = ctx
  if (actionType === 'read_code_file') {
    return {
      actionType,
      path: state.pendingCodeReadPaths[0],
      why: 'FSM: 读取候选代码文件。',
    }
  }

  if (actionType === 'search_code') {
    return {
      actionType,
      query: buildNextSearchQuery(ctx),
      why: 'FSM: 执行定向代码检索。',
    }
  }

  if (actionType === 'query_telemetry_aggregate') {
    return {
      actionType,
      why: 'FSM: 先拉取 telemetry 聚合。',
    }
  }

  if (actionType === 'read_telemetry_slice') {
    return {
      actionType,
      why: 'FSM: 按游标推进 telemetry 切片。',
    }
  }

  if (actionType === 'get_project_manifest') {
    return {
      actionType,
      why: 'FSM: 加载项目清单边界。',
    }
  }

  return {
    actionType: 'finish' as const,
    why: fallbackWhy || 'FSM: 满足收敛条件。',
  }
}

function buildDeterministicAction(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const options = state.request.workflow.options
  const hasManifest = state.evidence.some(line => line.includes('manifest files='))

  if (state.currentPhase === 'synthesize') {
    return { actionType: 'finish' as const, why: '阶段已进入综合，结束工具循环。' }
  }

  if (options.includeProjectManifest && options.forceManifestFirst && !hasManifest) {
    return { actionType: 'get_project_manifest' as const, why: '首轮强制加载项目清单。' }
  }

  if (options.toolPermissions.allowCodeRead && state.pendingCodeReadPaths.length > 0) {
    return {
      actionType: 'read_code_file' as const,
      path: state.pendingCodeReadPaths[0],
      why: '优先消费候选文件队列。',
    }
  }

  if (options.toolPermissions.allowCodeSearch) {
    return {
      actionType: 'search_code' as const,
      query: buildNextSearchQuery(ctx),
      why: '执行下一条代码检索补证。',
    }
  }

  if (
    options.toolPermissions.allowTelemetryRead &&
    shouldRequestTelemetry(state.request.prompt) &&
    state.telemetryAggregateDone === false
  ) {
    return {
      actionType: 'query_telemetry_aggregate' as const,
      why: '用户目标包含 telemetry，补充聚合信息。',
    }
  }

  if (isInvestigationReadyToFinish(ctx)) {
    return { actionType: 'finish' as const, why: '证据满足收敛条件。' }
  }

  return { actionType: 'finish' as const, why: '无可执行动作，结束循环。' }
}

function applyGovernance(ctx: ComponentExecutionContext) {
  const { state } = ctx
  const options = state.request.workflow.options
  const action = state.plannedActions[0]
  if (!action) return

  let governed = action
  const expected = state.plannedActionClasses.shift()
  if (expected && expected !== governed.actionType) {
    governed = buildActionForClass(ctx, expected, governed.why ?? '')
  }

  if (governed.actionType === 'finish' && !isInvestigationReadyToFinish(ctx)) {
    governed = tryBuildContinueAction(ctx)
  }

  if (governed.actionType === 'search_code' && !governed.query) {
    governed = { ...governed, query: buildNextSearchQuery(ctx), why: `${governed.why}（自动补全 query）` }
  }

  const signature = buildActionSignature(governed.actionType, governed.query, governed.path)
  if (signature) {
    if (signature === state.lastActionSignature) {
      state.repeatActionCount += 1
    } else {
      state.lastActionSignature = signature
      state.repeatActionCount = 1
    }
    const repeatLimit = governed.actionType === 'search_code' ? 2 : 3
    if (state.repeatActionCount >= repeatLimit) {
      state.bannedActionSignatures[signature] = true
      state.blockedActionCount += 1
      governed = tryBuildContinueAction(ctx)
    }
  }

  const currentReadCount = getExecutedActionCount(state.toolExecutions, 'read_code_file')
  const currentSearchCount = getExecutedActionCount(state.toolExecutions, 'search_code')
  const currentTelemetryCount =
    getExecutedActionCount(state.toolExecutions, 'query_telemetry_aggregate') +
    getExecutedActionCount(state.toolExecutions, 'read_telemetry_slice')

  if (governed.actionType === 'read_code_file' && currentReadCount >= options.actionQuotas.maxCodeReadActions) {
    state.blockedActionCount += 1
    governed = tryBuildContinueAction(ctx)
  }
  if (governed.actionType === 'search_code' && currentSearchCount >= options.actionQuotas.maxCodeSearchActions) {
    state.blockedActionCount += 1
    governed = tryBuildContinueAction(ctx)
  }
  if (
    (governed.actionType === 'query_telemetry_aggregate' || governed.actionType === 'read_telemetry_slice') &&
    currentTelemetryCount >= options.actionQuotas.maxTelemetrySliceActions
  ) {
    state.blockedActionCount += 1
    governed = tryBuildContinueAction(ctx)
  }

  const governedSignature = buildActionSignature(governed.actionType, governed.query, governed.path)
  if (governedSignature && state.bannedActionSignatures[governedSignature]) {
    state.blockedActionCount += 1
    governed = tryBuildContinueAction(ctx)
  }

  const normalizedPath = normalizePathToken(governed.path)
  if (governed.actionType === 'read_code_file' && normalizedPath && state.bannedCodeReadPaths[normalizedPath]) {
    state.blockedActionCount += 1
    governed = tryBuildContinueAction(ctx)
  }

  const budget = options.budget
  const nearBudget = state.loopStep >= Math.max(1, budget.maxSteps - 1)
  if (nearBudget && isInvestigationReadyToFinish(ctx)) {
    governed = { actionType: 'finish', why: '接近 step budget，执行收敛。' }
  }

  state.plannedActions = [governed]
  state.shouldFinish = state.plannedActions[0]?.actionType === 'finish'
  if (state.shouldFinish) {
    state.stopReason = state.stopReason || `Planner requested finish at step ${state.loopStep}.`
  }

  pushEvidence(
    state,
    `governance step=${state.loopStep}: ${state.plannedActions.map(item => item.actionType).join(', ')}`,
  )
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

  const budget = state.request.workflow.options.budget
  if (state.requestsUsed >= budget.maxRequests) {
    state.plannedActions = [{ actionType: 'finish', why: '达到 request 预算上限。' }]
    state.shouldFinish = true
    state.stopReason = state.stopReason || `Reach max requests (${budget.maxRequests}).`
    return
  }

  ensureAutonomousPlan(ctx)
  const action = buildDeterministicAction(ctx)
  state.plannedActions = [
    {
      actionType: action.actionType,
      query: action.query,
      path: action.path,
      why: action.why,
    },
  ]

  state.tokenEstimate += Math.ceil((state.request.prompt.length + state.plannedActions.length * 96) / 4)

  pushEvidence(
    state,
    `planner step=${state.loopStep} requests=${state.requestsUsed}/${budget.maxRequests}: ${state.plannedActions.map(item => item.actionType).join(', ')}`,
  )

  pushMessage(state, {
    id: `${state.runId}-msg-plan-${state.loopStep}`,
    role: 'agent',
    content: `Planner(step ${state.loopStep}) 输出动作：${state.plannedActions[0].actionType}`,
    thinking: state.plannedActions.map(item => `${item.actionType}: ${item.why}`).join('\n'),
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

export const governanceHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  applyGovernance(ctx)
  if (state.shouldFinish) {
    pushMessage(state, {
      id: `${state.runId}-msg-gov-${state.loopStep}`,
      role: 'agent',
      content: `Governance(step ${state.loopStep}) 请求收敛 finish。`,
      timestamp: Date.now(),
      status: 'success',
      nodeId: state.activeComponentNodeId ?? undefined,
    })
  }
}

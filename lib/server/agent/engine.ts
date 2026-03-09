import type { AgentRunRequest, AgentRunResponse } from '@/lib/agent-run-contract'
import type { AgentWorkflowComponent } from '@/lib/types'
import type { AgentExecutionState } from '@/lib/server/agent/context'
import {
  createNodeId,
  finishComponentNode,
  pushComponentNode,
  pushEdge,
} from '@/lib/server/agent/context'
import { resolveHandler } from '@/lib/server/agent/components'

export async function executeAgentRun(
  request: AgentRunRequest,
  workspaceRoot: string,
): Promise<AgentRunResponse> {
  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const startedAt = Date.now()

  const state: AgentExecutionState = {
    runId,
    startedAt,
    currentPhase: 'discover',
    currentBranch: request.currentBranch || 'main',
    request,

    nodes: [],
    edges: [],
    messages: [],
    toolExecutions: [],
    causalMemoryNodes: [],
    causalMemoryEdges: [],

    plannedActions: [],
    evidence: [],
    summary: '',
    nodeCounter: 0,
    edgeCounter: 0,
    memoryCounter: 0,
    previousNodeId: null,
    activeComponentNodeId: null,
    actionHits: {},
    loopStep: 0,
    requestsUsed: 0,
    tokenEstimate: Math.ceil((request.prompt?.length ?? 0) / 4),
    shouldFinish: false,
    stopReason: '',
    plannedActionClasses: [],
    pendingCodeReadPaths: [],
    exhaustedCodeReadPaths: {},
    readCodeFiles: {},
    searchedQueries: {},
    telemetryNextOffsets: {},
    exhaustedTelemetryCursors: {},
    telemetryAggregateDone: false,
    telemetrySliceSuccessCount: 0,
    codeReadSuccessCount: 0,
    searchSuccessCount: 0,
    successfulActionCount: 0,
    consecutiveLowValueActions: 0,
    bannedActionSignatures: {},
    bannedCodeReadPaths: {},
    lastActionSignature: '',
    repeatActionCount: 0,
    blockedActionCount: 0,
    activeInvestigateLoopNodeId: null,
    previousInvestigateLoopNodeId: null,
  }

  const enabledComponents = request.workflow.components.filter(component => component.enabled)
  const discoverComponents = enabledComponents.filter(component => component.phase === 'discover')
  const investigateComponents = enabledComponents.filter(component => component.phase === 'investigate')
  const synthesizeComponents = enabledComponents.filter(component => component.phase === 'synthesize')

  for (const component of discoverComponents) {
    await executeComponent(state, component, workspaceRoot)
  }

  await runInvestigateLoop(state, investigateComponents, workspaceRoot)

  state.currentPhase = 'synthesize'
  for (const component of synthesizeComponents) {
    await executeComponent(state, component, workspaceRoot)
  }

  const finishedAt = Date.now()

  return {
    runId,
    startedAt,
    finishedAt,
    currentPhase: state.currentPhase,
    nodes: state.nodes,
    edges: state.edges,
    messages: state.messages,
    toolExecutions: state.toolExecutions,
    causalMemoryNodes: state.causalMemoryNodes,
    causalMemoryEdges: state.causalMemoryEdges,
    plannedActions: state.plannedActions,
    evidence: state.evidence,
    summary: state.summary || `执行完成。${state.stopReason ? `停止原因：${state.stopReason}` : ''}`,
  }
}

async function runInvestigateLoop(
  state: AgentExecutionState,
  components: AgentWorkflowComponent[],
  workspaceRoot: string,
) {
  if (components.length === 0) {
    state.stopReason = 'No investigate components enabled.'
    return
  }

  const budget = state.request.workflow.options.budget
  const maxSteps = Math.max(1, budget.maxSteps)

  for (let step = 1; step <= maxSteps; step++) {
    state.loopStep = step
    state.currentPhase = 'investigate'
    state.shouldFinish = false
    const beforeSnapshot = `${state.toolExecutions.length}|${state.evidence.length}|${state.successfulActionCount}`

    if (state.requestsUsed >= budget.maxRequests) {
      state.stopReason = `Reach max requests (${budget.maxRequests}).`
      break
    }

    if (state.tokenEstimate >= budget.maxTotalTokens) {
      state.stopReason = `Reach token budget (${budget.maxTotalTokens}).`
      break
    }

    const loopNodeId = createNodeId(state, 'loop')
    state.nodes.push({
      id: loopNodeId,
      kind: 'workflow-loop',
      status: 'running',
      label: `Investigate Loop #${step}`,
      detail: 'Plan → Governance → Tool → Memory → Evidence',
      phase: 'investigate',
      branch: state.currentBranch,
      timestamp: Date.now(),
    })

    if (state.previousNodeId) {
      pushEdge(state, state.previousNodeId, loopNodeId, 'loop:start')
    }
    if (state.previousInvestigateLoopNodeId) {
      pushEdge(state, state.previousInvestigateLoopNodeId, loopNodeId, 'next', true)
    }

    state.activeInvestigateLoopNodeId = loopNodeId
    state.previousInvestigateLoopNodeId = loopNodeId

    let lastComponentNodeId: string | null = null
    for (const component of components) {
      lastComponentNodeId = await executeComponent(state, component, workspaceRoot)
      if (state.shouldFinish) {
        break
      }
    }
    if (lastComponentNodeId) {
      pushEdge(state, lastComponentNodeId, loopNodeId, 'feedback', true)
    }

    finishComponentNode(state, loopNodeId, true)
    state.activeInvestigateLoopNodeId = null
    state.previousNodeId = loopNodeId

    const afterSnapshot = `${state.toolExecutions.length}|${state.evidence.length}|${state.successfulActionCount}`
    if (!state.shouldFinish && beforeSnapshot === afterSnapshot) {
      state.stopReason = `No progress at loop step ${step}.`
      break
    }

    if (state.shouldFinish) {
      state.stopReason = state.stopReason || `Finish requested at loop step ${step}.`
      break
    }
  }

  if (!state.stopReason) {
    state.stopReason = `Loop ended by step budget (${maxSteps}).`
  }
}

async function executeComponent(
  state: AgentExecutionState,
  component: AgentWorkflowComponent,
  workspaceRoot: string,
): Promise<string | null> {
  const ctx = { state, component, workspaceRoot }
  const runningNode = pushComponentNode(
    ctx,
    'running',
    component.name,
    component.description,
  )

  try {
    const handler = resolveHandler(component.type)
    await handler(ctx)
    finishComponentNode(state, runningNode.id, true)
    return runningNode.id
  } catch (error) {
    finishComponentNode(
      state,
      runningNode.id,
      false,
      error instanceof Error ? error.message : String(error),
    )

    state.messages.push({
      id: `${state.runId}-msg-error-${state.messages.length + 1}`,
      role: 'agent',
      content: `组件 ${component.name} 执行失败：${error instanceof Error ? error.message : String(error)}`,
      timestamp: Date.now(),
      status: 'error',
      nodeId: runningNode.id,
    })
    return runningNode.id
  }
}

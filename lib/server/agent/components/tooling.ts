import type {
  ComponentExecutionContext,
  ComponentHandler,
  ToolActionExecution,
} from '@/lib/server/agent/context'
import {
  createMemoryId,
  createNodeId,
  pushEdge,
  pushEvidence,
  pushMessage,
} from '@/lib/server/agent/context'
import type { AgentActionType, ToolName } from '@/lib/types'
import { buildProjectManifest, readCodeFile, searchCode } from '@/lib/server/agent/workspace'

const ACTION_TOOL_MAP: Record<AgentActionType, ToolName> = {
  get_project_manifest: 'filesystem',
  query_telemetry_aggregate: 'memory',
  read_telemetry_slice: 'memory',
  search_code: 'filesystem',
  read_code_file: 'filesystem',
  use_previous_output: 'memory',
  finish: 'llm',
}

function normalizePathToken(path: string | undefined) {
  return (path ?? '').trim().replace(/\\/g, '/').replace(/^\.?\//, '')
}

function removePendingCodePath(state: ComponentExecutionContext['state'], path: string) {
  state.pendingCodeReadPaths = state.pendingCodeReadPaths.filter(item => item !== path)
}

function enqueueCodeCandidatesFromSearchOutput(state: ComponentExecutionContext['state'], output: string) {
  const lines = output.split('\n').map(item => item.trim()).filter(Boolean)
  for (const line of lines) {
    const firstColon = line.indexOf(':')
    if (firstColon <= 0) continue
    const path = normalizePathToken(line.slice(0, firstColon))
    if (!path) continue
    if (state.readCodeFiles[path]) continue
    if (state.exhaustedCodeReadPaths[path]) continue
    if (state.pendingCodeReadPaths.includes(path)) continue
    state.pendingCodeReadPaths.push(path)
  }
}

function updatePhaseAfterAction(state: ComponentExecutionContext['state'], actionType: AgentActionType, success: boolean) {
  if (!success) return
  if (state.currentPhase !== 'discover') return

  const hasTelemetry = actionType === 'query_telemetry_aggregate' || actionType === 'read_telemetry_slice'
  const hasCodeProbe = actionType === 'search_code' || actionType === 'read_code_file'
  if ((hasTelemetry && state.successfulActionCount >= 2) || hasCodeProbe) {
    state.currentPhase = 'investigate'
  }
}

function updateWorkingMemoryAfterExecution(
  ctx: ComponentExecutionContext,
  result: ToolActionExecution,
) {
  const { state } = ctx
  const signature = `${result.actionType}|${(result.query ?? '').trim()}|${normalizePathToken(result.path)}`

  if (result.actionType === 'search_code' && result.query) {
    state.searchedQueries[result.query.toLowerCase()] = true
  }

  if (result.actionType === 'search_code' && result.success) {
    enqueueCodeCandidatesFromSearchOutput(state, result.output)
    if (!result.output.includes('No search result.')) {
      state.searchSuccessCount += 1
    }
  }

  if (result.actionType === 'read_code_file') {
    const normalizedPath = normalizePathToken(result.path)
    if (normalizedPath) {
      removePendingCodePath(state, normalizedPath)
      if (result.success) {
        state.readCodeFiles[normalizedPath] = true
        state.codeReadSuccessCount += 1
      } else {
        state.bannedCodeReadPaths[normalizedPath] = true
      }
    }
  }

  if (result.actionType === 'query_telemetry_aggregate' && result.success) {
    state.telemetryAggregateDone = true
  }

  if (result.actionType === 'read_telemetry_slice' && result.success) {
    state.telemetrySliceSuccessCount += 1
  }

  const lowValue =
    !result.success ||
    (result.actionType === 'search_code' && result.output.includes('No search result.')) ||
    (result.actionType === 'query_telemetry_aggregate' && result.output.includes('not configured')) ||
    (result.actionType === 'read_telemetry_slice' && result.output.includes('not configured'))

  if (lowValue) {
    state.consecutiveLowValueActions += 1
    state.blockedActionCount += 1
    if (signature) {
      state.bannedActionSignatures[signature] = true
    }
  } else {
    state.successfulActionCount += 1
    state.consecutiveLowValueActions = 0
    state.blockedActionCount = 0
  }

  updatePhaseAfterAction(state, result.actionType, result.success)
}

export const manifestLoaderHandler: ComponentHandler = async (ctx: ComponentExecutionContext) => {
  const { state, workspaceRoot } = ctx
  if (!state.request.workflow.options.includeProjectManifest) {
    pushEvidence(state, 'manifest disabled by workflow option.')
    return
  }

  const maxFiles = Math.max(20, Math.min(400, state.request.workflow.options.budget.maxSteps * 25))
  const files = await buildProjectManifest(workspaceRoot, maxFiles)
  const manifestText = `manifest files=${files.length}\n${files.slice(0, 40).join('\n')}`
  pushEvidence(state, manifestText)

  pushMessage(state, {
    id: `${state.runId}-msg-manifest`,
    role: 'agent',
    content: `Manifest 已加载，共 ${files.length} 个文件。`,
    timestamp: Date.now(),
    status: 'success',
    nodeId: state.activeComponentNodeId ?? undefined,
  })
}

export const toolExecutorHandler: ComponentHandler = async (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  state.currentPhase = 'investigate'

  const hasFinishAction = state.plannedActions.some(item => item.actionType === 'finish')
  const actions = state.plannedActions.filter(item => item.actionType !== 'finish')
  if (actions.length === 0) {
    pushEvidence(state, 'tool executor skipped: no actions')
    if (hasFinishAction) {
      state.shouldFinish = true
      state.stopReason = state.stopReason || `No executable action, finish at step ${state.loopStep}.`
    }
    return
  }

  const results: ToolActionExecution[] = []
  for (const action of actions) {
    const result = await executeAction(ctx, action.actionType, action.query, action.path)
    results.push({ ...result, why: action.why })
    if (!result.success) {
      pushEvidence(state, `tool failed: ${action.actionType} -> ${result.summary}`)
    }
  }

  for (const result of results) {
    appendToolArtifacts(ctx, result)
    updateWorkingMemoryAfterExecution(ctx, result)
  }

  const hasError = results.some(item => !item.success)
  state.tokenEstimate += Math.ceil(results.reduce((sum, item) => sum + item.output.length, 0) / 6)

  if (hasFinishAction && !hasError) {
    state.shouldFinish = true
    state.stopReason = state.stopReason || `Finish action accepted at step ${state.loopStep}.`
  }
}

async function executeAction(
  ctx: ComponentExecutionContext,
  actionType: AgentActionType,
  query?: string,
  path?: string,
): Promise<ToolActionExecution> {
  const { workspaceRoot, state } = ctx

  if (actionType === 'search_code') {
    const q = query?.trim() || 'RunAnalysisAgentOrchestrator'
    const hits = await searchCode(workspaceRoot, q, 12)
    const output = hits.length
      ? hits.map(hit => `${hit.file}:${hit.line} ${hit.preview}`).join('\n')
      : 'No search result.'

    const firstFile = hits[0]?.file

    return {
      actionType,
      success: true,
      output,
      summary: `search ${q} -> ${hits.length} hits`,
      query: q,
      path: firstFile,
    }
  }

  if (actionType === 'read_code_file') {
    const targetPath = path || state.pendingCodeReadPaths[0] || 'hooks/use-agent-ws.ts'
    try {
      const output = await readCodeFile(workspaceRoot, targetPath, 1, 180)
      return {
        actionType,
        success: true,
        output,
        summary: `read ${targetPath}`,
        path: targetPath,
      }
    } catch (error) {
      return {
        actionType,
        success: false,
        output: String(error),
        summary: `read failed ${targetPath}`,
        path: targetPath,
      }
    }
  }

  if (actionType === 'get_project_manifest') {
    const files = await buildProjectManifest(workspaceRoot, 80)
    return {
      actionType,
      success: true,
      output: files.join('\n'),
      summary: `manifest ${files.length} files`,
    }
  }

  if (actionType === 'query_telemetry_aggregate' || actionType === 'read_telemetry_slice') {
    const output = 'Telemetry source not configured in web backend. Use injected runtime summary.'
    return {
      actionType,
      success: false,
      output,
      summary: 'telemetry unavailable',
    }
  }

  return {
    actionType,
    success: true,
    output: 'No-op action.',
    summary: 'noop',
  }
}

function appendToolArtifacts(ctx: ComponentExecutionContext, result: ToolActionExecution) {
  const { state } = ctx
  const callNodeId = createNodeId(state, 'tool')
  const resultNodeId = createNodeId(state, 'tool')

  state.nodes.push({
    id: callNodeId,
    kind: 'tool-call',
    status: 'success',
    label: result.actionType,
    detail: result.why ?? 'tool action',
    tool: ACTION_TOOL_MAP[result.actionType],
    branch: state.currentBranch,
    phase: state.currentPhase,
    actionType: result.actionType,
    timestamp: Date.now(),
  })

  if (state.activeComponentNodeId) {
    pushEdge(state, state.activeComponentNodeId, callNodeId, 'tool:call')
  }

  state.nodes.push({
    id: resultNodeId,
    kind: 'tool-result',
    status: result.success ? 'success' : 'error',
    label: result.summary,
    detail: result.output.slice(0, 180),
    tool: ACTION_TOOL_MAP[result.actionType],
    branch: state.currentBranch,
    phase: state.currentPhase,
    actionType: result.actionType,
    timestamp: Date.now(),
  })

  pushEdge(state, callNodeId, resultNodeId, 'tool:result')

  state.toolExecutions.push({
    id: `${state.runId}-exec-${state.toolExecutions.length + 1}`,
    tool: ACTION_TOOL_MAP[result.actionType],
    status: result.success ? 'success' : 'error',
    input: {
      actionType: result.actionType,
      query: result.query,
      path: result.path,
    },
    output: result.output,
    startTime: Date.now() - 120,
    endTime: Date.now(),
    nodeId: callNodeId,
  })

  pushMessage(state, {
    id: `${state.runId}-msg-tool-${state.messages.length + 1}`,
    role: 'tool',
    content: `${result.actionType}: ${result.summary}`,
    timestamp: Date.now(),
    nodeId: callNodeId,
    toolName: ACTION_TOOL_MAP[result.actionType],
    status: result.success ? 'success' : 'error',
    toolInput: {
      actionType: result.actionType,
      query: result.query,
      path: result.path,
    },
    toolOutput: result.output.slice(0, 4000),
  })

  pushEvidence(state, `${result.actionType}: ${result.summary}`)
}

export const causalMemoryHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  if (!state.request.workflow.options.enableCausalMemory) {
    pushEvidence(state, 'causal memory disabled by workflow option.')
    return
  }

  const recent = state.nodes
    .filter(node =>
      node.kind === 'tool-result' ||
      node.kind === 'workflow-component' ||
      node.kind === 'workflow-loop',
    )
    .slice(-4)

  let previousMemoryNodeId: string | null = null
  for (const node of recent) {
    const memoryId = createMemoryId(state)
    const memoryNode: typeof state.causalMemoryNodes[number] = {
      id: memoryId,
      stepIndex: state.causalMemoryNodes.length + 1,
      phase: node.phase ?? state.currentPhase,
      actionType: node.actionType ?? 'finish',
      nodeKind: node.kind === 'tool-result' ? 'tool-execution' : 'planner-decision',
      success: node.status !== 'error',
      summary: node.label,
      why: node.detail ?? 'derived from execution',
      digest: (node.detail ?? node.label).slice(0, 120),
      objectiveTags: [node.kind, node.phase ?? state.currentPhase],
      timestamp: Date.now(),
    }
    state.causalMemoryNodes.push(memoryNode)

    if (previousMemoryNodeId) {
      state.causalMemoryEdges.push({
        id: `${state.runId}-me-${state.causalMemoryEdges.length + 1}`,
        fromNodeId: previousMemoryNodeId,
        toNodeId: memoryId,
        relationType: 'refines',
        note: 'Execution continuity',
      })
    }
    previousMemoryNodeId = memoryId
  }

  pushEvidence(state, `causal memory size: nodes=${state.causalMemoryNodes.length}, edges=${state.causalMemoryEdges.length}`)
}

export const evidenceHubHandler: ComponentHandler = (ctx: ComponentExecutionContext) => {
  const { state } = ctx
  const maxChars = state.request.workflow.options.causalMemoryMaxChars
  const merged = state.evidence.join('\n')
  if (merged.length <= maxChars) {
    return
  }

  const clipped = merged.slice(0, maxChars)
  state.evidence = clipped.split('\n')
  pushEvidence(state, `evidence clipped to ${maxChars} chars`)
}

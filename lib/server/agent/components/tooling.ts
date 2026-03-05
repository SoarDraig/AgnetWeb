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
    if (firstFile) {
      const firstReadable = state.plannedActions.find(item => item.actionType === 'read_code_file' && !item.path)
      if (firstReadable) firstReadable.path = firstFile
    }

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
    const targetPath = path || state.plannedActions.find(item => item.actionType === 'read_code_file')?.path || 'hooks/use-agent-ws.ts'
    try {
      const output = await readCodeFile(workspaceRoot, targetPath, 1, 120)
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
    .filter(node => node.kind === 'tool-result' || node.kind === 'workflow-component')
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

import type {
  AgentWorkflowComponent,
  AgentPhase,
  AgentNode,
  AgentEdge,
  ChatMessage,
  ToolExecution,
  AgentCausalMemoryNode,
  AgentCausalMemoryEdge,
  AgentActionType,
  NodeStatus,
} from '@/lib/types'
import type { AgentRunRequest, AgentRunToolAction } from '@/lib/agent-run-contract'

export interface AgentExecutionState {
  runId: string
  startedAt: number
  currentPhase: AgentPhase
  currentBranch: string
  request: AgentRunRequest

  nodes: AgentNode[]
  edges: AgentEdge[]
  messages: ChatMessage[]
  toolExecutions: ToolExecution[]
  causalMemoryNodes: AgentCausalMemoryNode[]
  causalMemoryEdges: AgentCausalMemoryEdge[]

  plannedActions: AgentRunToolAction[]
  evidence: string[]
  summary: string
  nodeCounter: number
  edgeCounter: number
  memoryCounter: number
  previousNodeId: string | null
  activeComponentNodeId: string | null
  actionHits: Record<string, number>
  loopStep: number
  requestsUsed: number
  tokenEstimate: number
  shouldFinish: boolean
  stopReason: string

  plannedActionClasses: AgentActionType[]
  pendingCodeReadPaths: string[]
  exhaustedCodeReadPaths: Record<string, true>
  readCodeFiles: Record<string, true>
  searchedQueries: Record<string, true>
  telemetryNextOffsets: Record<string, number>
  exhaustedTelemetryCursors: Record<string, true>

  telemetryAggregateDone: boolean
  telemetrySliceSuccessCount: number
  codeReadSuccessCount: number
  searchSuccessCount: number
  successfulActionCount: number
  consecutiveLowValueActions: number

  bannedActionSignatures: Record<string, true>
  bannedCodeReadPaths: Record<string, true>
  lastActionSignature: string
  repeatActionCount: number
  blockedActionCount: number

  activeInvestigateLoopNodeId: string | null
  previousInvestigateLoopNodeId: string | null
}

export interface ComponentExecutionContext {
  state: AgentExecutionState
  component: AgentWorkflowComponent
  workspaceRoot: string
}

export type ComponentHandler = (ctx: ComponentExecutionContext) => Promise<void> | void

export interface ToolActionExecution {
  actionType: AgentActionType
  success: boolean
  output: string
  summary: string
  query?: string
  path?: string
  why?: string
}

export function createNodeId(state: AgentExecutionState, prefix: string) {
  state.nodeCounter += 1
  return `${state.runId}-${prefix}-${state.nodeCounter}`
}

export function createEdgeId(state: AgentExecutionState) {
  state.edgeCounter += 1
  return `${state.runId}-edge-${state.edgeCounter}`
}

export function createMemoryId(state: AgentExecutionState) {
  state.memoryCounter += 1
  return `${state.runId}-m${state.memoryCounter}`
}

export function pushEdge(state: AgentExecutionState, source: string, target: string, label?: string, animated = false) {
  state.edges.push({
    id: createEdgeId(state),
    source,
    target,
    label,
    animated,
  })
}

export function pushMessage(state: AgentExecutionState, message: ChatMessage) {
  state.messages.push(message)
}

export function pushEvidence(state: AgentExecutionState, line: string) {
  if (!line.trim()) return
  state.evidence.push(line)
}

export function pushComponentNode(
  ctx: ComponentExecutionContext,
  status: NodeStatus,
  label: string,
  detail: string,
) {
  const { state, component } = ctx
  const node: AgentNode = {
    id: createNodeId(state, 'wf'),
    kind: 'workflow-component',
    status,
    label,
    detail,
    phase: component.phase,
    componentType: component.type,
    branch: state.currentBranch,
    timestamp: Date.now(),
  }
  state.nodes.push(node)

  if (component.phase === 'investigate' && state.activeInvestigateLoopNodeId) {
    pushEdge(state, state.activeInvestigateLoopNodeId, node.id, 'contains')
  } else if (state.previousNodeId) {
    pushEdge(state, state.previousNodeId, node.id, component.phase)
    state.previousNodeId = node.id
  } else {
    state.previousNodeId = node.id
  }
  state.activeComponentNodeId = node.id
  return node
}

export function finishComponentNode(state: AgentExecutionState, nodeId: string, success: boolean, detail?: string) {
  state.nodes = state.nodes.map(node =>
    node.id === nodeId
      ? {
          ...node,
          status: success ? 'success' : 'error',
          detail: detail ?? node.detail,
          timestamp: Date.now(),
        }
      : node,
  )
}

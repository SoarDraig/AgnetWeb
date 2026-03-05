import type {
  AgentWorkflowDefinition,
  AgentNode,
  AgentEdge,
  ChatMessage,
  ToolExecution,
  AgentCausalMemoryNode,
  AgentCausalMemoryEdge,
  AgentPhase,
  AgentActionType,
  OpenAICompatibleApiConfig,
} from './types'

export interface AgentRunRequest {
  prompt: string
  workflow: AgentWorkflowDefinition
  currentBranch: string
  apiConfig: OpenAICompatibleApiConfig
  conversationHistory?: Array<{
    role: 'user' | 'agent'
    content: string
  }>
}

export interface AgentRunToolAction {
  actionType: AgentActionType
  query?: string
  path?: string
  why?: string
}

export interface AgentRunResponse {
  runId: string
  startedAt: number
  finishedAt: number
  currentPhase: AgentPhase
  nodes: AgentNode[]
  edges: AgentEdge[]
  messages: ChatMessage[]
  toolExecutions: ToolExecution[]
  causalMemoryNodes: AgentCausalMemoryNode[]
  causalMemoryEdges: AgentCausalMemoryEdge[]
  plannedActions: AgentRunToolAction[]
  evidence: string[]
  summary: string
}

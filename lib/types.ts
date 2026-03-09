// ─── Agent 核心类型 ────────────────────────────────────────────────────

export type ToolName = 'filesystem' | 'git' | 'shell' | 'llm' | 'memory'

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'skipped'

export type AgentPhase = 'discover' | 'investigate' | 'synthesize'

export type AgentActionType =
  | 'get_project_manifest'
  | 'query_telemetry_aggregate'
  | 'read_telemetry_slice'
  | 'search_code'
  | 'read_code_file'
  | 'use_previous_output'
  | 'finish'

export type WorkflowComponentType =
  | 'run-orchestrator'
  | 'manifest-loader'
  | 'baseline-analyzer'
  | 'llm-planner'
  | 'tool-executor'
  | 'causal-memory'
  | 'governance-gate'
  | 'evidence-hub'
  | 'summary-synthesizer'
  | 'critique-refiner'
  | 'custom-prompt'

export type NodeKind =
  | 'user-input'
  | 'agent-think'
  | 'tool-call'
  | 'tool-result'
  | 'memory'
  | 'branch'
  | 'checkpoint'
  | 'workflow-component'

// ─── 版本 / 提交记录 ──────────────────────────────────────────────────

export interface Commit {
  hash: string
  fullHash: string
  message: string
  timestamp: number
  branch: string
  parentHash: string | null
  parentHashes: string[]
  tags: string[]
  author: string
  nodeIds: string[]
  workflowId?: string
}

export interface Branch {
  name: string
  headHash: string
  color: string
  isActive: boolean
  isMerged: boolean
}

// ─── 工作流模型（参考 RunAnalysis）───────────────────────────────────

export interface AgentBudget {
  maxSteps: number
  maxRequests: number
  maxTotalTokens: number
  maxParallelRequests: number
}

export interface AgentToolPermissions {
  allowTelemetryRead: boolean
  allowCodeSearch: boolean
  allowCodeRead: boolean
}

export interface AgentActionQuotas {
  maxCodeReadActions: number
  maxCodeSearchActions: number
  maxTelemetrySliceActions: number
}

export interface OpenAICompatibleApiConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
}

export interface AgentWorkflowOptions {
  autonomousToolAgent: boolean
  enableCausalMemory: boolean
  includeProjectManifest: boolean
  forceManifestFirst: boolean
  includePreviousOutput: boolean
  debugVerboseReport: boolean
  causalMemoryTopK: number
  causalMemoryMaxChars: number
  budget: AgentBudget
  toolPermissions: AgentToolPermissions
  actionQuotas: AgentActionQuotas
}

export interface AgentWorkflowComponent {
  id: string
  type: WorkflowComponentType
  name: string
  phase: AgentPhase
  enabled: boolean
  description: string
  color: string
  config?: Record<string, unknown>
}

export interface AgentWorkflowDefinition {
  id: string
  name: string
  description: string
  components: AgentWorkflowComponent[]
  options: AgentWorkflowOptions
  lastUpdated: number
  isTemplate?: boolean
}

export interface AgentWorkflowTemplate {
  id: string
  name: string
  description: string
  components: AgentWorkflowComponent[]
  options: AgentWorkflowOptions
}

export type AgentCausalRelationType = 'causes' | 'depends_on' | 'refines' | 'blocks'

export interface AgentCausalMemoryNode {
  id: string
  stepIndex: number
  phase: AgentPhase
  actionType: AgentActionType
  nodeKind: 'planner-decision' | 'tool-execution' | 'observation'
  success: boolean
  summary: string
  why: string
  digest: string
  objectiveTags: string[]
  timestamp: number
}

export interface AgentCausalMemoryEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  relationType: AgentCausalRelationType
  note: string
}

// ─── Agent 节点（ReactFlow 展示用）────────────────────────────────────

export interface AgentNode {
  id: string
  kind: NodeKind
  status: NodeStatus
  label: string
  detail?: string
  tool?: ToolName
  commitHash?: string
  branch?: string
  timestamp: number
  duration?: number
  tokenCount?: number
  phase?: AgentPhase
  actionType?: AgentActionType
  componentType?: WorkflowComponentType
  meta?: Record<string, unknown>
}

export interface AgentEdge {
  id: string
  source: string
  target: string
  animated?: boolean
  label?: string
}

// ─── 消息 / 对话 ─────────────────────────────────────────────────────

export type MessageRole = 'user' | 'agent' | 'tool' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  timestamp: number
  nodeId?: string
  toolName?: ToolName
  status?: NodeStatus
  thinking?: string
  toolInput?: Record<string, unknown>
  toolOutput?: string
}

export interface AgentChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

// ─── 工具执行记录 ─────────────────────────────────────────────────────

export interface ToolExecution {
  id: string
  tool: ToolName
  status: NodeStatus
  input: Record<string, unknown>
  output?: string
  error?: string
  startTime: number
  endTime?: number
  nodeId: string
}

// ─── WebSocket 消息协议 ───────────────────────────────────────────────

export type WsEventType =
  | 'agent:start'
  | 'agent:think'
  | 'agent:finish'
  | 'tool:call'
  | 'tool:result'
  | 'tool:error'
  | 'memory:read'
  | 'memory:write'
  | 'commit:create'
  | 'branch:create'
  | 'branch:checkout'
  | 'branch:merge'
  | 'node:add'
  | 'node:update'
  | 'workflow:update'
  | 'error'
  | 'ping'
  | 'pong'

export interface WsEvent {
  type: WsEventType
  id: string
  timestamp: number
  payload: Record<string, unknown>
}

// ─── 应用全局状态 ─────────────────────────────────────────────────────

export type WsConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface AgentState {
  wsStatus: WsConnectionStatus
  wsUrl: string

  nodes: AgentNode[]
  edges: AgentEdge[]
  selectedNodeId: string | null

  commits: Commit[]
  branches: Branch[]
  currentBranch: string
  headCommit: string | null
  checkedOutHash: string | null

  messages: ChatMessage[]
  toolExecutions: ToolExecution[]

  workflow: AgentWorkflowDefinition
  workflowTemplates: AgentWorkflowTemplate[]
  apiConfig: OpenAICompatibleApiConfig
  causalMemoryNodes: AgentCausalMemoryNode[]
  causalMemoryEdges: AgentCausalMemoryEdge[]

  isRunning: boolean
  currentTaskId: string | null
}

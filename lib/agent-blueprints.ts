import type {
  AgentPhase,
  AgentWorkflowComponent,
  AgentWorkflowDefinition,
  AgentWorkflowOptions,
  AgentWorkflowTemplate,
  WorkflowComponentType,
} from '@/lib/types'

export interface MemoryCheckpoint {
  name: string
  when: string
  objective: string
}

export interface AgentBlueprint {
  id: string
  name: string
  description: string
  strategy: 'speed' | 'balanced' | 'quality'
  stagePlan: Record<AgentPhase, WorkflowComponentType[]>
  memoryCheckpoints: MemoryCheckpoint[]
  executionOrder: string[]
}

type ComponentCatalogEntry = {
  type: WorkflowComponentType
  phase: AgentPhase
  name: string
  description: string
  color: string
}

const COMPONENT_CATALOG: ComponentCatalogEntry[] = [
  { type: 'run-orchestrator', phase: 'discover', name: 'Run Orchestrator', description: '管理阶段状态机，确保先 discover 再 investigate 再 synthesize。', color: '#0070f3' },
  { type: 'manifest-loader', phase: 'discover', name: 'Manifest Loader', description: '优先读取项目结构，形成可控搜索边界。', color: '#00d4ff' },
  { type: 'baseline-analyzer', phase: 'discover', name: 'Baseline Analyzer', description: '生成初始认知与问题分解基线。', color: '#22c55e' },
  { type: 'llm-planner', phase: 'investigate', name: 'LLM Planner', description: '按预算生成下一步动作，避免盲目执行。', color: '#f59e0b' },
  { type: 'tool-executor', phase: 'investigate', name: 'Tool Executor', description: '执行代码、shell、检索等动作并记录证据。', color: '#06b6d4' },
  { type: 'causal-memory', phase: 'investigate', name: 'Causal Memory', description: '记录每步因果关系并提供召回增强。', color: '#a855f7' },
  { type: 'governance-gate', phase: 'investigate', name: 'Governance Gate', description: '预算/重复动作/权限控制。', color: '#ec4899' },
  { type: 'evidence-hub', phase: 'investigate', name: 'Evidence Hub', description: '聚合证据，支持总结阶段可追溯。', color: '#14b8a6' },
  { type: 'summary-synthesizer', phase: 'synthesize', name: 'Summary Synthesizer', description: '合并上下文输出最终结论。', color: '#22c55e' },
  { type: 'critique-refiner', phase: 'synthesize', name: 'Critique Refiner', description: '二轮复核，提升稳定性与可信度。', color: '#f97316' },
  { type: 'custom-prompt', phase: 'investigate', name: 'Custom Prompt', description: '注入可编辑系统提示词，定义聊天人设与边界。', color: '#94a3b8' },
]

const CATALOG_MAP = new Map(COMPONENT_CATALOG.map(item => [item.type, item] as const))

export const AGENT_BLUEPRINTS: AgentBlueprint[] = [
  {
    id: 'rapid-delivery',
    name: '极速交付编排',
    description: '面向“先跑通”的交付场景，减少深度记忆写入和二轮反思。',
    strategy: 'speed',
    stagePlan: {
      discover: ['run-orchestrator', 'manifest-loader', 'baseline-analyzer'],
      investigate: ['llm-planner', 'tool-executor', 'governance-gate', 'evidence-hub'],
      synthesize: ['summary-synthesizer'],
    },
    memoryCheckpoints: [
      { name: '失败快照', when: 'tool error 后', objective: '只保留问题根因，供重试使用' },
      { name: '结论快照', when: 'summary 前', objective: '汇总关键证据，避免漏结论' },
    ],
    executionOrder: ['扫描项目', '生成最小计划', '执行工具', '证据聚合', '最终总结'],
  },
  {
    id: 'project-pilot',
    name: '项目领航编排',
    description: '默认推荐：平衡速度与质量，强调“每轮行动后记忆”。',
    strategy: 'balanced',
    stagePlan: {
      discover: ['run-orchestrator', 'manifest-loader', 'baseline-analyzer'],
      investigate: ['llm-planner', 'tool-executor', 'causal-memory', 'governance-gate', 'evidence-hub'],
      synthesize: ['summary-synthesizer', 'critique-refiner'],
    },
    memoryCheckpoints: [
      { name: '动作后记忆', when: '每个 investigate 回合', objective: '记录“为什么这么做”与结果因果' },
      { name: '总结前召回', when: 'synthesize 前', objective: '召回 topK 关键历史，避免上下文断裂' },
    ],
    executionOrder: ['项目理解', '基线分析', '计划/执行循环', '因果召回', '总结与复核'],
  },
  {
    id: 'daily-chatbot',
    name: '日常聊天机器人',
    description: '面向日常问答与陪聊场景，强调自然对话、稳定语气与轻量记忆。',
    strategy: 'balanced',
    stagePlan: {
      discover: ['run-orchestrator', 'baseline-analyzer'],
      investigate: ['custom-prompt', 'llm-planner', 'evidence-hub'],
      synthesize: ['summary-synthesizer'],
    },
    memoryCheckpoints: [
      { name: '会话偏好记忆', when: '每 3-5 轮对话后', objective: '记录用户偏好与禁忌，避免反复询问' },
      { name: '上下文压缩', when: '超过长上下文阈值时', objective: '保留用户意图与事实，压缩闲聊内容' },
    ],
    executionOrder: ['接收用户消息', '套用人设 prompt', '生成回复计划', '组织回答', '输出自然回复'],
  },
  {
    id: 'deep-diagnosis',
    name: '深度诊断编排',
    description: '复杂问题定位模式：高预算、强记忆、双阶段收敛。',
    strategy: 'quality',
    stagePlan: {
      discover: ['run-orchestrator', 'manifest-loader', 'baseline-analyzer'],
      investigate: ['llm-planner', 'tool-executor', 'causal-memory', 'governance-gate', 'evidence-hub'],
      synthesize: ['summary-synthesizer', 'critique-refiner'],
    },
    memoryCheckpoints: [
      { name: '每步摘要记忆', when: '每次 planner / tool 后', objective: '沉淀步骤意图与证据来源' },
      { name: '决策前强召回', when: '每次大动作前', objective: '利用标签聚类降低重复探索' },
      { name: '结论一致性检查', when: 'critique 阶段', objective: '验证结论与证据一一对应' },
    ],
    executionOrder: ['结构建模', '多轮计划', '工具探索', '记忆强化', '双阶段总结'],
  },
]

function cloneOptions(options: AgentWorkflowOptions): AgentWorkflowOptions {
  return {
    ...options,
    budget: { ...options.budget },
    toolPermissions: { ...options.toolPermissions },
    actionQuotas: { ...options.actionQuotas },
  }
}

function configureOptionsByStrategy(base: AgentWorkflowOptions, strategy: AgentBlueprint['strategy']): AgentWorkflowOptions {
  const options = cloneOptions(base)

  if (strategy === 'speed') {
    options.enableCausalMemory = false
    options.debugVerboseReport = false
    options.causalMemoryTopK = 2
    options.causalMemoryMaxChars = 900
    options.budget.maxSteps = 5
    options.budget.maxRequests = 8
    options.budget.maxTotalTokens = 9000
  } else if (strategy === 'quality') {
    options.enableCausalMemory = true
    options.debugVerboseReport = true
    options.causalMemoryTopK = 12
    options.causalMemoryMaxChars = 3200
    options.budget.maxSteps = 16
    options.budget.maxRequests = 24
    options.budget.maxTotalTokens = 42000
  } else {
    options.enableCausalMemory = true
    options.debugVerboseReport = true
    options.causalMemoryTopK = 8
    options.causalMemoryMaxChars = 2200
    options.budget.maxSteps = 10
    options.budget.maxRequests = 15
    options.budget.maxTotalTokens = 24000
  }

  return options
}

function createComponent(type: WorkflowComponentType, order: number, componentMap: Map<WorkflowComponentType, AgentWorkflowComponent>): AgentWorkflowComponent {
  const existing = componentMap.get(type)
  const fallback = CATALOG_MAP.get(type)

  return {
    id: existing?.id ?? `wf-${type}`,
    type,
    name: existing?.name ?? fallback?.name ?? type,
    phase: fallback?.phase ?? existing?.phase ?? 'investigate',
    enabled: true,
    color: existing?.color ?? fallback?.color ?? '#666',
    description: existing?.description ?? fallback?.description ?? type,
    config: {
      ...(existing?.config ?? {}),
      orchestrationOrder: order,
    },
  }
}

function flattenStagePlan(stagePlan: AgentBlueprint['stagePlan']): WorkflowComponentType[] {
  return [...stagePlan.discover, ...stagePlan.investigate, ...stagePlan.synthesize]
}

export function buildWorkflowFromBlueprint(workflow: AgentWorkflowDefinition, blueprintId: string): AgentWorkflowDefinition {
  const blueprint = AGENT_BLUEPRINTS.find(item => item.id === blueprintId)
  if (!blueprint) return workflow

  const options = configureOptionsByStrategy(workflow.options, blueprint.strategy)
  const componentMap = new Map(workflow.components.map(item => [item.type, item] as const))
  const orderedTypes = flattenStagePlan(blueprint.stagePlan)

  const components = orderedTypes.map((type, index) => createComponent(type, index + 1, componentMap)).map(component => ({
    ...component,
    enabled: component.type === 'causal-memory' ? options.enableCausalMemory : component.enabled,
  }))

  const memorySummary = blueprint.memoryCheckpoints.map(item => `${item.name}（${item.when}）`).join('；')

  return {
    ...workflow,
    name: `编排器 · ${blueprint.name}`,
    description: `${blueprint.description}\n执行顺序：${blueprint.executionOrder.join(' → ')}\n记忆检查点：${memorySummary}`,
    components,
    options,
    lastUpdated: Date.now(),
  }
}

export function suggestBlueprint(templates: AgentWorkflowTemplate[], projectHints: string[]): string {
  const hintText = projectHints.join(' ').toLowerCase()

  if (hintText.includes('sdk') || hintText.includes('infra') || hintText.includes('distributed')) {
    return 'deep-diagnosis'
  }

  if (hintText.includes('chat') || hintText.includes('bot') || hintText.includes('对话') || hintText.includes('聊天')) {
    return 'daily-chatbot'
  }

  if (hintText.includes('next') || hintText.includes('react') || templates.some(item => item.name.includes('标准'))) {
    return 'project-pilot'
  }

  return 'rapid-delivery'
}

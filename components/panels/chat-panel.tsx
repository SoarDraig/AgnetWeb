'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type {
  ChatMessage,
  AgentWorkflowDefinition,
  AgentWorkflowTemplate,
  WorkflowComponentType,
  AgentWorkflowComponent,
  OpenAICompatibleApiConfig,
  AgentChatSession,
} from '@/lib/types'
import type { AgentWsActions } from '@/hooks/use-agent-ws'
import { AGENT_BLUEPRINTS } from '@/lib/agent-blueprints'

interface Props {
  messages: ChatMessage[]
  isRunning: boolean
  chatSessions: AgentChatSession[]
  activeSessionId: string
  workflow: AgentWorkflowDefinition
  workflowTemplates: AgentWorkflowTemplate[]
  apiConfig: OpenAICompatibleApiConfig
  actions: AgentWsActions
}

const TOOL_COLORS: Record<string, string> = {
  filesystem: '#00d4ff',
  git: '#f59e0b',
  shell: '#22c55e',
  llm: '#a855f7',
  memory: '#ec4899',
}

const TOOL_LABELS: Record<string, string> = {
  filesystem: 'FileSystem',
  git: 'Git',
  shell: 'Shell',
  llm: 'LLM',
  memory: 'Memory',
}

const COMPONENT_CATALOG: Array<{ type: WorkflowComponentType; label: string }> = [
  { type: 'run-orchestrator', label: 'RunAnalysis Orchestrator' },
  { type: 'baseline-analyzer', label: 'Baseline Analyzer' },
  { type: 'manifest-loader', label: 'Manifest Loader (Optional)' },
  { type: 'llm-planner', label: 'LLM Planner' },
  { type: 'governance-gate', label: 'Deterministic Governance' },
  { type: 'tool-executor', label: 'Tool Executor' },
  { type: 'causal-memory', label: 'Causal Memory (Optional)' },
  { type: 'evidence-hub', label: 'Evidence Hub' },
  { type: 'summary-synthesizer', label: 'Summary Synthesizer' },
  { type: 'critique-refiner', label: 'Critique Refiner (Optional)' },
]

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1.5 border border-[#f59e0b22] rounded bg-[#f59e0b08]">
      <button
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="#f59e0b">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 7a1 1 0 100 2 1 1 0 000-2zm.5-5.5h-1v4h1V6.5z" />
        </svg>
        <span className="text-[10px] font-mono text-[#f59e0b]">思考过程</span>
        <span className="ml-auto text-[10px] text-[#555]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-[10px] font-mono text-[#888] leading-relaxed border-t border-[#f59e0b1a]">
          {text}
        </div>
      )}
    </div>
  )
}

function ToolMessage({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[msg.toolName ?? ''] ?? '#555'
  const label = TOOL_LABELS[msg.toolName ?? ''] ?? msg.toolName

  return (
    <div className="rounded-lg border overflow-hidden" style={{ borderColor: color + '33', background: color + '08' }}>
      <button className="w-full flex items-center gap-2 px-3 py-2 text-left" onClick={() => setExpanded(e => !e)}>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ color, background: color + '22', border: `1px solid ${color}33` }}>
          {label}
        </span>
        <span className="text-[11px] font-mono text-[#d4d4d4] flex-1 truncate">{msg.content.split('\n')[0]}</span>
        <StatusBadge status={msg.status ?? 'idle'} />
        <span className="text-[9px] text-[#444] ml-1">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 space-y-2" style={{ borderColor: color + '22' }}>
          {msg.toolInput && (
            <div>
              <p className="text-[9px] font-mono text-[#555] mb-1">INPUT</p>
              <pre className="text-[10px] font-mono text-[#888] whitespace-pre-wrap break-all leading-relaxed bg-[#0a0a0a] rounded p-2">
                {JSON.stringify(msg.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {msg.toolOutput && (
            <div>
              <p className="text-[9px] font-mono text-[#555] mb-1">OUTPUT</p>
              <pre className="text-[10px] font-mono text-[#888] whitespace-pre-wrap break-all leading-relaxed bg-[#0a0a0a] rounded p-2 max-h-36 overflow-y-auto">
                {msg.toolOutput}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    running: { label: '运行中', color: '#f59e0b' },
    success: { label: '完成', color: '#22c55e' },
    error: { label: '错误', color: '#ff4444' },
    idle: { label: '等待', color: '#555' },
  }
  const s = map[status] ?? map.idle
  return (
    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded leading-none" style={{ color: s.color, background: s.color + '18', border: `1px solid ${s.color}33` }}>
      {s.label}
    </span>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-[#999]">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-[#0070f3]" />
      {label}
    </label>
  )
}

function WorkflowComponentRow({
  component,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMove,
  onRemove,
}: {
  component: AgentWorkflowComponent
  canMoveUp: boolean
  canMoveDown: boolean
  onToggle: () => void
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}) {
  return (
    <div className="rounded border border-[#1e1e1e] bg-[#0b0b0b] p-2">
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={component.enabled} onChange={onToggle} className="accent-[#0070f3]" />
        <span className="text-[11px] font-mono" style={{ color: component.color }}>{component.name}</span>
        <span className="text-[9px] px-1 rounded border border-[#2a2a2a] text-[#666]">{component.phase}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            className={cn('text-[10px] px-1.5 py-0.5 rounded border border-[#1e1e1e]', canMoveUp ? 'text-[#888] hover:text-white' : 'text-[#333] cursor-not-allowed')}
            disabled={!canMoveUp}
            onClick={() => onMove('up')}
          >
            ↑
          </button>
          <button
            className={cn('text-[10px] px-1.5 py-0.5 rounded border border-[#1e1e1e]', canMoveDown ? 'text-[#888] hover:text-white' : 'text-[#333] cursor-not-allowed')}
            disabled={!canMoveDown}
            onClick={() => onMove('down')}
          >
            ↓
          </button>
          <button className="text-[10px] px-1.5 py-0.5 rounded border border-[#ff444433] text-[#ff6666] hover:bg-[#ff444411]" onClick={onRemove}>删</button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-[#666] leading-relaxed">{component.description}</p>
    </div>
  )
}

export default function ChatPanel({
  messages,
  isRunning,
  chatSessions,
  activeSessionId,
  workflow,
  workflowTemplates,
  apiConfig,
  actions,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  const [activeTab, setActiveTab] = useState<'chat' | 'workflow' | 'api'>('chat')
  const [selectedTemplate, setSelectedTemplate] = useState(workflowTemplates[0]?.id ?? '')
  const [templateDraftName, setTemplateDraftName] = useState('')
  const [componentToAdd, setComponentToAdd] = useState<WorkflowComponentType>('causal-memory')
  const [snapshotNote, setSnapshotNote] = useState('')
  const [sessionDraftTitle, setSessionDraftTitle] = useState('')
  const [selectedBlueprint, setSelectedBlueprint] = useState(AGENT_BLUEPRINTS[0]?.id ?? 'project-pilot')

  useEffect(() => { setIsMounted(true) }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeTab])

  useEffect(() => {
    const active = chatSessions.find(session => session.id === activeSessionId)
    setSessionDraftTitle(active?.title ?? '')
  }, [chatSessions, activeSessionId])

  useEffect(() => {
    if (!selectedTemplate) return
    const template = workflowTemplates.find(item => item.id === selectedTemplate)
    setTemplateDraftName(template?.name ?? '')
  }, [selectedTemplate, workflowTemplates])

  useEffect(() => {
    if (workflowTemplates.length === 0) return
    const exists = workflowTemplates.some(item => item.id === selectedTemplate)
    if (!exists) {
      setSelectedTemplate(workflowTemplates[0].id)
    }
  }, [selectedTemplate, workflowTemplates])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isRunning) return
    actions.sendUserMessage(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const options = workflow.options
  const activeSession = chatSessions.find(session => session.id === activeSessionId) ?? null
  const activeBlueprint = useMemo(
    () => AGENT_BLUEPRINTS.find(item => item.id === selectedBlueprint) ?? AGENT_BLUEPRINTS[0],
    [selectedBlueprint],
  )

  return (
    <div className="flex flex-col h-full bg-[#000] border-l border-[#1e1e1e]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e1e] flex-shrink-0">
        <button
          className={cn('text-[10px] font-mono px-2 py-0.5 rounded border', activeTab === 'chat' ? 'text-[#d4d4d4] border-[#0070f3] bg-[#0070f322]' : 'text-[#555] border-[#1e1e1e] hover:text-[#888]')}
          onClick={() => setActiveTab('chat')}
        >
          对话
        </button>
        <button
          className={cn('text-[10px] font-mono px-2 py-0.5 rounded border', activeTab === 'workflow' ? 'text-[#d4d4d4] border-[#0070f3] bg-[#0070f322]' : 'text-[#555] border-[#1e1e1e] hover:text-[#888]')}
          onClick={() => setActiveTab('workflow')}
        >
          工作流
        </button>
        <button
          className={cn('text-[10px] font-mono px-2 py-0.5 rounded border', activeTab === 'api' ? 'text-[#d4d4d4] border-[#0070f3] bg-[#0070f322]' : 'text-[#555] border-[#1e1e1e] hover:text-[#888]')}
          onClick={() => setActiveTab('api')}
        >
          API
        </button>
        {isRunning && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
            <span className="text-[9px] font-mono text-[#f59e0b]">运行中</span>
          </span>
        )}
      </div>

      {activeTab === 'chat' ? (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
                  value={activeSessionId}
                  onChange={e => actions.switchChatSession(e.target.value)}
                >
                  {chatSessions.map(session => (
                    <option key={session.id} value={session.id}>
                      {session.title} ({session.messageCount})
                    </option>
                  ))}
                </select>
                <button
                  className="text-[10px] font-mono px-2 py-1.5 rounded bg-[#0070f3] text-white hover:bg-[#0060d3]"
                  onClick={() => actions.createChatSession()}
                >
                  新建
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  className="flex-1 text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
                  value={sessionDraftTitle}
                  onChange={e => setSessionDraftTitle(e.target.value)}
                  onBlur={() => {
                    if (activeSession) {
                      actions.renameChatSession(activeSession.id, sessionDraftTitle)
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && activeSession) {
                      e.preventDefault()
                      actions.renameChatSession(activeSession.id, sessionDraftTitle)
                    }
                  }}
                  placeholder="会话名称"
                />
                <button
                  className="text-[10px] font-mono px-2 py-1.5 rounded bg-[#111] border border-[#1e1e1e] text-[#d4d4d4] hover:bg-[#171717]"
                  onClick={() => actions.clearActiveSession()}
                >
                  清空
                </button>
                <button
                  className="text-[10px] font-mono px-2 py-1.5 rounded border border-[#ff444433] text-[#ff6666] hover:bg-[#ff444411]"
                  onClick={() => {
                    if (!activeSession) return
                    if (!window.confirm(`确认删除会话「${activeSession.title}」？`)) return
                    actions.deleteChatSession(activeSession.id)
                  }}
                >
                  删除
                </button>
              </div>

              <p className="text-[10px] text-[#666]">
                长期会话自动保存在本地浏览器（localStorage），刷新后可继续。
              </p>
            </section>

            {messages.map(msg => (
              <div key={msg.id} className={cn('flex flex-col gap-1', msg.role === 'user' && 'items-end')}>
                <span className="text-[9px] font-mono text-[#444] px-1">
                  {msg.role === 'user' ? '你' : msg.role === 'agent' ? 'Agent' : ''}
                </span>

                {msg.role === 'tool' ? (
                  <ToolMessage msg={msg} />
                ) : (
                  <div
                    className={cn(
                      'max-w-[90%] rounded-lg px-3 py-2',
                      msg.role === 'user'
                        ? 'bg-[#0070f322] border border-[#0070f344] text-[#d4d4d4]'
                        : 'bg-[#0f0f0f] border border-[#1e1e1e] text-[#d4d4d4]',
                    )}
                  >
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    {msg.thinking && <ThinkingBlock text={msg.thinking} />}
                    {msg.status === 'running' && (
                      <div className="flex items-center gap-1 mt-2">
                        <span className="w-1 h-1 rounded-full bg-[#888] animate-bounce [animation-delay:0ms]" />
                        <span className="w-1 h-1 rounded-full bg-[#888] animate-bounce [animation-delay:150ms]" />
                        <span className="w-1 h-1 rounded-full bg-[#888] animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                )}

                <time className="text-[9px] font-mono text-[#333] px-1" suppressHydrationWarning>
                  {isMounted ? new Date(msg.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                </time>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="flex-shrink-0 border-t border-[#1e1e1e] p-3">
            <div className="flex gap-2 items-end">
              <textarea
                className={cn(
                  'flex-1 resize-none rounded-lg bg-[#0f0f0f] border border-[#1e1e1e]',
                  'text-[12px] text-[#d4d4d4] placeholder-[#333] px-3 py-2',
                  'focus:outline-none focus:border-[#0070f3] transition-colors',
                  'min-h-[38px] max-h-[120px] leading-relaxed font-mono',
                )}
                rows={1}
                placeholder="发送指令给 Agent… (Enter 发送, Shift+Enter 换行)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning}
              />
              <button
                className={cn(
                  'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                  'transition-all duration-150',
                  isRunning || !input.trim()
                    ? 'bg-[#111] text-[#333] cursor-not-allowed'
                    : 'bg-[#0070f3] text-white hover:bg-[#0060d3] active:scale-95',
                )}
                onClick={handleSend}
                disabled={isRunning || !input.trim()}
                aria-label="发送"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 2L14 8L8 14M14 8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
            </div>
          </div>
        </>
      ) : activeTab === 'workflow' ? (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">智能体编排器</p>
            <select
              className="w-full text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
              value={selectedBlueprint}
              onChange={e => setSelectedBlueprint(e.target.value)}
            >
              {AGENT_BLUEPRINTS.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
            <div className="rounded border border-[#1e1e1e] bg-[#050505] p-2 space-y-2">
              <p className="text-[11px] text-[#d4d4d4]">{activeBlueprint.description}</p>
              <p className="text-[10px] text-[#666]">执行顺序：{activeBlueprint.executionOrder.join(' → ')}</p>
              <div className="space-y-1">
                <p className="text-[10px] text-[#888]">记忆检查点</p>
                {activeBlueprint.memoryCheckpoints.map(item => (
                  <div key={item.name} className="text-[10px] text-[#666] leading-relaxed">
                    • {item.name}：{item.when}，{item.objective}
                  </div>
                ))}
              </div>
            </div>
            <button
              className="w-full text-[10px] font-mono px-2 py-1.5 rounded bg-[#0070f3] text-white hover:bg-[#0060d3]"
              onClick={() => actions.applyAgentBlueprint(selectedBlueprint)}
            >
              一键应用到当前工作流
            </button>
          </section>

          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">模板</p>
            <div className="flex gap-2">
              <select
                className="flex-1 text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value)}
              >
                {workflowTemplates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                className="text-[10px] font-mono px-2 py-1.5 rounded bg-[#0070f3] text-white hover:bg-[#0060d3]"
                onClick={() => actions.applyWorkflowTemplate(selectedTemplate)}
              >
                应用
              </button>
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
                value={templateDraftName}
                onChange={e => setTemplateDraftName(e.target.value)}
                placeholder="模板名称"
              />
              <button
                className="text-[10px] font-mono px-2 py-1.5 rounded bg-[#111] border border-[#1e1e1e] text-[#d4d4d4] hover:bg-[#171717]"
                onClick={() => {
                  const clean = templateDraftName.trim()
                  if (!clean) return
                  actions.saveWorkflowAsTemplate(clean)
                }}
              >
                另存为模板
              </button>
              <button
                className="text-[10px] font-mono px-2 py-1.5 rounded border border-[#ff444433] text-[#ff6666] hover:bg-[#ff444411]"
                onClick={() => {
                  if (!selectedTemplate) return
                  if (!window.confirm('确认删除该模板？')) return
                  actions.deleteWorkflowTemplate(selectedTemplate)
                }}
              >
                删除模板
              </button>
            </div>
            <p className="text-[10px] text-[#666]">{workflow.description}</p>
            <p className="text-[10px] text-[#666]">提示：可在图中拖拽节点调整形状，布局会自动保存到当前工作流。</p>
          </section>

          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">执行选项</p>
            <div className="grid grid-cols-2 gap-2">
              <ToggleRow label="AutonomousToolAgent" checked={options.autonomousToolAgent} onChange={checked => actions.setWorkflowOptions({ autonomousToolAgent: checked })} />
              <ToggleRow label="EnableCausalMemory" checked={options.enableCausalMemory} onChange={checked => actions.setWorkflowOptions({ enableCausalMemory: checked })} />
              <ToggleRow label="IncludeManifest" checked={options.includeProjectManifest} onChange={checked => actions.setWorkflowOptions({ includeProjectManifest: checked })} />
              <ToggleRow label="ForceManifestFirst" checked={options.forceManifestFirst} onChange={checked => actions.setWorkflowOptions({ forceManifestFirst: checked })} />
              <ToggleRow label="IncludePreviousOutput" checked={options.includePreviousOutput} onChange={checked => actions.setWorkflowOptions({ includePreviousOutput: checked })} />
              <ToggleRow label="DebugVerbose" checked={options.debugVerboseReport} onChange={checked => actions.setWorkflowOptions({ debugVerboseReport: checked })} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <label className="text-[10px] text-[#666]">Steps
                <input
                  type="number"
                  min={1}
                  max={120}
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={options.budget.maxSteps}
                  onChange={e => actions.setWorkflowOptions({ budget: { maxSteps: Number(e.target.value) || 1 } })}
                />
              </label>
              <label className="text-[10px] text-[#666]">Requests
                <input
                  type="number"
                  min={3}
                  max={240}
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={options.budget.maxRequests}
                  onChange={e => actions.setWorkflowOptions({ budget: { maxRequests: Number(e.target.value) || 3 } })}
                />
              </label>
              <label className="text-[10px] text-[#666]">TotalTokens
                <input
                  type="number"
                  min={1000}
                  max={1000000}
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={options.budget.maxTotalTokens}
                  onChange={e => actions.setWorkflowOptions({ budget: { maxTotalTokens: Number(e.target.value) || 1000 } })}
                />
              </label>
            </div>
          </section>

          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">组件流水线</p>
              <span className="text-[9px] text-[#444]">{workflow.components.filter(c => c.enabled).length}/{workflow.components.length} 启用</span>
            </div>

            <div className="space-y-1.5">
              {workflow.components.map((component, index) => (
                <WorkflowComponentRow
                  key={component.id}
                  component={component}
                  canMoveUp={index > 0}
                  canMoveDown={index < workflow.components.length - 1}
                  onToggle={() => actions.toggleWorkflowComponent(component.id)}
                  onMove={direction => actions.moveWorkflowComponent(component.id, direction)}
                  onRemove={() => actions.removeWorkflowComponent(component.id)}
                />
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <select
                className="flex-1 text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
                value={componentToAdd}
                onChange={e => setComponentToAdd(e.target.value as WorkflowComponentType)}
              >
                {COMPONENT_CATALOG.map(item => (
                  <option key={item.type} value={item.type}>{item.label}</option>
                ))}
              </select>
              <button className="text-[10px] font-mono px-2 py-1.5 rounded bg-[#111] border border-[#1e1e1e] text-[#888] hover:text-white" onClick={() => actions.addWorkflowComponent(componentToAdd)}>
                + 添加
              </button>
            </div>
          </section>

          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">版本操作</p>
            <div className="flex gap-2">
              <button className="flex-1 text-[10px] font-mono py-1.5 rounded bg-[#0070f3] text-white hover:bg-[#0060d3]" onClick={actions.materializeWorkflowGraph}>
                刷新可视化
              </button>
              <button className="flex-1 text-[10px] font-mono py-1.5 rounded bg-[#111] border border-[#1e1e1e] text-[#d4d4d4] hover:bg-[#171717]" onClick={() => actions.createWorkflowSnapshot(snapshotNote)}>
                生成快照
              </button>
            </div>
            <input
              className="w-full text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4]"
              value={snapshotNote}
              onChange={e => setSnapshotNote(e.target.value)}
              placeholder="快照备注（可选）"
            />
          </section>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto scrollbar-thin p-3 space-y-3">
          <section className="rounded border border-[#1e1e1e] p-2 space-y-2 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">OpenAI 兼容 API</p>
            <ToggleRow label="EnableOpenAICompatible" checked={apiConfig.enabled} onChange={checked => actions.setApiConfig({ enabled: checked })} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-[#666]">Base URL
                <input
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={apiConfig.baseUrl}
                  onChange={e => actions.setApiConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label className="text-[10px] text-[#666]">Model
                <input
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={apiConfig.model}
                  onChange={e => actions.setApiConfig({ model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </label>
            </div>
            <label className="text-[10px] text-[#666] block">API Key（前端配置，后端执行）
              <input
                type="password"
                className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                value={apiConfig.apiKey}
                onChange={e => actions.setApiConfig({ apiKey: e.target.value })}
                placeholder="sk-..."
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[10px] text-[#666]">Temperature
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  max={2}
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={apiConfig.temperature}
                  onChange={e => actions.setApiConfig({ temperature: Number(e.target.value) || 0 })}
                />
              </label>
              <label className="text-[10px] text-[#666]">Max Tokens
                <input
                  type="number"
                  min={64}
                  max={8192}
                  className="mt-1 w-full text-[11px] bg-[#000] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4]"
                  value={apiConfig.maxTokens}
                  onChange={e => actions.setApiConfig({ maxTokens: Number(e.target.value) || 64 })}
                />
              </label>
            </div>
          </section>

          <section className="rounded border border-[#1e1e1e] p-2 space-y-1 bg-[#0a0a0a]">
            <p className="text-[10px] font-mono text-[#555] uppercase tracking-widest">说明</p>
            <p className="text-[11px] text-[#777] leading-relaxed">
              API 配置与工作流完全解耦，工作流只负责阶段/组件编排；后端按当前 API 配置执行兼容请求。
            </p>
            <p className="text-[10px] text-[#666]">
              连通性测试：保存参数后，在“对话”页发送一条消息并观察总结阶段是否返回模型输出。
            </p>
          </section>
        </div>
      )}
    </div>
  )
}

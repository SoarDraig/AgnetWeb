'use client'

import { useRef, useEffect, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/types'
import type { AgentWsActions } from '@/hooks/use-agent-ws'

interface Props {
  messages: ChatMessage[]
  isRunning: boolean
  actions: AgentWsActions
}

const TOOL_COLORS: Record<string, string> = {
  filesystem: '#00d4ff',
  git:        '#f59e0b',
  shell:      '#22c55e',
  llm:        '#a855f7',
  memory:     '#ec4899',
}

const TOOL_LABELS: Record<string, string> = {
  filesystem: 'FileSystem',
  git:        'Git',
  shell:      'Shell',
  llm:        'LLM',
  memory:     'Memory',
}

// ─── Thinking block ───────────────────────────────────────────────────

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1.5 border border-[#f59e0b22] rounded bg-[#f59e0b08]">
      <button
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="#f59e0b">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 2a5 5 0 110 10A5 5 0 018 3zm0 7a1 1 0 100 2 1 1 0 000-2zm.5-5.5h-1v4h1V6.5z"/>
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

// ─── Tool message ─────────────────────────────────────────────────────

function ToolMessage({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false)
  const color = TOOL_COLORS[msg.toolName ?? ''] ?? '#555'
  const label = TOOL_LABELS[msg.toolName ?? ''] ?? msg.toolName

  return (
    <div
      className="rounded-lg border overflow-hidden"
      style={{ borderColor: color + '33', background: color + '08' }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ color, background: color + '22', border: `1px solid ${color}33` }}
        >
          {label}
        </span>
        <span className="text-[11px] font-mono text-[#d4d4d4] flex-1 truncate">
          {msg.content.split('\n')[0]}
        </span>
        <StatusBadge status={msg.status ?? 'idle'} />
        <span className="text-[9px] text-[#444] ml-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
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

// ─── Status badge ─────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    running: { label: '运行中', color: '#f59e0b' },
    success: { label: '完成',   color: '#22c55e' },
    error:   { label: '错误',   color: '#ff4444' },
    idle:    { label: '等待',   color: '#555' },
  }
  const s = map[status] ?? map.idle
  return (
    <span
      className="text-[8px] font-mono px-1.5 py-0.5 rounded leading-none"
      style={{ color: s.color, background: s.color + '18', border: `1px solid ${s.color}33` }}
    >
      {s.label}
    </span>
  )
}

// ─── Main ChatPanel ───────────────────────────────────────────────────

export default function ChatPanel({ messages, isRunning, actions }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState('')
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  return (
    <div className="flex flex-col h-full bg-[#000] border-l border-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#1e1e1e] flex-shrink-0">
        <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">对话</span>
        {isRunning && (
          <span className="flex items-center gap-1 ml-auto">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
            <span className="text-[9px] font-mono text-[#f59e0b]">运行中</span>
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex flex-col gap-1', msg.role === 'user' && 'items-end')}>
            {/* Role label */}
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

      {/* Input */}
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
              <path d="M8 2L14 8L8 14M14 8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

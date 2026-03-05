'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { WsConnectionStatus, Branch, AgentWorkflowDefinition } from '@/lib/types'
import type { AgentWsActions } from '@/hooks/use-agent-ws'

interface Props {
  wsStatus: WsConnectionStatus
  currentBranch: string
  branches: Branch[]
  isRunning: boolean
  workflow: AgentWorkflowDefinition
  actions: AgentWsActions
}

const STATUS_CONFIG: Record<WsConnectionStatus, { label: string; color: string; animate: boolean }> = {
  disconnected: { label: '未连接', color: '#555', animate: false },
  connecting: { label: '连接中', color: '#f59e0b', animate: true },
  connected: { label: '已连接', color: '#22c55e', animate: false },
  error: { label: '连接错误', color: '#ff4444', animate: false },
}

export default function Topbar({ wsStatus, currentBranch, branches, isRunning, workflow, actions }: Props) {
  const [wsUrl, setWsUrl] = useState('ws://localhost:8080')
  const [showConnect, setShowConnect] = useState(false)

  const s = STATUS_CONFIG[wsStatus]
  const branchColor = branches.find(b => b.name === currentBranch)?.color ?? '#22c55e'
  const enabledCount = workflow.components.filter(c => c.enabled).length

  const handleConnect = () => {
    actions.connect(wsUrl)
    setShowConnect(false)
  }

  return (
    <header className="flex items-center gap-3 px-4 h-11 border-b border-[#1e1e1e] bg-[#000] flex-shrink-0">
      <div className="flex items-center gap-2 mr-2">
        <div className="w-5 h-5 rounded bg-[#0070f3] flex items-center justify-center">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="white">
            <path d="M8 1L15 13H1L8 1Z" />
          </svg>
        </div>
        <span className="text-[13px] font-mono text-[#d4d4d4] tracking-tight">AgentFlow</span>
        <span className="text-[9px] font-mono text-[#333] border border-[#222] px-1.5 py-0.5 rounded">v0.2</span>
      </div>

      <span className="text-[#222] text-sm select-none">/</span>

      <div className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 16 16" fill={branchColor}>
          <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25z"/>
        </svg>
        <span className="text-[11px] font-mono" style={{ color: branchColor }}>{currentBranch}</span>
      </div>

      <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e1e1e] bg-[#0a0a0a]">
        <span className="text-[9px] font-mono text-[#666]">Workflow</span>
        <span className="text-[9px] font-mono text-[#d4d4d4] truncate max-w-[180px]">{workflow.name}</span>
        <span className="text-[9px] font-mono text-[#22c55e]">{enabledCount}/{workflow.components.length}</span>
      </div>

      {isRunning && (
        <div className="flex items-center gap-1.5 ml-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse" />
          <span className="text-[10px] font-mono text-[#f59e0b]">Agent 运行中</span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        {['Manifest', 'Planner', 'Tools', 'Causal', 'Summary'].map((tool, i) => {
          const colors = ['#00d4ff', '#f59e0b', '#22c55e', '#a855f7', '#ec4899']
          return (
            <span
              key={tool}
              className="text-[8px] font-mono px-1.5 py-0.5 rounded leading-none border"
              style={{
                color: colors[i],
                borderColor: colors[i] + '33',
                background: colors[i] + '0f',
              }}
            >
              {tool}
            </span>
          )
        })}
      </div>

      <div className="relative">
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded border border-[#1e1e1e] bg-[#0a0a0a] hover:bg-[#111] transition-colors"
          onClick={() => setShowConnect(o => !o)}
        >
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', s.animate && 'animate-pulse')} style={{ background: s.color }} />
          <span className="text-[10px] font-mono" style={{ color: s.color }}>{s.label}</span>
          <svg width="8" height="8" viewBox="0 0 16 16" fill="#444" className="ml-0.5">
            <path d="M8 11L3 6h10l-5 5z"/>
          </svg>
        </button>

        {showConnect && (
          <div className="absolute right-0 top-full mt-1 w-64 bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg shadow-2xl z-50 p-3">
            <p className="text-[9px] font-mono text-[#444] uppercase mb-2 tracking-widest">WebSocket 服务器</p>
            <input
              className="w-full text-[11px] font-mono bg-[#000] border border-[#1e1e1e] rounded px-2 py-1.5 text-[#d4d4d4] placeholder-[#333] focus:outline-none focus:border-[#0070f3] transition-colors mb-2"
              value={wsUrl}
              onChange={e => setWsUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              placeholder="ws://localhost:8080"
            />
            <div className="flex gap-2">
              <button className="flex-1 text-[10px] font-mono py-1.5 rounded bg-[#0070f3] text-white hover:bg-[#0060d3] transition-colors" onClick={handleConnect}>
                连接
              </button>
              {wsStatus === 'connected' && (
                <button
                  className="flex-1 text-[10px] font-mono py-1.5 rounded bg-[#111] text-[#ff4444] border border-[#ff444433] hover:bg-[#ff444411] transition-colors"
                  onClick={() => { actions.disconnect(); setShowConnect(false) }}
                >
                  断开
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

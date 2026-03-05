'use client'

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { AgentNode } from '@/lib/types'

// ─── Tool icons (inline SVG to avoid extra deps) ──────────────────────

const TOOL_ICONS: Record<string, React.ReactNode> = {
  filesystem: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1 3.5A1.5 1.5 0 012.5 2h3.764c.958 0 1.76.56 2.236 1.382L9 4.5H13.5A1.5 1.5 0 0115 6v7a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 13V3.5z"/>
    </svg>
  ),
  git: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M15.698 7.287L8.712.302a1.03 1.03 0 00-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 011.55 1.56l1.773 1.774a1.224 1.224 0 011.267 2.025 1.226 1.226 0 01-2.002-1.335L8.58 5.965v4.353a1.226 1.226 0 11-1.001-.036V5.887a1.226 1.226 0 01-.647-1.614L5.093 2.432 .302 7.224a1.03 1.03 0 000 1.456l6.986 6.985a1.03 1.03 0 001.456 0l6.954-6.953a1.031 1.031 0 000-1.425z"/>
    </svg>
  ),
  shell: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M0 3a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H2a2 2 0 01-2-2V3zm4.5 1.5a.5.5 0 00-.793.405v5.19a.5.5 0 00.793.405l3.5-2.595a.5.5 0 000-.81L4.5 4.5zM8 10.5a.5.5 0 000 1h4a.5.5 0 000-1H8z"/>
    </svg>
  ),
  llm: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 2a2 2 0 012-2h8a2 2 0 012 2v13.5a.5.5 0 01-.777.416L8 13.101l-5.223 2.815A.5.5 0 012 15.5V2z"/>
    </svg>
  ),
  memory: (
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5 0a1 1 0 011 1v1h4V1a1 1 0 012 0v1h1a2 2 0 012 2v2H1V4a2 2 0 012-2h1V1a1 1 0 011-1zM0 7h16v5a2 2 0 01-2 2H2a2 2 0 01-2-2V7z"/>
    </svg>
  ),
}

// ─── Status colors ────────────────────────────────────────────────────

const STATUS_RING: Record<string, string> = {
  idle:    'ring-[#333]',
  running: 'ring-[#f59e0b] animate-pulse',
  success: 'ring-[#22c55e]',
  error:   'ring-[#ff4444]',
  skipped: 'ring-[#555]',
}

const STATUS_DOT: Record<string, string> = {
  idle:    'bg-[#444]',
  running: 'bg-[#f59e0b] animate-ping',
  success: 'bg-[#22c55e]',
  error:   'bg-[#ff4444]',
  skipped: 'bg-[#555]',
}

// ─── Node type colors ─────────────────────────────────────────────────

const KIND_STYLE: Record<string, { border: string; bg: string; icon: string; label: string }> = {
  'user-input':   { border: '#0070f3', bg: 'rgba(0,112,243,0.08)', icon: '#0070f3', label: '用户' },
  'agent-think':  { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', icon: '#f59e0b', label: 'Agent' },
  'tool-call':    { border: '#00d4ff', bg: 'rgba(0,212,255,0.08)', icon: '#00d4ff', label: '工具调用' },
  'tool-result':  { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', icon: '#22c55e', label: '工具结果' },
  'memory':       { border: '#a855f7', bg: 'rgba(168,85,247,0.08)', icon: '#a855f7', label: 'Memory' },
  'branch':       { border: '#f59e0b', bg: 'rgba(245,158,11,0.06)', icon: '#f59e0b', label: '分支' },
  'checkpoint':   { border: '#22c55e', bg: 'rgba(34,197,94,0.06)', icon: '#22c55e', label: '检查点' },
}

// ─── Main AgentNode component ─────────────────────────────────────────

interface AgentNodeData extends AgentNode {
  selected?: boolean
  onSelect?: (id: string) => void
}

export const AgentFlowNode = memo(function AgentFlowNode({ data, selected }: NodeProps) {
  const node = data as unknown as AgentNodeData
  const style = KIND_STYLE[node.kind] ?? KIND_STYLE['agent-think']
  const statusRing = STATUS_RING[node.status] ?? STATUS_RING.idle
  const statusDot = STATUS_DOT[node.status] ?? STATUS_DOT.idle

  return (
    <div
      className={cn(
        'relative group min-w-[160px] max-w-[220px] rounded-lg px-3 py-2.5',
        'ring-1 transition-all duration-200 cursor-pointer select-none',
        statusRing,
        selected && 'ring-2 ring-white/30 shadow-lg shadow-white/5',
      )}
      style={{ background: style.bg, borderColor: style.border + '66' }}
    >
      {/* Handles */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ width: 8, height: 8, border: 0, background: '#2a2a2a', top: -4 }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ width: 8, height: 8, border: 0, background: '#2a2a2a', bottom: -4 }}
      />

      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {/* Kind badge */}
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm leading-none"
          style={{ color: style.icon, background: style.border + '22', border: `1px solid ${style.border}44` }}
        >
          {style.label}
        </span>

        {/* Tool icon */}
        {node.tool && (
          <span style={{ color: style.icon }}>
            {TOOL_ICONS[node.tool] ?? null}
          </span>
        )}

        {/* Status dot */}
        <div className="ml-auto flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusDot)} />
        </div>
      </div>

      {/* Label */}
      <p className="text-[11px] font-mono text-[#e0e0e0] leading-snug line-clamp-2">
        {node.label}
      </p>

      {/* Detail */}
      {node.detail && (
        <p className="mt-1 text-[10px] text-[#666] leading-snug line-clamp-1">
          {node.detail}
        </p>
      )}

      {/* Footer metrics */}
      {(node.duration || node.tokenCount) && (
        <div className="mt-1.5 flex items-center gap-2">
          {node.duration && (
            <span className="text-[9px] font-mono text-[#555]">
              {node.duration >= 1000 ? `${(node.duration / 1000).toFixed(1)}s` : `${node.duration}ms`}
            </span>
          )}
          {node.tokenCount && (
            <span className="text-[9px] font-mono text-[#555]">
              {node.tokenCount.toLocaleString()} tok
            </span>
          )}
        </div>
      )}

      {/* Branch chip */}
      {node.branch && (
        <div className="absolute -top-2 -right-1">
          <span className="text-[8px] font-mono px-1 py-0.5 rounded bg-[#111] text-[#555] border border-[#222]">
            {node.branch}
          </span>
        </div>
      )}
    </div>
  )
})

// ─── Commit node (for git graph overlay) ─────────────────────────────

export const CommitNode = memo(function CommitNode({ data }: NodeProps) {
  const d = data as Record<string, unknown>
  const isHead = (d.tags as string[] | undefined)?.includes('HEAD')
  const isMerge = ((d.parentHashes as string[] | undefined)?.length ?? 0) > 1

  return (
    <div className="flex flex-col items-center">
      <Handle type="target" position={Position.Top} className="!opacity-0" />

      <div
        className={cn(
          'w-3 h-3 rounded-full border-2 flex-shrink-0 transition-all',
          isHead ? 'border-[#0070f3] bg-[#0070f3] shadow-[0_0_6px_#0070f3]' :
          isMerge ? 'border-[#a855f7] bg-[#a855f7]' :
          'border-[#444] bg-[#1a1a1a]',
        )}
      />

      {/* Tags */}
      {(d.tags as string[] | undefined) && (d.tags as string[]).length > 0 && (
        <div className="flex gap-0.5 mt-0.5">
          {(d.tags as string[]).map(tag => (
            <span
              key={tag}
              className={cn(
                'text-[8px] font-mono px-1 py-0.5 rounded leading-none',
                tag === 'HEAD' ? 'bg-[#0070f3] text-white' : 'bg-[#222] text-[#888] border border-[#333]',
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-0.5 max-w-[120px] text-center">
        <p className="text-[9px] font-mono text-[#888] truncate">{d.hash as string}</p>
        <p className="text-[9px] text-[#555] truncate leading-tight">{d.message as string}</p>
      </div>

      <Handle type="source" position={Position.Bottom} className="!opacity-0" />
    </div>
  )
})

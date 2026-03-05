'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import GitGraph from '@/components/agent-flow/git-graph'
import type { Commit, Branch } from '@/lib/types'
import type { AgentWsActions } from '@/hooks/use-agent-ws'

interface Props {
  commits: Commit[]
  branches: Branch[]
  currentBranch: string
  headCommit: string | null
  actions: AgentWsActions
}

type Tab = 'history' | 'branches'

export default function VersionSidebar({
  commits, branches, currentBranch, headCommit, actions,
}: Props) {
  const [tab, setTab] = useState<Tab>('history')
  const [newBranchName, setNewBranchName] = useState('')
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)

  const head = commits.find(c => c.tags.includes('HEAD'))

  const handleCreateBranch = () => {
    const name = newBranchName.trim()
    if (!name) return
    actions.createBranch(name)
    setNewBranchName('')
    setShowNewBranch(false)
  }

  return (
    <div className="flex flex-col h-full bg-[#000] border-r border-[#1e1e1e]">
      {/* Header */}
      <div className="px-3 py-3 border-b border-[#1e1e1e] flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">版本控制</span>
          <button
            className="text-[10px] font-mono text-[#0070f3] hover:text-[#4da3ff] transition-colors"
            onClick={() => setShowNewBranch(b => !b)}
          >
            + 新建分支
          </button>
        </div>

        {/* New branch input */}
        {showNewBranch && (
          <div className="flex gap-1.5 mt-2">
            <input
              className="flex-1 text-[11px] font-mono bg-[#0f0f0f] border border-[#1e1e1e] rounded px-2 py-1 text-[#d4d4d4] placeholder-[#333] focus:outline-none focus:border-[#0070f3] transition-colors"
              placeholder="branch-name"
              value={newBranchName}
              onChange={e => setNewBranchName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
              autoFocus
            />
            <button
              className="text-[10px] font-mono px-2 py-1 rounded bg-[#0070f3] text-white hover:bg-[#0060d3] transition-colors"
              onClick={handleCreateBranch}
            >
              创建
            </button>
          </div>
        )}

        {/* Current branch indicator */}
        <div className="flex items-center gap-1.5 mt-2">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="#22c55e">
            <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25z"/>
          </svg>
          <span
            className="text-[11px] font-mono"
            style={{ color: branches.find(b => b.name === currentBranch)?.color ?? '#22c55e' }}
          >
            {currentBranch}
          </span>
          {head && (
            <span className="text-[9px] font-mono text-[#444] ml-auto">{head.hash}</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e1e] flex-shrink-0">
        {(['history', 'branches'] as Tab[]).map(t => (
          <button
            key={t}
            className={cn(
              'flex-1 text-[10px] font-mono py-2 transition-colors',
              tab === t
                ? 'text-[#d4d4d4] border-b border-[#0070f3]'
                : 'text-[#444] hover:text-[#666]',
            )}
            onClick={() => setTab(t)}
          >
            {t === 'history' ? '提交历史' : '分支'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === 'history' && (
          <GitGraph
            commits={commits}
            branches={branches}
            currentBranch={currentBranch}
            selectedHash={selectedHash}
            onSelectCommit={(hash) => setSelectedHash(hash === selectedHash ? null : hash)}
            onCheckout={(hash) => {
              actions.checkoutCommit(hash)
              setSelectedHash(hash)
            }}
          />
        )}

        {tab === 'branches' && (
          <div className="p-2 space-y-1">
            {branches.map(branch => (
              <button
                key={branch.name}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left',
                  'transition-colors group',
                  branch.isActive
                    ? 'bg-[#0f0f0f] border border-[#1e1e1e]'
                    : 'hover:bg-[#0a0a0a]',
                )}
                onClick={() => actions.setCurrentBranch(branch.name)}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: branch.color }}
                />
                <span
                  className="text-[11px] font-mono flex-1 truncate"
                  style={{ color: branch.isActive ? branch.color : '#888' }}
                >
                  {branch.name}
                </span>
                {branch.isActive && (
                  <span className="text-[8px] font-mono text-[#22c55e] flex-shrink-0">active</span>
                )}
                {branch.isMerged && (
                  <span className="text-[8px] font-mono text-[#555] flex-shrink-0">merged</span>
                )}
                <span className="text-[9px] font-mono text-[#444]">{branch.headHash}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex-shrink-0 border-t border-[#1e1e1e] px-3 py-2 flex items-center gap-3">
        <span className="text-[9px] font-mono text-[#444]">
          {commits.length} commits
        </span>
        <span className="text-[9px] font-mono text-[#444]">
          {branches.length} branches
        </span>
        <span className="text-[9px] font-mono text-[#333] ml-auto">
          双击提交切换版本
        </span>
      </div>
    </div>
  )
}

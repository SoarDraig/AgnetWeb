'use client'

import { useState, useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { ReactFlowProvider } from '@xyflow/react'
import { cn } from '@/lib/utils'
import { useAgentWs } from '@/hooks/use-agent-ws'
import Topbar from '@/components/layout/topbar'
import VersionSidebar from '@/components/panels/version-sidebar'
import ChatPanel from '@/components/panels/chat-panel'
import NodeDetailPanel from '@/components/panels/node-detail-panel'
import AgentFlowGraph from '@/components/agent-flow/agent-flow-graph'

// ─── Panel resize handle ──────────────────────────────────────────────

function ResizeHandle({ direction = 'vertical' }: { direction?: 'vertical' | 'horizontal' }) {
  return (
    <PanelResizeHandle
      className={cn(
        'relative flex items-center justify-center group transition-colors',
        direction === 'vertical'
          ? 'w-[1px] bg-[#1e1e1e] hover:bg-[#0070f3] cursor-col-resize'
          : 'h-[1px] bg-[#1e1e1e] hover:bg-[#0070f3] cursor-row-resize',
      )}
    >
      <div
        className={cn(
          'absolute opacity-0 group-hover:opacity-100 transition-opacity',
          direction === 'vertical'
            ? 'w-4 h-8 flex flex-col items-center justify-center gap-0.5'
            : 'h-4 w-8 flex flex-row items-center justify-center gap-0.5',
        )}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={cn(
              'rounded-full bg-[#0070f3]',
              direction === 'vertical' ? 'w-0.5 h-1.5' : 'h-0.5 w-1.5',
            )}
          />
        ))}
      </div>
    </PanelResizeHandle>
  )
}

// ─── Workspace ────────────────────────────────────────────────────────

export default function AgentWorkspace() {
  const { state, actions } = useAgentWs()
  const [activeView, setActiveView] = useState<'graph' | 'split'>('split')
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const selectedNode = state.nodes.find(n => n.id === state.selectedNodeId) ?? null
  const headCommit = state.commits.find(c => c.tags.includes('HEAD'))?.hash ?? null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#000] text-[#d4d4d4]">
      {/* Top bar */}
      <Topbar
        wsStatus={state.status}
        currentBranch={state.currentBranch}
        branches={state.branches}
        isRunning={state.isRunning}
        actions={actions}
      />

      {/* View toggle */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[#1e1e1e] bg-[#000] flex-shrink-0">
        <span className="text-[9px] font-mono text-[#333] mr-2">视图</span>
        {(['graph', 'split'] as const).map(v => (
          <button
            key={v}
            className={cn(
              'text-[10px] font-mono px-2 py-0.5 rounded transition-colors',
              activeView === v
                ? 'bg-[#0070f322] text-[#0070f3] border border-[#0070f333]'
                : 'text-[#444] hover:text-[#666]',
            )}
            onClick={() => setActiveView(v)}
          >
            {v === 'graph' ? '节点图' : '分屏'}
          </button>
        ))}

        {/* Node count */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] font-mono text-[#333]">{state.nodes.length} 节点</span>
          <span className="text-[9px] font-mono text-[#333]">{state.edges.length} 连接</span>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left: Version sidebar */}
          <Panel defaultSize={16} minSize={12} maxSize={28}>
            <VersionSidebar
              commits={state.commits}
              branches={state.branches}
              currentBranch={state.currentBranch}
              headCommit={headCommit}
              actions={actions}
            />
          </Panel>

          <ResizeHandle direction="vertical" />

          {/* Center: ReactFlow graph */}
          <Panel defaultSize={activeView === 'graph' ? 68 : 52} minSize={30}>
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={70} minSize={40}>
                <ReactFlowProvider>
                  <AgentFlowGraph agentState={state} actions={actions} />
                </ReactFlowProvider>
              </Panel>

              <ResizeHandle direction="horizontal" />

              {/* Node detail panel (bottom of graph column) */}
              <Panel defaultSize={30} minSize={20} maxSize={50}>
                <NodeDetailPanel node={selectedNode} toolExecutions={state.toolExecutions} />
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="vertical" />

          {/* Right: Chat panel */}
          <Panel defaultSize={32} minSize={22} maxSize={45}>
            <ChatPanel
              messages={state.messages}
              isRunning={state.isRunning}
              actions={actions}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

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

export default function AgentWorkspace() {
  const { state, actions } = useAgentWs()
  const [activeView, setActiveView] = useState<'graph' | 'split'>('split')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  const selectedNode = state.nodes.find(n => n.id === state.selectedNodeId) ?? null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#000] text-[#d4d4d4]">
      <Topbar
        wsStatus={state.status}
        currentBranch={state.currentBranch}
        branches={state.branches}
        isRunning={state.isRunning}
        workflow={state.workflow}
        actions={actions}
      />

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

        <div className="ml-auto flex items-center gap-3">
          <span className="text-[9px] font-mono text-[#333]">{state.nodes.length} 节点</span>
          <span className="text-[9px] font-mono text-[#333]">{state.edges.length} 连接</span>
          <span className="text-[9px] font-mono text-[#333]">{state.workflow.components.filter(c => c.enabled).length} 组件启用</span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          <Panel defaultSize={18} minSize={13} maxSize={30}>
            <VersionSidebar
              commits={state.commits}
              branches={state.branches}
              currentBranch={state.currentBranch}
              actions={actions}
            />
          </Panel>

          <ResizeHandle direction="vertical" />

          <Panel defaultSize={activeView === 'graph' ? 66 : 50} minSize={30}>
            <PanelGroup direction="vertical" className="h-full">
              <Panel defaultSize={70} minSize={40}>
                <ReactFlowProvider>
                  <AgentFlowGraph agentState={state} actions={actions} />
                </ReactFlowProvider>
              </Panel>

              <ResizeHandle direction="horizontal" />

              <Panel defaultSize={30} minSize={18} maxSize={50}>
                <NodeDetailPanel
                  node={selectedNode}
                  toolExecutions={state.toolExecutions}
                  causalNodes={state.causalMemoryNodes}
                  causalEdges={state.causalMemoryEdges}
                />
              </Panel>
            </PanelGroup>
          </Panel>

          <ResizeHandle direction="vertical" />

          <Panel defaultSize={32} minSize={24} maxSize={46}>
            <ChatPanel
              messages={state.messages}
              isRunning={state.isRunning}
              chatSessions={state.chatSessions}
              activeSessionId={state.activeSessionId}
              workflow={state.workflow}
              workflowTemplates={state.workflowTemplates}
              apiConfig={state.apiConfig}
              actions={actions}
            />
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

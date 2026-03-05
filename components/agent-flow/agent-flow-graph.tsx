'use client'

import { useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AgentFlowNode } from './agent-nodes'
import type { AgentNode, AgentEdge } from '@/lib/types'
import type { AgentWsState, AgentWsActions } from '@/hooks/use-agent-ws'

// ─── Custom node types ────────────────────────────────────────────────

const NODE_TYPES = {
  agentNode: AgentFlowNode,
}

// ─── Convert domain types → ReactFlow types ───────────────────────────

function toRfNode(n: AgentNode, selectedId: string | null): Node {
  return {
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 }, // will be auto-laid out
    data: { ...n, selected: n.id === selectedId },
    selected: n.id === selectedId,
  }
}

function toRfEdge(e: AgentEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.animated ?? false,
    label: e.label,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#333', width: 12, height: 12 },
    style: { stroke: '#2a2a2a', strokeWidth: 1.5 },
    labelStyle: { fontSize: 9, fill: '#555', fontFamily: 'monospace' },
    labelBgStyle: { fill: '#0a0a0a', stroke: '#1e1e1e' },
  }
}

// ─── Auto-layout (simple vertical dag) ───────────────────────────────

function layoutNodes(nodes: AgentNode[], edges: AgentEdge[]): Node[] {
  const rfNodes = nodes.map(n => toRfNode(n, null))

  // Build adjacency for topological sort
  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  rfNodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = [] })
  edges.forEach(e => {
    adj[e.source]?.push(e.target)
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
  })

  // Kahn's algo for level assignment
  const queue = Object.keys(inDegree).filter(id => inDegree[id] === 0)
  const level: Record<string, number> = {}
  const col: Record<string, number> = {}
  const colCounter: Record<number, number> = {}

  while (queue.length) {
    const id = queue.shift()!
    const lvl = level[id] ?? 0
    colCounter[lvl] = (colCounter[lvl] ?? 0)
    col[id] = colCounter[lvl]
    colCounter[lvl]++

    adj[id]?.forEach(next => {
      level[next] = Math.max(level[next] ?? 0, lvl + 1)
      inDegree[next]--
      if (inDegree[next] === 0) queue.push(next)
    })
  }

  const X_SPACING = 260
  const Y_SPACING = 120

  return rfNodes.map(n => ({
    ...n,
    position: {
      x: (col[n.id] ?? 0) * X_SPACING - ((colCounter[level[n.id] ?? 0] ?? 1) - 1) * X_SPACING / 2,
      y: (level[n.id] ?? 0) * Y_SPACING,
    },
  }))
}

// ─── Component ────────────────────────────────────────────────────────

interface Props {
  agentState: AgentWsState
  actions: AgentWsActions
}

export default function AgentFlowGraph({ agentState, actions }: Props) {
  const initialNodes = useMemo(
    () => layoutNodes(agentState.nodes, agentState.edges),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const initialEdges = useMemo(
    () => agentState.edges.map(toRfEdge),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Sync external state changes
  useEffect(() => {
    setNodes(layoutNodes(agentState.nodes, agentState.edges).map(n => ({
      ...n,
      data: {
        ...n.data,
        selected: (n.id as string) === agentState.selectedNodeId,
      },
      selected: (n.id as string) === agentState.selectedNodeId,
    })))
  }, [agentState.nodes, agentState.selectedNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEdges(agentState.edges.map(toRfEdge))
  }, [agentState.edges]) // eslint-disable-line react-hooks/exhaustive-deps

  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge(params, eds)),
    [setEdges],
  )

  const { selectNode } = actions

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      selectNode(node.id as string)
    },
    [selectNode],
  )

  const onPaneClick = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  return (
    <div className="w-full h-full" style={{ background: '#000' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        attributionPosition="bottom-right"
        colorMode="dark"
        defaultEdgeOptions={{
          markerEnd: { type: MarkerType.ArrowClosed, color: '#333' },
          style: { stroke: '#2a2a2a', strokeWidth: 1.5 },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#1a1a1a"
        />
        <Controls
          className="!bg-[#0f0f0f] !border-[#1e1e1e] !rounded-lg overflow-hidden"
          showInteractive={false}
        />
        <MiniMap
          className="!bg-[#0a0a0a] !border-[#1e1e1e] !rounded-lg"
          nodeColor={n => {
            const kind = (n.data as AgentNode).kind
            const colors: Record<string, string> = {
              'user-input': '#0070f3',
              'agent-think': '#f59e0b',
              'tool-call': '#00d4ff',
              'tool-result': '#22c55e',
              'memory': '#a855f7',
            }
            return colors[kind] ?? '#333'
          }}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  )
}

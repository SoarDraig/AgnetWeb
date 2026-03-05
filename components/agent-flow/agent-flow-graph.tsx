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
import type { AgentNode, AgentEdge, WorkflowComponentType } from '@/lib/types'
import type { AgentWsState, AgentWsActions } from '@/hooks/use-agent-ws'

const NODE_TYPES = {
  agentNode: AgentFlowNode,
}

const WORKFLOW_COLOR: Record<WorkflowComponentType, string> = {
  'run-orchestrator': '#0070f3',
  'manifest-loader': '#00d4ff',
  'baseline-analyzer': '#22c55e',
  'llm-planner': '#f59e0b',
  'tool-executor': '#06b6d4',
  'causal-memory': '#a855f7',
  'governance-gate': '#ec4899',
  'evidence-hub': '#14b8a6',
  'summary-synthesizer': '#22c55e',
  'critique-refiner': '#f97316',
}

function toRfNode(n: AgentNode, selectedId: string | null): Node {
  return {
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
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

function layoutNodes(nodes: AgentNode[], edges: AgentEdge[]): Node[] {
  const rfNodes = nodes.map(n => toRfNode(n, null))

  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  rfNodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = [] })
  edges.forEach(e => {
    adj[e.source]?.push(e.target)
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
  })

  const queue = Object.keys(inDegree).filter(id => inDegree[id] === 0)
  const level: Record<string, number> = {}
  const col: Record<string, number> = {}
  const colCounter: Record<number, number> = {}

  while (queue.length) {
    const id = queue.shift()
    if (!id) break
    const lvl = level[id] ?? 0
    colCounter[lvl] = colCounter[lvl] ?? 0
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

interface Props {
  agentState: AgentWsState
  actions: AgentWsActions
}

interface MiniMapNodeData {
  kind?: AgentNode['kind']
  componentType?: AgentNode['componentType']
}

function resolveNodeColor(data: MiniMapNodeData) {
  if (data.kind === 'workflow-component' && data.componentType) {
    return WORKFLOW_COLOR[data.componentType] ?? '#0070f3'
  }

  const colors: Record<string, string> = {
    'user-input': '#0070f3',
    'agent-think': '#f59e0b',
    'tool-call': '#00d4ff',
    'tool-result': '#22c55e',
    memory: '#a855f7',
    checkpoint: '#22c55e',
    branch: '#f59e0b',
  }
  return data.kind ? colors[data.kind] ?? '#333' : '#333'
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

  useEffect(() => {
    setNodes(layoutNodes(agentState.nodes, agentState.edges).map(n => ({
      ...n,
      data: {
        ...n.data,
        selected: n.id === agentState.selectedNodeId,
      },
      selected: n.id === agentState.selectedNodeId,
    })))
  }, [agentState.nodes, agentState.edges, agentState.selectedNodeId, setNodes])

  useEffect(() => {
    setEdges(agentState.edges.map(toRfEdge))
  }, [agentState.edges, setEdges])

  const onConnect = useCallback((params: Connection) => setEdges(eds => addEdge(params, eds)), [setEdges])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    actions.selectNode(node.id)
  }, [actions])

  const onPaneClick = useCallback(() => {
    actions.selectNode(null)
  }, [actions])

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
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1a1a1a" />
        <Controls className="!bg-[#0f0f0f] !border-[#1e1e1e] !rounded-lg overflow-hidden" showInteractive={false} />
        <MiniMap
          className="!bg-[#0a0a0a] !border-[#1e1e1e] !rounded-lg"
          nodeColor={n => resolveNodeColor((n.data ?? {}) as MiniMapNodeData)}
          maskColor="rgba(0,0,0,0.7)"
        />
      </ReactFlow>
    </div>
  )
}

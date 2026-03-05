'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { WsConnectionStatus, WsEvent, AgentNode, ChatMessage, Commit, ToolExecution } from '@/lib/types'
import {
  MOCK_NODES, MOCK_EDGES, MOCK_COMMITS, MOCK_BRANCHES,
  MOCK_MESSAGES, MOCK_TOOL_EXECUTIONS,
} from '@/lib/mock-data'

// ─── State shape returned by the hook ────────────────────────────────

export interface AgentWsState {
  status: WsConnectionStatus
  nodes: AgentNode[]
  edges: typeof MOCK_EDGES
  commits: typeof MOCK_COMMITS
  branches: typeof MOCK_BRANCHES
  messages: ChatMessage[]
  toolExecutions: ToolExecution[]
  selectedNodeId: string | null
  currentBranch: string
  isRunning: boolean
  latestEvent: WsEvent | null
}

export interface AgentWsActions {
  connect: (url: string) => void
  disconnect: () => void
  send: (event: Omit<WsEvent, 'id' | 'timestamp'>) => void
  sendUserMessage: (content: string) => void
  selectNode: (id: string | null) => void
  checkoutCommit: (hash: string) => void
  createBranch: (name: string) => void
  setCurrentBranch: (name: string) => void
}

// ─── Hook ─────────────────────────────────────────────────────────────

export function useAgentWs(initialUrl = '') {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [state, setState] = useState<AgentWsState>({
    status: 'disconnected',
    nodes: MOCK_NODES,
    edges: MOCK_EDGES,
    commits: MOCK_COMMITS,
    branches: MOCK_BRANCHES,
    messages: MOCK_MESSAGES,
    toolExecutions: MOCK_TOOL_EXECUTIONS,
    selectedNodeId: null,
    currentBranch: 'main',
    isRunning: true,
    latestEvent: null,
  })

  // ─── Connect ────────────────────────────────────────────────────────

  const connect = useCallback((url: string) => {
    if (!url || typeof window === 'undefined') return
    if (wsRef.current) {
      wsRef.current.close()
    }

    setState(s => ({ ...s, status: 'connecting' }))

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setState(s => ({ ...s, status: 'connected' }))
        ws.send(JSON.stringify({ type: 'ping', id: genId(), timestamp: Date.now(), payload: {} }))
      }

      ws.onmessage = (ev) => {
        try {
          const event: WsEvent = JSON.parse(ev.data as string)
          handleEvent(event)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onerror = () => {
        setState(s => ({ ...s, status: 'error' }))
      }

      ws.onclose = () => {
        setState(s => ({ ...s, status: 'disconnected' }))
        // auto-reconnect after 3s
        reconnectTimer.current = setTimeout(() => connect(url), 3000)
      }
    } catch {
      setState(s => ({ ...s, status: 'error' }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Disconnect ─────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    wsRef.current?.close()
    wsRef.current = null
    setState(s => ({ ...s, status: 'disconnected' }))
  }, [])

  // ─── Send ────────────────────────────────────────────────────────────

  const send = useCallback((event: Omit<WsEvent, 'id' | 'timestamp'>) => {
    const full: WsEvent = { ...event, id: genId(), timestamp: Date.now() }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(full))
    }
  }, [])

  // ─── Handle incoming WS events ──────────────────────────────────────

  const handleEvent = useCallback((event: WsEvent) => {
    setState(prev => {
      const next = { ...prev, latestEvent: event }

      switch (event.type) {
        case 'node:add': {
          const node = event.payload as unknown as AgentNode
          return { ...next, nodes: [...prev.nodes, node] }
        }
        case 'node:update': {
          const updated = event.payload as unknown as Partial<AgentNode> & { id: string }
          return {
            ...next,
            nodes: prev.nodes.map(n => n.id === updated.id ? { ...n, ...updated } : n),
          }
        }
        case 'commit:create': {
          const commit = event.payload as unknown as Commit
          return { ...next, commits: [commit, ...prev.commits] }
        }
        case 'agent:start':
          return { ...next, isRunning: true }
        case 'agent:finish':
          return { ...next, isRunning: false }
        default:
          return next
      }
    })
  }, [])

  // ─── User actions ────────────────────────────────────────────────────

  const sendUserMessage = useCallback((content: string) => {
    if (!content.trim()) return

    const msgId = genId()
    const nodeId = genId()
    const now = Date.now()

    const userMsg: ChatMessage = {
      id: msgId, role: 'user', content, timestamp: now, nodeId,
    }
    const userNode: AgentNode = {
      id: nodeId, kind: 'user-input', status: 'success',
      label: content.length > 40 ? content.slice(0, 40) + '…' : content,
      branch: 'main', timestamp: now,
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMsg],
      nodes: [...prev.nodes, userNode],
      isRunning: true,
    }))

    // Send to server if connected
    send({ type: 'agent:start', payload: { content, nodeId } })

    // Simulate agent response after 1.5s (demo only)
    if (!wsRef.current) {
      simulateAgentResponse(content, setState)
    }
  }, [send])

  const selectNode = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedNodeId: id }))
  }, [])

  const checkoutCommit = useCallback((hash: string) => {
    setState(s => ({
      ...s,
      commits: s.commits.map(c => ({
        ...c,
        tags: c.hash === hash
          ? [...c.tags.filter(t => t !== 'HEAD'), 'HEAD']
          : c.tags.filter(t => t !== 'HEAD'),
      })),
    }))
  }, [])

  const createBranch = useCallback((name: string) => {
    const colors = ['#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4']
    setState(prev => ({
      ...prev,
      branches: [
        ...prev.branches,
        {
          name,
          headHash: prev.commits[0]?.hash ?? '',
          color: colors[prev.branches.length % colors.length],
          isActive: false,
          isMerged: false,
        },
      ],
    }))
  }, [])

  const setCurrentBranch = useCallback((name: string) => {
    setState(s => ({
      ...s,
      currentBranch: name,
      branches: s.branches.map(b => ({ ...b, isActive: b.name === name })),
    }))
  }, [])

  // ─── Auto-connect on mount if URL provided ───────────────────────────

  useEffect(() => {
    if (initialUrl) connect(initialUrl)
    return () => {
      disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo<AgentWsActions>(() => ({
    connect, disconnect, send,
    sendUserMessage, selectNode,
    checkoutCommit, createBranch, setCurrentBranch,
  }), [connect, disconnect, send, sendUserMessage, selectNode, checkoutCommit, createBranch, setCurrentBranch])

  return { state, actions }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function simulateAgentResponse(
  _content: string,
  setState: React.Dispatch<React.SetStateAction<AgentWsState>>,
) {
  const thinkNodeId = genId()
  const now = Date.now()

  // Step 1: thinking node
  setTimeout(() => {
    const thinkNode: AgentNode = {
      id: thinkNodeId, kind: 'agent-think', status: 'running',
      label: '分析请求中…', branch: 'main', timestamp: now + 500, tokenCount: 0,
    }
    const thinkMsg: ChatMessage = {
      id: genId(), role: 'agent',
      content: '正在分析您的请求，稍等…',
      thinking: '解析用户意图，规划执行步骤。',
      timestamp: now + 500, nodeId: thinkNodeId, status: 'running',
    }
    setState(s => ({
      ...s,
      nodes: [...s.nodes, thinkNode],
      messages: [...s.messages, thinkMsg],
    }))
  }, 500)

  // Step 2: finish
  setTimeout(() => {
    setState(s => ({
      ...s,
      nodes: s.nodes.map(n =>
        n.id === thinkNodeId ? { ...n, status: 'success', label: '完成分析', tokenCount: 256 } : n,
      ),
      messages: s.messages.map(m =>
        m.nodeId === thinkNodeId
          ? { ...m, status: 'success', content: '已完成分析。任务已加入执行队列，结果将实时更新。' }
          : m,
      ),
      isRunning: false,
    }))
  }, 2500)
}

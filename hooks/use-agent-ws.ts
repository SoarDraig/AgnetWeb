'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type {
  WsConnectionStatus,
  WsEvent,
  AgentNode,
  ChatMessage,
  Commit,
  ToolExecution,
  Branch,
  WorkflowComponentType,
  AgentWorkflowDefinition,
  AgentWorkflowTemplate,
  AgentWorkflowOptions,
  AgentWorkflowComponent,
  AgentCausalMemoryNode,
  AgentCausalMemoryEdge,
  OpenAICompatibleApiConfig,
  AgentChatSession,
} from '@/lib/types'
import type { AgentRunRequest, AgentRunResponse } from '@/lib/agent-run-contract'
import {
  MOCK_NODES,
  MOCK_EDGES,
  MOCK_COMMITS,
  MOCK_BRANCHES,
  MOCK_MESSAGES,
  MOCK_TOOL_EXECUTIONS,
  MOCK_WORKFLOW,
  MOCK_WORKFLOW_TEMPLATES,
  MOCK_API_CONFIG,
  MOCK_CAUSAL_MEMORY_NODES,
  MOCK_CAUSAL_MEMORY_EDGES,
} from '@/lib/mock-data'
import { buildWorkflowFromBlueprint } from '@/lib/agent-blueprints'

const BRANCH_COLORS = ['#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4', '#ef4444']
const SESSION_STORAGE_KEY = 'agent-web-chat-sessions-v1'
const DEFAULT_SESSION_TITLE = '默认会话'

interface AgentChatSessionSnapshot {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  nodes: AgentNode[]
  edges: typeof MOCK_EDGES
  commits: Commit[]
  branches: Branch[]
  messages: ChatMessage[]
  toolExecutions: ToolExecution[]
  selectedNodeId: string | null
  currentBranch: string
  causalMemoryNodes: AgentCausalMemoryNode[]
  causalMemoryEdges: AgentCausalMemoryEdge[]
}

interface PersistedAgentState {
  version: 1
  activeSessionId: string
  sessions: AgentChatSessionSnapshot[]
  workflow: AgentWorkflowDefinition
  apiConfig: OpenAICompatibleApiConfig
}

type WorkflowOptionsPatch =
  Partial<Omit<AgentWorkflowOptions, 'budget' | 'toolPermissions' | 'actionQuotas'>> & {
    budget?: Partial<AgentWorkflowOptions['budget']>
    toolPermissions?: Partial<AgentWorkflowOptions['toolPermissions']>
    actionQuotas?: Partial<AgentWorkflowOptions['actionQuotas']>
  }

export interface AgentWsState {
  status: WsConnectionStatus
  nodes: AgentNode[]
  edges: typeof MOCK_EDGES
  commits: Commit[]
  branches: Branch[]
  messages: ChatMessage[]
  toolExecutions: ToolExecution[]
  selectedNodeId: string | null
  currentBranch: string
  isRunning: boolean
  latestEvent: WsEvent | null
  workflow: AgentWorkflowDefinition
  workflowTemplates: AgentWorkflowTemplate[]
  apiConfig: OpenAICompatibleApiConfig
  causalMemoryNodes: AgentCausalMemoryNode[]
  causalMemoryEdges: AgentCausalMemoryEdge[]
  chatSessions: AgentChatSession[]
  activeSessionId: string
}

export interface AgentWsActions {
  connect: (url: string) => void
  disconnect: () => void
  send: (event: Omit<WsEvent, 'id' | 'timestamp'>) => void
  sendUserMessage: (content: string) => void
  selectNode: (id: string | null) => void
  checkoutCommit: (hash: string) => void
  createBranch: (name: string, baseHash?: string) => void
  createBranchFromCommit: (name: string, baseHash: string) => void
  setCurrentBranch: (name: string) => void
  tagCommit: (hash: string, tag: string) => void
  createWorkflowSnapshot: (note?: string) => void
  applyWorkflowTemplate: (templateId: string) => void
  setWorkflowOptions: (patch: WorkflowOptionsPatch) => void
  setApiConfig: (patch: Partial<OpenAICompatibleApiConfig>) => void
  toggleWorkflowComponent: (componentId: string) => void
  moveWorkflowComponent: (componentId: string, direction: 'up' | 'down') => void
  removeWorkflowComponent: (componentId: string) => void
  addWorkflowComponent: (type: WorkflowComponentType) => void
  updateWorkflowComponentPrompt: (componentId: string, promptTemplate: string) => void
  materializeWorkflowGraph: () => void
  applyAgentBlueprint: (blueprintId: string) => void
  createChatSession: (title?: string) => void
  switchChatSession: (sessionId: string) => void
  renameChatSession: (sessionId: string, title: string) => void
  deleteChatSession: (sessionId: string) => void
  clearActiveSession: () => void
}

export function useAgentWs(initialUrl = '') {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const manualDisconnectRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialStoreRef = useRef<{
    state: AgentWsState
    sessionStore: Record<string, AgentChatSessionSnapshot>
  } | null>(null)

  if (!initialStoreRef.current) {
    initialStoreRef.current = createInitialAgentStore()
  }

  const sessionStoreRef = useRef<Record<string, AgentChatSessionSnapshot>>(initialStoreRef.current.sessionStore)

  const [state, setState] = useState<AgentWsState>(initialStoreRef.current.state)

  const syncActiveSessionSnapshot = useCallback((draft: AgentWsState) => {
    const activeId = draft.activeSessionId
    if (!activeId) return

    const existing = sessionStoreRef.current[activeId]
    if (!existing) return

    const nextSnapshot = {
      ...existing,
      updatedAt: Date.now(),
      nodes: draft.nodes,
      edges: draft.edges,
      commits: draft.commits,
      branches: draft.branches,
      messages: draft.messages,
      toolExecutions: draft.toolExecutions,
      selectedNodeId: draft.selectedNodeId,
      currentBranch: draft.currentBranch,
      causalMemoryNodes: draft.causalMemoryNodes,
      causalMemoryEdges: draft.causalMemoryEdges,
    }
    sessionStoreRef.current = {
      ...sessionStoreRef.current,
      [activeId]: nextSnapshot,
    }
  }, [])

  const connect = useCallback((url: string) => {
    if (!url || typeof window === 'undefined') return

    manualDisconnectRef.current = false
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }

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
        if (manualDisconnectRef.current) {
          return
        }
        reconnectTimer.current = setTimeout(() => connect(url), 3000)
      }
    } catch {
      setState(s => ({ ...s, status: 'error' }))
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    wsRef.current?.close()
    wsRef.current = null
    setState(s => ({ ...s, status: 'disconnected' }))
  }, [])

  const send = useCallback((event: Omit<WsEvent, 'id' | 'timestamp'>) => {
    const full: WsEvent = { ...event, id: genId(), timestamp: Date.now() }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(full))
    }
  }, [])

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
        case 'workflow:update': {
          const wf = event.payload as unknown as AgentWorkflowDefinition
          return { ...next, workflow: wf }
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

  const sendUserMessage = useCallback((content: string) => {
    if (!content.trim()) return

    const msgId = genId()
    const now = Date.now()

    setState(prev => {
      const userNode: AgentNode = {
        id: genId(),
        kind: 'user-input',
        status: 'success',
        label: content.length > 40 ? `${content.slice(0, 40)}…` : content,
        branch: prev.currentBranch,
        timestamp: now,
      }

      const userMsg: ChatMessage = {
        id: msgId,
        role: 'user',
        content,
        timestamp: now,
        nodeId: userNode.id,
      }

      const nextNodes = [...prev.nodes, userNode]
      return {
        ...prev,
        messages: [...prev.messages, userMsg],
        nodes: nextNodes,
        selectedNodeId: userNode.id,
        isRunning: true,
      }
    })

    send({ type: 'agent:start', payload: { content } })

    const conversationHistory = [
      ...state.messages
        .filter(message => message.role === 'user' || message.role === 'agent')
        .slice(-10)
        .map(message => ({
          role: message.role as 'user' | 'agent',
          content: message.content,
        })),
      { role: 'user' as const, content },
    ]

    const request: AgentRunRequest = {
      prompt: content,
      workflow: state.workflow,
      currentBranch: state.currentBranch,
      apiConfig: state.apiConfig,
      conversationHistory,
    }
    void runWorkflowFromBackend(request, setState).catch(() => {
      simulateWorkflowRun(content, setState)
    })
  }, [send, state.messages, state.workflow, state.currentBranch, state.apiConfig])

  const selectNode = useCallback((id: string | null) => {
    setState(s => ({ ...s, selectedNodeId: id }))
  }, [])

  const checkoutCommit = useCallback((hash: string) => {
    setState(s => ({
      ...s,
      commits: s.commits.map(c => ({
        ...c,
        tags: c.hash === hash
          ? ensureTag(c.tags.filter(t => t !== 'HEAD'), 'HEAD')
          : c.tags.filter(t => t !== 'HEAD'),
      })),
    }))
  }, [])

  const createBranch = useCallback((name: string, baseHash?: string) => {
    const branchName = name.trim()
    if (!branchName) return

    setState(prev => {
      if (prev.branches.some(b => b.name === branchName)) return prev
      const head = baseHash || prev.commits.find(c => c.tags.includes('HEAD'))?.hash || prev.commits[0]?.hash || ''
      const color = BRANCH_COLORS[prev.branches.length % BRANCH_COLORS.length]
      return {
        ...prev,
        branches: [...prev.branches, { name: branchName, headHash: head, color, isActive: false, isMerged: false }],
      }
    })
  }, [])

  const createBranchFromCommit = useCallback((name: string, baseHash: string) => {
    createBranch(name, baseHash)
  }, [createBranch])

  const setCurrentBranch = useCallback((name: string) => {
    setState(s => ({
      ...s,
      currentBranch: name,
      branches: s.branches.map(b => ({ ...b, isActive: b.name === name })),
    }))
  }, [])

  const tagCommit = useCallback((hash: string, tag: string) => {
    const clean = tag.trim()
    if (!clean) return
    setState(s => ({
      ...s,
      commits: s.commits.map(c => c.hash === hash ? { ...c, tags: ensureTag(c.tags, clean) } : c),
    }))
  }, [])

  const createWorkflowSnapshot = useCallback((note?: string) => {
    setState(prev => {
      const now = Date.now()
      const head = prev.commits.find(c => c.tags.includes('HEAD'))
      const hash = shortHash()
      const fullHash = `${hash}${Math.random().toString(16).slice(2, 35)}`.slice(0, 40)
      const message = note?.trim() ? `工作流快照：${note.trim()}` : `工作流快照：${prev.workflow.name}`

      const checkpointNode: AgentNode = {
        id: genId(),
        kind: 'checkpoint',
        status: 'success',
        label: 'Workflow Snapshot',
        detail: message,
        branch: prev.currentBranch,
        commitHash: hash,
        timestamp: now,
      }

      const commit: Commit = {
        hash,
        fullHash,
        message,
        timestamp: now,
        branch: prev.currentBranch,
        parentHash: head?.hash ?? null,
        parentHashes: head ? [head.hash] : [],
        tags: ['HEAD', 'workflow'],
        author: 'user',
        nodeIds: [checkpointNode.id],
        workflowId: prev.workflow.id,
      }

      const commits = [
        commit,
        ...prev.commits.map(c => ({ ...c, tags: c.tags.filter(t => t !== 'HEAD') })),
      ]

      return {
        ...prev,
        commits,
        nodes: [...prev.nodes, checkpointNode],
        branches: prev.branches.map(b =>
          b.name === prev.currentBranch
            ? { ...b, headHash: hash, isActive: true }
            : b,
        ),
      }
    })
  }, [])

  const applyWorkflowTemplate = useCallback((templateId: string) => {
    setState(prev => {
      const tpl = prev.workflowTemplates.find(t => t.id === templateId)
      if (!tpl) return prev

      const nextWorkflow: AgentWorkflowDefinition = {
        id: `wf-${genId()}`,
        name: tpl.name,
        description: tpl.description,
        components: tpl.components.map(c => ({ ...c })),
        options: cloneOptions(tpl.options),
        lastUpdated: Date.now(),
      }

      const { nodes, edges } = buildNodesFromWorkflow(nextWorkflow, prev.currentBranch)
      return {
        ...prev,
        workflow: nextWorkflow,
        nodes,
        edges,
        selectedNodeId: nodes[0]?.id ?? null,
      }
    })
  }, [])

  const setWorkflowOptions = useCallback((patch: WorkflowOptionsPatch) => {
    setState(prev => {
      const merged = mergeWorkflowOptions(prev.workflow.options, patch)
      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          options: merged,
          lastUpdated: Date.now(),
        },
      }
    })
  }, [])

  const setApiConfig = useCallback((patch: Partial<OpenAICompatibleApiConfig>) => {
    setState(prev => ({
      ...prev,
      apiConfig: {
        ...prev.apiConfig,
        ...patch,
      },
    }))
  }, [])

  const toggleWorkflowComponent = useCallback((componentId: string) => {
    setState(prev => ({
      ...prev,
      workflow: {
        ...prev.workflow,
        components: prev.workflow.components.map(c => c.id === componentId ? { ...c, enabled: !c.enabled } : c),
        lastUpdated: Date.now(),
      },
    }))
  }, [])

  const moveWorkflowComponent = useCallback((componentId: string, direction: 'up' | 'down') => {
    setState(prev => {
      const arr = [...prev.workflow.components]
      const idx = arr.findIndex(c => c.id === componentId)
      if (idx < 0) return prev
      const nextIdx = direction === 'up' ? idx - 1 : idx + 1
      if (nextIdx < 0 || nextIdx >= arr.length) return prev
      const [item] = arr.splice(idx, 1)
      arr.splice(nextIdx, 0, item)
      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          components: arr,
          lastUpdated: Date.now(),
        },
      }
    })
  }, [])

  const removeWorkflowComponent = useCallback((componentId: string) => {
    setState(prev => {
      if (prev.workflow.components.length <= 1) return prev
      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          components: prev.workflow.components.filter(c => c.id !== componentId),
          lastUpdated: Date.now(),
        },
      }
    })
  }, [])

  const addWorkflowComponent = useCallback((type: WorkflowComponentType) => {
    setState(prev => {
      const component = createComponentFromType(type, prev.workflow.components.length + 1)
      return {
        ...prev,
        workflow: {
          ...prev.workflow,
          components: [...prev.workflow.components, component],
          lastUpdated: Date.now(),
        },
      }
    })
  }, [])

  const updateWorkflowComponentPrompt = useCallback((componentId: string, promptTemplate: string) => {
    setState(prev => ({
      ...prev,
      workflow: {
        ...prev.workflow,
        components: prev.workflow.components.map(component =>
          component.id === componentId
            ? {
                ...component,
                config: {
                  ...(component.config ?? {}),
                  promptTemplate,
                },
              }
            : component,
        ),
        lastUpdated: Date.now(),
      },
    }))
  }, [])

  const materializeWorkflowGraph = useCallback(() => {
    setState(prev => {
      const { nodes, edges } = buildNodesFromWorkflow(prev.workflow, prev.currentBranch)
      return {
        ...prev,
        nodes,
        edges,
        selectedNodeId: nodes[0]?.id ?? null,
      }
    })
  }, [])

  const applyAgentBlueprint = useCallback((blueprintId: string) => {
    setState(prev => {
      const nextWorkflow = buildWorkflowFromBlueprint(prev.workflow, blueprintId)
      if (nextWorkflow === prev.workflow) return prev

      const { nodes, edges } = buildNodesFromWorkflow(nextWorkflow, prev.currentBranch)
      return {
        ...prev,
        workflow: nextWorkflow,
        nodes,
        edges,
        selectedNodeId: nodes[0]?.id ?? null,
      }
    })
  }, [])

  const createChatSession = useCallback((title?: string) => {
    const cleanTitle = title?.trim()
    setState(prev => {
      syncActiveSessionSnapshot(prev)

      const now = Date.now()
      const id = `session_${now.toString(36)}_${genId()}`
      const snapshot = createEmptySessionSnapshot(
        id,
        cleanTitle || `会话 ${prev.chatSessions.length + 1}`,
        now,
      )

      sessionStoreRef.current = {
        ...sessionStoreRef.current,
        [id]: snapshot,
      }

      return applySessionSnapshot(
        {
          ...prev,
          activeSessionId: id,
          chatSessions: [toSessionMeta(snapshot), ...prev.chatSessions],
          isRunning: false,
        },
        snapshot,
      )
    })
  }, [syncActiveSessionSnapshot])

  const switchChatSession = useCallback((sessionId: string) => {
    setState(prev => {
      if (prev.activeSessionId === sessionId) return prev
      const snapshot = sessionStoreRef.current[sessionId]
      if (!snapshot) return prev

      syncActiveSessionSnapshot(prev)

      return applySessionSnapshot(
        {
          ...prev,
          activeSessionId: sessionId,
          isRunning: false,
        },
        snapshot,
      )
    })
  }, [syncActiveSessionSnapshot])

  const renameChatSession = useCallback((sessionId: string, title: string) => {
    const clean = title.trim()
    if (!clean) return

    setState(prev => {
      const snapshot = sessionStoreRef.current[sessionId]
      if (!snapshot) return prev

      const updatedSnapshot = {
        ...snapshot,
        title: clean,
        updatedAt: Date.now(),
      }

      sessionStoreRef.current = {
        ...sessionStoreRef.current,
        [sessionId]: updatedSnapshot,
      }

      return {
        ...prev,
        chatSessions: prev.chatSessions.map(session =>
          session.id === sessionId
            ? toSessionMeta(updatedSnapshot)
            : session,
        ),
      }
    })
  }, [])

  const deleteChatSession = useCallback((sessionId: string) => {
    setState(prev => {
      if (!prev.chatSessions.some(session => session.id === sessionId)) {
        return prev
      }

      if (prev.chatSessions.length <= 1) {
        const only = prev.chatSessions[0]
        const resetSnapshot = createEmptySessionSnapshot(only.id, only.title, only.createdAt)
        sessionStoreRef.current = { [only.id]: resetSnapshot }
        return applySessionSnapshot(
          {
            ...prev,
            activeSessionId: only.id,
            chatSessions: [toSessionMeta(resetSnapshot)],
            isRunning: false,
          },
          resetSnapshot,
        )
      }

      const nextSessions = prev.chatSessions.filter(session => session.id !== sessionId)
      const nextStore = { ...sessionStoreRef.current }
      delete nextStore[sessionId]
      sessionStoreRef.current = nextStore

      if (prev.activeSessionId !== sessionId) {
        return {
          ...prev,
          chatSessions: nextSessions,
        }
      }

      const fallbackSession = nextSessions[0]
      const fallbackSnapshot = sessionStoreRef.current[fallbackSession.id]
      if (!fallbackSnapshot) {
        return {
          ...prev,
          chatSessions: nextSessions,
          activeSessionId: fallbackSession.id,
          isRunning: false,
        }
      }

      return applySessionSnapshot(
        {
          ...prev,
          chatSessions: nextSessions,
          activeSessionId: fallbackSession.id,
          isRunning: false,
        },
        fallbackSnapshot,
      )
    })
  }, [])

  const clearActiveSession = useCallback(() => {
    setState(prev => {
      const active = prev.chatSessions.find(session => session.id === prev.activeSessionId)
      if (!active) return prev

      const clearedSnapshot = createEmptySessionSnapshot(active.id, active.title, active.createdAt)
      sessionStoreRef.current = {
        ...sessionStoreRef.current,
        [active.id]: clearedSnapshot,
      }

      return applySessionSnapshot(
        {
          ...prev,
          chatSessions: prev.chatSessions.map(session =>
            session.id === active.id ? toSessionMeta(clearedSnapshot) : session,
          ),
          isRunning: false,
        },
        clearedSnapshot,
      )
    })
  }, [])

  useEffect(() => {
    syncActiveSessionSnapshot(state)

    const activeSnapshot = sessionStoreRef.current[state.activeSessionId]
    if (!activeSnapshot) return

    setState(prev => {
      const index = prev.chatSessions.findIndex(session => session.id === state.activeSessionId)
      if (index < 0) return prev

      const nextMeta = toSessionMeta(activeSnapshot)
      const currentMeta = prev.chatSessions[index]
      if (
        currentMeta.title === nextMeta.title &&
        currentMeta.updatedAt === nextMeta.updatedAt &&
        currentMeta.messageCount === nextMeta.messageCount
      ) {
        return prev
      }

      const nextSessions = [...prev.chatSessions]
      nextSessions[index] = nextMeta
      return {
        ...prev,
        chatSessions: nextSessions,
      }
    })
  }, [
    state.activeSessionId,
    state.nodes,
    state.edges,
    state.commits,
    state.branches,
    state.messages,
    state.toolExecutions,
    state.selectedNodeId,
    state.currentBranch,
    state.causalMemoryNodes,
    state.causalMemoryEdges,
    syncActiveSessionSnapshot,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    saveTimerRef.current = setTimeout(() => {
      syncActiveSessionSnapshot(state)

      const sessions = state.chatSessions
        .map(session => sessionStoreRef.current[session.id])
        .filter((item): item is AgentChatSessionSnapshot => Boolean(item))

      const payload: PersistedAgentState = {
        version: 1,
        activeSessionId: state.activeSessionId,
        sessions,
        workflow: state.workflow,
        apiConfig: state.apiConfig,
      }

      try {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
      } catch {
        // ignore localStorage write failures
      }
    }, 250)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [
    state.activeSessionId,
    state.chatSessions,
    state.workflow,
    state.apiConfig,
    state.nodes,
    state.edges,
    state.commits,
    state.branches,
    state.messages,
    state.toolExecutions,
    state.selectedNodeId,
    state.currentBranch,
    state.causalMemoryNodes,
    state.causalMemoryEdges,
    syncActiveSessionSnapshot,
  ])

  useEffect(() => {
    if (initialUrl) connect(initialUrl)
    return () => {
      disconnect()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo<AgentWsActions>(() => ({
    connect,
    disconnect,
    send,
    sendUserMessage,
    selectNode,
    checkoutCommit,
    createBranch,
    createBranchFromCommit,
    setCurrentBranch,
    tagCommit,
    createWorkflowSnapshot,
    applyWorkflowTemplate,
    setWorkflowOptions,
    setApiConfig,
    toggleWorkflowComponent,
    moveWorkflowComponent,
    removeWorkflowComponent,
    addWorkflowComponent,
    updateWorkflowComponentPrompt,
    materializeWorkflowGraph,
    applyAgentBlueprint,
    createChatSession,
    switchChatSession,
    renameChatSession,
    deleteChatSession,
    clearActiveSession,
  }), [
    connect,
    disconnect,
    send,
    sendUserMessage,
    selectNode,
    checkoutCommit,
    createBranch,
    createBranchFromCommit,
    setCurrentBranch,
    tagCommit,
    createWorkflowSnapshot,
    applyWorkflowTemplate,
    setWorkflowOptions,
    setApiConfig,
    toggleWorkflowComponent,
    moveWorkflowComponent,
    removeWorkflowComponent,
    addWorkflowComponent,
    updateWorkflowComponentPrompt,
    materializeWorkflowGraph,
    applyAgentBlueprint,
    createChatSession,
    switchChatSession,
    renameChatSession,
    deleteChatSession,
    clearActiveSession,
  ])

  return { state, actions }
}

function createInitialAgentStore(): {
  state: AgentWsState
  sessionStore: Record<string, AgentChatSessionSnapshot>
} {
  const now = Date.now()
  const fallbackSnapshot = createSnapshotFromMockData('session-default', DEFAULT_SESSION_TITLE, now)
  const fallbackStore = { [fallbackSnapshot.id]: fallbackSnapshot }
  const fallbackState: AgentWsState = {
    status: 'disconnected',
    nodes: fallbackSnapshot.nodes,
    edges: fallbackSnapshot.edges,
    commits: fallbackSnapshot.commits,
    branches: fallbackSnapshot.branches,
    messages: fallbackSnapshot.messages,
    toolExecutions: fallbackSnapshot.toolExecutions,
    selectedNodeId: fallbackSnapshot.selectedNodeId,
    currentBranch: fallbackSnapshot.currentBranch,
    isRunning: false,
    latestEvent: null,
    workflow: MOCK_WORKFLOW,
    workflowTemplates: MOCK_WORKFLOW_TEMPLATES,
    apiConfig: MOCK_API_CONFIG,
    causalMemoryNodes: fallbackSnapshot.causalMemoryNodes,
    causalMemoryEdges: fallbackSnapshot.causalMemoryEdges,
    chatSessions: [toSessionMeta(fallbackSnapshot)],
    activeSessionId: fallbackSnapshot.id,
  }

  if (typeof window === 'undefined') {
    return {
      state: fallbackState,
      sessionStore: fallbackStore,
    }
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) {
      return {
        state: fallbackState,
        sessionStore: fallbackStore,
      }
    }

    const parsed = JSON.parse(raw) as PersistedAgentState
    if (parsed?.version !== 1 || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
      return {
        state: fallbackState,
        sessionStore: fallbackStore,
      }
    }

    const normalizedSessions = parsed.sessions
      .map(normalizeSessionSnapshot)
      .filter((session): session is AgentChatSessionSnapshot => Boolean(session))

    if (normalizedSessions.length === 0) {
      return {
        state: fallbackState,
        sessionStore: fallbackStore,
      }
    }

    const store: Record<string, AgentChatSessionSnapshot> = {}
    for (const session of normalizedSessions) {
      store[session.id] = session
    }

    const activeSession =
      store[parsed.activeSessionId] ??
      normalizedSessions[0]

    const restoredState: AgentWsState = {
      ...fallbackState,
      nodes: activeSession.nodes,
      edges: activeSession.edges,
      commits: activeSession.commits,
      branches: activeSession.branches,
      messages: activeSession.messages,
      toolExecutions: activeSession.toolExecutions,
      selectedNodeId: activeSession.selectedNodeId,
      currentBranch: activeSession.currentBranch,
      causalMemoryNodes: activeSession.causalMemoryNodes,
      causalMemoryEdges: activeSession.causalMemoryEdges,
      workflow: parsed.workflow ?? fallbackState.workflow,
      apiConfig: parsed.apiConfig ?? fallbackState.apiConfig,
      chatSessions: normalizedSessions.map(toSessionMeta),
      activeSessionId: activeSession.id,
    }

    return {
      state: restoredState,
      sessionStore: store,
    }
  } catch {
    return {
      state: fallbackState,
      sessionStore: fallbackStore,
    }
  }
}

function createSnapshotFromMockData(id: string, title: string, now: number): AgentChatSessionSnapshot {
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    nodes: MOCK_NODES,
    edges: MOCK_EDGES,
    commits: MOCK_COMMITS,
    branches: MOCK_BRANCHES,
    messages: MOCK_MESSAGES,
    toolExecutions: MOCK_TOOL_EXECUTIONS,
    selectedNodeId: null,
    currentBranch: 'main',
    causalMemoryNodes: MOCK_CAUSAL_MEMORY_NODES,
    causalMemoryEdges: MOCK_CAUSAL_MEMORY_EDGES,
  }
}

function createEmptySessionSnapshot(id: string, title: string, createdAt: number): AgentChatSessionSnapshot {
  return {
    id,
    title,
    createdAt,
    updatedAt: Date.now(),
    nodes: [],
    edges: [],
    commits: [],
    branches: [
      {
        name: 'main',
        headHash: '',
        color: BRANCH_COLORS[0],
        isActive: true,
        isMerged: false,
      },
    ],
    messages: [],
    toolExecutions: [],
    selectedNodeId: null,
    currentBranch: 'main',
    causalMemoryNodes: [],
    causalMemoryEdges: [],
  }
}

function normalizeSessionSnapshot(raw: unknown): AgentChatSessionSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const session = raw as Partial<AgentChatSessionSnapshot>
  if (!session.id || typeof session.id !== 'string') return null
  if (!session.title || typeof session.title !== 'string') return null

  const createdAt = typeof session.createdAt === 'number' ? session.createdAt : Date.now()
  const updatedAt = typeof session.updatedAt === 'number' ? session.updatedAt : createdAt

  return {
    id: session.id,
    title: session.title,
    createdAt,
    updatedAt,
    nodes: Array.isArray(session.nodes) ? session.nodes : [],
    edges: Array.isArray(session.edges) ? session.edges : [],
    commits: Array.isArray(session.commits) ? session.commits : [],
    branches: Array.isArray(session.branches) && session.branches.length > 0
      ? session.branches
      : [
          {
            name: 'main',
            headHash: '',
            color: BRANCH_COLORS[0],
            isActive: true,
            isMerged: false,
          },
        ],
    messages: Array.isArray(session.messages) ? session.messages : [],
    toolExecutions: Array.isArray(session.toolExecutions) ? session.toolExecutions : [],
    selectedNodeId: typeof session.selectedNodeId === 'string' ? session.selectedNodeId : null,
    currentBranch: typeof session.currentBranch === 'string' ? session.currentBranch : 'main',
    causalMemoryNodes: Array.isArray(session.causalMemoryNodes) ? session.causalMemoryNodes : [],
    causalMemoryEdges: Array.isArray(session.causalMemoryEdges) ? session.causalMemoryEdges : [],
  }
}

function toSessionMeta(snapshot: AgentChatSessionSnapshot): AgentChatSession {
  return {
    id: snapshot.id,
    title: snapshot.title,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    messageCount: snapshot.messages.length,
  }
}

function applySessionSnapshot(state: AgentWsState, snapshot: AgentChatSessionSnapshot): AgentWsState {
  return {
    ...state,
    nodes: snapshot.nodes,
    edges: snapshot.edges,
    commits: snapshot.commits,
    branches: snapshot.branches,
    messages: snapshot.messages,
    toolExecutions: snapshot.toolExecutions,
    selectedNodeId: snapshot.selectedNodeId,
    currentBranch: snapshot.currentBranch,
    causalMemoryNodes: snapshot.causalMemoryNodes,
    causalMemoryEdges: snapshot.causalMemoryEdges,
  }
}

function genId() {
  return Math.random().toString(36).slice(2, 10)
}

function shortHash() {
  return Math.random().toString(16).slice(2, 9)
}

function ensureTag(tags: string[], tag: string) {
  return tags.includes(tag) ? tags : [...tags, tag]
}

function phaseRank(phase: AgentWorkflowComponent['phase']) {
  if (phase === 'discover') return 0
  if (phase === 'investigate') return 1
  return 2
}

function buildNodesFromWorkflow(workflow: AgentWorkflowDefinition, branch: string) {
  const enabled = workflow.components
    .filter(c => c.enabled)
    .sort((a, b) => phaseRank(a.phase) - phaseRank(b.phase))

  const now = Date.now()
  const nodes: AgentNode[] = enabled.map((component, index) => ({
    id: `wf-node-${component.id}-${index}`,
    kind: 'workflow-component',
    status: index === enabled.length - 1 ? 'running' : 'success',
    label: component.name,
    detail: component.description,
    componentType: component.type,
    phase: component.phase,
    branch,
    timestamp: now - (enabled.length - index) * 800,
    tokenCount: component.type === 'llm-planner' || component.type === 'summary-synthesizer' ? 320 + index * 64 : undefined,
  }))

  const edges = nodes.slice(1).map((node, index) => ({
    id: `wf-edge-${index + 1}`,
    source: nodes[index].id,
    target: node.id,
    animated: node.componentType === 'causal-memory' || node.componentType === 'summary-synthesizer',
    label: node.phase,
  }))

  return { nodes, edges }
}

function cloneOptions(options: AgentWorkflowOptions): AgentWorkflowOptions {
  return {
    ...options,
    budget: { ...options.budget },
    toolPermissions: { ...options.toolPermissions },
    actionQuotas: { ...options.actionQuotas },
  }
}

function mergeWorkflowOptions(base: AgentWorkflowOptions, patch: WorkflowOptionsPatch): AgentWorkflowOptions {
  return {
    ...base,
    ...patch,
    budget: { ...base.budget, ...(patch.budget ?? {}) },
    toolPermissions: { ...base.toolPermissions, ...(patch.toolPermissions ?? {}) },
    actionQuotas: { ...base.actionQuotas, ...(patch.actionQuotas ?? {}) },
  }
}

function createComponentFromType(type: WorkflowComponentType, order: number): AgentWorkflowComponent {
  const base = {
    id: `wf-custom-${type}-${genId()}`,
    type,
    enabled: true,
    config: {},
  } as const

  switch (type) {
    case 'run-orchestrator':
      return {
        ...base,
        name: `Orchestrator #${order}`,
        phase: 'discover',
        description: '调度 Agent 阶段与请求预算',
        color: '#0070f3',
      }
    case 'manifest-loader':
      return {
        ...base,
        name: `Manifest Loader #${order}`,
        phase: 'discover',
        description: '读取代码清单与目录边界',
        color: '#00d4ff',
      }
    case 'baseline-analyzer':
      return {
        ...base,
        name: `Baseline Analyzer #${order}`,
        phase: 'discover',
        description: '生成首轮基线结论',
        color: '#22c55e',
      }
    case 'llm-planner':
      return {
        ...base,
        name: `LLM Planner #${order}`,
        phase: 'investigate',
        description: '规划下一步动作',
        color: '#f59e0b',
      }
    case 'tool-executor':
      return {
        ...base,
        name: `Tool Executor #${order}`,
        phase: 'investigate',
        description: '执行 code/telemetry 工具',
        color: '#06b6d4',
      }
    case 'causal-memory':
      return {
        ...base,
        name: `Causal Memory #${order}`,
        phase: 'investigate',
        description: '构建并检索因果记忆图',
        color: '#a855f7',
      }
    case 'governance-gate':
      return {
        ...base,
        name: `Governance Gate #${order}`,
        phase: 'investigate',
        description: '动作治理（去重/禁用签名）',
        color: '#ec4899',
      }
    case 'evidence-hub':
      return {
        ...base,
        name: `Evidence Hub #${order}`,
        phase: 'investigate',
        description: '集中管理证据片段',
        color: '#14b8a6',
      }
    case 'summary-synthesizer':
      return {
        ...base,
        name: `Summary Synthesizer #${order}`,
        phase: 'synthesize',
        description: '生成最终输出',
        color: '#22c55e',
      }
    case 'critique-refiner':
      return {
        ...base,
        name: `Critique Refiner #${order}`,
        phase: 'synthesize',
        description: '批判与精修结论',
        color: '#f97316',
      }
    case 'custom-prompt':
      return {
        ...base,
        name: `Custom Prompt #${order}`,
        phase: 'investigate',
        description: '自定义提示词节点',
        color: '#94a3b8',
        config: {
          promptTemplate: '你是项目智能体，请基于当前上下文先输出计划，再输出执行建议。',
        },
      }
    default:
      return {
        ...base,
        name: `Component #${order}`,
        phase: 'investigate',
        description: '自定义组件',
        color: '#888888',
      }
  }
}

function simulateWorkflowRun(
  content: string,
  setState: React.Dispatch<React.SetStateAction<AgentWsState>>,
) {
  const start = Date.now()

  setTimeout(() => {
    setState(prev => {
      const activeWorkflowNodes = prev.nodes.filter(node => node.kind === 'workflow-component')
      const runningNodeId = activeWorkflowNodes[activeWorkflowNodes.length - 1]?.id ?? prev.selectedNodeId ?? genId()

      const patchedNodes = patchWorkflowNodes(activeWorkflowNodes, content, start)

      const toolExec: ToolExecution | undefined = prev.workflow.components.some(c => c.enabled && c.type === 'tool-executor')
        ? {
            id: genId(),
            tool: 'shell',
            status: 'running',
            input: {
              action: 'workflow_execute',
              steps: prev.workflow.components.filter(c => c.enabled).map(c => c.type),
              causal_memory: prev.workflow.options.enableCausalMemory,
            },
            startTime: start + 500,
            nodeId: patchedNodes.find(n => n.componentType === 'tool-executor')?.id ?? runningNodeId,
          }
        : undefined

      const agentMessage: ChatMessage = {
        id: genId(),
        role: 'agent',
        content: `已按「${prev.workflow.name}」执行。当前链路：${prev.workflow.components.filter(c => c.enabled).map(c => c.name).join(' -> ')}`,
        thinking: prev.workflow.options.enableCausalMemory
          ? '因果记忆已参与检索增强，下一步建议创建 workflow 快照并打 stable 标签。'
          : '当前关闭了因果记忆，建议开启后再次比较结果。',
        timestamp: start + 1400,
        nodeId: runningNodeId,
        status: 'running',
      }

      return {
        ...prev,
        nodes: mergeWorkflowNodes(prev.nodes, patchedNodes),
        toolExecutions: toolExec ? [...prev.toolExecutions, toolExec] : prev.toolExecutions,
        messages: [...prev.messages, agentMessage],
        selectedNodeId: runningNodeId,
      }
    })
  }, 350)

  setTimeout(() => {
    setState(prev => ({
      ...prev,
      nodes: prev.nodes.map(n =>
        n.kind === 'workflow-component' && n.status === 'running'
          ? { ...n, status: 'success', tokenCount: n.tokenCount ?? 256 }
          : n,
      ),
      toolExecutions: prev.toolExecutions.map(exec =>
        exec.status === 'running'
          ? {
              ...exec,
              status: 'success',
              output: 'workflow execution success',
              endTime: Date.now(),
            }
          : exec,
      ),
      messages: prev.messages.map(msg =>
        msg.status === 'running'
          ? { ...msg, status: 'success', content: `${msg.content}
已完成执行，可在左侧创建快照并管理分支。` }
          : msg,
      ),
      isRunning: false,
    }))
  }, 2400)
}

async function runWorkflowFromBackend(
  request: AgentRunRequest,
  setState: React.Dispatch<React.SetStateAction<AgentWsState>>,
) {
  const response = await fetch('/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(`Backend run failed: ${response.status}`)
  }

  const result = (await response.json()) as AgentRunResponse
  setState(prev => {
    const mergedCausalNodes = mergeUniqueById(prev.causalMemoryNodes, result.causalMemoryNodes)
    const mergedCausalEdges = mergeUniqueById(prev.causalMemoryEdges, result.causalMemoryEdges)

    const workflowResultNodes = result.nodes.filter(node => node.kind === 'workflow-component')
    const nonWorkflowResultNodes = result.nodes.filter(node => node.kind !== 'workflow-component')

    const patchedWorkflowNodes = projectResultToWorkflowNodes(prev.nodes, workflowResultNodes, request.prompt)
    const nextNodes = [
      ...mergeWorkflowNodes(prev.nodes, patchedWorkflowNodes),
      ...nonWorkflowResultNodes,
    ]

    const lastNodeId = patchedWorkflowNodes[patchedWorkflowNodes.length - 1]?.id
      ?? nonWorkflowResultNodes[nonWorkflowResultNodes.length - 1]?.id
      ?? prev.selectedNodeId

    return {
      ...prev,
      nodes: nextNodes,
      edges: result.edges.length > 0 ? result.edges : prev.edges,
      messages: [...prev.messages, ...result.messages],
      toolExecutions: [...prev.toolExecutions, ...result.toolExecutions],
      causalMemoryNodes: mergedCausalNodes,
      causalMemoryEdges: mergedCausalEdges,
      selectedNodeId: lastNodeId,
      isRunning: false,
    }
  })
}

function patchWorkflowNodes(nodes: AgentNode[], content: string, startTime: number): AgentNode[] {
  if (nodes.length === 0) return nodes
  return nodes.map((node, index) => ({
    ...node,
    status: index === nodes.length - 1 ? 'running' : 'success',
    detail: `处理用户请求：${content.slice(0, 48)}${content.length > 48 ? '…' : ''}`,
    timestamp: startTime + index * 320,
    tokenCount: node.tokenCount ?? (node.componentType === 'llm-planner' || node.componentType === 'summary-synthesizer' ? 360 + index * 40 : undefined),
  }))
}

function projectResultToWorkflowNodes(baseNodes: AgentNode[], incomingWorkflowNodes: AgentNode[], prompt: string): AgentNode[] {
  const workflowBase = baseNodes.filter(node => node.kind === 'workflow-component')
  if (workflowBase.length === 0) return incomingWorkflowNodes

  return workflowBase.map((node, index) => {
    const byType = incomingWorkflowNodes.find(item => item.componentType && item.componentType === node.componentType)
    const fallback = incomingWorkflowNodes[index]
    const source = byType ?? fallback
    if (!source) {
      return {
        ...node,
        detail: node.detail ?? `执行中：${prompt.slice(0, 32)}${prompt.length > 32 ? '…' : ''}`,
      }
    }

    return {
      ...node,
      status: source.status,
      detail: source.detail ?? node.detail,
      duration: source.duration ?? node.duration,
      tokenCount: source.tokenCount ?? node.tokenCount,
      timestamp: source.timestamp ?? node.timestamp,
      meta: {
        ...(node.meta ?? {}),
        ...(source.meta ?? {}),
      },
    }
  })
}

function mergeWorkflowNodes(baseNodes: AgentNode[], patchedWorkflowNodes: AgentNode[]): AgentNode[] {
  if (patchedWorkflowNodes.length === 0) return baseNodes
  const patchedMap = new Map(patchedWorkflowNodes.map(item => [item.id, item] as const))
  return baseNodes.map(node => {
    if (node.kind !== 'workflow-component') return node
    return patchedMap.get(node.id) ?? node
  })
}

function mergeUniqueById<T extends { id: string }>(base: T[], incoming: T[]): T[] {
  const map = new Map<string, T>()
  for (const item of base) map.set(item.id, item)
  for (const item of incoming) map.set(item.id, item)
  return Array.from(map.values())
}

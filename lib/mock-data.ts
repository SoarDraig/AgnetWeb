import type {
  AgentNode,
  AgentEdge,
  Commit,
  Branch,
  ChatMessage,
  ToolExecution,
} from './types'

// Fixed base time so SSR and CSR produce identical timestamps (no hydration mismatch)
const BASE_TIME = 1741132800000 // 2025-03-05 00:00:00 UTC — fixed reference

// ─── Branches ─────────────────────────────────────────────────────────

export const MOCK_BRANCHES: Branch[] = [
  { name: 'main',          headHash: 'a3f8c21', color: '#0070f3', isActive: true,  isMerged: false },
  { name: 'feat/refactor', headHash: 'd9e1b47', color: '#22c55e', isActive: false, isMerged: false },
  { name: 'fix/memory',    headHash: '7c2a9f0', color: '#f59e0b', isActive: false, isMerged: true  },
]

// ─── Commits ──────────────────────────────────────────────────────────

export const MOCK_COMMITS: Commit[] = [
  {
    hash: 'a3f8c21', fullHash: 'a3f8c210394bde92a1f7cc2c4e9073b123456789',
    message: '完成文件结构分析，输出架构报告',
    timestamp: BASE_TIME - 1000 * 60 * 2,
    branch: 'main', parentHash: 'd9e1b47', parentHashes: ['d9e1b47'],
    tags: ['HEAD', 'latest'], author: 'agent',
    nodeIds: ['node-7', 'node-8'],
  },
  {
    hash: 'd9e1b47', fullHash: 'd9e1b470a9c3fa12b8e4d527c89abc0123456789',
    message: 'Merge feat/refactor → main',
    timestamp: BASE_TIME - 1000 * 60 * 8,
    branch: 'main', parentHash: '5b1e3d9', parentHashes: ['5b1e3d9', '7c2a9f0'],
    tags: [], author: 'agent',
    nodeIds: [],
  },
  {
    hash: '7c2a9f0', fullHash: '7c2a9f0e1b234567890abcdef0123456789abcde',
    message: '修复 memory 写入竞态问题',
    timestamp: BASE_TIME - 1000 * 60 * 12,
    branch: 'fix/memory', parentHash: '5b1e3d9', parentHashes: ['5b1e3d9'],
    tags: [], author: 'agent',
    nodeIds: ['node-5', 'node-6'],
  },
  {
    hash: '5b1e3d9', fullHash: '5b1e3d9f2a345678901bcdef01234567890abcde',
    message: '执行 shell 命令：npm install，安装依赖',
    timestamp: BASE_TIME - 1000 * 60 * 18,
    branch: 'main', parentHash: '2c4a7f1', parentHashes: ['2c4a7f1'],
    tags: [], author: 'agent',
    nodeIds: ['node-3', 'node-4'],
  },
  {
    hash: '2c4a7f1', fullHash: '2c4a7f1d3456789012cdef012345678901abcdef',
    message: '读取项目根目录，获取文件列表',
    timestamp: BASE_TIME - 1000 * 60 * 25,
    branch: 'main', parentHash: null, parentHashes: [],
    tags: ['init'], author: 'user',
    nodeIds: ['node-1', 'node-2'],
  },
]

// ─── Agent Nodes ──────────────────────────────────────────────────────

export const MOCK_NODES: AgentNode[] = [
  {
    id: 'node-1', kind: 'user-input', status: 'success',
    label: '分析这个项目的结构', detail: '用户发送初始指令',
    commitHash: '2c4a7f1', branch: 'main',
    timestamp: BASE_TIME - 1000 * 60 * 25,
  },
  {
    id: 'node-2', kind: 'agent-think', status: 'success',
    label: 'Agent 规划执行步骤',
    detail: '决定先读取目录结构，然后分析文件内容',
    commitHash: '2c4a7f1', branch: 'main',
    timestamp: BASE_TIME - 1000 * 60 * 24,
    tokenCount: 312,
  },
  {
    id: 'node-3', kind: 'tool-call', status: 'success',
    label: 'filesystem.readDir("/")',
    tool: 'filesystem', commitHash: '5b1e3d9', branch: 'main',
    timestamp: BASE_TIME - 1000 * 60 * 18,
    duration: 85,
  },
  {
    id: 'node-4', kind: 'tool-result', status: 'success',
    label: '返回 24 个文件',
    detail: 'src/, tests/, package.json, README.md ...',
    tool: 'filesystem', commitHash: '5b1e3d9', branch: 'main',
    timestamp: BASE_TIME - 1000 * 60 * 17,
  },
  {
    id: 'node-5', kind: 'tool-call', status: 'success',
    label: 'shell.exec("npm install")',
    tool: 'shell', commitHash: '7c2a9f0', branch: 'fix/memory',
    timestamp: BASE_TIME - 1000 * 60 * 12,
    duration: 4200,
  },
  {
    id: 'node-6', kind: 'tool-result', status: 'success',
    label: 'npm install 成功',
    detail: 'added 847 packages in 4.2s',
    tool: 'shell', commitHash: '7c2a9f0', branch: 'fix/memory',
    timestamp: BASE_TIME - 1000 * 60 * 11,
  },
  {
    id: 'node-7', kind: 'agent-think', status: 'running',
    label: '生成架构分析报告',
    detail: '正在调用 LLM 进行深度分析...',
    commitHash: 'a3f8c21', branch: 'main',
    timestamp: BASE_TIME - 1000 * 60 * 2,
    tokenCount: 1847,
  },
  {
    id: 'node-8', kind: 'memory', status: 'running',
    label: 'memory.write("arch_report")',
    tool: 'memory', commitHash: 'a3f8c21', branch: 'main',
    timestamp: BASE_TIME - 1000 * 30,
  },
]

export const MOCK_EDGES: AgentEdge[] = [
  { id: 'e1-2', source: 'node-1', target: 'node-2' },
  { id: 'e2-3', source: 'node-2', target: 'node-3' },
  { id: 'e3-4', source: 'node-3', target: 'node-4' },
  { id: 'e4-5', source: 'node-4', target: 'node-5', label: 'branch: fix/memory' },
  { id: 'e5-6', source: 'node-5', target: 'node-6' },
  { id: 'e6-7', source: 'node-6', target: 'node-7', label: 'merge' },
  { id: 'e7-8', source: 'node-7', target: 'node-8', animated: true },
]

// ─── Chat Messages ────────────────────────────────────────────────────

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1', role: 'user',
    content: '帮我分析这个项目的整体结构，并生成一份架构报告',
    timestamp: BASE_TIME - 1000 * 60 * 25,
    nodeId: 'node-1',
  },
  {
    id: 'msg-2', role: 'agent',
    content: '好的，我会先扫描项目的目录结构，然后分析关键文件，最后生成一份完整的架构报告。',
    thinking: '需要先读取根目录，获取整体文件结构。然后针对重要配置文件和源码进行深度分析。',
    timestamp: BASE_TIME - 1000 * 60 * 24,
    nodeId: 'node-2',
    status: 'success',
  },
  {
    id: 'msg-3', role: 'tool',
    content: '读取目录：/\n返回 24 个条目：src/, tests/, docs/, package.json, tsconfig.json...',
    timestamp: BASE_TIME - 1000 * 60 * 18,
    nodeId: 'node-3',
    toolName: 'filesystem',
    status: 'success',
    toolInput: { path: '/', recursive: false },
    toolOutput: 'src/ tests/ docs/ package.json tsconfig.json .env.example README.md ...',
  },
  {
    id: 'msg-4', role: 'tool',
    content: '执行：npm install\n✓ 成功安装 847 个依赖包，耗时 4.2s',
    timestamp: BASE_TIME - 1000 * 60 * 12,
    nodeId: 'node-5',
    toolName: 'shell',
    status: 'success',
    toolInput: { command: 'npm install', cwd: '/' },
    toolOutput: 'added 847 packages in 4.2s\n\n91 packages are looking for funding',
  },
  {
    id: 'msg-5', role: 'agent',
    content: '正在整合分析结果，生成最终架构报告...',
    thinking: '综合文件结构、依赖关系和代码模式，我需要生成一份包含以下部分的报告：1) 项目概览 2) 技术栈 3) 模块划分 4) 改进建议',
    timestamp: BASE_TIME - 1000 * 60 * 2,
    nodeId: 'node-7',
    status: 'running',
  },
]

// ─── Tool Executions ──────────────────────────────────────────────────

export const MOCK_TOOL_EXECUTIONS: ToolExecution[] = [
  {
    id: 'exec-1', tool: 'filesystem', status: 'success',
    input: { action: 'readDir', path: '/', recursive: false },
    output: 'src/\ntests/\ndocs/\npackage.json\ntsconfig.json\n.env.example\nREADME.md',
    startTime: BASE_TIME - 1000 * 60 * 18,
    endTime: BASE_TIME - 1000 * 60 * 18 + 85,
    nodeId: 'node-3',
  },
  {
    id: 'exec-2', tool: 'shell', status: 'success',
    input: { command: 'npm install', cwd: '/' },
    output: 'added 847 packages in 4.2s\n\n91 packages are looking for funding\n  run `npm fund` for details',
    startTime: BASE_TIME - 1000 * 60 * 12,
    endTime: BASE_TIME - 1000 * 60 * 12 + 4200,
    nodeId: 'node-5',
  },
  {
    id: 'exec-3', tool: 'memory', status: 'running',
    input: { action: 'write', key: 'arch_report', value: '...' },
    startTime: BASE_TIME - 1000 * 30,
    nodeId: 'node-8',
  },
]

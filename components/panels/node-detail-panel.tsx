'use client'

import { cn } from '@/lib/utils'
import type { AgentNode, ToolExecution } from '@/lib/types'

interface Props {
  node: AgentNode | null
  toolExecutions: ToolExecution[]
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  idle:    { label: '等待', color: '#555' },
  running: { label: '运行中', color: '#f59e0b' },
  success: { label: '已完成', color: '#22c55e' },
  error:   { label: '错误', color: '#ff4444' },
  skipped: { label: '已跳过', color: '#555' },
}

const KIND_LABELS: Record<string, string> = {
  'user-input':  '用户输入',
  'agent-think': 'Agent 思考',
  'tool-call':   '工具调用',
  'tool-result': '工具结果',
  'memory':      'Memory 操作',
  'branch':      '分支节点',
  'checkpoint':  '检查点',
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#111]">
      <span className="text-[9px] font-mono text-[#444] w-16 flex-shrink-0 pt-0.5 uppercase">{label}</span>
      <span className={cn('text-[11px] text-[#888] flex-1 break-all', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

export default function NodeDetailPanel({ node, toolExecutions }: Props) {
  if (!node) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#000] border-t border-[#1e1e1e] text-center px-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" className="mb-3">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 8v4M12 16h.01"/>
        </svg>
        <p className="text-[11px] text-[#333]">点击图中节点查看详情</p>
      </div>
    )
  }

  const status = STATUS_LABELS[node.status] ?? STATUS_LABELS.idle
  const kindLabel = KIND_LABELS[node.kind] ?? node.kind

  const relatedExec = toolExecutions.find(e => e.nodeId === node.id)

  return (
    <div className="flex flex-col h-full bg-[#000] border-t border-[#1e1e1e] overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">节点详情</span>
        <span
          className="text-[9px] font-mono px-1.5 py-0.5 rounded"
          style={{ color: status.color, background: status.color + '18', border: `1px solid ${status.color}33` }}
        >
          {status.label}
        </span>
      </div>

      {/* Details */}
      <div className="flex-1 px-3 py-2">
        <Row label="ID" value={node.id} mono />
        <Row label="类型" value={kindLabel} />
        <Row label="标签" value={node.label} />
        {node.detail && <Row label="描述" value={node.detail} />}
        {node.tool && <Row label="工具" value={node.tool} mono />}
        {node.branch && <Row label="分支" value={node.branch} mono />}
        {node.commitHash && <Row label="Commit" value={node.commitHash} mono />}
        {node.duration != null && (
          <Row
            label="耗时"
            value={node.duration >= 1000 ? `${(node.duration / 1000).toFixed(2)}s` : `${node.duration}ms`}
          />
        )}
        {node.tokenCount != null && <Row label="Token" value={`${node.tokenCount.toLocaleString()} tokens`} />}
        <Row
          label="时间"
          value={new Date(node.timestamp).toLocaleString('zh-CN', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
          })}
        />

        {/* Tool execution details */}
        {relatedExec && (
          <div className="mt-3">
            <p className="text-[9px] font-mono text-[#444] uppercase mb-2 tracking-widest">工具执行记录</p>

            <div className="rounded border border-[#1e1e1e] overflow-hidden">
              <div className="bg-[#0a0a0a] px-3 py-2">
                <p className="text-[9px] font-mono text-[#555] mb-1">INPUT</p>
                <pre className="text-[10px] font-mono text-[#888] whitespace-pre-wrap break-all leading-relaxed">
                  {JSON.stringify(relatedExec.input, null, 2)}
                </pre>
              </div>

              {relatedExec.output && (
                <div className="bg-[#0a0a0a] border-t border-[#1e1e1e] px-3 py-2">
                  <p className="text-[9px] font-mono text-[#22c55e66] mb-1">OUTPUT</p>
                  <pre className="text-[10px] font-mono text-[#888] whitespace-pre-wrap break-all leading-relaxed max-h-32 overflow-y-auto">
                    {relatedExec.output}
                  </pre>
                </div>
              )}

              {relatedExec.error && (
                <div className="bg-[#ff444408] border-t border-[#ff444422] px-3 py-2">
                  <p className="text-[9px] font-mono text-[#ff4444] mb-1">ERROR</p>
                  <pre className="text-[10px] font-mono text-[#ff6666] whitespace-pre-wrap break-all leading-relaxed">
                    {relatedExec.error}
                  </pre>
                </div>
              )}

              <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#1e1e1e] bg-[#050505]">
                {relatedExec.endTime && (
                  <span className="text-[9px] font-mono text-[#444]">
                    {relatedExec.endTime - relatedExec.startTime}ms
                  </span>
                )}
                <span
                  className={cn(
                    'text-[8px] font-mono px-1 rounded ml-auto',
                    relatedExec.status === 'success' ? 'text-[#22c55e]' :
                    relatedExec.status === 'running' ? 'text-[#f59e0b]' :
                    relatedExec.status === 'error' ? 'text-[#ff4444]' : 'text-[#555]',
                  )}
                >
                  {relatedExec.status}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

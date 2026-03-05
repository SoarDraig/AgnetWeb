'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import type { Commit, Branch } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  commits: Commit[]
  branches: Branch[]
  currentBranch: string
  onSelectCommit?: (hash: string) => void
  onCheckout?: (hash: string) => void
  selectedHash?: string | null
}

// ─── Layout constants ─────────────────────────────────────────────────

const COL_W = 18
const ROW_H = 52
const DOT_R = 5
const PAD_LEFT = 12

// ─── Assign columns to commits ────────────────────────────────────────

function assignColumns(commits: Commit[], branches: Branch[]): Map<string, number> {
  const branchOrder = branches.map(b => b.name)
  const colMap = new Map<string, number>()
  const usedCols: string[] = [] // branch name occupying each col

  for (const commit of commits) {
    // Does any branch col match?
    const branchIdx = usedCols.indexOf(commit.branch)
    if (branchIdx !== -1) {
      colMap.set(commit.hash, branchIdx)
    } else {
      // Assign next free column (prefer order from branches)
      const preferredCol = branchOrder.indexOf(commit.branch)
      let col = preferredCol >= 0 ? preferredCol : usedCols.length
      while (usedCols[col] && usedCols[col] !== commit.branch) col++
      usedCols[col] = commit.branch
      colMap.set(commit.hash, col)
    }
  }

  return colMap
}

// ─── Component ────────────────────────────────────────────────────────

export default function GitGraph({
  commits, branches, onSelectCommit, onCheckout, selectedHash,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => { setIsMounted(true) }, [])
  const colMap = assignColumns(commits, branches)
  const totalCols = Math.max(...Array.from(colMap.values()), 0) + 1

  const getBranchColor = useCallback(
    (branchName: string) => {
      return branches.find(b => b.name === branchName)?.color ?? '#555'
    },
    [branches],
  )

  // ─── Draw canvas ──────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio ?? 1
    const width = canvas.offsetWidth
    const height = ROW_H * commits.length + 16
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    const cx = (col: number) => PAD_LEFT + col * COL_W + DOT_R
    const cy = (row: number) => ROW_H * row + ROW_H / 2

    // Draw edges first
    commits.forEach((commit, row) => {
      const col = colMap.get(commit.hash) ?? 0
      const color = getBranchColor(commit.branch)

      commit.parentHashes.forEach((parentHash, pIdx) => {
        const parentRow = commits.findIndex(c => c.hash === parentHash)
        if (parentRow === -1) return
        const parentCol = colMap.get(parentHash) ?? 0
        const isMerge = pIdx > 0

        ctx.beginPath()
        ctx.strokeStyle = isMerge ? getBranchColor(commit.branch) : color
        ctx.lineWidth = 1.5
        ctx.setLineDash(isMerge ? [3, 3] : [])

        if (col === parentCol) {
          // Straight vertical
          ctx.moveTo(cx(col), cy(row) + DOT_R)
          ctx.lineTo(cx(parentCol), cy(parentRow) - DOT_R)
        } else {
          // Bezier curve
          const x1 = cx(col), y1 = cy(row) + DOT_R
          const x2 = cx(parentCol), y2 = cy(parentRow) - DOT_R
          const midY = (y1 + y2) / 2
          ctx.moveTo(x1, y1)
          ctx.bezierCurveTo(x1, midY, x2, midY, x2, y2)
        }
        ctx.stroke()
        ctx.setLineDash([])
      })
    })

    // Draw dots
    commits.forEach((commit, row) => {
      const col = colMap.get(commit.hash) ?? 0
      const color = getBranchColor(commit.branch)
      const isSelected = commit.hash === selectedHash
      const isHead = commit.tags.includes('HEAD')

      // Glow for HEAD
      if (isHead) {
        ctx.beginPath()
        ctx.arc(cx(col), cy(row), DOT_R + 4, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(cx(col), cy(row), 0, cx(col), cy(row), DOT_R + 4)
        glow.addColorStop(0, color + '55')
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.fill()
      }

      // Outer ring for selection
      if (isSelected) {
        ctx.beginPath()
        ctx.arc(cx(col), cy(row), DOT_R + 3, 0, Math.PI * 2)
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Main dot
      ctx.beginPath()
      ctx.arc(cx(col), cy(row), DOT_R, 0, Math.PI * 2)
      ctx.fillStyle = isHead ? color : '#1a1a1a'
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.fill()
      ctx.stroke()

      // Merge indicator
      if (commit.parentHashes.length > 1) {
        ctx.beginPath()
        ctx.arc(cx(col), cy(row), DOT_R - 2, 0, Math.PI * 2)
        ctx.fillStyle = '#a855f7'
        ctx.fill()
      }
    })
  }, [commits, branches, selectedHash, colMap, getBranchColor])

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {commits.map((commit, row) => (
        <div
          key={commit.hash}
          className={cn(
            'flex items-center gap-0 cursor-pointer group',
            'transition-colors duration-100',
            selectedHash === commit.hash ? 'bg-[#111]' : 'hover:bg-[#0d0d0d]',
          )}
          style={{ height: ROW_H }}
          onClick={() => onSelectCommit?.(commit.hash)}
          onDoubleClick={() => onCheckout?.(commit.hash)}
        >
          {/* Canvas column */}
          <div
            className="flex-shrink-0"
            style={{ width: PAD_LEFT * 2 + totalCols * COL_W }}
          >
            {row === 0 && (
              <canvas
                ref={canvasRef}
                className="absolute"
                style={{ width: PAD_LEFT * 2 + totalCols * COL_W }}
              />
            )}
          </div>

          {/* Commit info */}
          <div className="flex-1 min-w-0 pl-2 pr-3 py-1.5">
            {/* Tags */}
            {commit.tags.length > 0 && (
              <div className="flex gap-1 mb-0.5">
                {commit.tags.map(tag => (
                  <span
                    key={tag}
                    className={cn(
                      'text-[8px] font-mono px-1.5 py-0.5 rounded leading-none',
                      tag === 'HEAD'
                        ? 'bg-[#0070f3] text-white'
                        : tag === 'latest'
                        ? 'bg-[#22c55e22] text-[#22c55e] border border-[#22c55e44]'
                        : 'bg-[#222] text-[#666] border border-[#333]',
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Message */}
            <p className="text-[11px] text-[#d4d4d4] truncate leading-tight group-hover:text-white transition-colors">
              {commit.message}
            </p>

            {/* Meta */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] font-mono text-[#555]">{commit.hash}</span>
              <span
                className="text-[9px] font-mono px-1 rounded"
                style={{
                  color: branches.find(b => b.name === commit.branch)?.color ?? '#555',
                  background: (branches.find(b => b.name === commit.branch)?.color ?? '#555') + '18',
                }}
              >
                {commit.branch}
              </span>
              <span className="text-[9px] text-[#444]" suppressHydrationWarning>
                {isMounted ? formatRelTime(commit.timestamp) : ''}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function formatRelTime(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m 前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h 前`
  return `${Math.floor(diff / 86_400_000)}d 前`
}

import { promises as fs } from 'fs'
import path from 'path'
import { execFile } from 'child_process'

const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', '.turbo', '.vercel', 'dist', 'build'])

export interface CodeSearchHit {
  file: string
  line: number
  preview: string
}

export async function buildProjectManifest(root: string, maxFiles: number): Promise<string[]> {
  const output: string[] = []
  await walk(root, root, output, maxFiles)
  return output
}

async function walk(root: string, dir: string, output: string[], maxFiles: number): Promise<void> {
  if (output.length >= maxFiles) return

  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (output.length >= maxFiles) return
    if (entry.name.startsWith('.DS_Store')) continue

    const abs = path.join(dir, entry.name)
    const rel = path.relative(root, abs)

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await walk(root, abs, output, maxFiles)
      continue
    }

    output.push(rel)
  }
}

export async function searchCode(root: string, query: string, maxHits = 20): Promise<CodeSearchHit[]> {
  const q = query.trim()
  if (!q) return []

  try {
    const stdout = await execFileText('rg', ['-n', '--no-heading', '--max-count', String(maxHits), q, root])
    const lines = stdout.split(/\r?\n/).filter(Boolean)
    return lines.slice(0, maxHits).map(line => parseRgLine(root, line)).filter((hit): hit is CodeSearchHit => Boolean(hit))
  } catch {
    return []
  }
}

function parseRgLine(root: string, line: string): CodeSearchHit | null {
  const match = line.match(/^(.*?):(\d+):(.*)$/)
  if (!match) return null
  const [, filePath, lineNo, preview] = match
  return {
    file: path.relative(root, filePath),
    line: Number(lineNo),
    preview: preview.trim(),
  }
}

export async function readCodeFile(root: string, relativeFile: string, startLine = 1, maxLines = 120): Promise<string> {
  const normalized = relativeFile.replace(/^\/+/, '')
  const abs = path.resolve(root, normalized)
  if (!abs.startsWith(path.resolve(root))) {
    return 'Read blocked: path escapes workspace root.'
  }

  const text = await fs.readFile(abs, 'utf-8')
  const lines = text.split(/\r?\n/)
  const begin = Math.max(1, startLine)
  const end = Math.min(lines.length, begin + Math.max(1, maxLines) - 1)
  const chunk = lines.slice(begin - 1, end).join('\n')
  return `FILE: ${normalized}\nLINES: ${begin}-${end}\n\n${chunk}`
}

function execFileText(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 1024 * 1024 * 2 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

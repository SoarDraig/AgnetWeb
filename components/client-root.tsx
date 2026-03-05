'use client'

import dynamic from 'next/dynamic'

// ssr: false must live inside a Client Component
const AgentWorkspace = dynamic(() => import('@/components/agent-workspace'), { ssr: false })

export default function ClientRoot() {
  return <AgentWorkspace />
}

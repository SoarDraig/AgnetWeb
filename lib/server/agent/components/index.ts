import type { WorkflowComponentType } from '@/lib/types'
import type { ComponentHandler } from '@/lib/server/agent/context'
import { runOrchestratorHandler } from './orchestrator'
import { baselineAnalyzerHandler, governanceHandler, plannerHandler } from './planning'
import {
  causalMemoryHandler,
  evidenceHubHandler,
  manifestLoaderHandler,
  toolExecutorHandler,
} from './tooling'
import { critiqueRefinerHandler, summarySynthesizerHandler } from './synthesis'

const noopHandler: ComponentHandler = () => {
  // intentionally empty
}

export const COMPONENT_HANDLER_REGISTRY: Record<WorkflowComponentType, ComponentHandler> = {
  'run-orchestrator': runOrchestratorHandler,
  'manifest-loader': manifestLoaderHandler,
  'baseline-analyzer': baselineAnalyzerHandler,
  'llm-planner': plannerHandler,
  'tool-executor': toolExecutorHandler,
  'causal-memory': causalMemoryHandler,
  'governance-gate': governanceHandler,
  'evidence-hub': evidenceHubHandler,
  'summary-synthesizer': summarySynthesizerHandler,
  'critique-refiner': critiqueRefinerHandler,
  'custom-prompt': noopHandler,
}

export function resolveHandler(type: WorkflowComponentType): ComponentHandler {
  return COMPONENT_HANDLER_REGISTRY[type] ?? noopHandler
}
